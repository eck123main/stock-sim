import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getMarketSession, isMarketOpen, nyseHolidays, isEarlyClose, isTradingDay, easterSunday,
} from '../lib/market.ts'

// Official NYSE calendar for 2026-2028 (announced Dec 2025):
// https://mondovisione.com/media-and-resources/news/nyse-group-announces-2026-2027-and-2028-holiday-and-early-closings-calendar-20251223
const OFFICIAL_HOLIDAYS: Record<number, string[]> = {
  2026: ['2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
    '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25'],
  2027: ['2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31',
    '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24'],
  // New Year's Day 2028 is a Saturday and is not observed at all.
  2028: ['2028-01-17', '2028-02-21', '2028-04-14', '2028-05-29',
    '2028-06-19', '2028-07-04', '2028-09-04', '2028-11-23', '2028-12-25'],
}

test('computed holidays match the official 2026-2028 NYSE calendar exactly', () => {
  for (const [y, days] of Object.entries(OFFICIAL_HOLIDAYS)) {
    assert.deepEqual([...nyseHolidays(+y)].sort(), [...days].sort(), `year ${y}`)
  }
  // Dec 31 2027 trades normally even though Jan 1 2028 is a holiday-on-Saturday
  assert.ok(isTradingDay('2027-12-31'))
})

test('computed early closes match the official calendar', () => {
  const early = (y: number) => {
    const out: string[] = []
    for (let d = new Date(Date.UTC(y, 0, 1)); d.getUTCFullYear() === y; d.setUTCDate(d.getUTCDate() + 1)) {
      const ymd = d.toISOString().slice(0, 10)
      if (isEarlyClose(ymd)) out.push(ymd)
    }
    return out
  }
  assert.deepEqual(early(2026), ['2026-11-27', '2026-12-24'])
  assert.deepEqual(early(2027), ['2027-11-26']) // Dec 24 is the observed Christmas
  assert.deepEqual(early(2028), ['2028-07-03', '2028-11-24'])
  assert.deepEqual(early(2025), ['2025-07-03', '2025-11-28', '2025-12-24'])
})

test('Easter dates and pre-Juneteenth years', () => {
  assert.equal(easterSunday(2024), '2024-03-31')
  assert.equal(easterSunday(2025), '2025-04-20')
  assert.equal(easterSunday(2038), '2038-04-25')
  assert.ok(!nyseHolidays(2021).has('2021-06-18'))
  assert.ok(!isTradingDay('2025-01-09')) // Carter day of mourning
})

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
