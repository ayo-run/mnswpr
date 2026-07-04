// @ts-check

/**
 * @typedef {import('../core/minesweeper/rules.js').MoveEvent} MnswprMoveEvent
 */

/**
 * Map a recorded move-event back to the rules move that produced it: `flag` and
 * `unflag` are both the toggle move `flag`; `reveal` and `chord` pass through.
 * Unknown kinds are ignored. Shared by the mnswpr replay adapters (progress and
 * full-board state) so both replay a stream through the core rules identically.
 *
 * @param {MnswprMoveEvent} e
 * @returns {{ type: 'reveal' | 'flag' | 'chord', r: number, c: number } | null}
 */
export function toMove(e) {
  switch (e && e.type) {
    case 'reveal': return { type: 'reveal', r: e.r, c: e.c }
    case 'chord': return { type: 'chord', r: e.r, c: e.c }
    case 'flag':
    case 'unflag': return { type: 'flag', r: e.r, c: e.c }
    default: return null
  }
}
