import { WebComponent } from 'web-component-base'
import { LeaderBoardService } from './leader-board.js'

/**
 * `<cozy-leaderboard>` — a custom element that lets a developer compose the
 * leaderboard UI declaratively in HTML instead of wiring it in JavaScript.
 *
 * Built on `web-component-base` (WebComponent base class + lifecycle hooks). It
 * extends WCB for the custom-element scaffolding (onInit/onDestroy, connect
 * handling) and delegates all inner DOM — the duration tabs and the ranked
 * list — to the existing LeaderBoardService, which already builds and manages
 * that DOM (including in-place tab swaps).
 *
 * Composition lives in HTML attributes; the storage backend (adapter) is set
 * once in JS via configureLeaderboard(), because env-var config can't live in
 * static markup.
 *
 *   <cozy-leaderboard category="beginner" title="Best Times" format="time"></cozy-leaderboard>
 */

// Shared config for every element on the page, set once via configureLeaderboard().
let sharedConfig = {}
const instances = new Set()

/**
 * Configure the backend + defaults for all <cozy-leaderboard> elements. Call
 * once at startup, after building your adapter (Firebase/Supabase/…). User-facing
 * strings (labels, emptyMessages, loadingText, errorText, anonymousName) can be
 * passed here to localize without changing the package.
 * @param {Object} options - { adapter, scoreOrder?, format?, formatScore?, qualifies?, labels?, emptyMessages?, loadingText?, errorText?, anonymousName? }
 */
export function configureLeaderboard(options = {}) {
  sharedConfig = { ...sharedConfig, ...options }
  instances.forEach(el => el._mount())
}

const clean = (str, separator) => (str === '00' ? '' : `${str}${separator}`)

// ms -> pretty time, e.g. 4200 -> "04.2" (mirrors utils/timer pretty()).
const prettyTime = ms => {
  if (!ms) return '0'
  const milliseconds = parseInt((ms % 1000) / 100)
  const seconds = Math.floor((ms / 1000) % 60)
  const minutes = Math.floor((ms / (1000 * 60)) % 60)
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24)
  const hh = hours < 10 ? `0${hours}` : `${hours}`
  const mm = minutes < 10 ? `0${minutes}` : `${minutes}`
  const ss = seconds < 10 ? `0${seconds}` : `${seconds}`
  return `${clean(hh, ':')}${clean(mm, ':')}${clean(ss, '.')}${milliseconds}`
}

// Built-in score formatters, selectable via the `format` attribute.
const FORMATTERS = { time: prettyTime }
const resolveFormat = name => FORMATTERS[name]

export class CozyLeaderboard extends WebComponent {

  static get observedAttributes() {
    return ['category', 'title', 'duration', 'score-order', 'format']
  }

  // WCB lifecycle: register/unregister so configureLeaderboard() can re-render.
  onInit() {
    instances.add(this)
  }

  onDestroy() {
    instances.delete(this)
  }

  // Attributes are read directly (getAttribute) rather than through WCB's typed
  // props proxy, so optional/empty values never trip its type enforcement.
  attributeChangedCallback(name, previousValue, currentValue) {
    if (previousValue === currentValue || !this.isConnected) return
    this._mount(name === 'duration' ? (currentValue || undefined) : undefined)
  }

  // WCB calls render() on connect; we treat it as "(re)mount the board".
  render() {
    this._mount()
  }

  // Per-element override properties (public): adapter, formatScore, qualifies,
  // labels, emptyMessages, loadingText, errorText, anonymousName. Each falls back
  // to the shared configureLeaderboard() value, then the package default. Set
  // them before the element connects (or clear `_svc` to force a rebuild).
  _service() {
    if (this._svc) return this._svc
    const adapter = this.adapter || sharedConfig.adapter
    if (!adapter) return null
    const formatScore = this.formatScore
      || resolveFormat(this.getAttribute('format'))
      || sharedConfig.formatScore
      || resolveFormat(sharedConfig.format)
      || String
    this._svc = new LeaderBoardService({
      adapter,
      scoreOrder: this.getAttribute('score-order') || sharedConfig.scoreOrder || 'asc',
      formatScore,
      qualifies: this.qualifies || sharedConfig.qualifies,
      // User-facing strings — pass through so apps localize without touching the package.
      labels: this.labels || sharedConfig.labels,
      tooltips: this.tooltips || sharedConfig.tooltips,
      emptyMessages: this.emptyMessages || sharedConfig.emptyMessages,
      loadingText: this.loadingText || sharedConfig.loadingText,
      errorText: this.errorText || sharedConfig.errorText,
      anonymousName: this.anonymousName || sharedConfig.anonymousName
    })
    return this._svc
  }

  /**
   * (Re)render the board. The first successful mount honors the author's
   * `duration` attribute; later mounts preserve the service's remembered
   * duration (so switching category keeps the selected tab) unless a duration
   * is passed explicitly.
   */
  _mount(durationArg) {
    if (!this.isConnected) return
    const service = this._service()
    if (!service) {
      this.replaceChildren(this._message('Leaderboard not configured.'))
      return
    }

    let duration = durationArg
    if (duration === undefined && !this._mounted) {
      duration = this.getAttribute('duration') || undefined
    }

    const token = (this._token || 0) + 1
    this._token = token
    service.render(this.getAttribute('category') || '', this.getAttribute('title') || '', duration)
      .then(el => {
        if (this._token !== token) return
        this.replaceChildren(el)
        this._mounted = true
      })
      .catch(() => {
        if (this._token !== token) return
        this.replaceChildren(this._message('Leaderboard unavailable right now.'))
      })
  }

  /**
   * Submit a finished game through this element's service — keeps score
   * submission a one-liner from the host app.
   * @param {Object} entry
   */
  submit(entry) {
    const service = this._service()
    if (service) return service.submit(entry)
  }

  _message(text) {
    const em = document.createElement('em')
    em.innerText = text
    return em
  }
}

if (!customElements.get('cozy-leaderboard')) {
  customElements.define('cozy-leaderboard', CozyLeaderboard)
}
