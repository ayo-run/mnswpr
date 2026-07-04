# Headless core + client design — `@ayo-run/mnswpr/core` and the client that consumes it

Design for splitting the Minesweeper engine into a **headless, isomorphic core**
(runs identically in a browser or on a server) and a **thin client** that renders
it. The core is internally layered so the generic bottom can later be lifted out
into `@cozy-games/grid` + `@cozy-games/game-session` once a second game (Sudoku)
exists to validate the abstraction. We are **not** building the generic grid
engine now — only structuring for it.

Goals, in priority order:

1. **Headless core** — game state is a plain data model, no DOM, no wall clock.
2. **Authoritative-host capable** — the same core can run on a host that owns
   the RNG, the clock, and the move sequence, so game state and timing can be
   computed by an authoritative host rather than solely on the client.
3. **Backwards compatible** — the existing DOM UI, CSS, and jsdom tests keep
   working; today's offline play is just "the core with a local transport."
4. **Extraction-ready** — a clean seam between generic (grid/session) and
   Minesweeper-specific (mines/reveal) code.

---

## 1. Package layout & the seam

**Decision (settled): one published package, core exposed as a sub-path.** Open-
source consumers keep installing a single `@ayo-run/mnswpr` and get the headless
core for free at `@ayo-run/mnswpr/core` — no second package to publish, version,
or document. The DOM client stays the default entry (`.`).

```
packages/mnswpr/                 # @ayo-run/mnswpr — ONE published package
  mnswpr.js                      # "."       → DOM client (browser entry; today's default)
  levels.js                      # shared by client + core (level presets)
  core/                          # "./core"  → headless, isomorphic, ZERO DOM, ZERO wall-clock
    index.js                     #   the sub-path entry — public core API
    grid/                        #   Layer 0  → future @cozy-games/grid
      grid.js                    #     Grid<Cell> container, coords, inBounds
      neighbors.js               #     neighbor STRATEGIES (eightWay, orthogonal, …)
      serialize.js
    session/                     #   Layer 1  → future @cozy-games/game-session
      session.js                 #     GameSession: lifecycle, injected clock, move log
      rng.js                     #     seedable deterministic PRNG (mulberry32)
      replay.js                  #     replay(rules, {seed, config, log}) → validate
    minesweeper/                 #   Layer 2  → Minesweeper-specific rules
      rules.js                   #     GameRules impl: init/apply/status/project
      board.js                   #     deterministic board gen + first-click safety
      reveal.js                  #     flood-fill, chording
  client/                        # DOM client internals (consume ./core)
    renderer.js                  #   events → DOM (the ONLY place document is touched) — EXTRACTED
    transport.js                 #   LocalTransport (RemoteTransport added later) — EXTRACTED
    # Decision: the input state machine (mouse/touch/chording/long-press) and the
    # timer stay INLINE in mnswpr.js for now — not extracted to input-adapter.js /
    # timer-view.js. The input code is intricate and under-tested (no chord/touch/
    # middle-click coverage yet), so extraction is deferred until those
    # characterization tests exist or a concrete need arises. See §9.
```

`package.json` `exports` (sub-path is the only surface change consumers see):

```jsonc
"exports": {
  ".":        { "default": "./dist/mnswpr.js" },  // DOM client (browser) — unchanged default
  "./core":   { "default": "./core/index.js" },   // headless, isomorphic core (source ESM)
  "./dist/*": { "default": "./dist/*" },
  "./*":      { "default": "./*" }
}
```

- `import mnswpr from '@ayo-run/mnswpr'` → DOM client, exactly as today.
- `import { GameSession, MinesweeperRules } from '@ayo-run/mnswpr/core'` → headless.
  The core entry pulls in **zero DOM**, so a server (later) imports it without
  dragging in browser code, and the browser bundle for `.` never includes the
  core's server-only helpers.

