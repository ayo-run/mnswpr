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
export function eightWay(grid: Boundable, r: any, c: any): Array<[number, number]>;
/**
 * The 4 orthogonal cells (N/E/S/W).
 * @param {Boundable} grid
 * @returns {Array<[number, number]>}
 */
export function orthogonal(grid: Boundable, r: any, c: any): Array<[number, number]>;
/**
 * Neighbor STRATEGIES — the extraction seam. A game injects the topology it
 * wants; the grid layer never assumes one. Minesweeper uses `eightWay`; a future
 * Sudoku would inject its row/col/box `peers`. Each returns in-bounds [r, c]
 * coordinate pairs.
 */
export type Boundable = {
    inBounds: (r: number, c: number) => boolean;
};
