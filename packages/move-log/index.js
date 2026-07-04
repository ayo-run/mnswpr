// @ts-check

/**
 * `@cozy-games/move-log` — a game-blind container for a recorded run of move
 * events. It wraps ANY game's event stream: `T` is the consuming game's own
 * event vocabulary (mnswpr's `MoveEvent` union from core-06 is the first `T`),
 * supplied by the caller.
 *
 * This module imports NO game types — that independence is the whole point and
 * is enforced by a dependency-graph guard in the tests. The log owns the
 * per-event timestamp (`{ t, event }`) so `T` can stay a pure game payload with
 * no required shape; the module never inspects the inside of an event.
 *
 * Extraction to a standalone published package comes later; for now it lives as
 * a shared workspace module alongside `packages/utils`.
 */

/**
 * The move-log schema version. Bump ONLY on a breaking change to the container
 * shape itself — never for changes to a game's `T` vocabulary.
 *
 * @typedef {1} SchemaVersion
 */
export const SCHEMA_VERSION = /** @type {SchemaVersion} */ (1)

/**
 * A single recorded event: the game's opaque payload `event` plus the
 * log-owned timestamp `t` (milliseconds). Generic over the game's event type
 * `T`.
 *
 * @template T
 * @typedef {{ t: number, event: T }} MoveEvent
 */

/**
 * The container: a schema-versioned, ordered array of timestamped events for one
 * recorded run. Generic over the game's event vocabulary `T`. JSON-safe as long
 * as `T` is.
 *
 * @template T
 * @typedef {{ schema_version: SchemaVersion, events: MoveEvent<T>[] }} MoveLog
 */

/**
 * Build a move log from an ordered list of already-timestamped events. Pure and
 * game-blind: it validates only the log's own invariants (each entry is a
 * `{ t: number, event }`), never the shape of `T`. Order is preserved as given.
 *
 * @template T
 * @param {MoveEvent<T>[]} [events] - ordered events, each `{ t, event }`
 * @returns {MoveLog<T>}
 */
export function createMoveLog(events = []) {
  if (!Array.isArray(events)) {
    throw new TypeError(`createMoveLog: events must be an array (got ${events === null ? 'null' : typeof events})`)
  }
  const copied = events.map((e, i) => {
    if (e === null || typeof e !== 'object' || typeof e.t !== 'number' || !('event' in e)) {
      throw new TypeError(`createMoveLog: events[${i}] must be { t: number, event }`)
    }
    return { t: e.t, event: e.event }
  })
  return { schema_version: SCHEMA_VERSION, events: copied }
}

/**
 * Runtime type guard: is `value` a well-formed move log of the current schema
 * version? Checks the container invariants only — remains blind to `T`.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isMoveLog(value) {
  if (value === null || typeof value !== 'object') return false
  const v = /** @type {any} */ (value)
  if (v.schema_version !== SCHEMA_VERSION || !Array.isArray(v.events)) return false
  return v.events.every(e => e !== null && typeof e === 'object' && typeof e.t === 'number' && 'event' in e)
}
