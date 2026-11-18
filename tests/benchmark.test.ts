import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseTimeSeries, benchmarkLevelAt, computeBenchmarkStats, fetchDailyBars, type Bar,
} from '../lib/benchmark.ts'
import { shouldTakeValuationSnapshot } from '../lib/market.ts'

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9

// Trading days starting Mon 2026-03-02 (no holidays in the range used).
function weekdays(n: number): string[] {
  const out: string[] = []
  for (let d = new Date(Date.UTC(2026, 2, 2)); out.length < n; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay()
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10))
  }
  return out
}

// A deterministic wiggly benchmark path.
function benchBars(days: string[]): Bar[] {
  let p = 400
  return days.map((date, i) => {
    p *= 1 + 0.01 * Math.sin(i * 1.7) + 0.002
    return { date, close: p }
  })
}

// Snapshot after the close (22:00 UTC is 17:00/18:00 ET).
const after = (date: string) => `${date}T22:00:00Z`

test('parseTimeSeries sorts newest-first values ascending and parses strings', () => {
  const { bars, error } = parseTimeSeries({
    status: 'ok',
    values: [
      { datetime: '2026-03-04', close: '102.5' },
      { datetime: '2026-03-03', close: '101' },
      { datetime: '2026-03-02', close: 'garbage' },
    ],
  })
  assert.equal(error, undefined)
  assert.deepEqual(bars, [{ date: '2026-03-03', close: 101 }, { date: '2026-03-04', close: 102.5 }])
  assert.equal(parseTimeSeries({ status: 'error', message: 'rate limit' }).error, 'rate limit')
  assert.ok(parseTimeSeries({}).error)
})

test('benchmark level has no look-ahead: intraday snapshot uses the previous close', () => {
  const bars: Bar[] = [{ date: '2026-03-02', close: 100 }, { date: '2026-03-03', close: 110 }]
  // 10:00 ET on 03-03 (15:00 UTC, EST) -> 03-02 close
  assert.equal(benchmarkLevelAt(bars, new Date('2026-03-03T15:00:00Z')), 100)
  // 16:30 ET on 03-03 -> 03-03 close
  assert.equal(benchmarkLevelAt(bars, new Date('2026-03-03T21:30:00Z')), 110)
  // weekend after -> last close
  assert.equal(benchmarkLevelAt(bars, new Date('2026-03-07T15:00:00Z')), 110)
  // before any bar -> null
  assert.equal(benchmarkLevelAt(bars, new Date('2026-03-02T15:00:00Z')), null)
})

test('a 2x-levered copy of the benchmark has beta 2 and correlation 1', () => {
  const days = weekdays(30)
  const bars = benchBars(days)
  let v = 10_000
  const snaps = bars.map((b, i) => {
    if (i > 0) v *= 1 + 2 * (b.close / bars[i - 1].close - 1)
    return { created_at: after(b.date), portfolio_value: v }
  })
  const s = computeBenchmarkStats(snaps, [], bars)
  assert.equal(s.periods, 29)
  assert.ok(close(s.beta!, 2), `beta ${s.beta}`)
  assert.ok(close(s.correlation!, 1))
  assert.ok(close(s.benchmarkReturn!, bars[29].close / bars[0].close - 1))
  assert.ok(close(s.excessReturn!, s.portfolioReturn! - s.benchmarkReturn!))
  assert.notEqual(s.alpha, null) // window is > 30 calendar days
})

test('tracking the benchmark exactly gives zero excess return and alpha, even with a deposit', () => {
  const days = weekdays(30)
  const bars = benchBars(days)
  let v = 10_000
  const flows: { created_at: string; amount: number }[] = []
  const snaps = bars.map((b, i) => {
    if (i > 0) v *= b.close / bars[i - 1].close
    if (i === 15) { v += 5_000; flows.push({ created_at: `${b.date}T21:30:00Z`, amount: 5_000 }) }
    return { created_at: after(b.date), portfolio_value: v }
  })
  const s = computeBenchmarkStats(snaps, flows, bars)
  assert.ok(Math.abs(s.excessReturn!) < 1e-9, `excess ${s.excessReturn}`)
  assert.ok(close(s.beta!, 1))
  assert.ok(Math.abs(s.alpha!) < 1e-9)
})

test('too few periods: returns are reported, beta/alpha are not', () => {
  const bars = benchBars(weekdays(4))
  const snaps = bars.map(b => ({ created_at: after(b.date), portfolio_value: 1000 }))
  const s = computeBenchmarkStats(snaps, [], bars)
  assert.equal(s.periods, 3)
  assert.equal(s.portfolioReturn, 0)
  assert.ok(s.benchmarkReturn !== null)
  assert.equal(s.beta, null)
  assert.equal(s.alpha, null)
  assert.equal(computeBenchmarkStats([], [], bars).portfolioReturn, null)
})

test('several snapshots in one day collapse to the last one', () => {
  const bars: Bar[] = [{ date: '2026-03-02', close: 100 }, { date: '2026-03-03', close: 105 }]
  const s = computeBenchmarkStats([
    { created_at: '2026-03-02T22:00:00Z', portfolio_value: 1000 },
    { created_at: '2026-03-03T21:30:00Z', portfolio_value: 900 },
    { created_at: '2026-03-03T22:30:00Z', portfolio_value: 1100 },
  ], [], bars)
  assert.equal(s.periods, 1)
  assert.ok(close(s.portfolioReturn!, 0.1))
  assert.ok(close(s.benchmarkReturn!, 0.05))
})

test('fetchDailyBars builds a time_series request and survives network errors', async () => {
  let seen = ''
  const ok = await fetchDailyBars('SPY', 'k', {
    fetchJson: async url => { seen = url; return { values: [{ datetime: '2026-03-02', close: '1' }] } },
  })
  assert.match(seen, /time_series\?symbol=SPY&interval=1day/)
  assert.equal(ok.bars.length, 1)
  const bad = await fetchDailyBars('SPY', 'k', { fetchJson: async () => { throw new Error('x') } })
  assert.equal(bad.error, 'network error')
})

test('valuation snapshot: at most one per New York day, only when fully priced', () => {
  const now = new Date('2026-11-18T15:00:00Z') // 10:00 ET Nov 18
  assert.equal(shouldTakeValuationSnapshot(null, now, true), true)
  assert.equal(shouldTakeValuationSnapshot('2026-11-18T14:00:00Z', now, true), false)
  // 03:00 UTC Nov 18 is still Nov 17 in New York -> new NY day
  assert.equal(shouldTakeValuationSnapshot('2026-11-18T03:00:00Z', now, true), true)
  assert.equal(shouldTakeValuationSnapshot('2026-11-17T20:00:00Z', now, false), false)
})
