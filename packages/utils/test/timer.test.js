import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TimerService } from '@cozy-games/utils/timer/timer.js'

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

describe('TimerService rendering', () => {
  let display

  beforeEach(() => {
    vi.useFakeTimers()
    display = document.createElement('span')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows 0 before the timer starts', () => {
    const timer = new TimerService()
    timer.initialize(display)
    expect(display.innerHTML).toBe('0')
  })

  it('drives updates with requestAnimationFrame, not a 1ms interval', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    const interval = vi.spyOn(window, 'setInterval')

    const timer = new TimerService()
    timer.initialize(display)
    timer.start()

    expect(raf).toHaveBeenCalled()
    expect(interval).not.toHaveBeenCalled()
  })

  it('only touches the DOM when the displayed value changes', () => {
    const timer = new TimerService()
    timer.initialize(display)
    timer.start()

    let writes = 0
    const span = { set innerHTML(_v) { writes++ } }
    timer.display = span

    // Same tenth-of-a-second value across frames -> a single DOM write.
    timer.time = 1500
    timer.render()
    timer.render()
    timer.render()
    expect(writes).toBe(1)

    // A new value -> one more write.
    timer.time = 1600
    timer.render()
    expect(writes).toBe(2)
  })

  it('returns the elapsed time in milliseconds from stop()', () => {
    const timer = new TimerService()
    timer.initialize(display)
    timer.start()
    vi.advanceTimersByTime(2500)
    timer.tick()
    expect(timer.stop()).toBe(2500)
  })
})
