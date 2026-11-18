import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeReturnStats } from '../lib/metrics.ts'

const close = (a: number | null, b: number, eps = 1e-9) => a !== null && Math.abs(a - b) < eps
const day = (d: number, h = 20) => new Date(Date.UTC(2026, 0, 1 + d, h)).toISOString()

test('daily buckets follow the New York date, not UTC', () => {
  // Snapshots at 15:00 ET and 20:00 ET (01:00 UTC next day) on each of 12
  // days: 12 NY days of returns. Bucketing by UTC would give a 13th "day".
  const snaps = [{ created_at: '2026-01-05T19:00:00Z', portfolio_value: 100 }]
  let v = 100
  for (let d = 6; d <= 17; d++) {
    v *= 1.01
    snaps.push({ created_at: `2026-01-${String(d).padStart(2, '0')}T20:00:00Z`, portfolio_value: v })
    v *= 0.995
    snaps.push({ created_at: `2026-01-${String(d + 1).padStart(2, '0')}T01:00:00Z`, portfolio_value: v })
  }
  assert.equal(computeReturnStats(snaps).days, 12)
})

test('deposit is not counted as a gain', () => {
  const snaps = [
    { created_at: day(0), portfolio_value: 10_000 },
    { created_at: day(1), portfolio_value: 11_000 }, // +10% from trading
    { created_at: day(2, 15), portfolio_value: 21_000 }, // right after a $10k deposit
    { created_at: day(3), portfolio_value: 19_950 }, // -5%
  ]
  const flows = [{ created_at: day(2, 14), amount: 10_000 }]
  const r = computeReturnStats(snaps, flows)
  assert.ok(close(r.twr, 1.1 * 0.95 - 1)) // 4.5%, not +99.5%
  assert.equal(r.netDeposits, 10_000)
  assert.ok(close(r.investmentGain, 19_950 - 10_000 - 10_000))
  assert.ok(close(r.maxDrawdown, 0.05))
})

test('a withdrawal is not a drawdown', () => {
  const r = computeReturnStats([
    { created_at: day(0), portfolio_value: 10_000 },
    { created_at: day(1), portfolio_value: 5_000 },
  ], [{ created_at: day(0, 22), amount: -5_000 }])
  assert.ok(close(r.twr, 0))
  assert.equal(r.maxDrawdown, 0)
})

test('string values from Supabase and unsorted input are handled', () => {
  const r = computeReturnStats([
    { created_at: day(1), portfolio_value: '110' },
    { created_at: day(0), portfolio_value: '100' },
  ], [{ created_at: day(0, 21), amount: '0' }])
  assert.ok(close(r.twr, 0.1))
})

test('flows before the first or after the last snapshot are ignored', () => {
  const r = computeReturnStats([
    { created_at: day(1), portfolio_value: 100 },
    { created_at: day(2), portfolio_value: 105 },
  ], [{ created_at: day(0), amount: 50 }, { created_at: day(3), amount: 50 }])
  assert.ok(close(r.twr, 0.05))
  assert.equal(r.netDeposits, 0)
})

test('fewer than two snapshots gives nulls', () => {
  const r = computeReturnStats([{ created_at: day(0), portfolio_value: 100 }])
  assert.equal(r.twr, null)
  assert.equal(r.sharpe, null)
})

test('risk ratios need enough daily returns and are annualised', () => {
  // alternating +2% / -1% days, several snapshots per day compound to one return
  const snaps = [{ created_at: day(0), portfolio_value: 100 }]
  let v = 100
  const daily: number[] = []
  for (let d = 1; d <= 20; d++) {
    const r = d % 2 ? 0.02 : -0.01
    daily.push(r)
    // two snapshots on the same day: split the move in half (geometrically)
    const half = Math.sqrt(1 + r)
    snaps.push({ created_at: day(d, 15), portfolio_value: v * half })
    v *= 1 + r
    snaps.push({ created_at: day(d, 20), portfolio_value: v })
  }
  const r = computeReturnStats(snaps)
  assert.equal(r.days, 20)
  const mean = daily.reduce((a, b) => a + b, 0) / 20
  const sd = Math.sqrt(daily.reduce((a, x) => a + (x - mean) ** 2, 0) / 19)
  assert.ok(close(r.volatility, sd * Math.sqrt(252), 1e-9))
  assert.ok(close(r.sharpe, (mean / sd) * Math.sqrt(252), 1e-9))
  const dd = Math.sqrt(daily.reduce((a, x) => a + Math.min(x, 0) ** 2, 0) / 20)
  assert.ok(close(r.sortino, (mean / dd) * Math.sqrt(252), 1e-9))
  assert.equal(r.annualizedReturn, null) // < 30 days of history

  const few = computeReturnStats(snaps.slice(0, 9))
  assert.equal(few.sharpe, null)
})

test('annualised return over a year equals the TWR', () => {
  const r = computeReturnStats([
    { created_at: '2025-01-01T00:00:00Z', portfolio_value: 100 },
    { created_at: new Date(Date.parse('2025-01-01T00:00:00Z') + 365.25 * 86_400_000).toISOString(), portfolio_value: 120 },
  ])
  assert.ok(close(r.annualizedReturn, 0.2, 1e-9))
})
