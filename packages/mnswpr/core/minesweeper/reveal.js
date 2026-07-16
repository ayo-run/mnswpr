// @ts-check
import { eightWay } from '../grid/neighbors.js'

/**
 * @typedef {import('./board.js').Cell} Cell
 * @typedef {import('../grid/grid.js').Grid<Cell>} MineGrid
 * @typedef {{ r: number, c: number, adjacent: number }} RevealedCell
 */

/**
 * Reveal starting at (r, c) and flood-fill outward while cells are blank (zero
 * adjacent mines), stopping at numbers and flags. Mutates cell statuses; returns
 * the newly-revealed cells (never includes already-revealed/flagged cells, so
 * callers can count these as fresh safe reveals). The start cell must be a known
 * non-mine, hidden cell.
 *
 * @param {MineGrid} grid
 * @returns {RevealedCell[]}
 */
export function floodReveal(grid, startR, startC) {
  /** @type {RevealedCell[]} */
  const revealed = []
  const start = grid.at(startR, startC)
  start.status = 'revealed'
  revealed.push({ r: startR, c: startC, adjacent: start.adjacent })

  /** @type {[number, number][]} */
  const queue = [[startR, startC]]
  while (queue.length) {
    // Safe: the `while (queue.length)` guard guarantees a value here.
    const [r, c] = /** @type {[number, number]} */ (queue.shift())
    // Only blank cells propagate; numbers are a boundary.
    if (grid.at(r, c).adjacent !== 0) continue
    for (const [nr, nc] of eightWay(grid, r, c)) {
      const n = grid.at(nr, nc)
      if (n.status === 'revealed' || n.status === 'flagged') continue
      // A blank cell has no adjacent mines, so its neighbors are all safe.
      n.status = 'revealed'
      revealed.push({ r: nr, c: nc, adjacent: n.adjacent })
      if (n.adjacent === 0) queue.push([nr, nc])
    }
  }
  return revealed
}

/**
 * @param {MineGrid} grid
 * @returns {number} count of flagged cells around (r, c)
 */
export function countFlagsAround(grid, r, c) {
  let flags = 0
  for (const [nr, nc] of eightWay(grid, r, c)) {
    if (grid.at(nr, nc).status === 'flagged') flags++
  }
  return flags
}

/**
 * @param {MineGrid} grid
 * @returns {Array<{ r: number, c: number }>} every mined coordinate
 */
export function allMines(grid) {
  const out = []
  grid.forEach((cell, r, c) => { if (cell.mine) out.push({ r, c }) })
  return out
}
