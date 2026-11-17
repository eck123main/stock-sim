import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeTradeStats, computeDrawdown, unrealizedReturn } from '../lib/metrics.ts'

test('trade stats sum numeric strings instead of concatenating them', () => {
  const s = computeTradeStats([
    { action: 'BUY', profit_loss: null },
    { action: 'SELL', profit_loss: '100' },
    { action: 'SELL', profit_loss: '-40' },
    { action: 'SELL', profit_loss: 20 },
    { action: 'SELL', profit_loss: 0 },
  ])
  assert.equal(s.realizedPnL, 80)
  assert.equal(s.closedTrades, 4)
  assert.equal(s.wins, 2)
  assert.equal(s.losses, 1)
  assert.equal(s.breakeven, 1)
  assert.equal(s.winRate, 0.5)
  assert.equal(s.profitFactor, 120 / 40)
  assert.equal(s.avgWin, 60)
  assert.equal(s.avgLoss, -40)
  assert.equal(s.expectancy, 20)
  assert.equal(s.largestWin, 100)
  assert.equal(s.largestLoss, -40)
})

test('trade stats with no trades / no losses', () => {
  assert.equal(computeTradeStats([]).winRate, null)
  assert.equal(computeTradeStats([]).profitFactor, null)
  assert.equal(computeTradeStats([{ action: 'SELL', profit_loss: 5 }]).profitFactor, Infinity)
})

test('max drawdown finds the worst peak-to-trough fall, regardless of input order', () => {
  const snaps = [
    { created_at: '2026-01-03', portfolio_value: 120 },
    { created_at: '2026-01-01', portfolio_value: 100 },
    { created_at: '2026-01-02', portfolio_value: 80 },
    { created_at: '2026-01-04', portfolio_value: '90' },
    { created_at: '2026-01-05', portfolio_value: 108 },
  ]
  const d = computeDrawdown(snaps)
  assert.equal(d.maxDrawdown, 0.25) // 120 -> 90
  assert.equal(d.peakValue, 120)
  assert.equal(d.troughValue, 90)
  assert.ok(Math.abs(d.currentDrawdown - 0.1) < 1e-12)
  assert.equal(computeDrawdown([]).maxDrawdown, 0)
})

test('unrealized return', () => {
  assert.equal(unrealizedReturn(110, 100), 0.1)
  assert.equal(unrealizedReturn(0, 0), null)
})
