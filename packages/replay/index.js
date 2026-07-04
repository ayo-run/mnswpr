// @ts-check
import { assertMoveLog, SCHEMA_VERSION } from '@cozy-games/move-log'

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
 * A reducer supplied by a game adapter for full-board replay: given the ordered
 * slice of events played so far, reconstruct the complete game state `S` at that
 * point. Typed generically over the event vocabulary `T` and the (opaque) state
 * `S`. Powers the flag-gated full-board mode; the engine treats `S` as a black box.
 *
 * @template T, S
 * @typedef {(events: import('@cozy-games/move-log').MoveEvent<T>[]) => S} StateReducer
 */

/**
 * The replay game-adapter contract (v0) — the seam through which game meaning
 * enters the engine. Both methods are optional; the engine calls whichever the
 * mode needs and never interprets an event itself. See `docs/adapter-interface.md`.
 *
 * @template T
 * @typedef {{ progress?: ProgressReducer<T>, state?: StateReducer<T, any> }} ReplayAdapter
 */

/**
 * A version reader: normalize a raw envelope of its generation into the canonical
 * ordered `MoveEvent` records the engine plays. One engine build can therefore
 * replay envelopes from multiple format generations.
 *
 * @typedef {(envelope: any) => Event[]} EnvelopeReader
 */

/** v1 is the canonical format itself — its `events` are already the records. */
function readV1(envelope) {
  return envelope.events
}

/**
 * The built-in dispatch table: `schema_version → reader`. Adding a real future
 * generation is exactly one entry here (plus its normalizer). Callers can also
 * supply extra/override readers per instance via the `readers` option.
 *
 * @type {Record<number, EnvelopeReader>}
 */
const ENVELOPE_READERS = { [SCHEMA_VERSION]: readV1 }

/**
 * Dispatch on an envelope's `schema_version` to the matching reader and return
 * the canonical `MoveEvent` records. Unknown/unsupported versions fail LOUDLY
 * with a specific error — never a silent best-effort parse. Whatever a reader
 * returns is validated as a canonical move log, so a half-normalized generation
 * can't reach the engine.
 *
 * @param {any} envelope
 * @param {Record<number, EnvelopeReader>} [extraReaders] - added/overriding readers
 * @returns {Event[]}
 */
export function readEnvelope(envelope, extraReaders) {
  if (envelope === null || typeof envelope !== 'object') {
    throw new TypeError(`readEnvelope: expected an envelope object (got ${envelope === null ? 'null' : typeof envelope})`)
  }
  const readers = extraReaders ? { ...ENVELOPE_READERS, ...extraReaders } : ENVELOPE_READERS
  const version = envelope.schema_version
  const read = readers[version]
  if (typeof read !== 'function') {
    const supported = Object.keys(readers).map(Number).sort((a, b) => a - b).join(', ')
    throw new RangeError(`readEnvelope: unsupported envelope schema_version ${JSON.stringify(version)} (supported: ${supported})`)
  }
  const records = read(envelope)
  // Every reader MUST normalize to canonical move-log records; enforce it here so
  // no downstream generation can feed the engine a malformed or half-normalized log.
  assertMoveLog({ schema_version: SCHEMA_VERSION, events: records })
  return records
}

