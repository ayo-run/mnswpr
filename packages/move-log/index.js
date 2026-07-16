// @ts-check

/**
 * `@cozy-games/move-log` — a game-agnostic container for a recorded run of move
 * events, implementing the generic envelope of cozy-games ADR-002 §1.
 *
 * Each recorded entry is `{ seq, clientTs, type, payload }` (+ an optional,
 * additive `receivedTs`): the log-owned recording metadata plus a surfaced move
 * `type` discriminator (a string naming a member of the consuming game's
 * move-event vocabulary) and an OPAQUE `payload` carrying that game's move data.
 *
 * The container is **generic over the game** — `MoveEvent<TType, TPayload>` and
 * `MoveLog<TType, TPayload>` are parameterized so a second game reuses this
 * package with ZERO changes: Minesweeper instantiates
 * `MoveLog<'reveal'|'flag'|'unflag'|'chord', { r: number, c: number }>`; another
 * game supplies its own `TType`/`TPayload`. The defaults (`string`, `unknown`)
 * give game-blind persistence/routing/inspection code a usable erased form. At
 * runtime the package imports NO game types, never inspects the inside of a
 * `payload`, and treats `type` only as an opaque non-empty string — independence
 * enforced by a dependency-graph guard in the tests.
 *
 * The container carries a `schema_version`: a caller-supplied STRING identifying
 * the game's frozen move-event vocabulary (e.g. `"mnswpr-moves/1"`), stored
 * verbatim so a reader of a forever-stored log always knows how to replay it (ADR
 * §2). The package owns no version of its own.
 */

/**
 * A single recorded move event — the log-owned recording metadata plus the
 * game's surfaced `type` + opaque `payload`:
 *
 * - `seq` — integer, STRICTLY INCREASING across the log (starts at 1, survives resume).
 * - `clientTs` — finite millisecond timestamp from the client clock.
 * - `type` — the game's move-event discriminator (ADR §1 `type: T`); a non-empty string.
 * - `payload` — game-specific move data; OPAQUE to the package (never inspected).
 * - `receivedTs` — OPTIONAL, additive: a consumer-side receipt time (finite ms).
 *
 * Generic over the game's discriminator `TType` and payload `TPayload`, with
 * defaults so game-blind code can use the erased form.
 *
 * @template {string} [TType=string]
 * @template [TPayload=unknown]
 * @typedef {{ seq: number, clientTs: number, type: TType, payload: TPayload, receivedTs?: number }} MoveEvent
 */

/**
 * The container: a schema-versioned, ordered array of recorded entries for one
 * run. `schema_version` is the game's move-event vocabulary version, verbatim.
 * Generic over the game (same parameters as {@link MoveEvent}); JSON-safe as long
 * as every `payload` is.
 *
 * @template {string} [TType=string]
 * @template [TPayload=unknown]
 * @typedef {{ schema_version: string, events: MoveEvent<TType, TPayload>[] }} MoveLog
 */

/**
 * Assert a schema version is a non-empty string — the game's move-event
 * vocabulary version, carried verbatim (ADR §2). Throws otherwise.
 *
 * @param {unknown} version
 */
function assertSchemaVersion(version) {
  if (typeof version !== 'string' || version.length === 0) {
    throw new TypeError(`move-log: schema_version must be a non-empty string (got ${JSON.stringify(version)})`)
  }
}

/**
 * Validate an events array: each entry must be a `{ seq, clientTs, type, payload }`
 * object with an integer `seq`, a finite `clientTs`, a non-empty string `type`,
 * and a PRESENT `payload` (any value — never inspected); `seq` must be STRICTLY
 * INCREASING; a present `receivedTs` must be finite. Throws a distinct,
 * field-specific error on the first problem — never leaves a caller with a
 * half-checked array. Reject, never repair: nothing is mutated, truncated, or
 * coerced. The inside of `payload` is never inspected (game-blind).
 *
 * @param {unknown} events
 */
function assertEvents(events) {
  if (!Array.isArray(events)) {
    throw new TypeError(`move-log: events must be an array (got ${events === null ? 'null' : typeof events})`)
  }
  let prevSeq = -Infinity
  events.forEach((e, i) => {
    if (e === null || typeof e !== 'object' || Array.isArray(e)) {
      throw new TypeError(`move-log: events[${i}] must be an object (got ${e === null ? 'null' : Array.isArray(e) ? 'array' : typeof e})`)
    }
    if (!Number.isInteger(e.seq)) {
      throw new TypeError(`move-log: events[${i}].seq must be an integer (got ${JSON.stringify(e.seq)})`)
    }
    if (e.seq <= prevSeq) {
      throw new RangeError(`move-log: events[${i}].seq must be strictly increasing (got ${e.seq} after ${prevSeq})`)
    }
    if (typeof e.clientTs !== 'number' || !Number.isFinite(e.clientTs)) {
      throw new TypeError(`move-log: events[${i}].clientTs must be a finite number (got ${JSON.stringify(e.clientTs)})`)
    }
    if (typeof e.type !== 'string' || e.type.length === 0) {
      throw new TypeError(`move-log: events[${i}].type must be a non-empty string (got ${JSON.stringify(e.type)})`)
    }
    // `payload` must be PRESENT but is otherwise opaque — any value, never inspected.
    if (!('payload' in e) || e.payload === undefined) {
      throw new TypeError(`move-log: events[${i}].payload must be present`)
    }
    if (e.receivedTs !== undefined && (typeof e.receivedTs !== 'number' || !Number.isFinite(e.receivedTs))) {
      throw new TypeError(`move-log: events[${i}].receivedTs must be a finite number when present (got ${JSON.stringify(e.receivedTs)})`)
    }
    prevSeq = e.seq
  })
}

