// @ts-check

/**
 * Layer 0 — a dense 2D container of opaque cells. Knows nothing about game
 * meaning (no "mine", no "reveal"). Future home: @cozy-games/grid.
 *
 * @template Cell
 */
export class Grid {
  /**
   * @param {number} rows
   * @param {number} cols
   * @param {(r: number, c: number) => Cell} [fill] - factory for each cell
   */
  constructor(rows, cols, fill) {
    this.rows = rows
    this.cols = cols
    /** @type {Cell[]} */
    this._cells = new Array(rows * cols)
    if (fill) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          this._cells[r * cols + c] = fill(r, c)
        }
      }
    }
  }

  /** @returns {boolean} */
  inBounds(r, c) {
    return r >= 0 && c >= 0 && r < this.rows && c < this.cols
  }

  /** @returns {Cell} */
  at(r, c) {
    return this._cells[r * this.cols + c]
  }

  set(r, c, cell) {
    this._cells[r * this.cols + c] = cell
  }

  /** @param {(cell: Cell, r: number, c: number) => void} fn */
  forEach(fn) {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        fn(this.at(r, c), r, c)
      }
    }
  }

  /**
   * @template Out
   * @param {(cell: Cell, r: number, c: number) => Out} fn
   * @returns {Grid<Out>}
   */
  map(fn) {
    const out = new Grid(this.rows, this.cols)
    this.forEach((cell, r, c) => out.set(r, c, fn(cell, r, c)))
    return out
  }
}
