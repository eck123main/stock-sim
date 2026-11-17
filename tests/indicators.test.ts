import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculateSMA, calculateRSI, calculateMACD, calculateBollingerBands } from '../lib/indicators.ts'

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps

test('SMA averages the trailing window and is undefined before it fills', () => {
  const sma = calculateSMA([1, 2, 3, 4, 5], 3)
  assert.deepEqual(sma, [undefined, undefined, 2, 3, 4])
})

test('RSI is 100 for a strictly rising series and 0 for a falling one', () => {
  const up = Array.from({ length: 20 }, (_, i) => 100 + i)
  const down = Array.from({ length: 20 }, (_, i) => 100 - i)
  const rUp = calculateRSI(up, 14)
  const rDown = calculateRSI(down, 14)
  for (let i = 14; i < 20; i++) {
    assert.equal(rUp[i], 100)
    assert.equal(rDown[i], 0)
  }
})

test('RSI is 50 (not NaN) for flat prices and has no NaN at the last point', () => {
  const flat = new Array(20).fill(10)
  const r = calculateRSI(flat, 14)
  assert.equal(r[19], 50)
  const mixed = [44, 44.3, 44.1, 43.6, 44.3, 44.8, 45.1, 45.4, 45.8, 46.1, 45.9, 46.3, 46.3, 46.0, 46.4, 46.2, 45.6, 46.2]
  const rm = calculateRSI(mixed, 14)
  for (let i = 14; i < mixed.length; i++) {
    assert.ok(Number.isFinite(rm[i]), `rsi[${i}] should be finite`)
    assert.ok((rm[i] as number) >= 0 && (rm[i] as number) <= 100)
  }
})

test('RSI uses the change ending at each index (Wilder smoothing)', () => {
  // 14 flat-ish bars then one big drop: RSI at the drop must fall below the prior value
  const prices = [...Array.from({ length: 15 }, (_, i) => 100 + i), 80]
  const r = calculateRSI(prices, 14)
  assert.equal(r[14], 100)
  // avgGain = (1*13 + 0)/14, avgLoss = 34/14 -> RS = 13/34
  assert.ok(close(r[15] as number, 100 - 100 / (1 + 13 / 34)))
})

test('MACD signal line is aligned with the MACD line', () => {
  const prices = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5 + i * 0.2)
  const { macd, signal } = calculateMACD(prices)
  // MACD defined from index 25 (slow EMA), signal 8 bars later
  assert.equal(macd[24], undefined)
  assert.notEqual(macd[25], undefined)
  assert.equal(signal[32], undefined)
  assert.notEqual(signal[33], undefined)
  // First signal value = SMA of the first 9 MACD values
  const first9 = macd.slice(25, 34) as number[]
  const expected = first9.reduce((a, b) => a + b, 0) / 9
  assert.ok(close(signal[33] as number, expected))
  assert.equal(signal.length, prices.length)
})

test('Bollinger bands are symmetric around the SMA', () => {
  const prices = Array.from({ length: 25 }, (_, i) => 50 + (i % 5))
  const { upper, middle, lower } = calculateBollingerBands(prices, 20)
  const i = 24
  assert.ok(close((upper[i] as number) - (middle[i] as number), (middle[i] as number) - (lower[i] as number)))
})