/**
 * Copy one entry to the canonical field set, carrying `receivedTs` through only
 * when it's actually present (so absent stays absent — no `receivedTs: undefined`
 * keys leak into the log or its JSON). `payload` is copied by reference: it's the
 * game's opaque data and the log never clones or inspects it.
 *
 * @template {string} TType
 * @template TPayload
 * @param {MoveEvent<TType, TPayload>} e
 * @returns {MoveEvent<TType, TPayload>}
 */
function copyEvent(e) {
  /** @type {MoveEvent<TType, TPayload>} */
  const out = { seq: e.seq, clientTs: e.clientTs, type: e.type, payload: e.payload }
  if (e.receivedTs !== undefined) out.receivedTs = e.receivedTs
  return out
}

/**
 * Assert a value is a well-formed move log — a non-empty string `schema_version`
 * and a valid events array — throwing a clear, specific error otherwise. Returns
 * the value (typed as the erased, game-blind form) for chaining; never mutates.
 *
 * @param {unknown} value
 * @returns {MoveLog}
 */
export function assertMoveLog(value) {
  if (value === null || typeof value !== 'object') {
    throw new TypeError(`move-log: expected an object (got ${value === null ? 'null' : typeof value})`)
  }
  const v = /** @type {any} */ (value)
  assertSchemaVersion(v.schema_version)
  assertEvents(v.events)
  return v
}

/**
 * Build a move log for a game's move-event vocabulary. `schemaVersion` names that
 * vocabulary (e.g. `"mnswpr-moves/1"`) and is stored verbatim. Pure and
 * game-agnostic: it validates only the log's own invariants (metadata types and
 * strictly increasing `seq`), never the shape of a `payload`. Order is preserved
 * and entries are copied, so the log never aliases the caller's array. Generic
 * over the game — infers `TType`/`TPayload` from `events`.
 *
 * @template {string} [TType=string]
 * @template [TPayload=unknown]
 * @param {string} schemaVersion - the game's move-event vocabulary version, stored verbatim
 * @param {MoveEvent<TType, TPayload>[]} [events] - ordered entries, each `{ seq, clientTs, type, payload, receivedTs? }`
 * @returns {MoveLog<TType, TPayload>}
 */
export function createMoveLog(schemaVersion, events = []) {
  assertSchemaVersion(schemaVersion)
  assertEvents(events)
  return {
    schema_version: schemaVersion,
    events: events.map(copyEvent)
  }
}

/**
 * Return a new move log with a received-side timestamp attached to each event
 * for which `stamp` returns a finite number; events where `stamp` returns
 * `undefined` are left as-is (keeping any existing `receivedTs`). This is how a
 * consumer records WHEN it received events — the log never cares where the value
 * came from. Pure: the input log is not mutated.
 *
 * @template {string} TType
 * @template TPayload
 * @param {MoveLog<TType, TPayload>} log
 * @param {(event: MoveEvent<TType, TPayload>, index: number) => number | undefined} stamp
 * @returns {MoveLog<TType, TPayload>}
 */
export function withReceivedTs(log, stamp) {
  assertMoveLog(log)
  const events = log.events.map((e, i) => {
    const rt = stamp(e, i)
    if (rt === undefined) return copyEvent(e)
    if (typeof rt !== 'number' || !Number.isFinite(rt)) {
      throw new TypeError(`withReceivedTs: stamp must return a finite number or undefined (got ${JSON.stringify(rt)} at index ${i})`)
    }
    return { ...copyEvent(e), receivedTs: rt }
  })
  return { schema_version: log.schema_version, events }
}

/**
 * Non-throwing type guard: is `value` a well-formed move log? Checks the
 * container invariants only — remains blind to each `payload`.
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
 * @template {string} TType
 * @template TPayload
 * @param {MoveLog<TType, TPayload>} log
 * @returns {string}
 */
export function serializeMoveLog(log) {
  assertMoveLog(log)
  return JSON.stringify(log)
}

/**
 * Parse and validate a JSON string into a move log, with full fidelity: event
 * order, `seq`, `clientTs`, `type`, `payload`, and any `receivedTs` survive the
 * round-trip exactly. Rejects malformed input (bad JSON, missing/typed-wrong
 * fields, non-monotonic `seq`) with a clear error and NEVER returns a
 * partially-parsed log. Inverse of {@link serializeMoveLog}.
 *
 * @param {string} json
 * @returns {MoveLog}
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
