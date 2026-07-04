# @cozy-games/move-log

A **game-agnostic** container for a recorded run of move events. It wraps any game's event stream in a schema-versioned, ordered, timestamped log.

```js
import { createMoveLog, isMoveLog, SCHEMA_VERSION } from '@cozy-games/move-log'

// `T` is your game's own event vocabulary — supplied by you, unknown to us.
const log = createMoveLog([
  { t: 0, event: { type: 'reveal', r: 0, c: 0 } },
  { t: 50, event: { type: 'flag', r: 1, c: 2 } }
])
// → { schema_version: 1, events: [ { t, event }, ... ] }
```

## Shape

| field            | type              | meaning                                  |
| ---------------- | ----------------- | ---------------------------------------- |
| `schema_version` | `1`               | the move-log container version           |
| `events`         | `MoveEvent<T>[]`  | ordered, each `{ t, event }`             |

`MoveEvent<T> = { t: number, event: T }` — the log owns the per-event timestamp
`t`, so `T` stays a pure game payload with no required shape.

## Invariant: zero game-specific imports

This module **must never import a game package** (e.g. mnswpr) or any game
vocabulary. `T` is always supplied by the consumer; the log only ever sees
opaque payloads. This independence is the whole point — it lets one move-log
format serve every game.

The rule is enforced by a dependency-graph guard in `test/move-log.test.js`
(scans the package's source and manifest for game references). Keep it green.
