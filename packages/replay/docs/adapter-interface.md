# Replay adapter interface

The replay engine is **game-agnostic**: it schedules and delivers the events in a
[`@cozy-games/move-log`](../../move-log) envelope over time, but it never
interprets what an event *means*. All game meaning enters through a **game
adapter** — the seam defined here. This is the concrete realization of the
progress-reducer item in
[ADR 0002](../../../docs/decisions/0002-game-adapter-pattern.md).

## `ReplayAdapter<T>`

An adapter is a plain object supplied at construction:

```js
new PlaybackClock(envelope, deps, adapter)
```

```ts
// Typed generically over the game's event vocabulary T.
type ReplayAdapter<T> = {
  progress?: ProgressReducer<T>
}

type ProgressReducer<T> = (events: MoveEvent<T>[]) => number  // 0–100
```

`MoveEvent<T>` is the move-log record `{ seq, t, event, receivedTs? }`, where
`event` is the game's own payload — opaque to the engine.

## `progress(events) → %`

The only adapter method today. It maps the **ordered slice of events delivered so
far** (every event whose offset ≤ the current playback position) to a completion
percentage.

- **Input:** `MoveEvent<T>[]` — the played-so-far slice, in order. To compute a
  percentage the adapter typically needs a total (e.g. total safe cells); it owns
  that context, usually by closing over the board it was built from. The engine
  passes only the slice.
- **Output:** a number in `[0, 100]`. The engine **clamps** the result into range
  and throws if the reducer returns a non-number, so an adapter can be permissive.
- **When:** call `clock.progress()` at any time. It returns `null` if no adapter
  (or no `progress`) was supplied — the engine never invents a percentage.

```js
// A minesweeper-style adapter, built over its board (illustrative):
const adapter = {
  progress: (events) => {
    const revealed = events.filter(e => e.event.type === 'reveal').length
    return (revealed / totalSafeCells) * 100
  }
}
const clock = new PlaybackClock(envelope, {}, adapter)
clock.seek(1500)
clock.progress() // → e.g. 42
```

## Contract rules

- **The engine calls the reducer; it never interprets events itself.** Engine
  source references only envelope types (`MoveEvent` / `MoveLog`) and the log's
  recording metadata (`seq`, `t`) — never an event's `.event` payload. This is
  enforced by a guard in `test/playback-clock.test.js`.
- **The adapter owns all game meaning** — event vocabulary, progress math, and
  (as the contract grows) state reduction and terminal predicates per ADR 0002.
- **Typed generically over `T`** so one engine serves every game.
