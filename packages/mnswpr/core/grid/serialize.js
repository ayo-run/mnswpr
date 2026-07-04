// @ts-check
import { Grid } from './grid.js'

/**
 * Plain-JSON serialization of a Grid. Used by the move log / server persistence
 * (Layer 1) and by replay. Cells must themselves be JSON-serializable.
 *
 * @template Cell
 * @param {Grid<Cell>} grid
 * @returns {{ rows: number, cols: number, cells: Cell[] }}
 */
export function toJSON(grid) {
  const cells = []
  grid.forEach(cell => cells.push(cell))
  return { rows: grid.rows, cols: grid.cols, cells }
}

/**
 * @template Cell
 * @param {{ rows: number, cols: number, cells: Cell[] }} data
 * @param {(cell: Cell) => Cell} [reviveCell]
 * @returns {Grid<Cell>}
 */
export function fromJSON(data, reviveCell) {
  const grid = new Grid(data.rows, data.cols)
  for (let r = 0; r < data.rows; r++) {
    for (let c = 0; c < data.cols; c++) {
      const cell = data.cells[r * data.cols + c]
      grid.set(r, c, reviveCell ? reviveCell(cell) : cell)
    }
  }
  return grid
}
