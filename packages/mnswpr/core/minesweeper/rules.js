// @ts-check
import { Grid } from '../grid/grid.js'
import { toJSON as gridToJSON, fromJSON as gridFromJSON } from '../grid/serialize.js'
import { eightWay } from '../grid/neighbors.js'
import { placeMines, excludeAround, validateLayout } from './board.js'
import { floodReveal, countFlagsAround, allMines } from './reveal.js'

/**
 * Minesweeper as a pure, deterministic state machine — no DOM, no wall clock.
 * `GameSession` (Layer 1) drives it; the client renders the events it emits.
 *
 * @typedef {import('./board.js').Config} Config
 * @typedef {import('./board.js').Cell} Cell
 * @typedef {'fresh' | 'active' | 'won' | 'lost'} Phase
 * @typedef {{ seed: number, config: Config, grid: Grid<Cell>, phase: Phase, minesPlaced: boolean, revealedSafe: number }} State
 * @typedef {{ type: 'reveal', r: number, c: number } | { type: 'flag', r: number, c: number } | { type: 'chord', r: number, c: number }} Move
 * @typedef {object} Event
 */

/**
 * The typed move-event vocabulary emitted by the session (one per effective
 * move). This is the game's public event language — consumed later by the shared
 * envelope. `type` + `r`/`c` are game meaning (classified here); `t` (injected
 * clock) and `seq` (monotonic) are stamped by `GameSession` when it emits.
 *
 * Note `flag` vs `unflag`: both come from a `flag` move — the distinction is the
 * outcome (did the toggle set or clear the flag), which only the rules can tell.
 *
 * @typedef {'reveal' | 'flag' | 'unflag' | 'chord'} MoveEventType
 * @typedef {{ type: MoveEventType, r: number, c: number, t: number, seq: number }} MoveEvent
 */

/** The move-event vocabulary as runtime data (the `MoveEvent` `type` domain). */
export const MOVE_EVENT_TYPES = /** @type {const} */ (['reveal', 'flag', 'unflag', 'chord'])

const freshCell = () => ({ mine: false, adjacent: 0, status: 'hidden' })

/** Valid game phases and per-cell statuses — the closed sets a snapshot may name. */
const PHASES = new Set(['fresh', 'active', 'won', 'lost'])
const CELL_STATUSES = new Set(['hidden', 'flagged', 'revealed'])

/**
 * Assert a serialized game state (from {@link MinesweeperRules.serialize}, or its
 * JSON round-trip) is well-formed before reviving it, so a corrupt or truncated
 * snapshot fails with a clear error instead of quietly producing a broken game.
 *
 * @param {unknown} snap
 */
function assertStateSnapshot(snap) {
  if (snap === null || typeof snap !== 'object') {
    throw new TypeError(`deserialize: expected a state snapshot object (got ${snap === null ? 'null' : typeof snap})`)
  }
  const s = /** @type {any} */ (snap)
  if (typeof s.seed !== 'number') throw new TypeError('deserialize: snapshot.seed must be a number')
  const cfg = s.config
  if (cfg === null || typeof cfg !== 'object' || !Number.isInteger(cfg.rows) || !Number.isInteger(cfg.cols) || !Number.isInteger(cfg.mines)) {
    throw new TypeError('deserialize: snapshot.config must be { rows, cols, mines } integers')
  }
  if (!PHASES.has(s.phase)) throw new RangeError(`deserialize: snapshot.phase must be one of ${[...PHASES].join('/')} (got ${JSON.stringify(s.phase)})`)
  if (typeof s.minesPlaced !== 'boolean') throw new TypeError('deserialize: snapshot.minesPlaced must be a boolean')
  if (!Number.isInteger(s.revealedSafe) || s.revealedSafe < 0) throw new RangeError('deserialize: snapshot.revealedSafe must be a non-negative integer')
  const g = s.grid
  if (g === null || typeof g !== 'object' || !Number.isInteger(g.rows) || !Number.isInteger(g.cols) || !Array.isArray(g.cells)) {
    throw new TypeError('deserialize: snapshot.grid must be { rows, cols, cells[] }')
  }
  if (g.rows !== cfg.rows || g.cols !== cfg.cols) {
    throw new RangeError(`deserialize: grid ${g.rows}x${g.cols} disagrees with config ${cfg.rows}x${cfg.cols}`)
  }
  if (g.cells.length !== g.rows * g.cols) {
    throw new RangeError(`deserialize: grid.cells must have ${g.rows * g.cols} entries (got ${g.cells.length})`)
  }
  for (let i = 0; i < g.cells.length; i++) {
    const cell = g.cells[i]
    if (cell === null || typeof cell !== 'object' || typeof cell.mine !== 'boolean' || !Number.isInteger(cell.adjacent) || !CELL_STATUSES.has(cell.status)) {
      throw new TypeError(`deserialize: grid.cells[${i}] must be { mine: boolean, adjacent: integer, status: hidden/flagged/revealed }`)
    }
  }
}