**The seam** = the boundary *inside* `core/` between `grid/` + `session/`
(generic) and `minesweeper/` (specific). Exposing the core via a sub-path does
**not** compromise the future extraction — the publish surface and the internal
layering are orthogonal. Rules of the seam:

- `grid/` and `session/` **never import** `minesweeper/`.
- `minesweeper/` depends on `grid/` + `session/` only through their public
  interfaces (below) — no reaching into internals.
- Anything Minesweeper-specific that leaks *down* (8-way adjacency, "mine",
  "reveal") is a bug in the layering. Adjacency is **injected**, not assumed.

When Sudoku lands, `core/grid/` and `core/session/` move out verbatim into
`@cozy-games/grid` + `@cozy-games/game-session`; `core/minesweeper/` (and a new
`sudoku/`) depend on them, and `@ayo-run/mnswpr/core` re-exports from them so the
consumer-facing sub-path is unchanged.

---

## 2. Layer 0 — generic grid (`grid/`)

A dumb, dense 2D container of opaque cells. Knows nothing about game meaning.

```js
// Coord is a plain [r, c] tuple everywhere (cheap, serializable).
// Grid<Cell> — Cell is opaque to this layer.
class Grid {
  constructor(rows, cols, fill)          // fill: (r, c) => Cell
  get rows(); get cols()
  at(r, c)                               // → Cell   (throws/undefined out of bounds)
  set(r, c, cell)
  inBounds(r, c)                         // → boolean
  forEach(fn)                            // fn(cell, r, c)
  map(fn)                                // → Grid of new cells
  clone()
}

// Neighbor STRATEGY — the critical extraction seam. Injected, never baked in.
// eightWay is Minesweeper's; Sudoku would inject `peers` (row ∪ col ∪ box).
const eightWay      = (grid, r, c) => [...8 in-bounds diagonal+orthogonal coords]
const orthogonal    = (grid, r, c) => [...4 in-bounds N/E/S/W coords]
```

`serialize.js`: `toJSON(grid)` / `fromJSON(data, reviveCell)` — used by the
session for the move log and by the server for persistence/replay.

---

## 3. Layer 1 — generic session & host authority (`session/`)

The most reusable layer, and the one that makes an authoritative host possible. It
owns **lifecycle, time, and the move log**, and delegates game meaning to an
injected `GameRules` object.

### The rules contract (what any game implements)

```js
/**
 * @template State, Move, Event
 * A pure, deterministic game definition. NO Date, NO Math.random, NO DOM.
 */
const GameRules = {
  init(seed, config),                    // → State           (deterministic from seed)
  apply(state, move, rng),               // → { state, events } (pure; rng passed in)
  status(state),                         // → 'active' | 'won' | 'lost'
  project(state)                         // → ClientView       (hides secrets; see §4)
}
```

### The session

```js
class GameSession {
  /**
   * @param rules   a GameRules implementation
   * @param opts.seed   number   — seeds board gen + RNG (host-held when a host owns the session)
   * @param opts.config game config (level/difficulty)
   * @param opts.clock  () => number — INJECTED time source (whoever runs the session owns it)
   */
  constructor(rules, opts)

  applyMove(move)        // stamps t=clock(); appends {move, t} to log;
                         // rules.apply(...); returns projected events + view.
  status()               // 'active' | 'won' | 'lost'
  view()                 // rules.project(state) — safe to send to a client
  elapsed()              // authoritative: t(last decisive move) − t(first move)
  log()                  // [{move, t}]  — the audit trail
  result()               // on terminal: { status, time, seed, config, log }
}
```

Two decisions that unlock everything:

- **Injected clock.** The session never calls `Date.now()`. The *caller* supplies
  the clock. On the client it's `Date.now`. On an authoritative host it's the
  host's clock — so `elapsed()` is owned by whoever runs the session.
