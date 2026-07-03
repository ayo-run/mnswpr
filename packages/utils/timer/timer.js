import { LoggerService } from '../logger/logger'

export class TimerService {

  constructor() {
    this.loggerService = new LoggerService()
    this.time = 0
    this.rendered = undefined
  }

  initialize(el) {
    if (!el) return

    this.display = el
    this.startTime = undefined
    if (this.id !== undefined) {
      this.stop()
    }
    this.time = 0
    this.render()
  }

  start() {
    if (this.running || !this.display) return

    this.running = true
    this.startTime = Date.now()
    this.tick()
    this.loggerService.debug('started timer')
  }

  stop() {
    this.running = false
    if (this.id !== undefined) {
      window.cancelAnimationFrame(this.id)
    }
    this.id = undefined
    this.loggerService.debug('stopped timer')
    return this.time
  }

  /**
   * Recompute the elapsed time and schedule the next frame.
   * Driven by requestAnimationFrame so it aligns with the browser's paint
   * cadence and pauses automatically when the tab is hidden — instead of the
   * old fixed 1ms interval that fired ~1000 times a second.
   */
  tick() {
    this.time = Date.now() - this.startTime
    this.render()
    if (this.running) {
      this.id = window.requestAnimationFrame(() => this.tick())
    }
  }

  /**
   * Write to the DOM only when the visible value actually changes. The display
   * has 100ms (tenths-of-a-second) resolution, so most frames are a no-op and
   * cost no reflow.
   */
  render() {
    if (!this.display) return
    const text = this.pretty(this.time) || '0'
    if (text !== this.rendered) {
      this.display.innerHTML = text
      this.rendered = text
    }
  }

  pretty(duration) {
    if (!duration) return undefined
    var milliseconds = parseInt((duration % 1000) / 100),
      seconds = Math.floor((duration / 1000) % 60),
      minutes = Math.floor((duration / (1000 * 60)) % 60),
      hours = Math.floor((duration / (1000 * 60 * 60)) % 24)

    hours = (hours < 10) ? `0${hours}` : hours
    minutes = (minutes < 10) ? `0${minutes}` : minutes
    seconds = (seconds < 10) ? `0${seconds}` : seconds

    return `${this.clean(hours, ':')}${this.clean(minutes, ':')}${this.clean(seconds, '.')}${this.clean(milliseconds, '')}`
  }

  clean(str, separator) {
    return (str === '00') ? '' : `${str}${separator}`
  }
}
