/**
 * Layer 0 — a dense 2D container of opaque cells. Knows nothing about game
 * meaning (no "mine", no "reveal"). Future home: @cozy-games/grid.
 *
 * @template Cell
 */
export class Grid<Cell> {
    /**
     * @param {number} rows
     * @param {number} cols
     * @param {(r: number, c: number) => Cell} [fill] - factory for each cell
     */
    constructor(rows: number, cols: number, fill?: (r: number, c: number) => Cell);
    rows: number;
    cols: number;
    /** @type {Cell[]} */
    _cells: Cell[];
    /**
     * @param {number} r
     * @param {number} c
     * @returns {boolean}
     */
    inBounds(r: number, c: number): boolean;
    /**
     * @param {number} r
     * @param {number} c
     * @returns {Cell}
     */
    at(r: number, c: number): Cell;
    /**
     * @param {number} r
     * @param {number} c
     * @param {Cell} cell
     */
    set(r: number, c: number, cell: Cell): void;
    /** @param {(cell: Cell, r: number, c: number) => void} fn */
    forEach(fn: (cell: Cell, r: number, c: number) => void): void;
    /**
     * @template Out
     * @param {(cell: Cell, r: number, c: number) => Out} fn
     * @returns {Grid<Out>}
     */
    map<Out>(fn: (cell: Cell, r: number, c: number) => Out): Grid<Out>;
}