- **Injected, seedable RNG** (`rng.js`, e.g. mulberry32 seeded by `opts.seed`).
  Board generation is a pure function of `seed` (+ first click), so a run is
  **bit-for-bit reproducible**. A host that owns the session holds the seed and
  sends only projected views, so unrevealed board state need not be sent to the
  client mid-game.

### Replay (`replay.js`)

```js
// Re-runs a game from scratch from its recorded inputs and returns the
// recomputed outcome. A host can use this to validate a submitted
// { seed, config, log }:
//   - does the log actually solve the board?
//   - is the move timeline monotonic and within plausible bounds?
//   - does the recomputed time match the recorded time?
replay(rules, { seed, config, log }) // → { status, time, valid, reason? }
```

Because the core is deterministic, a full game can be reconstructed from its
inputs alone — no live per-move host needed; `replay()` can run wherever a host
processes a submission. It requires exactly this headless core and nothing else.

> **Determinism is a hard rule for Layers 1–2:** no `Date.now()`, no
> `Math.random()`, no `new Date()` inside core logic — all injected. This is what
> makes replay reproducible and tests deterministic. (Same constraint we already
> follow elsewhere in the repo.)

---

## 4. Layer 2 — Minesweeper rules (`minesweeper/`)

### State (plain data — the DOM's job is gone)

```js
// Cell — replaces the <td> + data-status/data-value attributes.
Cell = { mine: boolean, adjacent: number, status: 'hidden' | 'flagged' | 'revealed' }

// State
{
  grid: Grid<Cell>,
  config: { rows, cols, mines, id },     // from levels.js
  phase: 'fresh' | 'active' | 'won' | 'lost',
  minesPlaced: boolean                   // false until the first reveal (safety)
}
```

### Moves (intents — what the client sends)

```js
Move =
  | { type: 'reveal', r, c }
  | { type: 'flag',   r, c }             // toggle
  | { type: 'chord',  r, c }             // reveal neighbors when flag-count satisfied
```

### Events (deltas — what the renderer/server emits)

```js
Event =
  | { type: 'reveal',  cells: [{ r, c, adjacent }] }   // whole flood-filled region
  | { type: 'flag',    r, c, flagged: boolean }
  | { type: 'explode', r, c, mines: [{ r, c }] }        // loss reveal
  | { type: 'win' }
```

Emitting **deltas** (not full state) is what lets the client render incrementally
*and* lets an authoritative host withhold the rest of the board.

### First-click safety, done right

Generate the board **on the first reveal**, from `(seed, firstClick, config)`,
excluding the first cell and its neighbors from mine placement. Replaces today's
`transferMine()` relocation. Benefits: nothing exists to leak before move 1, the
first click is provably safe, and generation stays a pure seed function.

### `reveal.js`

- Flood-fill of the connected zero-adjacency region (ports `handleEmpty`), returns
  the revealed cells as one `reveal` event.
- Chording (ports the left+right behavior), returns a `reveal` or `explode`.
- Win = every non-mine cell revealed. Loss = a mine revealed.

### Hidden-information projection (`project.js`)

```js
project(state) // → ClientView
```

Returns only what a client is allowed to know: revealed cells + their adjacency,
flags, and phase. **Unrevealed mine positions are never included** (until a
terminal `explode`/`win`, when the full board is disclosed for the reveal
animation). A host sends `view()` / event deltas — never the raw state, never the
seed. A client therefore cannot see unrevealed mines even if it inspects every
byte it receives.

---

## 5. The client (`packages/mnswpr` → consumer of the core)

The client keeps today's look, CSS, and DOM shape (`<table>` with
`game-status` / `data-status` / `data-value`) — but it becomes a **consumer** of
core state, not the owner of it. Four parts:

```
 InputAdapter          Transport                 Renderer          TimerView
 (gestures → Move) ──▶ (Local | Remote) ──▶ Event[] ──▶ (deltas → DOM)   (time → DOM)
                          │
                          ├─ Local : in-process GameSession  (offline / npm engine)
                          └─ Remote: HTTP/WS to a host        (authoritative host)
```

