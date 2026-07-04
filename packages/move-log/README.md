# @cozy-games/move-log

A **game-agnostic** container for a recorded run of move events. It wraps any game's event stream in a schema-versioned, ordered, timestamped log.

```js
import {
  createMoveLog, serializeMoveLog, deserializeMoveLog, isMoveLog, SCHEMA_VERSION
} from '@cozy-games/move-log'

// `T` is your game's own event vocabulary — supplied by you, unknown to us.
const log = createMoveLog([
  { seq: 1, t: 0, event: { type: 'reveal', r: 0, c: 0 } },
  { seq: 2, t: 50, event: { type: 'flag', r: 1, c: 2 } }
])
// → { schema_version: 1, events: [ { seq, t, event }, ... ] }

const json = serializeMoveLog(log)          // → JSON string
const restored = deserializeMoveLog(json)    // → validated MoveLog, or throws
```

## Shape

| field            | type              | meaning                                       |
| ---------------- | ----------------- | --------------------------------------------- |
| `schema_version` | `1`               | the move-log container version                |
| `events`         | `MoveEvent<T>[]`  | ordered, each `{ seq, t, event }`             |

`MoveEvent<T> = { seq: number, t: number, event: T }` — the log owns the
per-event recording metadata (a strictly increasing `seq` and a timestamp `t`),
so `T` stays a pure game payload with no required shape.

`deserializeMoveLog` round-trips a serialized log with full fidelity (order,
timestamps, sequence numbers) and rejects malformed input — bad JSON, missing or
wrong-typed fields, or non-monotonic `seq` — with a clear error, never returning
a partially-parsed log.

## Invariant: zero game-specific imports

This module **must never import a game package** (e.g. mnswpr) or any game
vocabulary. `T` is always supplied by the consumer; the log only ever sees
opaque payloads. This independence is the whole point — it lets one move-log
format serve every game.

The rule is enforced by a dependency-graph guard in `test/move-log.test.js`
(scans the package's source and manifest for game references). Keep it green.
