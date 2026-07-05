import { WebComponent, html } from 'web-component-base'
import { LeaderBoardService } from './leader-board.js'
import { DURATIONS } from './leaderboard-read.js'

/**
 * `<cozy-leaderboard>` — a custom element that lets a developer compose the
 * leaderboard UI declaratively in HTML instead of wiring it in JavaScript.
 *
 * Built on `web-component-base` (WCB) the idiomatic way: the observed
 * attributes are declared as `static props` (typed defaults; the base derives
 * observedAttributes and feeds values into the reactive `this.props`), the view
 * is a pure `html` template over a precomputed view-state object, and change
 * reactions arrive through the `onChanges` hook. Data access and user-facing
 * strings stay in {@link LeaderBoardService} / LeaderBoardReader — the element
 * only turns query results into templates.
 *
 * (WCB ≥5 is required: v4 wrote each prop default onto the element as an
 * attribute inside the constructor, which the custom-elements spec forbids and
 * which broke `document.createElement('cozy-leaderboard')`. v5 defers that
 * reflection to connect and never clobbers authored attributes, making
 * `static props` safe here.)
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

// Inline styles (as WCB `html` style objects) — the same visual output the
// LeaderBoardReader produces for the imperative JS composition path.
const STYLES = {
  wrapper: { maxWidth: '270px', margin: '0 auto' },
  heading: { borderBottom: '1px solid #c0c0c0', paddingBottom: '10px' },
  tabBar: { display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '10px' },
  list: { listStyle: 'none', textAlign: 'left' },
  row: { display: 'flex' },
  name: {
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    padding: '0 5px',
    fontWeight: 'bold',
    fontStyle: 'italic',
    flex: '1'
  }
}

const tabStyle = active => ({
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '2px 4px',
  fontSize: '0.85em',
  color: active ? '#ffffff' : '#999999',
  fontWeight: active ? 'bold' : 'normal',
  borderBottom: active ? '2px solid orange' : '2px solid transparent'
})

export class CozyLeaderboard extends WebComponent {

  // Declared attributes (kebab-cased on the element: score-order). String
  // defaults keep `this.props.*` typed as strings, so an unset or emptied
  // attribute reads as '' rather than a coerced boolean. The base class derives
  // observedAttributes from these keys.
  static props = {
    category: '',
    title: '',
    duration: '',
    scoreOrder: '',
    format: ''
  }

  // View state the template renders from. Either { board: false } (not
  // configured) or { board: true, tabs, active, list } where list is
  // { rows: [{ index, name, score }] } or { message } (loading/empty/error).
  _view = { board: false }
  // Selected duration window; survives category changes and re-connects.
  // null until the board first mounts, so the `duration` attribute is honored.
  _activeDuration = null
  _connected = false
  _token = 0

  // WCB lifecycle: connect mounts the board, disconnect unregisters. The
  // instances set lets configureLeaderboard() re-mount live elements.
  onInit() {
    this._connected = true
    instances.add(this)
    this._mount()
  }

  onDestroy() {
    this._connected = false
    instances.delete(this)
  }

  /**
   * WCB change hook — `property` is the camelCase prop name (WCB ≥5). A title
   * change needs no re-query: the heading reads `this.props.title`, so the base
   * class's own render already updated it. score-order/format changes rebuild
   * the service so the new config actually takes effect.
   */
  onChanges({ property }) {
    // Invalidate the cached service even while disconnected, so a scoreOrder/
    // format change made on a detached element takes effect on re-connect.
    if (property === 'scoreOrder' || property === 'format') this._svc = null
    if (!this._connected || property === 'title') return
    this._mount(property === 'duration' ? (this.props.duration || undefined) : undefined)
  }

  get template() {
    const view = this._view
    if (!view.board) return html`<em>Leaderboard not configured.</em>`
    return html`
      <div style=${STYLES.wrapper}>
        <h3 style=${STYLES.heading}>${this.props.title}</h3>
        <div style=${STYLES.tabBar}>
          ${view.tabs.map(tab => html`
            <button
              type="button"
              title=${tab.tooltip}
              data-duration=${tab.id}
              style=${tabStyle(tab.id === view.active)}
              onclick=${() => this._selectTab(tab.id)}
            >${tab.label}</button>
          `)}
        </div>
        <div>
          ${view.list.rows
            ? html`
              <div style=${STYLES.list}>
                ${view.list.rows.map(row => html`
                  <div style=${STYLES.row}>
                    <div>#${row.index}</div>
                    <div title=${row.name} style=${STYLES.name}>${row.name}</div>
                    <div>${row.score}</div>
                  </div>
                `)}
              </div>`
            : html`<em>${view.list.message}</em>`}
        </div>
      </div>
    `
  }

  // Per-element override properties (public): adapter, formatScore, qualifies,
  // labels, tooltips, emptyMessages, loadingText, errorText, anonymousName.
  // Each falls back to the shared configureLeaderboard() value, then the
  // package default. Set them before the element connects (or clear `_svc` to
  // force a rebuild). Rich values stay plain properties — WCB props are
  // attribute-backed and only carry serializable primitives.
  _service() {
    if (this._svc) return this._svc
    const adapter = this.adapter || sharedConfig.adapter
    if (!adapter) return null
    const formatScore = this.formatScore
      || resolveFormat(this.props.format)
      || sharedConfig.formatScore
      || resolveFormat(sharedConfig.format)
      || String
    this._svc = new LeaderBoardService({
      adapter,
      scoreOrder: this.props.scoreOrder || sharedConfig.scoreOrder || 'asc',
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
   * (Re)mount the board. The first mount honors the author's `duration`
   * attribute; later mounts keep the selected duration (so switching category
   * keeps the selected tab) unless a duration is passed explicitly.
   */
  _mount(durationArg) {
    if (!this._connected) return
    const service = this._service()
    if (!service) {
      this._view = { board: false }
      this._paint()
      return
    }
    const duration = durationArg
      ?? this._activeDuration
      ?? (this.props.duration || 'today')
    this._activeDuration = duration
    this._load(service, duration)
  }

  _selectTab(id) {
    this._activeDuration = id
    this._load(this._service(), id)
  }

  /**
   * Query one duration window and project the result into view state: a
   * loading message immediately, then rows / a random empty message / the
   * error text. The token guards against a stale response (quick tab or
   * category switches) overwriting a newer one.
   */
  async _load(service, durationId) {
    const reader = service.reader
    const tabs = DURATIONS.map(d => ({ id: d.id, label: reader.label(d), tooltip: reader.tooltip(d) }))
    const board = list => ({ board: true, tabs, active: durationId, list })

    const token = ++this._token
    this._view = board({ message: reader.loadingText })
    this._paint()

    let list
    try {
      const rows = await reader.list(this.props.category, durationId)
      list = (rows && rows.length)
        ? {
          rows: rows.map((row, index) => ({
            index: index + 1,
            name: row.name || reader.anonymousName,
            score: reader.formatScore(row.score)
          }))
        }
        : { message: reader.emptyMessage() }
    } catch {
      list = { message: reader.errorText }
    }
    if (token !== this._token) return
    this._view = board(list)
    this._paint()
  }

  /**
   * Render the current view state through WCB. WCB's render() replaces the
   * whole subtree (no diffing yet), which would drop focus from a clicked
   * duration tab — the one behavior the base class can't preserve for us — so
   * focus is handed to the replacement tab explicitly.
   */
  _paint() {
    // getRootNode(), not document: inside a shadow root, document.activeElement
    // is retargeted to the host and the focused tab would go undetected.
    const focused = this.getRootNode().activeElement
    const focusedTab = focused && this.contains(focused) ? focused.dataset.duration : undefined
    this.render()
    if (focusedTab) this.querySelector(`button[data-duration="${focusedTab}"]`)?.focus()
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
}

if (!customElements.get('cozy-leaderboard')) {
  customElements.define('cozy-leaderboard', CozyLeaderboard)
}
