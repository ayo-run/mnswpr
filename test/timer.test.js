import { describe, it, expect } from 'vitest'
import { TimerService } from '../utils/timer/timer.js'

describe('TimerService.pretty', () => {
  const timer = new TimerService()

  it('returns undefined for a falsy duration', () => {
    expect(timer.pretty(0)).toBeUndefined()
    expect(timer.pretty(undefined)).toBeUndefined()
  })

  it('drops leading zero-value units', () => {
    // 1500ms -> 1 second, 5 tenths, with hours/minutes stripped
    expect(timer.pretty(1500)).toBe('01.5')
  })

  it('keeps minutes once they are non-zero', () => {
    // 65_000ms -> 1 minute 5 seconds
    expect(timer.pretty(65_000)).toBe('01:05.0')
  })
})

describe('TimerService.clean', () => {
  const timer = new TimerService()

  it('blanks out a zeroed unit', () => {
    expect(timer.clean('00', ':')).toBe('')
  })

  it('appends the separator to a non-zero unit', () => {
    expect(timer.clean('05', ':')).toBe('05:')
  })
})
