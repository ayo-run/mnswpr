/**
 * Assert a value is a well-formed move log — correct `schema_version` and a valid
 * events array — throwing a clear, specific error otherwise. Returns the value
 * (typed) for chaining; never mutates.
 *
 * @param {unknown} value
 * @returns {MoveLog<any>}
 */
export function assertMoveLog(value: unknown): MoveLog<any>;
/**
 * Build a move log from an ordered list of `{ seq, t, event }` records. Pure and
 * game-agnostic: it validates only the log's own invariants (metadata types and
 * strictly increasing `seq`), never the shape of `T`. Order is preserved and
 * entries are copied, so the log never aliases the caller's array.
 *
 * @template T
 * @param {MoveEvent<T>[]} [events] - ordered events, each `{ seq, t, event, receivedTs? }`
 * @returns {MoveLog<T>}
 */
export function createMoveLog<T>(events?: MoveEvent<T>[]): MoveLog<T>;
/**
 * Return a new move log with a received-side timestamp attached to each event
 * for which `stamp` returns a finite number; events where `stamp` returns
 * `undefined` are left as-is (keeping any existing `receivedTs`). This is how a
 * consumer records WHEN it received events — the log never cares where the value
 * came from. Pure: the input log is not mutated.
 *
 * @template T
 * @param {MoveLog<T>} log
 * @param {(event: MoveEvent<T>, index: number) => number | undefined} stamp
 * @returns {MoveLog<T>}
 */
export function withReceivedTs<T>(log: MoveLog<T>, stamp: (event: MoveEvent<T>, index: number) => number | undefined): MoveLog<T>;
/**
 * Non-throwing type guard: is `value` a well-formed move log of the current
 * schema version? Checks the container invariants only — remains blind to `T`.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isMoveLog(value: unknown): boolean;
/**
 * Serialize a move log to a JSON string. Validates first, so a malformed log is
 * rejected here rather than emitted. Inverse of {@link deserializeMoveLog}.
 *
 * @template T
 * @param {MoveLog<T>} log
 * @returns {string}
 */
export function serializeMoveLog<T>(log: MoveLog<T>): string;
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
export function deserializeMoveLog(json: string): MoveLog<any>;
/**
 * `@cozy-games/move-log` — a game-agnostic container for a recorded run of move
 * events. It wraps ANY game's event stream: `T` is the consuming game's own
 * event vocabulary (mnswpr's `MoveEvent` union from core-06 is the first `T`),
 * supplied by the caller.
 *
 * This module imports NO game types — that independence is the whole point and
 * is enforced by a dependency-graph guard in the tests. The log owns the
 * per-event recording metadata (`seq` + `t`, and an optional received-side
 * `receivedTs`) so `T` can stay a pure game payload with no required shape; the
 * module never inspects the inside of an `event`.
 *
 * Extraction to a standalone published package comes later; for now it lives as
 * a shared workspace module alongside `packages/utils`.
 */
/**
 * The move-log schema version.
 *
 * Versioning policy: OPTIONAL, purely additive fields (an event gaining an
 * optional `receivedTs`, say) do NOT bump this — a v1 reader ignores fields it
 * doesn't know, and a log written with them stays a valid v1 log. Bump ONLY on a
 * breaking change to the container shape (a renamed/removed field, a newly
 * *required* field), which would need dispatch on read. Never bump for changes
 * to a game's `T` vocabulary.
 *
 * @typedef {1} SchemaVersion
 */
export const SCHEMA_VERSION: SchemaVersion;
/**
 * A single recorded event: the log-owned recording metadata — a strictly
 * increasing sequence number `seq`, a source-side timestamp `t` (milliseconds),
 * and an OPTIONAL received-side timestamp `receivedTs` a consumer may attach when
 * it received the event — plus the game's opaque payload `event`. Generic over
 * the game's event type `T`. `receivedTs` is purpose-neutral: the log records
 * only THAT it was received at some time, never why or from where.
 */
export type MoveEvent<T> = {
    seq: number;
    t: number;
    event: T;
    receivedTs?: number;
};
/**
 * The container: a schema-versioned, ordered array of timestamped, sequenced
 * events for one recorded run. Generic over the game's event vocabulary `T`.
 * JSON-safe as long as `T` is.
 */
export type MoveLog<T> = {
    schema_version: SchemaVersion;
    events: MoveEvent<T>[];
};
/**
 * The move-log schema version.
 *
 * Versioning policy: OPTIONAL, purely additive fields (an event gaining an
 * optional `receivedTs`, say) do NOT bump this — a v1 reader ignores fields it
 * doesn't know, and a log written with them stays a valid v1 log. Bump ONLY on a
 * breaking change to the container shape (a renamed/removed field, a newly
 * *required* field), which would need dispatch on read. Never bump for changes
 * to a game's `T` vocabulary.
 */
export type SchemaVersion = 1;
