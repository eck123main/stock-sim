// US equity market session helpers (NYSE/Nasdaq regular hours, 9:30-16:00
// America/New_York). Outside regular hours the price feed returns the last
// trade, so a "market" order in the simulator fills at a stale price, while
// a real broker would queue it for the next open (often at a gapped price).

// The NYSE calendar is computed from the exchange's rules rather than a
// hard-coded list, so it never runs out (the old list ended in 2027).
// Rules (NYSE Rule 7.2; checked against the 2026-2028 calendar published at
// https://www.nyse.com/markets/hours-calendars):
//   New Year's Day, Juneteenth (2022+), Independence Day, Christmas: fixed
//     dates; Saturday -> previous Friday, Sunday -> next Monday. Exception:
//     New Year's on a Saturday is NOT observed (no holiday on Dec 31).
//   MLK (3rd Mon Jan), Washington's Birthday (3rd Mon Feb), Memorial (last
//     Mon May), Labor (1st Mon Sep), Thanksgiving (4th Thu Nov), Good Friday.
//   Early closes (13:00 ET): July 3, Christmas Eve when they are trading
//     days, and the day after Thanksgiving.
// Unscheduled closures (national days of mourning etc.) go in EXTRA_CLOSURES.

const EXTRA_CLOSURES = new Set<string>([
  '2025-01-09', // National Day of Mourning, President Carter
])

function ymdOf(y: number, m: number, d: number): string {
  // Normalise through Date.UTC so day overflow/underflow rolls the month.
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.toISOString().slice(0, 10)
}

function weekdayOf(y: number, m: number, d: number): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Sun
}

/** n-th (1-based) given weekday of a month; n = -1 means the last one. */
function nthWeekday(y: number, m: number, weekday: number, n: number): string {
  if (n > 0) {
    const first = weekdayOf(y, m, 1)
    return ymdOf(y, m, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7)
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const last = weekdayOf(y, m, lastDay)
  return ymdOf(y, m, lastDay - ((last - weekday + 7) % 7))
}

/** Gregorian Easter Sunday (anonymous Gregorian / Meeus algorithm). */
export function easterSunday(y: number): string {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return ymdOf(y, month, day)
}

function observed(y: number, m: number, d: number): string {
  const wd = weekdayOf(y, m, d)
  if (wd === 6) return ymdOf(y, m, d - 1)
  if (wd === 0) return ymdOf(y, m, d + 1)
  return ymdOf(y, m, d)
}

const holidayCache = new Map<number, Set<string>>()

/** NYSE full-day holidays observed in calendar year `y` (YYYY-MM-DD). */
export function nyseHolidays(y: number): Set<string> {
  const cached = holidayCache.get(y)
  if (cached) return cached
  const days = new Set<string>()
  if (weekdayOf(y, 1, 1) !== 6) days.add(observed(y, 1, 1))
  days.add(nthWeekday(y, 1, 1, 3))  // MLK
  days.add(nthWeekday(y, 2, 1, 3))  // Washington's Birthday
  const easter = easterSunday(y)
  days.add(ymdOf(y, +easter.slice(5, 7), +easter.slice(8, 10) - 2)) // Good Friday
  days.add(nthWeekday(y, 5, 1, -1)) // Memorial Day
  if (y >= 2022) days.add(observed(y, 6, 19)) // Juneteenth
  days.add(observed(y, 7, 4))
  days.add(nthWeekday(y, 9, 1, 1))  // Labor Day
  days.add(nthWeekday(y, 11, 4, 4)) // Thanksgiving
  days.add(observed(y, 12, 25))
  holidayCache.set(y, days)
  return days
}

function isWeekendYmd(ymd: string): boolean {
  const wd = weekdayOf(+ymd.slice(0, 4), +ymd.slice(5, 7), +ymd.slice(8, 10))
  return wd === 0 || wd === 6
}

/** True if the NYSE holds a regular session on this New York date. */
export function isTradingDay(ymd: string): boolean {
  return !isWeekendYmd(ymd) && !nyseHolidays(+ymd.slice(0, 4)).has(ymd) && !EXTRA_CLOSURES.has(ymd)
}

/** True if the regular session on this (trading) day ends at 13:00 ET. */
export function isEarlyClose(ymd: string): boolean {
  if (!isTradingDay(ymd)) return false
  const y = +ymd.slice(0, 4)
  const md = ymd.slice(5)
  if (md === '07-03' || md === '12-24') return true
  const thanksgiving = nthWeekday(y, 11, 4, 4)
  return ymd === ymdOf(y, 11, +thanksgiving.slice(8, 10) + 1)
}

export type MarketSession = 'open' | 'pre-market' | 'after-hours' | 'closed'

function nyParts(date: Date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  })
  const parts: Record<string, string> = {}
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value
  const hour = parseInt(parts.hour, 10) % 24 // some engines emit "24" for midnight
  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    minutes: hour * 60 + parseInt(parts.minute, 10),
  }
}

export function getMarketSession(date: Date = new Date()): MarketSession {
  const { ymd, weekday, minutes } = nyParts(date)
  if (weekday === 'Sat' || weekday === 'Sun' || !isTradingDay(ymd)) return 'closed'
  const early = isEarlyClose(ymd)
  const close = early ? 13 * 60 : 16 * 60
  const extendedEnd = early ? 17 * 60 : 20 * 60
  if (minutes >= 9 * 60 + 30 && minutes < close) return 'open'
  if (minutes >= 4 * 60 && minutes < 9 * 60 + 30) return 'pre-market'
  if (minutes >= close && minutes < extendedEnd) return 'after-hours'
  return 'closed'
}

export function isMarketOpen(date: Date = new Date()): boolean {
  return getMarketSession(date) === 'open'
}
