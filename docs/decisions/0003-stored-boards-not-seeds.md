# 0003. Stored board layouts, not reproducible seeds

**Status:** Accepted · **Repo:** cozy-games · **Date:** 2026-07

## Context
Replay and shared-board features require two plays of the same board. Two options:
(a) seeded PRNG generation, where a seed reproduces the board; (b) serialize and
store the full board layout at game start, referenced by an id.

## Decision
Store the full layout (b). Boards are serialized as the game's payload (per
0002 §5) and referenced by an unguessable `game_id`.

## Rationale
- **No generator lock-in:** seeded reproduction breaks if the generation algorithm ever changes (bugfix, difficulty tuning, library swap). Stored layouts are immune to generator-version drift — old games replay forever.
- **No refactor required:** existing generators keep working; serialization is additive.
- **Simpler single-use semantics:** "a board is played once per player" is a fact about a stored entity, not a rule about seed distribution.
- Layout size is trivial (a Minesweeper expert board < 1KB).

## Consequences
- Games recorded before layout storage existed cannot be replayed (archived instead).
- `game_id` values may appear in URLs → must be unguessable (no sequential IDs).
- Stored layout data is provided to clients as game rules require.
