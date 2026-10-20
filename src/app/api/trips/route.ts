import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { format, differenceInDays } from 'date-fns'
import { anthropic, PERSONA_PROMPT } from '@/lib/claude'
import { fetchWeather, formatWeatherForPrompt } from '@/lib/weather'

function stripJSON(raw: string) {
  return raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
}

export async function GET() {
  const { data } = await supabaseAdmin
    .from('trips')
    .select('*')
    .neq('status', 'completed')
    .order('departure_date')
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  const title = body.title || `${body.origin} → ${body.destination} · ${format(new Date(body.departure_date), 'MMM d')}`

  const { data: trip, error } = await supabaseAdmin
    .from('trips')
    .insert({ ...body, title })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Generate pack in background
  generateTripPack(trip.id).catch(console.error)

  return NextResponse.json(trip)
}

export async function PATCH(req: NextRequest) {
  const { id, ...updates } = await req.json()
  const { data, error } = await supabaseAdmin
    .from('trips')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function generateTripPack(tripId: string) {
  const { data: trip } = await supabaseAdmin.from('trips').select('*').eq('id', tripId).single()
  if (!trip) return

  const [profileRes, deadlinesRes, mealRes, logsRes] = await Promise.all([
    supabaseAdmin.from('packing_profile').select('key, value'),
    supabaseAdmin.from('deadlines').select('title, due_date').neq('status', 'done').gte('due_date', trip.departure_date).lte('due_date', trip.return_date || trip.departure_date),
    supabaseAdmin.from('meal_context').select('key, value').eq('key', 'fridge_items').single(),
    supabaseAdmin.from('trip_packing_logs').select('forgotten_items, destination, trip_purpose').eq('destination', trip.destination).not('forgotten_items', 'is', null).limit(3),
  ])

  const profile = Object.fromEntries((profileRes.data || []).map((r: any) => [r.key, r.value]))
  const deadlinesDuring = (deadlinesRes.data || []).map((d: any) => `${d.title} (due ${d.due_date})`).join(', ') || 'None'
  const fridgeItems = mealRes.data?.value || 'Unknown'
  const forgottenHistory = (logsRes.data || []).map((l: any) => l.forgotten_items).filter(Boolean).join(', ') || 'None'

  const weather = await fetchWeather(trip.destination)
  const weatherStr = formatWeatherForPrompt(weather)

  const departureDt = trip.departure_time ? new Date(trip.departure_time) : new Date(trip.departure_date)
  const returnDate = trip.return_date || trip.departure_date
  const durationDays = differenceInDays(new Date(returnDate), new Date(trip.departure_date)) + 1

  const destLower = trip.destination.toLowerCase()
  const destSpecifics = destLower.includes('riyadh') ? profile.riyadh_specifics :
    destLower.includes('london') ? profile.london_specifics : ''

  const prompt = `Generate a complete travel pack for Tuleen's trip.

TRIP DETAILS:
Origin: ${trip.origin}
Destination: ${trip.destination}
Departure: ${departureDt.toLocaleString('en-GB')}
Return: ${returnDate}
Purpose: ${trip.trip_purpose || 'not specified'}
Duration: ${durationDays} days
Flight: ${trip.flight_number ? `${trip.airline || ''} ${trip.flight_number} departing ${trip.terminal ? 'Terminal ' + trip.terminal : ''}` : 'Not specified'}
Hotel: ${trip.hotel_name ? `${trip.hotel_name}, check-in ${trip.checkin_date}, check-out ${trip.checkout_date}` : 'None'}

PACKING PROFILE:
Always brings: ${profile.always_bring || 'not set'}
Consistently forgets: ${profile.always_forget || 'not set'}
Travel style: ${profile.travel_style || 'not set'}
Tech always needs: ${profile.tech_always || 'not set'}
Toiletries approach: ${profile.toiletries_approach || 'not set'}
Comfort items: ${profile.comfort_items || 'not set'}
${trip.destination}-specific notes: ${destSpecifics || 'none'}
Previous forgotten items for similar trips: ${forgottenHistory}
Home airport: ${profile.home_airport || 'Heathrow'}

CONTEXT:
Weather at destination: ${weatherStr}
Current fridge items (use up before leaving): ${fridgeItems}
Deadlines during trip: ${deadlinesDuring}

Return a JSON object ONLY, no markdown:
{
  "leave_home_by": "HH:MM — departure time minus 3h for international or 2h domestic, minus ~45min travel to ${profile.home_airport || 'Heathrow'}",
  "travel_time_to_airport": "estimated minutes from London flat",
  "pre_departure_checklist": {
    "always": ["Passport", "Boarding pass downloaded", "Phone charged", "Chargers packed"],
    "trip_specific": ["items specific to this destination and purpose"],
    "home_reset": ["Trash out", "Windows closed", "Fridge cleared"],
    "fridge_use_up": ["specific things to cook or use based on: ${fridgeItems}"],
    "deadlines_to_handle_before_leaving": ["any deadlines during the trip that should be done before she leaves: ${deadlinesDuring}"]
  },
  "packing_list": {
    "documents": ["Passport", "Boarding pass", "Booking confirmations"],
    "tech": ["specific devices and cables"],
    "clothes": ["specific — X outfits, mention weather and duration"],
    "toiletries": ["based on her approach: ${profile.toiletries_approach || 'standard kit'}"],
    "comfort": ["from her profile"],
    "destination_specific": ["things specific to ${trip.destination}"]
  },
  "money_logistics": {
    "currency_note": "does she need cash, what currency, rough rate",
    "sim_recommendation": "eSIM or local SIM recommendation",
    "plug_type": "plug type for ${trip.destination}",
    "transport_from_airport": "taxi, metro, Uber options from airport",
    "payment_note": "card acceptance, fees etc"
  },
  "itinerary": null,
  "forgotten_items_added": ["items added because she forgot them on a previous similar trip — from: ${forgottenHistory}"]
}

Rules:
- Be specific about clothes (weather is ${weatherStr}, trip is ${durationDays} days)
- Don't list obvious things (phone, wallet)
- Mark items she tends to forget with ⚠️
- Riyadh: include modest clothing, abaya if relevant
- London: uni card, laptop, it's probably cold`

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: PERSONA_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = (res.content[0] as any).text || '{}'
  const pack = JSON.parse(stripJSON(raw))

  await supabaseAdmin.from('trips').update({
    packing_list: pack.packing_list,
    pre_departure_checklist: pack.pre_departure_checklist,
    itinerary: pack.itinerary,
    money_logistics: pack.money_logistics,
    leave_home_by: pack.leave_home_by,
    weather_snapshot: weather,
    updated_at: new Date().toISOString(),
  }).eq('id', tripId)

  // Save packing log
  await supabaseAdmin.from('trip_packing_logs').insert({
    trip_id: tripId,
    destination: trip.destination,
    trip_purpose: trip.trip_purpose,
    duration_days: durationDays,
    packing_list: pack.packing_list,
  })
}
