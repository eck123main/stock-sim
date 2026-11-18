import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePriceResponse, fetchPrices, chunk } from '../lib/quotes.ts'

test('single-symbol response is flat', () => {
  const r = parsePriceResponse(['AAPL'], { price: '190.50' })
  assert.deepEqual(r.prices, { AAPL: 190.5 })
  assert.deepEqual(r.failed, [])
})

test('multi-symbol response is keyed by symbol; per-symbol errors fail only that symbol', () => {
  const r = parsePriceResponse(['AAPL', 'BAD', 'MSFT'], {
    AAPL: { price: '190' },
    BAD: { code: 400, status: 'error', message: 'symbol not found' },
    MSFT: { price: '410.1' },
  })
  assert.deepEqual(r.prices, { AAPL: 190, MSFT: 410.1 })
  assert.deepEqual(r.failed, ['BAD'])
})

test('request-level error (e.g. rate limit) fails all symbols with a message', () => {
  const r = parsePriceResponse(['AAPL', 'MSFT'], { code: 429, status: 'error', message: 'out of credits' })
  assert.deepEqual(r.failed, ['AAPL', 'MSFT'])
  assert.equal(r.error, 'out of credits')
})

test('zero / garbage prices are failures', () => {
  const r = parsePriceResponse(['A', 'B'], { A: { price: '0' }, B: { price: 'abc' } })
  assert.deepEqual(r.failed, ['A', 'B'])
})

test('chunk splits evenly', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
})

test('fetchPrices batches, dedupes, upper-cases and survives a failed chunk', async () => {
  const urls: string[] = []
  const r = await fetchPrices(['aapl', 'AAPL', 'msft', 'nvda'], 'k', {
    chunkSize: 2,
    fetchJson: async (url) => {
      urls.push(url)
      if (url.includes('NVDA')) throw new Error('boom')
      return { AAPL: { price: '1' }, MSFT: { price: '2' } }
    },
  })
  assert.equal(urls.length, 2)
  assert.ok(decodeURIComponent(urls[0]).includes('symbol=AAPL,MSFT'))
  assert.deepEqual(r.prices, { AAPL: 1, MSFT: 2 })
  assert.deepEqual(r.failed, ['NVDA'])
  assert.equal(r.error, 'network error')
})
