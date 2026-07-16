// @ts-check

/**
 * Neighbor STRATEGIES — the extraction seam. A game injects the topology it
 * wants; the grid layer never assumes one. Minesweeper uses `eightWay`; a future
 * Sudoku would inject its row/col/box `peers`. Each returns in-bounds [r, c]
 * coordinate pairs.
 *
 * @typedef {{ inBounds: (r: number, c: number) => boolean }} Boundable
 */

/**
 * All 8 surrounding cells (orthogonal + diagonal).
 * @param {Boundable} grid
 * @returns {Array<[number, number]>}
 */
export function eightWay(grid, r, c) {
  /** @type {Array<[number, number]>} */
  const out = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const nr = r + dr
      const nc = c + dc
      if (grid.inBounds(nr, nc)) out.push([nr, nc])
    }
  }
  return out
}

/**
 * The 4 orthogonal cells (N/E/S/W).
 * @param {Boundable} grid
 * @returns {Array<[number, number]>}
 */
export function orthogonal(grid, r, c) {
  /** @type {Array<[number, number]>} */
  const out = []
  const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]]
  for (const [dr, dc] of deltas) {
    const nr = r + dr
    const nc = c + dc
    if (grid.inBounds(nr, nc)) out.push([nr, nc])
  }
  return out
}
