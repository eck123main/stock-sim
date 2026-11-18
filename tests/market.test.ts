import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getMarketSession, isMarketOpen } from '../lib/market.ts'

test('early close: day after Thanksgiving ends at 13:00 ET', () => {
  // Fri 2026-11-27 12:59 EST = 17:59 UTC -> open; 13:00 -> after-hours
  assert.equal(getMarketSession(new Date('2026-11-27T17:59:00Z')), 'open')
  assert.equal(getMarketSession(new Date('2026-11-27T18:00:00Z')), 'after-hours')
  // extended session ends at 17:00 ET on early-close days
  assert.equal(getMarketSession(new Date('2026-11-27T22:00:00Z')), 'closed')
  // Thanksgiving itself is closed
  assert.equal(getMarketSession(new Date('2026-11-26T16:00:00Z')), 'closed')
})

test('regular session on a normal weekday (EST and EDT)', () => {
  // Wed 2026-11-18 10:00 EST = 15:00 UTC
  assert.equal(getMarketSession(new Date('2026-11-18T15:00:00Z')), 'open')
  // 9:29 EST is pre-market
  assert.equal(getMarketSession(new Date('2026-11-18T14:29:00Z')), 'pre-market')
  // 16:00 EST is after-hours
  assert.equal(getMarketSession(new Date('2026-11-18T21:00:00Z')), 'after-hours')
  // Wed 2026-07-15 09:30 EDT = 13:30 UTC
  assert.ok(isMarketOpen(new Date('2026-07-15T13:30:00Z')))
  // 23:00 EDT -> closed overnight
  assert.equal(getMarketSession(new Date('2026-07-16T03:00:00Z')), 'closed')
})

test('weekends and holidays are closed', () => {
  assert.equal(getMarketSession(new Date('2026-11-21T16:00:00Z')), 'closed') // Saturday
  assert.equal(getMarketSession(new Date('2026-11-26T16:00:00Z')), 'closed') // Thanksgiving
  assert.equal(getMarketSession(new Date('2026-12-25T16:00:00Z')), 'closed') // Christmas
})
