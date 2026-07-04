// @ts-check

/**
 * `@cozy-games/move-log` — a game-agnostic container for a recorded run of move
 * events. It wraps ANY game's event stream: `T` is the consuming game's own
 * event vocabulary (mnswpr's `MoveEvent` union from core-06 is the first `T`),
 * supplied by the caller.
 *
 * This module imports NO game types — that independence is the whole point and
 * is enforced by a dependency-graph guard in the tests. The log owns the
 * per-event recording metadata (`seq` + `t`) so `T` can stay a pure game payload
 * with no required shape; the module never inspects the inside of an `event`.
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
 * A single recorded event: the log-owned recording metadata — a strictly
 * increasing sequence number `seq` and a timestamp `t` (milliseconds) — plus the
 * game's opaque payload `event`. Generic over the game's event type `T`.
 *
 * @template T
 * @typedef {{ seq: number, t: number, event: T }} MoveEvent
 */

/**
 * The container: a schema-versioned, ordered array of timestamped, sequenced
 * events for one recorded run. Generic over the game's event vocabulary `T`.
 * JSON-safe as long as `T` is.
 *
 * @template T
 * @typedef {{ schema_version: SchemaVersion, events: MoveEvent<T>[] }} MoveLog
 */

/**
 * Validate an events array: each entry must be a `{ seq, t, event }` with an
 * integer `seq`, a finite numeric `t`, and a present `event`; and `seq` must be
 * STRICTLY INCREASING across the array. Throws a distinct, field-specific error
 * on the first problem — never leaves a caller with a half-checked array.
 *
 * @param {unknown} events
 */
function assertEvents(events) {
  if (!Array.isArray(events)) {
    throw new TypeError(`move-log: events must be an array (got ${events === null ? 'null' : typeof events})`)
  }
  let prevSeq = -Infinity
  events.forEach((e, i) => {
    if (e === null || typeof e !== 'object') {
      throw new TypeError(`move-log: events[${i}] must be an object (got ${e === null ? 'null' : typeof e})`)
    }
    if (!('event' in e)) {
      throw new TypeError(`move-log: events[${i}] is missing 'event'`)
    }
    if (typeof e.t !== 'number' || !Number.isFinite(e.t)) {
      throw new TypeError(`move-log: events[${i}].t must be a finite number (got ${JSON.stringify(e.t)})`)
    }
    if (!Number.isInteger(e.seq)) {
      throw new TypeError(`move-log: events[${i}].seq must be an integer (got ${JSON.stringify(e.seq)})`)
    }
    if (e.seq <= prevSeq) {
      throw new RangeError(`move-log: events[${i}].seq must be strictly increasing (got ${e.seq} after ${prevSeq})`)
    }
    prevSeq = e.seq
  })
}

/**
 * Assert a value is a well-formed move log — correct `schema_version` and a valid
 * events array — throwing a clear, specific error otherwise. Returns the value
 * (typed) for chaining; never mutates.
 *
 * @param {unknown} value
 * @returns {MoveLog<any>}
 */
export function assertMoveLog(value) {
  if (value === null || typeof value !== 'object') {
    throw new TypeError(`move-log: expected an object (got ${value === null ? 'null' : typeof value})`)
  }
  const v = /** @type {any} */ (value)
  if (v.schema_version !== SCHEMA_VERSION) {
    throw new RangeError(`move-log: unsupported schema_version ${JSON.stringify(v.schema_version)} (expected ${SCHEMA_VERSION})`)
  }
  assertEvents(v.events)
  return v
}

/**
 * Build a move log from an ordered list of `{ seq, t, event }` records. Pure and
 * game-agnostic: it validates only the log's own invariants (metadata types and
 * strictly increasing `seq`), never the shape of `T`. Order is preserved and
 * entries are copied, so the log never aliases the caller's array.
 *
 * @template T
 * @param {MoveEvent<T>[]} [events] - ordered events, each `{ seq, t, event }`
 * @returns {MoveLog<T>}
 */
export function createMoveLog(events = []) {
  assertEvents(events)
  return {
    schema_version: SCHEMA_VERSION,
    events: events.map(({ seq, t, event }) => ({ seq, t, event }))
  }
}

/**
 * Non-throwing type guard: is `value` a well-formed move log of the current
 * schema version? Checks the container invariants only — remains blind to `T`.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isMoveLog(value) {
  try {
    assertMoveLog(value)
    return true
  } catch {
    return false
  }
}

/**
 * Serialize a move log to a JSON string. Validates first, so a malformed log is
 * rejected here rather than emitted. Inverse of {@link deserializeMoveLog}.
 *
 * @template T
 * @param {MoveLog<T>} log
 * @returns {string}
 */
export function serializeMoveLog(log) {
  assertMoveLog(log)
  return JSON.stringify(log)
}

/**
 * Parse and validate a JSON string into a move log, with full fidelity: event
 * order, timestamps, and sequence numbers survive the round-trip exactly.
 * Rejects malformed input (bad JSON, missing/typed-wrong fields, non-monotonic
 * `seq`) with a clear error and NEVER returns a partially-parsed log. Inverse of
 * {@link serializeMoveLog}.
 *
 * @param {string} json
 * @returns {MoveLog<any>}
 */
export function deserializeMoveLog(json) {
  if (typeof json !== 'string') {
    throw new TypeError(`deserializeMoveLog: expected a JSON string (got ${json === null ? 'null' : typeof json})`)
  }
  let parsed
  try {
    parsed = JSON.parse(json)
  } catch (err) {
    throw new SyntaxError(`deserializeMoveLog: invalid JSON — ${/** @type {Error} */ (err).message}`, { cause: err })
  }
  return assertMoveLog(parsed)
}
