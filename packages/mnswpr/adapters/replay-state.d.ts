/**
 * @typedef {import('./replay-common.js').MnswprRecord} MnswprRecord
 * @typedef {import('../core/minesweeper/board.js').Layout} Layout
 * @typedef {{ mine: boolean, adjacent: number, status: 'hidden' | 'flagged' | 'revealed' }} BoardCell
 * @typedef {{ rows: number, cols: number, phase: string, revealedSafe: number, cells: BoardCell[][] }} BoardState
 */
/**
 * The full-board state reducer for Minesweeper — mnswpr's implementation of the
 * replay engine's `StateReducer<BoardState>` seam (replay-05). Given the ordered
 * slice of move-log entries played so far, it reconstructs the COMPLETE board at
 * that point: every cell's mine/adjacent/status plus the phase.
 *
 * Like the progress reducer, it takes the board as closure input and replays the
 * moves through the pure core rules — so reveals flood, chords open their
 * neighbors, and flags toggle — giving an exact reconstruction at any event
 * index. Statelessly a function of the slice, so the engine can jump (seek) to
 * any position and rebuild the board there.
 *
 * @param {Layout} layout - the recorded board (as produced by `generateBoard`)
 * @returns {(events: MnswprRecord[]) => BoardState}
 */
export function createStateReducer(layout: Layout): (events: MnswprRecord[]) => BoardState;
export type MnswprRecord = import("./replay-common.js").MnswprRecord;
export type Layout = import("../core/minesweeper/board.js").Layout;
export type BoardCell = {
    mine: boolean;
    adjacent: number;
    status: "hidden" | "flagged" | "revealed";
};
export type BoardState = {
    rows: number;
    cols: number;
    phase: string;
    revealedSafe: number;
    cells: BoardCell[][];
};