### Transport — one interface, two implementations (mirrors the leaderboard adapter pattern)

```js
// The client talks ONLY to this — it never knows if the game runs here or on a server.
Transport = {
  start(config)          // → { view, time }         begin a game
  send(move)             // → { events, view, time } apply a move
  onEvent(cb)            // (Remote may push server events; Local resolves inline)
  result()               // → { status, time, … } when terminal
}
```

- **`LocalTransport`** wraps a `GameSession` with `clock = Date.now`. This is
  today's behavior exactly: fast, offline, timing owned by the client — fine for
  offline play and the standalone npm engine.
- **`RemoteTransport`** forwards moves to a host, which holds the authoritative
  `GameSession`, and streams back projected events. Timing is host-owned. Used
  when a game runs on an authoritative host.

### Renderer

`render(container, view)` builds the initial `<table>`; `applyEvents(events)`
mutates the DOM from deltas. This is the *only* place `document` is touched. It
reuses the current markup/attributes so existing CSS and the jsdom tests survive.
(It is basically today's DOM-building code, inverted: driven by events instead of
owning state.)

### InputAdapter

Keep the existing mouse/touch state machine (left/right/middle, chording,
long-press-to-flag, `isBusy` debounce) — but instead of mutating the DOM, it
**emits `Move` intents** to the transport. This is the trickiest existing code;
porting it as "same gestures, different output" keeps the hard-won input feel.

### TimerView & `gameDone`

- `TimerService` splits in two: the **authoritative clock** moves into
  `GameSession` (injected); the **display** becomes a dumb `TimerView` that shows
  `transport`-reported time. In Remote mode it shows server time (optionally a
  locally-interpolated estimate reconciled on each server message).
- The current `hooks.gameDone(game)` fires from the terminal event. In **Local**
  mode the client builds `game` as today. In **Remote** mode the **host**
  produces the authoritative `{ time, status }` and records the leaderboard
  result — the client renders it rather than computing it.

The public constructor stays hook-shaped for compatibility, e.g.:

```js
Minesweeper(appId, version, {
  transport: new LocalTransport({ level }),   // or RemoteTransport({ endpoint })
  levelChanged(setting) { … },
  gameDone(game) { … }                         // Local: client-built; Remote: host-authoritative
})
```

---

## 6. Two run modes, one codebase

| | **Local / offline** | **Authoritative host** |
|---|---|---|
| Where the core runs | in the browser | on a host |
| Clock | `Date.now` | host clock |
| Board/seed | in browser | host-held, sent as rules allow |
| Transport | `LocalTransport` | `RemoteTransport` |
| Needs a host tier | no | yes (Function/Worker + session store) |
| Use | offline play, published npm engine | host-owned sessions |

The published `@ayo-run/mnswpr` stays fully functional standalone (Local mode).
Running on a host opts into Remote. Same renderer, same input, same rules.

---

## 7. Server-readiness invariants (the offline build MUST hold these)

Going offline-first is only "server-easy later" if the offline build refuses a few
tempting in-process shortcuts. Each maps to a concrete failure if violated. These
are the disciplines that make the server additive rather than a rewrite:

1. **Transport is `async`.** `send(move)` returns a Promise (or fires a callback)
   even though `LocalTransport` resolves instantly. *Violation:* client code
   assumes synchronous returns → every `RemoteTransport` call breaks.
2. **Only serializable messages cross the Transport.** Moves in; Events + a
   projected view out; plain JSON. Never hand the client a live `GameSession`,
   `Grid`, or `State`. *Violation:* nothing survives a network hop.
3. **The Renderer consumes only `project(state)` + events** — never raw mine
   positions, even offline where it technically has them. *Violation:* host mode
   (which withholds unrevealed board state) needs a renderer rewrite; hidden-
   information projection stops being a drop-in.
