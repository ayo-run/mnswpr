import { describe, it, expect } from 'vitest'
import { dayKey, weekKey, monthKey, buckets } from '@cozy-games/utils/date-bucket/date-bucket.js'

describe('date-bucket', () => {
  it('builds a zero-padded UTC day key', () => {
    expect(dayKey(new Date('2026-07-03T12:00:00Z'))).toBe('2026-07-03')
    expect(dayKey(new Date('2026-01-09T00:00:00Z'))).toBe('2026-01-09')
  })

  it('builds a UTC month key', () => {
    expect(monthKey(new Date('2026-07-03T12:00:00Z'))).toBe('2026-07')
    expect(monthKey(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12')
  })

  it('builds an ISO week key', () => {
    // 2026-07-03 falls in ISO week 27
    expect(weekKey(new Date('2026-07-03T12:00:00Z'))).toBe('2026-W27')
    // 2026-01-01 is a Thursday -> ISO week 1 of 2026
    expect(weekKey(new Date('2026-01-01T00:00:00Z'))).toBe('2026-W01')
  })

  it('rolls the ISO week-year back at the January boundary', () => {
    // 2027-01-01 is a Friday -> still ISO week 53 of 2026
    expect(weekKey(new Date('2027-01-01T00:00:00Z'))).toBe('2026-W53')
  })

  it('uses UTC, not local time', () => {
    // Just before UTC midnight is still the 3rd in UTC
    expect(dayKey(new Date('2026-07-03T23:59:59Z'))).toBe('2026-07-03')
    // Just after is the 4th
    expect(dayKey(new Date('2026-07-04T00:00:01Z'))).toBe('2026-07-04')
  })

  it('returns all three keys together', () => {
    expect(buckets(new Date('2026-07-03T12:00:00Z'))).toEqual({
      day: '2026-07-03',
      week: '2026-W27',
      month: '2026-07'
    })
  })
})
