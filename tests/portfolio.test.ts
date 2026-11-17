import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeHolding, planOrderExecutions, lotsAfterSell, isTriggered, toNum, type PendingOrder } from '../lib/portfolio.ts'

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps

test('average price is share-weighted, not a plain mean of lot prices', () => {
  // $1000 at $100 (10 sh) + $100 at $200 (0.5 sh)
  const lots = [
    { ticker: 'AAPL', shares: 10, price_at_purchase: 100 },
    { ticker: 'AAPL', shares: 0.5, price_at_purchase: 200 },
  ]
  const h = computeHolding(lots, 'AAPL')!
  assert.equal(h.shares, 10.5)
  assert.ok(close(h.avgPrice, 1100 / 10.5)) // ~104.76, not 150
  assert.ok(close(h.costBasis, 1100))
})

test('computeHolding handles numeric strings from Supabase', () => {
  const h = computeHolding([{ ticker: 'X', shares: '2', price_at_purchase: '10.5' }], 'X')!
  assert.equal(h.shares, 2)
  assert.equal(h.avgPrice, 10.5)
  assert.equal(computeHolding([], 'X'), null)
  assert.equal(toNum('abc'), 0)
})

const order = (o: Partial<PendingOrder>): PendingOrder => ({
  id: o.id ?? 'o', ticker: o.ticker ?? 'AAPL', order_type: o.order_type ?? 'LIMIT_BUY',
  shares: o.shares ?? null, target_price: o.target_price ?? 100, amount: o.amount ?? null,
})

test('trigger conditions', () => {
  assert.ok(isTriggered(order({ order_type: 'LIMIT_BUY', target_price: 100 }), 99))
  assert.ok(!isTriggered(order({ order_type: 'LIMIT_BUY', target_price: 100 }), 101))
  assert.ok(isTriggered(order({ order_type: 'LIMIT_SELL', target_price: 100 }), 100))
  assert.ok(!isTriggered(order({ order_type: 'LIMIT_SELL', target_price: 100 }), 99))
  assert.ok(isTriggered(order({ order_type: 'STOP_LOSS', target_price: '100' }), 90))
})

test('multiple buys in one pass use running cash and skip when cash runs out', () => {
  const plan = planOrderExecutions(
    [
      order({ id: 'a', ticker: 'AAPL', amount: 600, target_price: 200 }),
      order({ id: 'b', ticker: 'MSFT', amount: 600, target_price: 500 }),
    ],
    { AAPL: 150, MSFT: 400 },
    1000,
    [],
  )
  assert.equal(plan.executions.length, 1)
  assert.equal(plan.executions[0].order.id, 'a')
  assert.equal(plan.skipped[0].order.id, 'b')
  assert.equal(plan.cash, 400)
})

test('limit buy fills at market price when it is below the limit', () => {
  const plan = planOrderExecutions([order({ amount: 100, target_price: 100 })], { AAPL: 80 }, 1000, [])
  const ex = plan.executions[0]
  assert.equal(ex.kind, 'BUY')
  assert.equal(ex.price, 80)
  assert.ok(close(ex.shares, 1.25))
})

test('stop-loss and limit-sell on the same position cannot both sell it', () => {
  const lots = [{ ticker: 'AAPL', shares: 10, price_at_purchase: 100 }]
  const plan = planOrderExecutions(
    [
      order({ id: 'stop', order_type: 'STOP_LOSS', shares: 10, target_price: 90 }),
      order({ id: 'stop2', order_type: 'STOP_LOSS', shares: 10, target_price: 95 }),
    ],
    { AAPL: 85 },
    0,
    lots,
  )
  assert.equal(plan.executions.length, 1)
  assert.equal(plan.cancellations.length, 1)
  assert.equal(plan.cancellations[0].order.id, 'stop2')
  assert.equal(plan.cash, 850)
  const ex = plan.executions[0]
  assert.ok(ex.kind === 'SELL' && close(ex.profitLoss, -150))
})

test('sell order never sells more than is held and reports remaining shares', () => {
  const lots = [{ ticker: 'AAPL', shares: 4, price_at_purchase: 100 }]
  const plan = planOrderExecutions([order({ order_type: 'LIMIT_SELL', shares: 10, target_price: 110 })], { AAPL: 120 }, 0, lots)
  const ex = plan.executions[0]
  assert.ok(ex.kind === 'SELL')
  assert.equal(ex.shares, 4)
  assert.equal(ex.remainingShares, 0)
  assert.equal(plan.cash, 480)
})

test('partial sell keeps remaining shares at the same average cost', () => {
  const lots = [
    { ticker: 'AAPL', shares: 10, price_at_purchase: 100 },
    { ticker: 'AAPL', shares: 10, price_at_purchase: 200 },
    { ticker: 'MSFT', shares: 1, price_at_purchase: 300 },
  ]
  const plan = planOrderExecutions([order({ order_type: 'LIMIT_SELL', shares: 5, target_price: 160 })], { AAPL: 160 }, 0, lots)
  const ex = plan.executions[0]
  assert.ok(ex.kind === 'SELL')
  assert.equal(ex.remainingShares, 15)
  assert.ok(close(ex.profitLoss, 5 * 160 - 5 * 150))
  const after = lotsAfterSell(lots, 'AAPL', 5)
  const h = computeHolding(after, 'AAPL')!
  assert.equal(h.shares, 15)
  assert.equal(h.avgPrice, 150)
  assert.ok(computeHolding(after, 'MSFT'))
  assert.equal(computeHolding(lotsAfterSell(lots, 'AAPL', 20), 'AAPL'), null)
})

test('a buy followed by a sell in the same pass sees the new position', () => {
  const plan = planOrderExecutions(
    [
      order({ id: 'buy', amount: 100, target_price: 100 }),
      order({ id: 'sell', order_type: 'STOP_LOSS', shares: 0, target_price: 100 }),
    ],
    { AAPL: 50 },
    100,
    [],
  )
  assert.equal(plan.executions.length, 2)
  const sell = plan.executions[1]
  assert.ok(sell.kind === 'SELL' && close(sell.shares, 2) && close(sell.profitLoss, 0))
  assert.ok(close(plan.cash, 100))
})

test('orders without a price are left untouched', () => {
  const plan = planOrderExecutions([order({ amount: 10 })], {}, 100, [])
  assert.deepEqual([plan.executions.length, plan.skipped.length, plan.cancellations.length, plan.cash], [0, 0, 0, 100])
})
