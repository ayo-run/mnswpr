# 0002. Game-agnostic cores behind a game-adapter interface

**Status:** Accepted · **Repo:** cozy-games · **Date:** 2026-07

## Context
Multiple games (Minesweeper today, Sudoku planned) share generic infrastructure:
move logging, replay, timing, and leaderboards. Building this per-game duplicates
logic; abstracting prematurely risks wrong boundaries.

## Decision
Core modules are written **game-agnostic from day one**; each game supplies an
**adapter**. Package extraction and npm publishing are deferred until a second
game consumes the seam ("create seams, not packages").

### The adapter contract (v0, will be frozen after the second game ships)
A game adapter supplies:

1. **Event vocabulary** — a typed set of move events (Minesweeper: `reveal | flag | unflag | chord`). Core code handles only the generic envelope `MoveEvent<T>`: `{ seq, clientTs, type: T, payload }` wrapped in a log carrying `schema_version`.
2. **Progress reducer** — `progress(events) → percent` for progress display.
3. **State reducer** — `apply(state, event) → state` for full replay and validation.
4. **Terminal predicate** — `isTerminal(state) → win | loss | null`; generic timing code measures first event → terminal event.
5. **Board payload type** — serialized layout (e.g. grid + mine positions) stored as typed JSON under a `game_type` discriminator.
6. **Headless core** — pure functions (`generateBoard`, reducers, predicates) runnable in Node with no DOM dependency; presentation is a separate layer.
7. **Board injection & resume** — constructors accepting an externally supplied board and a mid-game state snapshot.

### Rules
- Core/engine modules import no game-specific types.
- The event vocabulary and log schema_version live in the game's package; recorded logs are replayable forever (schema changes are versioned, never breaking).
- Generic storage columns (id, player, outcome, timestamps, game_type) never require migration to add a game; new games add a payload type and adapter only.

## Consequences
- Adding a game = writing one adapter; infrastructure is untouched.
- The replay engine and the log envelope become extractable packages once validated by the second adapter.
- The adapter interface is frozen and versioned after the second game ships; breaking changes thereafter require a new decision record.
