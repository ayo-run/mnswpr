# @cozy-games/move-log

A **game-agnostic** container for a recorded run of move events — the generic
envelope of cozy-games **ADR-002 §1**. It wraps any game's move stream in a
schema-versioned, ordered log of `{ seq, clientTs, type, payload }` entries and
never looks inside a `payload`.

```js
import {
  createMoveLog, withReceivedTs,
  serializeMoveLog, deserializeMoveLog, isMoveLog, assertMoveLog
} from '@cozy-games/move-log'

// The first argument is YOUR game's move-event vocabulary version — a string,
// carried verbatim. `type` names a move in that vocabulary; `payload` is your
// game's opaque move data (never inspected here).
const log = createMoveLog('mnswpr-moves/1', [
  { seq: 1, clientTs: 0,  type: 'reveal', payload: { r: 0, c: 0 } },
  { seq: 2, clientTs: 50, type: 'flag',   payload: { r: 1, c: 2 } }
])
// → { schema_version: 'mnswpr-moves/1', events: [ { seq, clientTs, type, payload }, ... ] }

const json = serializeMoveLog(log)          // → JSON string
const restored = deserializeMoveLog(json)    // → validated MoveLog, or throws

// A consumer records WHEN it received events (host clock), additively:
const stamped = withReceivedTs(restored, () => hostNow())
// → each event now also carries `receivedTs`; still a valid log
```

## Shape — generic over the game

```ts
// Parameterized over the game's move-event discriminator and payload, with
// defaults so game-blind code can use the erased (string / unknown) form.
interface MoveEvent<TType extends string = string, TPayload = unknown> {
  seq: number         // integer, STRICTLY INCREASING (starts at 1, survives resume) — log metadata
  clientTs: number    // finite ms timestamp (client clock) — log metadata
  type: TType         // the game's move-event discriminator (ADR §1: `type: T`)
  payload: TPayload   // game-specific move data — OPAQUE to the package (never inspected)
  receivedTs?: number // OPTIONAL, additive: consumer-side receipt time
}

interface MoveLog<TType extends string = string, TPayload = unknown> {
  schema_version: string   // the GAME's move-event vocabulary version, verbatim
  events: MoveEvent<TType, TPayload>[]
}
```

The move splits into a surfaced `type` **discriminator** plus an **opaque**
`payload` — exactly ADR-002 §1 — so game-agnostic tooling (progress overlays,
analytics, log inspection) can key off the event *kind* without a game adapter,
while the package never looks inside `payload` and treats `type` only as an
opaque non-empty string. The log owns the recording metadata (`seq`, `clientTs`,
and an optional `receivedTs`); the game owns `type` + `payload`.

**Genericness is the point:** a second game reuses this package with **zero
changes** — it just instantiates its own vocabulary. Minesweeper uses
`MoveLog<'reveal' | 'flag' | 'unflag' | 'chord', { r: number; c: number }>`; the
defaults give persistence/routing code a usable `MoveLog` with `type: string` +
opaque `payload`.

```js
/** @type {import('@cozy-games/move-log').MoveLog<'a' | 'b', { x: number }>} */
const log = createMoveLog('made-up-game/1', [
  { seq: 1, clientTs: 0, type: 'a', payload: { x: 1 } }
])
```

`.d.ts` declarations ship with the package (generated from the JSDoc), so
consumers get the exact generic `MoveEvent` / `MoveLog` types with no ambient
stand-in.

## `schema_version` is the game's vocabulary version — a string, verbatim

Per ADR-002 §2, *"the event vocabulary and log `schema_version` live in the
game's package."* The version identifies the **game's move-event vocabulary**
(e.g. `"mnswpr-moves/1"`), supplied by the caller and carried **verbatim** so a
reader of a forever-stored log always knows how to replay it. This package owns
no version of its own and never rewrites the one you pass. `receivedTs` remains
optional and additive — a log is valid whether every event, some events, or no
events carry it, and a reader that doesn't know the field simply ignores it.

## API

- `createMoveLog(schemaVersion, events?)` — stamp `schema_version` with the
  supplied string verbatim, copy the events (no aliasing), validate, return the log.
- `assertMoveLog(value)` — throw a distinct, field-specific error on any
  violation; return the log otherwise. **Reject, never repair** (no mutation,
  truncation, or coercion).
- `isMoveLog(value)` — non-throwing wrapper around `assertMoveLog`.
- `serializeMoveLog(log)` / `deserializeMoveLog(json)` — lossless JSON round-trip
  (order, `seq`, `clientTs`, `type`, `payload`, `receivedTs`); rejects malformed
  input, never returning a partially-parsed log.
- `withReceivedTs(log, stamp)` — return a new log with a received-side timestamp
  attached to each event for which `stamp` returns a finite number; input untouched.

### Invariants enforced by `assertMoveLog`

`schema_version` is a non-empty string; `events` is an array; every entry is a
plain object with an **integer, strictly-increasing** `seq`, a **finite**
`clientTs`, a **non-empty string** `type`, and a **plain-object** `payload` (not
an array or `null`); `receivedTs` is finite when present.

## Invariant: zero game-specific imports

This module **must never import a game package** (e.g. mnswpr) or any game
vocabulary. `type`/`payload` are always supplied by the consumer; the log only
ever sees opaque payloads. This independence is the whole point — it lets one
move-log format serve every game. The rule is enforced by a dependency-graph
guard in `test/move-log.test.js` (scans the package's source and manifest for
game references). Keep it green.
