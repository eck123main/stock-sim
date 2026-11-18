import { test } from 'node:test'
import assert from 'node:assert/strict'
import { barTriggeredFill, sortForReplay } from '../lib/fills.ts'
import { planOrderExecutions } from '../lib/portfolio.ts'
import type { Bar } from '../lib/benchmark.ts'

const order = (o: Record<string, unknown>) => ({
  id: 'o1', ticker: 'AAPL', shares: null, amount: null, created_at: '2026-03-02T15:00:00Z', ...o,
}) as any

// Placed Mon 2026-03-02 at 10:00 ET. "now" is Fri 03-06 at 18:00 ET.
const NOW = new Date('2026-03-06T23:00:00Z')
const bars: Bar[] = [
  { date: '2026-03-02', open: 100, high: 101, low: 90, close: 100 }, // placement day: ignored
  { date: '2026-03-03', open: 99, high: 100, low: 96, close: 98 },
  { date: '2026-03-04', open: 97, high: 99, low: 94.5, close: 98 },
  { date: '2026-03-05', open: 92, high: 99, low: 91, close: 98 },   // gap down
  { date: '2026-03-06', open: 98, high: 112, low: 97, close: 99 },
]

test('limit buy fills at the limit on the first bar that trades through it', () => {
  assert.deepEqual(barTriggeredFill(order({ order_type: 'LIMIT_BUY', target_price: 95 }), bars, NOW),
    { price: 95, date: '2026-03-04' })
})

test('a touch is not enough for a limit; the placement-day bar is ignored', () => {
  // low 96 on 03-03 touches 96 but does not trade through; 03-02 low 90 is the placement day
  assert.deepEqual(barTriggeredFill(order({ order_type: 'LIMIT_BUY', target_price: 96 }), bars, NOW),
    { price: 96, date: '2026-03-04' })
  assert.equal(barTriggeredFill(order({ order_type: 'LIMIT_BUY', target_price: 90 }), bars, NOW), null)
})

test('gap through a limit buy fills at the better open; gap through a stop fills at the worse open', () => {
  assert.deepEqual(barTriggeredFill(order({ order_type: 'LIMIT_BUY', target_price: 93 }), bars, NOW),
    { price: 92, date: '2026-03-05' })
  assert.deepEqual(barTriggeredFill(order({ order_type: 'STOP_LOSS', target_price: 93 }), bars, NOW),
    { price: 92, date: '2026-03-05' })
  // stop triggers on a touch
  assert.deepEqual(barTriggeredFill(order({ order_type: 'STOP_LOSS', target_price: 96 }), bars, NOW),
    { price: 96, date: '2026-03-03' })
})

test('limit sell fills at max(open, limit)', () => {
  assert.deepEqual(barTriggeredFill(order({ order_type: 'LIMIT_SELL', target_price: 110 }), bars, NOW),
    { price: 110, date: '2026-03-06' })
  assert.deepEqual(barTriggeredFill(order({ order_type: 'LIMIT_SELL', target_price: 97.5 }), bars, NOW),
    { price: 99, date: '2026-03-03' }) // opened above the limit
})

test('today\'s bar is only used after the close; bars without OHLC are skipped', () => {
  const intraday = new Date('2026-03-06T16:00:00Z') // 11:00 ET Fri
  assert.equal(barTriggeredFill(order({ order_type: 'LIMIT_SELL', target_price: 110 }), bars, intraday), null)
  assert.equal(barTriggeredFill(order({ order_type: 'LIMIT_BUY', target_price: 99 }),
    [{ date: '2026-03-03', close: 50 }], NOW), null)
  assert.equal(barTriggeredFill(order({ order_type: 'LIMIT_BUY', target_price: 99, created_at: undefined }), bars, NOW), null)
})

test('replay order: bar fills by date, stop before limit sell on the same bar, then current-price orders', () => {
  const a = order({ id: 'a', order_type: 'LIMIT_SELL', created_at: '2026-03-01T00:00:00Z' })
  const b = order({ id: 'b', order_type: 'STOP_LOSS', created_at: '2026-03-02T00:00:00Z' })
  const c = order({ id: 'c', order_type: 'LIMIT_BUY', created_at: '2026-02-01T00:00:00Z' })
  const d = order({ id: 'd', order_type: 'LIMIT_BUY', created_at: '2026-01-01T00:00:00Z' })
  const fills = { a: { price: 1, date: '2026-03-05' }, b: { price: 1, date: '2026-03-05' }, c: { price: 1, date: '2026-03-04' } }
  assert.deepEqual(sortForReplay([a, b, c, d], fills).map(o => o.id), ['c', 'b', 'a', 'd'])
})

test('planner uses fill overrides even when the current price no longer triggers', () => {
  const o = order({ order_type: 'LIMIT_BUY', target_price: 95, amount: 950 })
  // current price 98 is above the limit, but the order filled at 95 on an earlier bar
  const plan = planOrderExecutions([o], { AAPL: 98 }, 1000, [], undefined, { o1: 95 })
  assert.equal(plan.executions.length, 1)
  assert.equal(plan.executions[0].price, 95)
  assert.ok(Math.abs(plan.executions[0].shares - 10) < 1e-9)
  // without the override nothing fills
  assert.equal(planOrderExecutions([o], { AAPL: 98 }, 1000, []).executions.length, 0)
})
