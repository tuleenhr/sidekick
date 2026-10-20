const CITY_IDS: Record<string, string> = {
  london: 'London,UK',
  riyadh: 'Riyadh,SA',
}

export interface WeatherData {
  temperature: string
  feels_like: string
  condition: string
  relevant_note: string
}

export async function fetchWeather(location: string): Promise<WeatherData | null> {
  const key = process.env.OPENWEATHER_API_KEY
  if (!key) return null

  const city = CITY_IDS[location.toLowerCase()] || CITY_IDS.london

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${key}&units=metric`,
      { next: { revalidate: 1800 } }
    )
    if (!res.ok) return null
    const data = await res.json()

    const temp = Math.round(data.main.temp)
    const feels = Math.round(data.main.feels_like)
    const condition = data.weather?.[0]?.description || 'unknown'
    const rain = data.rain?.['1h'] || data.rain?.['3h']

    let relevant_note = `${temp}°C`
    if (rain) relevant_note += ', rain likely — bring an umbrella'
    else if (temp >= 30) relevant_note += ` — very hot, stay hydrated`
    else if (temp >= 25) relevant_note += ` — warm and sunny`
    else if (temp <= 5) relevant_note += ` — very cold, dress warmly`
    else if (temp <= 12) relevant_note += ` — cold out`

    return {
      temperature: `${temp}°C`,
      feels_like: `${feels}°C`,
      condition,
      relevant_note,
    }
  } catch {
    return null
  }
}

export function formatWeatherForPrompt(weather: WeatherData | null): string {
  if (!weather) return 'Weather unavailable'
  return `${weather.temperature} (feels ${weather.feels_like}), ${weather.condition}. ${weather.relevant_note}`
}
