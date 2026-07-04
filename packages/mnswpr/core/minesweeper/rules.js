// @ts-check
import { Grid } from '../grid/grid.js'
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

const freshCell = () => ({ mine: false, adjacent: 0, status: 'hidden' })

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
 * project. Deterministic and DOM-free.
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

  project
}
