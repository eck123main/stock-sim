// Benchmark comparison: how did the portfolio do relative to simply holding
// an index fund (SPY by default) over the same window?
//
// A raw return says little on its own: +8% is poor in a year the S&P rose
// 20% and excellent in one where it fell. Standard performance attribution
// reports the benchmark return over the identical period, the excess
// (active) return, beta (sensitivity to the market), correlation, and
// Jensen's alpha (return not explained by market exposure).
//
// Alignment: each portfolio snapshot is compared to the benchmark's last
// official close at or before the snapshot time (no look-ahead: a snapshot
// at 11:00 ET uses the previous day's close). Both series are reduced to one
// point per New York day, and returns are taken between consecutive days
// that have a snapshot, so the two return series cover identical intervals.

import { twrGrowthSeries, type CashFlow, type Snapshot } from './metrics.ts'
import { nyDateTime, sessionCloseMinutes } from './market.ts'

export interface Bar {
  /** New York trading date, YYYY-MM-DD */
  date: string
  close: number
  open?: number
  high?: number
  low?: number
}

function optNum(v: unknown): number | undefined {
  const n = parseFloat(String(v))
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * Parse a Twelve Data /time_series (interval=1day) response into bars in
 * ascending date order. Values arrive newest first as strings.
 */
export function parseTimeSeries(data: unknown): { bars: Bar[]; error?: string } {
  const d = (data ?? {}) as { status?: string; message?: string; values?: unknown }
  if (d.status === 'error') return { bars: [], error: d.message || 'time series request failed' }
  if (!Array.isArray(d.values)) return { bars: [], error: 'no values in time series response' }
  const bars: Bar[] = []
  for (const v of d.values as Record<string, unknown>[]) {
    const date = typeof v?.datetime === 'string' ? v.datetime.slice(0, 10) : ''
    const close = parseFloat(String(v?.close))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(close) || close <= 0) continue
    const bar: Bar = { date, close }
    const open = optNum(v.open), high = optNum(v.high), low = optNum(v.low)
    if (open !== undefined) bar.open = open
    if (high !== undefined) bar.high = high
    if (low !== undefined) bar.low = low
    bars.push(bar)
  }
  bars.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  // drop duplicate dates (keep the last)
  const dedup = bars.filter((b, i) => i === bars.length - 1 || bars[i + 1].date !== b.date)
  return { bars: dedup }
}

/** Last close at or before time `t` (bars ascending). null if none yet. */
export function benchmarkLevelAt(bars: Bar[], t: Date): number | null {
  const { ymd, minutes } = nyDateTime(t)
  // binary search for the last bar with date <= ymd
  let lo = 0, hi = bars.length - 1, idx = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (bars[mid].date <= ymd) { idx = mid; lo = mid + 1 } else hi = mid - 1
  }
  if (idx < 0) return null
  // Today's bar only counts once the session has closed.
  if (bars[idx].date === ymd && minutes < sessionCloseMinutes(ymd)) idx--
  return idx >= 0 ? bars[idx].close : null
}

export interface BenchmarkStats {
  /** Number of aligned day-to-day return intervals. */
  periods: number
  /** Portfolio TWR over the aligned window. */
  portfolioReturn: number | null
  /** Benchmark price return over the same window. */
  benchmarkReturn: number | null
  /** portfolioReturn - benchmarkReturn */
  excessReturn: number | null
  /** cov(rp, rb) / var(rb); null with fewer than minPeriods intervals. */
  beta: number | null
  correlation: number | null
  /** Annualised Jensen's alpha (risk-free 0); needs beta and 30+ days. */
  alpha: number | null
}

const DAY_MS = 86_400_000

export function computeBenchmarkStats(
  snapshots: Snapshot[],
  flows: CashFlow[],
  bars: Bar[],
  opts: { minPeriods?: number } = {},
): BenchmarkStats {
  const { minPeriods = 10 } = opts
  const empty: BenchmarkStats = {
    periods: 0, portfolioReturn: null, benchmarkReturn: null, excessReturn: null,
    beta: null, correlation: null, alpha: null,
  }
  const sorted = [...bars].sort((a, b) => (a.date < b.date ? -1 : 1))
  const series = twrGrowthSeries(snapshots, flows)

  // One (growth, benchmark) point per New York day: the day's last snapshot.
  const byDay = new Map<string, { t: number; g: number; b: number }>()
  for (const p of series) {
    const b = benchmarkLevelAt(sorted, new Date(p.t))
    if (b === null) continue
    byDay.set(nyDateTime(new Date(p.t)).ymd, { t: p.t, g: p.growth, b })
  }
  const pts = [...byDay.values()].sort((a, b) => a.t - b.t)
  if (pts.length < 2) return empty

  const rp: number[] = []
  const rb: number[] = []
  for (let i = 1; i < pts.length; i++) {
    rp.push(pts[i].g / pts[i - 1].g - 1)
    rb.push(pts[i].b / pts[i - 1].b - 1)
  }
  const first = pts[0], last = pts[pts.length - 1]
  const portfolioReturn = last.g / first.g - 1
  const benchmarkReturn = last.b / first.b - 1

  let beta: number | null = null
  let correlation: number | null = null
  let alpha: number | null = null
  const n = rp.length
  if (n >= minPeriods) {
    const mp = rp.reduce((a, b) => a + b, 0) / n
    const mb = rb.reduce((a, b) => a + b, 0) / n
    let cov = 0, vp = 0, vb = 0
    for (let i = 0; i < n; i++) {
      cov += (rp[i] - mp) * (rb[i] - mb)
      vp += (rp[i] - mp) ** 2
      vb += (rb[i] - mb) ** 2
    }
    if (vb > 0) beta = cov / vb
    if (vb > 0 && vp > 0) correlation = cov / Math.sqrt(vp * vb)
    const years = (last.t - first.t) / (365.25 * DAY_MS)
    if (beta !== null && years >= 30 / 365.25) {
      const annP = Math.pow(1 + portfolioReturn, 1 / years) - 1
      const annB = Math.pow(1 + benchmarkReturn, 1 / years) - 1
      alpha = annP - beta * annB
    }
  }

  return {
    periods: n,
    portfolioReturn,
    benchmarkReturn,
    excessReturn: portfolioReturn - benchmarkReturn,
    beta,
    correlation,
    alpha,
  }
}

/** Fetch daily closes for the benchmark. `fetchJson` is injectable for tests. */
export async function fetchDailyBars(
  symbol: string,
  apiKey: string | undefined,
  opts: { outputsize?: number; fetchJson?: (url: string) => Promise<unknown> } = {},
): Promise<{ bars: Bar[]; error?: string }> {
  const { outputsize = 500, fetchJson = async (url: string) => (await fetch(url)).json() } = opts
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}`
    + `&interval=1day&outputsize=${outputsize}&apikey=${apiKey ?? ''}`
  try {
    return parseTimeSeries(await fetchJson(url))
  } catch {
    return { bars: [], error: 'network error' }
  }
}
