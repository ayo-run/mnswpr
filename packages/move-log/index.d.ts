/**
 * Assert a value is a well-formed move log — a non-empty string `schema_version`
 * and a valid events array — throwing a clear, specific error otherwise. Returns
 * the value (typed as the erased, game-blind form) for chaining; never mutates.
 *
 * @param {unknown} value
 * @returns {MoveLog}
 */
export function assertMoveLog(value: unknown): MoveLog;
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
export function createMoveLog<TType extends string = string, TPayload = unknown>(schemaVersion: string, events?: MoveEvent<TType, TPayload>[]): MoveLog<TType, TPayload>;
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
export function withReceivedTs<TType extends string, TPayload>(log: MoveLog<TType, TPayload>, stamp: (event: MoveEvent<TType, TPayload>, index: number) => number | undefined): MoveLog<TType, TPayload>;
/**
 * Non-throwing type guard: is `value` a well-formed move log? Checks the
 * container invariants only — remains blind to each `payload`.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isMoveLog(value: unknown): boolean;
/**
 * Serialize a move log to a JSON string. Validates first, so a malformed log is
 * rejected here rather than emitted. Inverse of {@link deserializeMoveLog}.
 *
 * @template {string} TType
 * @template TPayload
 * @param {MoveLog<TType, TPayload>} log
 * @returns {string}
 */
export function serializeMoveLog<TType extends string, TPayload>(log: MoveLog<TType, TPayload>): string;
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
export function deserializeMoveLog(json: string): MoveLog;
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
 */
export type MoveEvent<TType extends string = string, TPayload = unknown> = {
    seq: number;
    clientTs: number;
    type: TType;
    payload: TPayload;
    receivedTs?: number;
};
/**
 * The container: a schema-versioned, ordered array of recorded entries for one
 * run. `schema_version` is the game's move-event vocabulary version, verbatim.
 * Generic over the game (same parameters as {@link MoveEvent}); JSON-safe as long
 * as every `payload` is.
 */
export type MoveLog<TType extends string = string, TPayload = unknown> = {
    schema_version: string;
    events: MoveEvent<TType, TPayload>[];
};
