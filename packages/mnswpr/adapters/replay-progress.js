// @ts-check
import { MinesweeperRules } from '../core/minesweeper/rules.js'
import { toMove } from './replay-common.js'

/**
 * @typedef {import('../core/minesweeper/rules.js').MoveEvent} MnswprMoveEvent
 * @typedef {import('../core/minesweeper/board.js').Layout} Layout
 */

/**
 * The percent-cleared progress reducer for Minesweeper — mnswpr's first concrete
 * implementation of the replay engine's `ProgressReducer<MnswprMoveEvent>` seam
 * (see `@cozy-games/replay` / replay-02). Given the ordered slice of move-events
 * played so far, it returns completion as
 * `revealed safe cells / total safe cells * 100`.
 *
 * Why it needs the board: a single `reveal` or `chord` event floods MANY cells,
 * but the recorded move-event only carries `{ type, r, c }` — not how many cells
 * opened. So the reducer takes the board as closure input (consistent with the
 * interface design) and replays the moves through the pure core rules. That makes
 * reveals flood, chords reveal via their (non-flagged) neighbors, and
 * flags/unflags only gate chords — never advancing progress themselves — with no
 * cell double-counted. The engine stays game-blind; all interpretation is here.
 *
 * @param {Layout} layout - the recorded board (as produced by `generateBoard`)
 * @returns {(events: { event: MnswprMoveEvent }[]) => number} a reducer to `[0, 100]`
 */
export function createProgressReducer(layout) {
  const totalSafe = layout.rows * layout.cols - layout.mines
  return function progress(events) {
    // A board with no safe cells is vacuously fully cleared (and avoids /0).
    if (totalSafe === 0) return 100
    let state = MinesweeperRules.fromLayout(layout)
    for (const record of events) {
      const move = toMove(record.event)
      if (move) state = MinesweeperRules.apply(state, move).state
    }
    return (state.revealedSafe / totalSafe) * 100
  }
}
