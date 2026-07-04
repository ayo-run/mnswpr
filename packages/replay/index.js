// @ts-check
import { assertMoveLog } from '@cozy-games/move-log'

/**
 * `@cozy-games/replay` — the core of a game-agnostic replay engine.
 *
 * {@link PlaybackClock} re-drives a move-log envelope over time: it schedules
 * each recorded event to fire at its OFFSET (its `t` relative to the first
 * event) as playback time advances, and supports play / pause / seek. It
 * consumes ONLY the generic envelope (`@cozy-games/move-log`) and never inspects
 * the inside of an `event` — no game types cross this boundary.
 *
 * The clock and scheduler are injected (mirroring the core session's
 * injected-clock seam), so tests drive it with fake timers or a hand-rolled
 * scheduler for exact, deterministic timing.
 */

/**
 * @typedef {import('@cozy-games/move-log').MoveEvent<any>} Event
 * @typedef {import('@cozy-games/move-log').MoveLog<any>} Envelope
 * @typedef {{
 *   clock?: () => number,
 *   setTimeout?: (fn: () => void, ms: number) => any,
 *   clearTimeout?: (handle: any) => void
 * }} Deps
 */

/**
 * A reducer supplied by a game adapter: given the ordered slice of events played
 * so far (offset <= the current position), return a completion percentage in
 * `[0, 100]`. Typed generically over the game's event vocabulary `T`. The engine
 * clamps the result and never inspects an event's payload — all interpretation
 * lives in this reducer.
 *
 * @template T
 * @typedef {(events: import('@cozy-games/move-log').MoveEvent<T>[]) => number} ProgressReducer
 */

/**
 * The replay game-adapter contract (v0) — the seam through which game meaning
 * enters the engine. Currently one optional method; more join as the contract
 * grows. See `docs/adapter-interface.md`.
 *
 * @template T
 * @typedef {{ progress?: ProgressReducer<T> }} ReplayAdapter
 */

export class PlaybackClock {
  /**
   * @param {Envelope} envelope - a valid move-log envelope (validated here)
   * @param {Deps} [deps] - injected time source + scheduler (default: real host)
   * @param {ReplayAdapter<any>} [adapter] - game adapter (e.g. a progress reducer)
   */
  constructor(envelope, deps = {}, adapter = {}) {
    assertMoveLog(envelope)
    if (adapter.progress !== undefined && typeof adapter.progress !== 'function') {
      throw new TypeError('PlaybackClock: adapter.progress must be a function when provided')
    }
    this._adapter = adapter

    const {
      clock = () => Date.now(),
      setTimeout = (fn, ms) => globalThis.setTimeout(fn, ms),
      clearTimeout = (handle) => globalThis.clearTimeout(handle)
    } = deps
    this._now = clock
    this._setTimeout = setTimeout
    this._clearTimeout = clearTimeout

    // Sort by recorded time (tie-break by seq) and rebase to offsets so the first
    // event sits at offset 0 — "recorded offset relative to playback time".
    const sorted = [...envelope.events].sort((a, b) => a.t - b.t || a.seq - b.seq)
    const baseT = sorted.length ? sorted[0].t : 0
    /** @type {{ offset: number, record: Event }[]} */
    this._events = sorted.map(record => ({ offset: record.t - baseT, record }))
    this._duration = this._events.length ? this._events[this._events.length - 1].offset : 0

    // Playback state. Invariant: `_cursor` === number of events whose offset is
    // <= the current position; events below the cursor have been delivered in the
    // current forward pass. This single source of truth makes seek deterministic.
    this._position = 0
    this._cursor = 0
    this._playing = false
    /** @type {any} */
    this._timer = null
    this._anchorClock = 0
    this._anchorPosition = 0
    /** @type {Set<(event: Event) => void>} */
    this._handlers = new Set()
  }

  /** Total playback length in ms (offset of the last event; 0 if empty). */
  get duration() {
    return this._duration
  }

  /** @returns {boolean} */
  isPlaying() {
    return this._playing
  }

  /** Current playback position in ms, clamped to `[0, duration]`. */
  position() {
    return this._livePosition()
  }

