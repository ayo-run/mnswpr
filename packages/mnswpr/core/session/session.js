// @ts-check

/**
 * Layer 1 — owns lifecycle, the (injected) clock, and the move log; delegates all
 * game meaning to an injected `rules` object. This is where timing authority
 * lives: on the client `clock` is `Date.now` (cosmetic); on a server it is the
 * server's clock (authoritative). The session never calls a wall clock itself.
 * Future home: @cozy-games/game-session.
 *
 * @typedef {{ init: Function, apply: Function, status: Function, project: Function, serialize?: Function, deserialize?: Function }} Rules
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

    return { events, view: this.rules.project(state), time: this.elapsed() }
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
   * @returns {{ state: object, log: Array<{ move: object, t: number }>, t0: number | null, tEnd: number | null }}
   */
  serialize() {
    if (typeof this.rules.serialize !== 'function') {
      throw new TypeError('GameSession.serialize: rules must implement serialize(state)')
    }
    return {
      state: this.rules.serialize(this.state),
      log: this._log.map(({ move, t }) => ({ move, t })),
      t0: this._t0,
      tEnd: this._tEnd
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
    const session = new GameSession(rules, { state: rules.deserialize(snapshot.state), clock })
    session._log = snapshot.log.map(({ move, t }) => ({ move, t }))
    session._t0 = snapshot.t0
    session._tEnd = snapshot.tEnd
    return session
  }
}