/** @param {State} state */
function isWin(state) {
  const { rows, cols, mines } = state.config
  return state.revealedSafe >= rows * cols - mines
}

/**
 * Reveal a single cell (with first-click safety and flood-fill).
 * @param {State} state
 * @returns {{ state: State, events: Event[] }}
 */
function reveal(state, r, c) {
  const cell = state.grid.at(r, c)
  if (!cell || cell.status !== 'hidden') return { state, events: [] }

  // First reveal: generate the board now, excluding this cell's neighborhood, so
  // the opening click is always safe and the seed fully determines the layout.
  // Injected boards (fromLayout) arrive with minesPlaced already true and skip
  // this — their opening reveal plays exactly as the layout dictates.
  if (!state.minesPlaced) {
    placeMines(state.seed, state.config, excludeAround(state.config, r, c), state.grid)
    state.minesPlaced = true
  }
  // fresh → active on the first real reveal, whether the board was just generated
  // or injected pre-built — decoupled from placement so both paths transition the
  // same way.
  if (state.phase === 'fresh') state.phase = 'active'

  if (cell.mine) {
    cell.status = 'revealed'
    state.phase = 'lost'
    return { state, events: [{ type: 'explode', r, c, mines: allMines(state.grid) }] }
  }

  const revealed = floodReveal(state.grid, r, c)
  state.revealedSafe += revealed.length
  /** @type {Event[]} */
  const events = [{ type: 'reveal', cells: revealed }]
  if (isWin(state)) { state.phase = 'won'; events.push({ type: 'win' }) }
  return { state, events }
}

/**
 * Toggle a flag on a hidden cell.
 * @param {State} state
 * @returns {{ state: State, events: Event[] }}
 */
function flag(state, r, c) {
  const cell = state.grid.at(r, c)
  if (!cell || cell.status === 'revealed') return { state, events: [] }
  cell.status = cell.status === 'flagged' ? 'hidden' : 'flagged'
  return { state, events: [{ type: 'flag', r, c, flagged: cell.status === 'flagged' }] }
}

/**
 * Chord: on a revealed number whose adjacent flags equal its value, reveal every
 * non-flagged neighbor (any of which may be a mine → loss).
 * @param {State} state
 * @returns {{ state: State, events: Event[] }}
 */
function chord(state, r, c) {
  const { grid } = state
  const cell = grid.at(r, c)
  if (!cell || cell.status !== 'revealed' || cell.adjacent === 0) return { state, events: [] }
  if (countFlagsAround(grid, r, c) !== cell.adjacent) return { state, events: [] }

  /** @type {import('./reveal.js').RevealedCell[]} */
  const revealedCells = []
  for (const [nr, nc] of eightWay(grid, r, c)) {
    const n = grid.at(nr, nc)
    if (n.status !== 'hidden') continue
    if (n.mine) {
      n.status = 'revealed'
      state.phase = 'lost'
      return { state, events: [{ type: 'explode', r: nr, c: nc, mines: allMines(grid) }] }
    }
    for (const rev of floodReveal(grid, nr, nc)) revealedCells.push(rev)
  }
  state.revealedSafe += revealedCells.length

  /** @type {Event[]} */
  const events = []
  if (revealedCells.length) events.push({ type: 'reveal', cells: revealedCells })
  if (isWin(state)) { state.phase = 'won'; events.push({ type: 'win' }) }
  return { state, events }
}

/**
 * Project full state down to what a client is allowed to know: revealed cells
 * (+ their adjacency), flags, and — only once the game is over — the mines. An
 * unrevealed mine is NEVER included mid-game, so this is safe to send over a wire
 * (invariant #3). Hidden, unrevealed, non-mine cells are simply omitted.
 *
 * @param {State} state
 */
function project(state) {
  const terminal = state.phase === 'won' || state.phase === 'lost'
  const cells = []
  state.grid.forEach((cell, r, c) => {
    if (cell.status === 'revealed') cells.push({ r, c, status: 'revealed', adjacent: cell.adjacent, mine: cell.mine })
    else if (cell.status === 'flagged') cells.push({ r, c, status: 'flagged' })
    else if (terminal && cell.mine) cells.push({ r, c, status: 'hidden', mine: true })
  })
  return { config: state.config, phase: state.phase, cells }
}

