/**
 * Plain-JSON serialization of a Grid. Used by the move log / server persistence
 * (Layer 1) and by replay. Cells must themselves be JSON-serializable.
 *
 * @template Cell
 * @param {Grid<Cell>} grid
 * @returns {{ rows: number, cols: number, cells: Cell[] }}
 */
export function toJSON<Cell>(grid: Grid<Cell>): {
    rows: number;
    cols: number;
    cells: Cell[];
};
/**
 * @template Cell
 * @param {{ rows: number, cols: number, cells: Cell[] }} data
 * @param {(cell: Cell) => Cell} [reviveCell]
 * @returns {Grid<Cell>}
 */
export function fromJSON<Cell>(data: {
    rows: number;
    cols: number;
    cells: Cell[];
}, reviveCell?: (cell: Cell) => Cell): Grid<Cell>;
import { Grid } from './grid.js';
