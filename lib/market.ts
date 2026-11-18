// US equity market session helpers (NYSE/Nasdaq regular hours, 9:30-16:00
// America/New_York). Outside regular hours the price feed returns the last
// trade, so a "market" order in the simulator fills at a stale price, while
// a real broker would queue it for the next open (often at a gapped price).

// NYSE full-day holidays (dates re-derived in round 2: Good Friday from the
// Easter date; Saturday holidays observed Friday, Sunday ones Monday).
// Source: https://www.nyse.com/markets/hours-calendars
const NYSE_HOLIDAYS = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31',
  '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
])

// Early-close days: the regular session ends at 13:00 ET (extended hours at
// 17:00). Day after Thanksgiving and Christmas Eve when it's a trading day.
const NYSE_EARLY_CLOSES = new Set([
  '2026-11-27', '2026-12-24',
  '2027-11-26',
])

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
  if (weekday === 'Sat' || weekday === 'Sun' || NYSE_HOLIDAYS.has(ymd)) return 'closed'
  const early = NYSE_EARLY_CLOSES.has(ymd)
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
