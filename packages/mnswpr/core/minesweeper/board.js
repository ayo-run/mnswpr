// @ts-check
import { Grid } from '../grid/grid.js'
import { mulberry32, randInt } from '../session/rng.js'
import { eightWay } from '../grid/neighbors.js'

/**
 * @typedef {{ rows: number, cols: number, mines: number, id?: string }} Config
 * @typedef {{ mine: boolean, adjacent: number, status: 'hidden' | 'flagged' | 'revealed' }} Cell
 * @typedef {{ mine: boolean, adjacent: number }} LayoutCell
 * @typedef {{ rows: number, cols: number, mines: number, cells: LayoutCell[][], mineLocations: [number, number][] }} Layout
 */

/** Shared empty exclude set for generation without first-click safety. */
const NO_EXCLUDE = new Set()

/**
 * The set of cells kept mine-free for first-click safety: the clicked cell, plus
 * its 8 neighbors when the board has room for all mines outside that 3x3. Falls
 * back to just the clicked cell on boards too dense to spare the neighborhood.
 *
 * @param {Config} config
 * @returns {Set<number>} coordinate keys (r * cols + c)
 */
export function excludeAround(config, r, c) {
  const { rows, cols, mines } = config
  const set = new Set([r * cols + c])
  const roomFor3x3 = rows * cols - 9 >= mines
  if (roomFor3x3) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr
        const nc = c + dc
        if (nr >= 0 && nc >= 0 && nr < rows && nc < cols) set.add(nr * cols + nc)
      }
    }
  }
  return set
}

/**
 * Deterministically place mines and compute adjacency counts, mutating the grid
 * in place. Pure function of (seed, config, exclude) — same inputs, same board.
 * Thin convenience wrapper over {@link fillMines} that builds the RNG from a seed.
 *
 * @param {number} seed
 * @param {Config} config
 * @param {Set<number>} exclude - coordinate keys never to mine (first-click safety)
 * @param {import('../grid/grid.js').Grid<Cell>} grid
 * @returns {Set<number>} the mined coordinate keys
 */
export function placeMines(seed, config, exclude, grid) {
  return fillMines(mulberry32(seed), config, exclude, grid)
}

/**
 * The injected-RNG seam under {@link placeMines}: place mines and compute
 * adjacency counts, mutating the grid in place. Takes an rng function (any
 * `() => [0, 1)`), so callers own determinism — same rng sequence, same board.
 *
 * @param {() => number} rng
 * @param {Config} config
 * @param {Set<number>} exclude - coordinate keys never to mine (first-click safety)
 * @param {import('../grid/grid.js').Grid<Cell>} grid
 * @returns {Set<number>} the mined coordinate keys
 */
export function fillMines(rng, config, exclude, grid) {
  const { rows, cols, mines } = config
  const placed = new Set()
  while (placed.size < mines) {
    const key = randInt(rng, rows) * cols + randInt(rng, cols)
    if (placed.has(key) || exclude.has(key)) continue
    placed.add(key)
  }
  grid.forEach((cell, r, c) => { cell.mine = placed.has(r * cols + c) })
  grid.forEach((cell, r, c) => {
    if (cell.mine) { cell.adjacent = 0; return }
    let n = 0
    for (const [nr, nc] of eightWay(grid, r, c)) {
      if (grid.at(nr, nc).mine) n++
    }
    cell.adjacent = n
  })
  return placed
}

/**
 * Assert a plain layout object (as produced by {@link generateBoard}) is
 * well-formed before it's injected into a game: correct dimensions, cell shape,
 * a mine count that matches its own cells, and in-bounds mine positions. Throws a
 * clear error on the first problem so a malformed board can't silently corrupt
 * win detection or adjacency. Returns the layout for convenient chaining.
 *
 * @param {unknown} layout
 * @returns {Layout}
 */
