// Prayer time calculation using adhan library
import { Coordinates, CalculationMethod, PrayerTimes } from 'adhan'

const LOCATIONS: Record<string, { lat: number; lng: number; label: string }> = {
  london: { lat: 51.5074, lng: -0.1278, label: 'London' },
  riyadh: { lat: 24.7136, lng: 46.6753, label: 'Riyadh' },
}

export function getPrayerTimes(location: string, date = new Date()) {
  const loc = LOCATIONS[location.toLowerCase()] || LOCATIONS.london
  const coords = new Coordinates(loc.lat, loc.lng)
  const params = CalculationMethod.MuslimWorldLeague()
  const times = new PrayerTimes(coords, date, params)

  return {
    fajr: times.fajr,
    sunrise: times.sunrise,
    dhuhr: times.dhuhr,
    asr: times.asr,
    maghrib: times.maghrib,
    isha: times.isha,
  }
}

export function formatPrayerTimesForBrief(location: string): string {
  const times = getPrayerTimes(location)
  const fmt = (d: Date) =>
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })

  return `Fajr ${fmt(times.fajr)}, Dhuhr ${fmt(times.dhuhr)}, Asr ${fmt(times.asr)}, Maghrib ${fmt(times.maghrib)}, Isha ${fmt(times.isha)}`
}
