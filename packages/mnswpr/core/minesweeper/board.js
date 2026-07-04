// @ts-check
import { mulberry32, randInt } from '../session/rng.js'
import { eightWay } from '../grid/neighbors.js'

/**
 * @typedef {{ rows: number, cols: number, mines: number, id?: string }} Config
 * @typedef {{ mine: boolean, adjacent: number, status: 'hidden' | 'flagged' | 'revealed' }} Cell
 */

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
 *
 * @param {number} seed
 * @param {Config} config
 * @param {Set<number>} exclude - coordinate keys never to mine (first-click safety)
 * @param {import('../grid/grid.js').Grid<Cell>} grid
 * @returns {Set<number>} the mined coordinate keys
 */
export function placeMines(seed, config, exclude, grid) {
  const rng = mulberry32(seed)
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
