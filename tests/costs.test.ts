import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buyFill, sellFill, slippedPrice, commissionFor, ZERO_COSTS, type ExecutionCosts } from '../lib/costs.ts'
import { planOrderExecutions, type PendingOrder } from '../lib/portfolio.ts'

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps
const costs: ExecutionCosts = { slippageBps: 10, commissionPerOrder: 1, commissionBps: 0 }

test('slippage: buys pay more, sells receive less', () => {
  assert.ok(close(slippedPrice('BUY', 100, costs), 100.1))
  assert.ok(close(slippedPrice('SELL', 100, costs), 99.9))
  assert.equal(slippedPrice('BUY', 100, ZERO_COSTS), 100)
})

test('commission: flat plus bps of notional, zero for nothing traded', () => {
  assert.ok(close(commissionFor(10_000, { slippageBps: 0, commissionPerOrder: 1, commissionBps: 5 }), 6))
  assert.equal(commissionFor(0, costs), 0)
})

test('buyFill spends exactly the requested dollars, commission included', () => {
  const f = buyFill(1001, 100, costs)!
  assert.ok(close(f.fillPrice, 100.1))
  assert.ok(close(f.commission, 1))
  assert.ok(close(f.shares * f.fillPrice + f.commission, 1001))
  assert.ok(close(f.costPerShare * f.shares, 1001))
  assert.equal(buyFill(0.5, 100, costs), null) // can't cover $1 commission
})

test('limit buy never fills above its limit even after slippage', () => {
  // price 99.95 triggers a 100 limit; slipped price would be 100.05
  const f = buyFill(1000, 99.95, { slippageBps: 10, commissionPerOrder: 0, commissionBps: 0 }, 100)!
  assert.ok(f.fillPrice <= 100)
  assert.ok(f.fillPrice >= 99.95)
})

test('limit sell never fills below its limit; stop may slip below', () => {
  const lim = sellFill(10, 100.05, 90, { slippageBps: 10, commissionPerOrder: 0, commissionBps: 0 }, 100)
  assert.ok(lim.fillPrice >= 100)
  const stop = sellFill(10, 95, 90, { slippageBps: 10, commissionPerOrder: 0, commissionBps: 0 })
  assert.ok(stop.fillPrice < 95)
})

test('round trip at an unchanged price loses spread and commissions', () => {
  const b = buyFill(1001, 100, costs)!
  const s = sellFill(b.shares, 100, b.costPerShare, costs)
  assert.ok(s.profitLoss < 0)
  // ~$1 + $1 commission + ~20 bps spread on $1000
  assert.ok(close(s.profitLoss, s.proceeds - 1001))
  assert.ok(s.profitLoss < -2 && s.profitLoss > -4)
})

test('planner applies costs: cost basis includes commission, sell P&L is net', () => {
  const orders: PendingOrder[] = [
    { id: 'b', ticker: 'X', order_type: 'LIMIT_BUY', shares: null, target_price: 100, amount: 1001 },
  ]
  const plan = planOrderExecutions(orders, { X: 100 }, 2000, [], costs)
  const ex = plan.executions[0]
  assert.equal(ex.kind, 'BUY')
  if (ex.kind !== 'BUY') return
  assert.ok(ex.price <= 100)
  assert.ok(close(ex.costPerShare * ex.shares, 1001))
  assert.ok(close(plan.cash, 999))

  const sell: PendingOrder[] = [
    { id: 's', ticker: 'X', order_type: 'STOP_LOSS', shares: null, target_price: 95, amount: null },
  ]
  const lots = [{ ticker: 'X', shares: 10, price_at_purchase: 100 }]
  const p2 = planOrderExecutions(sell, { X: 95 }, 0, lots, costs)
  const s = p2.executions[0]
  assert.equal(s.kind, 'SELL')
  if (s.kind !== 'SELL') return
  assert.ok(close(s.price, 95 * 0.999))
  assert.ok(close(s.proceeds, 10 * 95 * 0.999 - 1))
  assert.ok(close(s.profitLoss, s.proceeds - 1000))
  assert.ok(close(p2.cash, s.proceeds))
})