4. **The core is deterministic now** — seeded RNG + injected clock + a working
   `replay()`, even though offline play doesn't need them. *Violation:*
   retrofitting determinism into board generation later is a rewrite, and the
   replay/validation path has no substrate.
5. **The client is stateless about rules.** All win/loss/reveal logic lives in the
   core; the client only renders. *Violation:* client-side rule shortcuts aren't
   authoritative on a server.

A determinism guard (see §10 Testing) fails the build if `Date`/`Math.random`
appear in `core/` outside the injected `clock`/`rng` seams.

## 8. Mapping from today's engine

| Today (`packages/mnswpr/mnswpr.js`) | Moves to |
|---|---|
| `document.createElement` grid build | client **Renderer** |
| `data-status` / `data-value` / `game-status` attrs | core **State** (`Cell`, `phase`) |
| `getStatus`/`setStatus`/`isMine`/`isFlagged` | core model ops |
| `minesArray` + `transferMine` (first-click safety) | `minesweeper/board.js` (seeded gen) |
| `handleEmpty` flood-fill, chording | `minesweeper/reveal.js` |
| mouse/touch handlers, chording, long-press | client **InputAdapter** (emits Moves) |
| `TimerService` (`Date.now`, rAF, DOM write) | clock → `GameSession`; display → `TimerView` |
| `hooks.gameDone(game)` | terminal Event → Local builds `game` / Remote = server |
| `levels.js` | `minesweeper/levels.js` |

---

## 9. Migration plan (each step keeps the suite green)

1. **Core, headless & tested.** Port board gen, flood-fill, chording, win/loss
   into `core/` as pure functions with unit tests over plain data (fast, no
   DOM). Add seeded RNG + `replay()`. **← this diff.**
2. **Renderer + LocalTransport.** Build the event-driven Renderer that reproduces
   today's exact DOM, and `LocalTransport` around `GameSession`.
3. **Port InputAdapter** to emit `Move`s into the transport instead of mutating
   the DOM.
4. **Swap `apps/mnswpr/main.js`** to construct the client with `LocalTransport`.
   Behavior is identical to today — the existing jsdom tests (real DOM events on
   `#app`) are the regression harness and must stay green.
5. **(Later) Remote.** Add a host runtime running `GameSession` authoritatively
   + `RemoteTransport`; the host records results.
6. **(Later) Extract** `grid/` + `session/` into `@cozy-games/grid` +
   `@cozy-games/game-session` once Sudoku exists.

## 10. Testing strategy

- **Core:** pure data-model unit tests — deterministic via fixed seeds; property
  tests (e.g. flood-fill never reveals a mine; win ⇔ all non-mines revealed).
- **Replay:** generate a random valid game, feed its log to `replay()`, assert
  `valid` and matching time; mutate the log and assert rejection.
- **Client:** keep the current jsdom tests (mount, dispatch real mouse events,
  assert on cell/grid attributes) — now exercising Renderer + InputAdapter +
  LocalTransport end-to-end.
- **Determinism guard:** a lint/test that fails if `Date`/`Math.random` appear in
  `core/` outside the injected `clock`/`rng` seams.

## 11. Open decisions

- **Package boundary:** ✅ *resolved* — one `@ayo-run/mnswpr` package, core at the
  `./core` sub-path (§1). Extraction to `@cozy-games/grid` + `@cozy-games/game-session`
  deferred to when Sudoku lands; the sub-path stays stable across that move.
- **Host mode (replay-validation vs live authority):** *deferred.* Ship
  offline-only for now (`LocalTransport`, client-owned timing — matches today's UX).
  The deterministic core + `replay()` are built now so either path is a later
  add-on, not a rewrite.
- **Remote transport / server host / latency & cost:** *deferred* (offline-first).
  HTTP-vs-WebSocket, Netlify Function vs Worker, and the session store are picked
  when we do the server; the `Transport` interface reserves the seam.
