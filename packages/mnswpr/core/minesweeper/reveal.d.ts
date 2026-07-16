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
export function floodReveal(grid: MineGrid, startR: any, startC: any): RevealedCell[];
/**
 * @param {MineGrid} grid
 * @returns {number} count of flagged cells around (r, c)
 */
export function countFlagsAround(grid: MineGrid, r: any, c: any): number;
/**
 * @param {MineGrid} grid
 * @returns {Array<{ r: number, c: number }>} every mined coordinate
 */
export function allMines(grid: MineGrid): Array<{
    r: number;
    c: number;
}>;
export type Cell = import("./board.js").Cell;
export type MineGrid = import("../grid/grid.js").Grid<Cell>;
export type RevealedCell = {
    r: number;
    c: number;
    adjacent: number;
};
