// @ts-check

/**
 * Layer 1 — owns lifecycle, the (injected) clock, and the move log; delegates all
 * game meaning to an injected `rules` object. This is where timing authority
 * lives: on the client `clock` is `Date.now` (cosmetic); on a server it is the
 * server's clock (authoritative). The session never calls a wall clock itself.
 * Future home: @cozy-games/game-session.
 *
 * @typedef {{ init: Function, apply: Function, status: Function, project: Function, serialize?: Function, deserialize?: Function, toMoveEvent?: Function }} Rules
 */
export class GameSession {
  /**
   * Start from either `{ seed, config }` (the rules generate the board) or a
   * pre-built `{ state }` (e.g. a rules factory that injected an explicit board);
   * `state` wins when both are given. The session stays generic — it just holds
   * whatever state the rules produced.
   *
   * @param {Rules} rules
   * @param {{ seed?: number, config?: object, state?: object, clock?: () => number }} opts
   */
  constructor(rules, { seed, config, state, clock = () => 0 }) {
    this.rules = rules
    this.clock = clock
    this.state = state ?? rules.init(seed, config)
    /** @type {Array<{ move: object, t: number }>} */
    this._log = []
    this._t0 = null
    this._tEnd = null
    // Move-event emission: subscribers + a monotonic sequence counter (last seq
    // assigned; 0 = none yet). Seq is part of the snapshot so it keeps rising
    // across a resume rather than restarting.
    /** @type {Set<(event: object) => void>} */
    this._moveHandlers = new Set()
    this._seq = 0
  }

  /**
   * Subscribe to typed move-events — one per effective move (reveal / flag /
   * unflag / chord), each carrying `{ type, r, c, t, seq }`. Returns an
   * unsubscribe function. Pure in-process pub/sub: no DOM, no rendering. Requires
   * the rules to implement `toMoveEvent`.
   *
   * @param {(event: object) => void} handler
   * @returns {() => void} unsubscribe
   */
  onMove(handler) {
    this._moveHandlers.add(handler)
    return () => this._moveHandlers.delete(handler)
  }

  /**
   * Apply a move: stamp it, fold it through the rules, and return the projected
   * view + events + authoritative elapsed time.
   * @param {object} move
   */
  applyMove(move) {
    const t = this.clock()
    const before = this.rules.status(this.state)
    const { state, events } = this.rules.apply(this.state, move)
    this.state = state
    this._log.push({ move, t })

    const after = this.rules.status(state)
    // Timer starts on the first move that leaves 'fresh' (the opening reveal).
    if (before === 'fresh' && after !== 'fresh' && this._t0 === null) this._t0 = t
    if ((after === 'won' || after === 'lost') && this._tEnd === null) this._tEnd = t

    // Emit a typed move-event for effective moves (rules classify; no-ops → null).
    if (typeof this.rules.toMoveEvent === 'function') {
      const kind = this.rules.toMoveEvent(move, events)
      if (kind) this._emitMove({ ...kind, t, seq: ++this._seq })
    }

    return { events, view: this.rules.project(state), time: this.elapsed() }
  }

  /** @param {object} event */
  _emitMove(event) {
    for (const handler of this._moveHandlers) handler(event)
  }

  status() {
    return this.rules.status(this.state)
  }

  view() {
    return this.rules.project(this.state)
  }

  log() {
    return this._log.slice()
  }

  /** Authoritative elapsed ms: first move → terminal move (or → now if ongoing). */
  elapsed() {
    if (this._t0 === null) return 0
    const end = this._tEnd !== null ? this._tEnd : this.clock()
    return end - this._t0
  }

  /** The signed-off result, or null while the game is still in progress. */
  result() {
    const status = this.status()
    if (status !== 'won' && status !== 'lost') return null
    return { status, time: this.elapsed(), seed: this.state.seed, config: this.state.config, log: this.log() }
  }

  /**
   * Full, JSON-safe snapshot of the whole session — game state (board + per-cell
   * status, via the rules' own serializer) plus the move log and timing anchors
   * (`t0`/`tEnd`) that `elapsed()` derives from. Everything needed to later resume
   * (core-05); the live `clock` is deliberately excluded (it's re-injected on
   * {@link GameSession.deserialize}). Requires the rules to implement `serialize`.
   *
   * @returns {{ state: object, log: Array<{ move: object, t: number }>, t0: number | null, tEnd: number | null, seq: number }}
   */
  serialize() {
    if (typeof this.rules.serialize !== 'function') {
      throw new TypeError('GameSession.serialize: rules must implement serialize(state)')
    }
    return {
      state: this.rules.serialize(this.state),
      log: this._log.map(({ move, t }) => ({ move, t })),
      t0: this._t0,
      tEnd: this._tEnd,
      seq: this._seq
    }
  }

  /**
   * Rebuild a session from a {@link serialize} snapshot (or its JSON round-trip).
   * The clock is re-injected — it's a live function, not serializable — while the
   * log and timing anchors are restored so `elapsed()` resumes correctly.
   * Requires the rules to implement `deserialize`.
   *
   * @param {Rules} rules
   * @param {{ state: object, log: Array<{ move: object, t: number }>, t0: number | null, tEnd: number | null }} snapshot
   * @param {{ clock?: () => number }} [opts]
   * @returns {GameSession}
   */
  static deserialize(rules, snapshot, { clock = () => 0 } = {}) {
    if (typeof rules.deserialize !== 'function') {
      throw new TypeError('GameSession.deserialize: rules must implement deserialize(snapshot)')
    }
    if (snapshot === null || typeof snapshot !== 'object') {
      throw new TypeError(`GameSession.deserialize: expected a snapshot object (got ${snapshot === null ? 'null' : typeof snapshot})`)
    }
    const { state, log, t0, tEnd, seq } = snapshot
    if (!Array.isArray(log)) {
      throw new TypeError('GameSession.deserialize: snapshot.log must be an array')
    }
    for (const entry of log) {
      if (entry === null || typeof entry !== 'object' || typeof entry.t !== 'number' || entry.move === null || typeof entry.move !== 'object') {
        throw new TypeError('GameSession.deserialize: each log entry must be { move: object, t: number }')
      }
    }
    if (!(t0 === null || typeof t0 === 'number') || !(tEnd === null || typeof tEnd === 'number')) {
      throw new TypeError('GameSession.deserialize: snapshot.t0/tEnd must each be a number or null')
    }
    if (!(seq === undefined || (Number.isInteger(seq) && seq >= 0))) {
      throw new TypeError('GameSession.deserialize: snapshot.seq must be a non-negative integer')
    }
    // rules.deserialize validates and revives the game-state half.
    const session = new GameSession(rules, { state: rules.deserialize(state), clock })
    session._log = log.map(({ move, t }) => ({ move, t }))
    session._t0 = t0
    session._tEnd = tEnd
    // Continue the sequence where it left off so move-event seq keeps rising
    // across a resume (absent in a pre-move-event snapshot ⇒ start at 0).
    session._seq = seq ?? 0
    return session
  }
}
