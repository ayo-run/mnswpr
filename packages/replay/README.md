# @cozy-games/replay

A **game-agnostic** replay engine. `PlaybackClock` re-drives a
[`@cozy-games/move-log`](../move-log) envelope over time — scheduling each
recorded event to fire at its offset — with `play` / `pause` / `seek`.

```js
import { PlaybackClock } from '@cozy-games/replay'

const clock = new PlaybackClock(envelope)     // a valid move-log envelope
const off = clock.on(record => apply(record.event)) // record = { seq, t, event, ... }

clock.play()      // events fire at their recorded offsets
clock.pause()     // freeze at the current position
clock.seek(1500)  // jump to 1500ms — delivers exactly the events at offset <= 1500
```

## Progress via a game adapter

The engine never interprets events. To show completion percent, supply a game
**adapter** with a `progress(events) → %` reducer at construction:

```js
const adapter = { progress: (events) => (events.length / total) * 100 }
const clock = new PlaybackClock(envelope, {}, adapter)

clock.seek(1500)
clock.progress() // 0–100 (clamped), or null if no adapter supplied
```

The reducer receives the ordered slice of events delivered so far; the engine
clamps the result and stays blind to the payload. See
[docs/adapter-interface.md](./docs/adapter-interface.md) for the full contract.

## Offsets

Each event fires at its **offset** — its recorded `t` minus the first event's
`t`, so playback time `0` is the first event. `duration` is the last event's
offset.

## Injected clock + scheduler

The time source and scheduler are injected (mirroring the core session's
injected-clock seam), so tests get exact, deterministic timing:

```js
new PlaybackClock(envelope, { clock, setTimeout, clearTimeout })
```

They default to the real host (`Date.now` + global timers). Under a deterministic
injected scheduler — or `vi.useFakeTimers()` — events fire **exactly** at their
offsets (tolerance 0). Under the real host scheduler the tolerance is the host's
timer resolution (a few ms), the same bound as any `setTimeout`.

## Seek is deterministic

The clock keeps one invariant: `cursor` = the number of events whose offset is
`<= position`. So after `seek(t)` the delivered set is exactly the events at
offset `<= t`:

- **Forward** (`seek` ahead, or playback advancing) delivers each newly-passed
  event once, in order.
- **Backward** rewinds the cursor without delivering; passing those offsets again
  going forward re-delivers them (so scrub-back-then-replay works).

No event is ever delivered twice for a single forward pass, and none is dropped.

## Invariant: envelope only, no game types

This module imports **only** `@cozy-games/move-log` (to validate the envelope) and
never a game package. It treats every `event` payload as opaque. Enforced by a
dependency-graph guard in `test/playback-clock.test.js`.