export class PlaybackClock {
  /**
   * @param {Envelope} envelope - a valid move-log envelope (validated here)
   * @param {Deps} [deps] - injected time source + scheduler (default: real host)
   * @param {ReplayAdapter<any>} [adapter] - game adapter (progress / state reducers)
   * @param {{ fullBoard?: boolean, readers?: Record<number, EnvelopeReader> }} [options] -
   *   `fullBoard` flag-gates full-board mode (default OFF: `state()`/`onState` are
   *   inert and the state reducer is never called) — the minimal, documented
   *   feature-flag seam for this engine. `readers` adds/overrides schema-version
   *   readers for this instance (see {@link readEnvelope}).
   */
  constructor(envelope, deps = {}, adapter = {}, options = {}) {
    // Dispatch on schema_version → the matching reader's canonical records.
    const records = readEnvelope(envelope, options.readers)
    if (adapter.progress !== undefined && typeof adapter.progress !== 'function') {
      throw new TypeError('PlaybackClock: adapter.progress must be a function when provided')
    }
    if (adapter.state !== undefined && typeof adapter.state !== 'function') {
      throw new TypeError('PlaybackClock: adapter.state must be a function when provided')
    }
    this._adapter = adapter
    this._fullBoard = options.fullBoard === true

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
    const sorted = [...records].sort((a, b) => a.t - b.t || a.seq - b.seq)
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
    /** @type {Set<(update: { position: number, progress: number }) => void>} */
    this._progressHandlers = new Set()
    /** Last progress value pushed, so unchanged progress (e.g. a flag) is not re-emitted. */
    this._lastProgress = /** @type {number | null} */ (null)
    /** @type {Set<(update: { position: number, state: any }) => void>} */
    this._stateHandlers = new Set()
    /** @type {Set<(update: { position: number }) => void>} */
    this._endHandlers = new Set()
    /** True once the end has been reached; re-arms when playback moves back before it. */
    this._ended = false
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
   * Full-board mode: the reconstructed game state at the current position, via the
   * adapter's `state` reducer over the delivered slice. Returns `null` unless the
   * `fullBoard` flag is on AND a state reducer was supplied — so the mode is inert
   * (and the reducer never runs) by default. The state shape `S` is the adapter's;
   * the engine treats it as opaque.
   *
   * @returns {any}
   */
  state() {
    if (!this._fullBoard) return null
    const reduce = this._adapter.state
    if (typeof reduce !== 'function') return null
    return reduce(this._events.slice(0, this._cursor).map(e => e.record))
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
   * Progress-mode subscription: receive `{ position, progress }` updates as
   * playback advances — the "percent complete over elapsed time" signal. Fires
   * only when the percentage actually changes (so flags/unflags, which don't
   * advance progress, emit nothing), on play, seek forward, and seek backward.
   * Requires an adapter with a `progress` reducer; without one it never emits.
   * Subscribe before playing to catch every update; use {@link progress} for the
   * current value at any time. Returns an unsubscribe.
   *
   * @param {(update: { position: number, progress: number }) => void} handler
   * @returns {() => void}
   */
  onProgress(handler) {
    this._progressHandlers.add(handler)
    return () => this._progressHandlers.delete(handler)
  }

  /**
   * Full-board mode subscription: receive `{ position, state }` whenever the
   * delivered set changes (play, seek forward, seek backward), where `state` is
   * the adapter's reconstruction at that position. Inert unless the `fullBoard`
   * flag is on and a state reducer was supplied. Returns an unsubscribe.
   *
   * @param {(update: { position: number, state: any }) => void} handler
   * @returns {() => void}
   */
  onState(handler) {
    this._stateHandlers.add(handler)
    return () => this._stateHandlers.delete(handler)
  }

  /**
   * Subscribe to the "ended" signal: fires with `{ position }` when playback
   * reaches the last recorded event's offset — the SAME signal whether the run
   * completed or the recording was truncated mid-game (the engine has no notion
   * of a terminal event). Fires once on reaching the end and re-arms if playback
   * moves back before it. Returns an unsubscribe.
   *
   * @param {(update: { position: number }) => void} handler
   * @returns {() => void}
   */
  onEnd(handler) {
    this._endHandlers.add(handler)
    return () => this._endHandlers.delete(handler)
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
    const before = this._cursor
    while (this._cursor < this._events.length && this._events[this._cursor].offset <= t) {
      this._emit(this._events[this._cursor].record)
      this._cursor++
    }
    while (this._cursor > 0 && this._events[this._cursor - 1].offset > t) {
      this._cursor--
    }
    this._position = t
    this._emitProgressIfChanged()
    if (this._cursor !== before) this._emitState()
    this._maybeEmitEnded()
  }

  /** Deliver an event to all subscribers. */
  _emit(record) {
    for (const handler of this._handlers) handler(record)
  }

  /** Push a progress update to subscribers, but only when the percentage moved. */
  _emitProgressIfChanged() {
    if (this._progressHandlers.size === 0) return
    const progress = this.progress()
    if (progress === null || progress === this._lastProgress) return
    this._lastProgress = progress
    const update = { position: this._position, progress }
    for (const handler of this._progressHandlers) handler(update)
  }

  /**
   * Fire "ended" once when every recorded event has been delivered (the timeline
   * reached the last event's offset); re-arm when playback moves back before it.
   * Terminal-agnostic: a truncated recording ends here exactly like a complete one.
   */
  _maybeEmitEnded() {
    const atEnd = this._events.length > 0 && this._cursor >= this._events.length
    if (atEnd && !this._ended) {
      this._ended = true
      const update = { position: this._position }
      for (const handler of this._endHandlers) handler(update)
    } else if (!atEnd) {
      this._ended = false
    }
  }

  /** Push a reconstructed board state to subscribers — only in active full-board mode. */
  _emitState() {
    if (!this._fullBoard || this._stateHandlers.size === 0) return
    if (typeof this._adapter.state !== 'function') return
    const update = { position: this._position, state: this.state() }
    for (const handler of this._stateHandlers) handler(update)
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
