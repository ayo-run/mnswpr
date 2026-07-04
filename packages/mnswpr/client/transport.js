// @ts-check
import { GameSession } from '../core/session/session.js'

/**
 * In-process transport: runs a `GameSession` locally and emits its events.
 *
 * The Transport interface is intentionally async — `send()` returns a Promise —
 * so a future `RemoteTransport` (server-authoritative) is a drop-in with no
 * change to the client (server-readiness invariant #1). Rendering is driven by
 * `onEvent`, which Local fires synchronously inside `send()` and Remote would
 * fire when the server replies; the client never depends on `send()`'s timing.
 *
 * Only serializable messages cross this boundary (moves in; events + a projected
 * view out) — never the live session/state (invariant #2).
 */
export class LocalTransport {
  /**
   * @param {object} rules - a GameRules implementation (e.g. MinesweeperRules)
   * @param {{ seed: number, config: object, clock?: () => number }} opts
   */
  constructor(rules, opts) {
    this.session = new GameSession(rules, opts)
    this._subs = []
  }

  /** @param {(payload: { events: object[], view: object, time: number }) => void} cb */
  onEvent(cb) {
    this._subs.push(cb)
    return () => { this._subs = this._subs.filter(s => s !== cb) }
  }

  /**
   * Apply a move and emit the resulting events/view. Returns a Promise for
   * interface parity with a remote transport.
   * @param {object} move
   * @returns {Promise<{ events: object[], view: object, time: number }>}
   */
  send(move) {
    const payload = this.session.applyMove(move)
    for (const cb of this._subs) cb(payload)
    return Promise.resolve(payload)
  }

  status() { return this.session.status() }
  view() { return this.session.view() }
  result() { return this.session.result() }
  elapsed() { return this.session.elapsed() }
}