  /**
   * Completion percentage (0–100) at the current position, via the adapter's
   * progress reducer — or `null` if no reducer was supplied. The engine hands the
   * reducer the ordered slice of events delivered so far and clamps its result;
   * it never interprets an event payload itself (that's the adapter's job).
   *
   * @returns {number | null}
   */
  progress() {
    const reduce = this._adapter.progress
    if (typeof reduce !== 'function') return null
    const delivered = this._events.slice(0, this._cursor).map(e => e.record)
    const pct = reduce(delivered)
    if (typeof pct !== 'number' || Number.isNaN(pct)) {
      throw new TypeError(`PlaybackClock.progress: reducer must return a number (got ${typeof pct})`)
    }
    return Math.min(100, Math.max(0, pct))
  }

  /**
   * Subscribe to delivered events. The handler receives the raw envelope record
   * (`{ seq, t, event, ... }`) — the payload stays opaque. Returns an unsubscribe.
   *
   * @param {(event: Event) => void} handler
   * @returns {() => void}
   */
  on(handler) {
    this._handlers.add(handler)
    return () => this._handlers.delete(handler)
  }

  /**
   * Start (or resume) playback from the current position. Any event already due
   * at the current position fires synchronously; the rest are scheduled at their
   * offsets. No-op if already playing or already at the end.
   */
  play() {
    if (this._playing) return
    this._playing = true
    this._anchorClock = this._now()
    this._anchorPosition = this._position
    this._scheduleNext()
  }

  /** Pause playback, freezing the position where it currently is. */
  pause() {
    if (!this._playing) return
    this._position = this._livePosition()
    this._playing = false
    this._clearTimer()
  }

  /**
   * Seek to playback time `t` (ms, clamped to `[0, duration]`). Deterministic:
   * afterwards the delivered set is exactly the events at offset <= t. Moving
   * forward delivers the newly-passed events in order (each exactly once); moving
   * backward rewinds the cursor without delivering, so a later forward pass
   * re-delivers them. Re-schedules if playing.
   *
   * @param {number} t
   */
  seek(t) {
    if (typeof t !== 'number' || Number.isNaN(t)) {
      throw new TypeError(`PlaybackClock.seek: t must be a number (got ${typeof t})`)
    }
    const wasPlaying = this._playing
    this._clearTimer()
    this._advanceTo(t)
    if (wasPlaying) {
      this._anchorClock = this._now()
      this._anchorPosition = this._position
      this._scheduleNext()
    }
  }

  // ---- internals ----

  /** Live position: derived from the clock while playing, else the stored value. */
  _livePosition() {
    if (!this._playing) return this._position
    const raw = this._anchorPosition + (this._now() - this._anchorClock)
    return Math.min(Math.max(raw, 0), this._duration)
  }

  /**
   * Move the cursor to match `target` position: emit events crossed going
   * forward (once each), un-count events going backward (no emit). Sets position.
   * @param {number} target
   */
  _advanceTo(target) {
    const t = Math.min(Math.max(target, 0), this._duration)
    while (this._cursor < this._events.length && this._events[this._cursor].offset <= t) {
      this._emit(this._events[this._cursor].record)
      this._cursor++
    }
    while (this._cursor > 0 && this._events[this._cursor - 1].offset > t) {
      this._cursor--
    }
    this._position = t
  }

  /** Deliver an event to all subscribers. */
  _emit(record) {
    for (const handler of this._handlers) handler(record)
  }

  /**
   * Deliver anything already due, then arm a timer for the next pending event.
   * Ends playback when the cursor reaches the last event.
   */
  _scheduleNext() {
    this._clearTimer()
    if (!this._playing) return
    this._advanceTo(this._livePosition())
    if (this._cursor >= this._events.length) {
      this._position = this._duration
      this._playing = false
      return
    }
    const delay = Math.max(0, this._events[this._cursor].offset - this._livePosition())
    this._timer = this._setTimeout(() => this._onTimer(), delay)
  }

  _onTimer() {
    this._timer = null
    if (this._playing) this._scheduleNext()
  }

  _clearTimer() {
    if (this._timer !== null) {
      this._clearTimeout(this._timer)
      this._timer = null
    }
  }
}
