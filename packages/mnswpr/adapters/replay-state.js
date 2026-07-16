// @ts-check
import { MinesweeperRules } from '../core/minesweeper/rules.js'
import { toMove } from './replay-common.js'

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
export function createStateReducer(layout) {
  return function state(events) {
    let s = MinesweeperRules.fromLayout(layout)
    for (const record of events) {
      const move = toMove(record)
      if (move) s = MinesweeperRules.apply(s, move).state
    }
    return toBoard(s)
  }
}

/**
 * Project a core game state into a plain, render-ready 2D board snapshot.
 * @param {import('../core/minesweeper/rules.js').State} s
 * @returns {BoardState}
 */
function toBoard(s) {
  const { rows, cols } = s.config
  /** @type {BoardCell[][]} */
  const cells = []
  for (let r = 0; r < rows; r++) {
    /** @type {BoardCell[]} */
    const row = []
    for (let c = 0; c < cols; c++) {
      const cell = s.grid.at(r, c)
      row.push({ mine: cell.mine, adjacent: cell.adjacent, status: cell.status })
    }
    cells.push(row)
  }
  return { rows, cols, phase: s.phase, revealedSafe: s.revealedSafe, cells }
}