export function validateLayout(layout) {
  if (layout === null || typeof layout !== 'object') {
    throw new TypeError(`validateLayout: expected a layout object (got ${layout === null ? 'null' : typeof layout})`)
  }
  const { rows, cols, mines, cells, mineLocations } = /** @type {any} */ (layout)
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new RangeError(`validateLayout: rows/cols must be positive integers (got ${rows}x${cols})`)
  }
  if (!Array.isArray(cells) || cells.length !== rows) {
    throw new RangeError(`validateLayout: cells must have ${rows} rows (got ${Array.isArray(cells) ? cells.length : typeof cells})`)
  }
  let mineCount = 0
  for (let r = 0; r < rows; r++) {
    const row = cells[r]
    if (!Array.isArray(row) || row.length !== cols) {
      throw new RangeError(`validateLayout: row ${r} must have ${cols} cells (got ${Array.isArray(row) ? row.length : typeof row})`)
    }
    for (let c = 0; c < cols; c++) {
      const cell = row[c]
      if (cell === null || typeof cell !== 'object' || typeof cell.mine !== 'boolean' || !Number.isInteger(cell.adjacent)) {
        throw new TypeError(`validateLayout: cell (${r},${c}) must be { mine: boolean, adjacent: integer }`)
      }
      if (cell.mine) mineCount++
    }
  }
  if (!Number.isInteger(mines) || mines < 0 || mines > rows * cols) {
    throw new RangeError(`validateLayout: mines must be an integer in [0, ${rows * cols}] (got ${mines})`)
  }
  if (mineCount !== mines) {
    throw new RangeError(`validateLayout: mines (${mines}) disagrees with ${mineCount} mined cells`)
  }
  // mineLocations is optional, but if present it must agree with the grid — the
  // "dimensions vs. mine positions" cross-check.
  if (mineLocations !== undefined) {
    if (!Array.isArray(mineLocations) || mineLocations.length !== mineCount) {
      throw new RangeError(`validateLayout: mineLocations must list all ${mineCount} mines (got ${Array.isArray(mineLocations) ? mineLocations.length : typeof mineLocations})`)
    }
    for (const loc of mineLocations) {
      if (!Array.isArray(loc) || loc.length !== 2) {
        throw new TypeError(`validateLayout: each mineLocation must be a [r, c] pair (got ${JSON.stringify(loc)})`)
      }
      const [r, c] = loc
      if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= rows || c >= cols || !cells[r][c].mine) {
        throw new RangeError(`validateLayout: mineLocation [${r}, ${c}] is out of bounds or not a mined cell`)
      }
    }
  }
  return /** @type {Layout} */ (layout)
}

/**
 * Pure, Node-runnable board generation: given a size, a mine count, and an
 * injected RNG, produce a plain layout object — no DOM, no I/O, no `Grid` class
 * leaking out. This is the headless entry point behind `@ayo-run/mnswpr/core`;
 * the DOM client reaches the same generator lazily through `MinesweeperRules`.
 *
 * The injected `rng` is the determinism seam: the same rng sequence always
 * yields the same layout. `seed` is a convenience — when no `rng` is given it is
 * wrapped with {@link mulberry32}, keeping generation reproducible and free of
 * `Math.random` (invariant #4).
 *
 * First-move safety: pass `safeCell: { r, c }` to guarantee that cell is never a
 * mine — the coordinate-friendly front door to the low-level `exclude` set, so
 * callers don't have to know the `r * cols + c` key encoding. It merges with any
 * `exclude` given, and the capacity check below rejects layouts where the mines
 * can't fit once it's carved out. For 3x3 first-click *flood* safety (the clicked
 * cell plus its 8 neighbors), see {@link excludeAround}.
 *
 * @param {number} rows - number of rows (board height)
 * @param {number} cols - number of columns (board width)
 * @param {number} mines - number of mines to place
 * @param {{ rng?: () => number, seed?: number, exclude?: Set<number>, safeCell?: { r: number, c: number } }} [options]
 * @returns {Layout} a plain, serializable layout object
 */
export function generateBoard(rows, cols, mines, { rng, seed = 0, exclude = NO_EXCLUDE, safeCell } = {}) {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new RangeError(`generateBoard: rows/cols must be positive integers (got ${rows}x${cols})`)
  }

  // Resolve the first-move-safe cell into the exclude set (non-mutating: never
  // touch a caller-owned set). An out-of-bounds safeCell fails loudly rather than
  // silently excluding nothing and handing back a board that could mine it.
  let excludeSet = exclude
  if (safeCell !== undefined) {
    const { r, c } = safeCell
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= rows || c >= cols) {
      throw new RangeError(`generateBoard: safeCell must be an in-bounds { r, c } (got { r: ${r}, c: ${c} } on ${rows}x${cols})`)
    }
    excludeSet = new Set(exclude)
    excludeSet.add(r * cols + c)
  }

  const capacity = rows * cols - excludeSet.size
  if (!Number.isInteger(mines) || mines < 0 || mines > capacity) {
    throw new RangeError(`generateBoard: mines must be an integer in [0, ${capacity}] (got ${mines})`)
  }

  const config = { rows, cols, mines }
  const grid = new Grid(rows, cols, () => ({ mine: false, adjacent: 0, status: 'hidden' }))
  fillMines(rng ?? mulberry32(seed), config, excludeSet, grid)

  /** @type {LayoutCell[][]} */
  const cells = []
  /** @type {[number, number][]} */
  const mineLocations = []
  for (let r = 0; r < rows; r++) {
    /** @type {LayoutCell[]} */
    const row = []
    for (let c = 0; c < cols; c++) {
      const cell = grid.at(r, c)
      row.push({ mine: cell.mine, adjacent: cell.adjacent })
      if (cell.mine) mineLocations.push([r, c])
    }
    cells.push(row)
  }
  return { rows, cols, mines, cells, mineLocations }
}