/**
 * The GameRules contract consumed by GameSession/replay: init / apply / status /
 * project, plus serialize / deserialize for snapshotting. Deterministic and
 * DOM-free.
 */
export const MinesweeperRules = {
  /**
   * @param {number} seed
   * @param {Config} config
   * @returns {State}
   */
  init(seed, config) {
    return {
      seed,
      config,
      grid: new Grid(config.rows, config.cols, freshCell),
      phase: 'fresh',
      minesPlaced: false,
      revealedSafe: 0
    }
  },

  /**
   * Build a game state from an explicit, pre-built layout (as returned by
   * `generateBoard`) instead of generating one from a seed. Parallel to
   * {@link init}: it yields a `State` a `GameSession` can drive identically —
   * same rules, same transitions — the only difference being that the board is
   * fixed up front, so the opening reveal is NOT made safe (first-click safety is
   * a property of internal generation, not of a caller-supplied board). The
   * layout is validated first and a malformed one throws.
   *
   * @param {import('./board.js').Layout} layout
   * @param {{ seed?: number }} [opts] - seed is metadata only (no generation happens); defaults to 0
   * @returns {State}
   */
  fromLayout(layout, { seed = 0 } = {}) {
    validateLayout(layout)
    const { rows, cols, mines } = layout
    return {
      seed,
      config: { rows, cols, mines },
      grid: new Grid(rows, cols, (r, c) => ({
        mine: layout.cells[r][c].mine,
        adjacent: layout.cells[r][c].adjacent,
        status: 'hidden'
      })),
      phase: 'fresh',
      minesPlaced: true,
      revealedSafe: 0
    }
  },

  /** @param {State} state @returns {Phase} */
  status(state) {
    return state.phase
  },

  /**
   * Fold a move into the state. Terminal states are absorbing.
   * @param {State} state
   * @param {Move} move
   * @returns {{ state: State, events: Event[] }}
   */
  apply(state, move) {
    if (state.phase === 'won' || state.phase === 'lost') return { state, events: [] }
    switch (move.type) {
      case 'reveal': return reveal(state, move.r, move.c)
      case 'flag': return flag(state, move.r, move.c)
      case 'chord': return chord(state, move.r, move.c)
      default: return { state, events: [] }
    }
  },

  project,

  /**
   * Classify an applied move into a typed move-event kind, or `null` if the move
   * was a no-op (the rules produced no events — e.g. clicking a revealed cell).
   * The session stamps the returned `{ type, r, c }` with `t` and `seq`. This is
   * the seam that turns a raw `Move` into the {@link MoveEvent} vocabulary and,
   * critically, splits a `flag` move into `flag`/`unflag` by its outcome.
   *
   * @param {Move} move
   * @param {Event[]} events - the rules events this move produced
   * @returns {{ type: MoveEventType, r: number, c: number } | null}
   */
  toMoveEvent(move, events) {
    if (!events || events.length === 0) return null
    switch (move.type) {
      case 'reveal': return { type: 'reveal', r: move.r, c: move.c }
      case 'chord': return { type: 'chord', r: move.r, c: move.c }
      case 'flag': {
        const flagged = events.find(e => e.type === 'flag')
        if (!flagged) return null
        return { type: flagged.flagged ? 'flag' : 'unflag', r: move.r, c: move.c }
      }
      default: return null
    }
  },

  /**
   * Snapshot a game state as a plain, JSON-safe object: the whole board (every
   * cell's mine/adjacent/status, via the Layer-0 grid serializer) plus phase and
   * progress. Inverse of {@link deserialize}. The `grid` instance is the only
   * non-JSON-safe field of `State`; everything else (seed, config, flags) is
   * already plain data.
   *
   * @param {State} state
   * @returns {{ seed: number, config: Config, phase: Phase, minesPlaced: boolean, revealedSafe: number, grid: { rows: number, cols: number, cells: Cell[] } }}
   */
  serialize(state) {
    return {
      seed: state.seed,
      config: state.config,
      phase: state.phase,
      minesPlaced: state.minesPlaced,
      revealedSafe: state.revealedSafe,
      grid: gridToJSON(state.grid)
    }
  },

  /**
   * Rebuild a game state from {@link serialize} output (or its JSON round-trip).
   * Cells are cloned so the revived state shares no references with the snapshot.
   *
   * @param {ReturnType<typeof MinesweeperRules.serialize>} snap
   * @returns {State}
   */
  deserialize(snap) {
    assertStateSnapshot(snap)
    return {
      seed: snap.seed,
      config: snap.config,
      phase: snap.phase,
      minesPlaced: snap.minesPlaced,
      revealedSafe: snap.revealedSafe,
      grid: gridFromJSON(snap.grid, cell => ({ ...cell }))
    }
  }
}
