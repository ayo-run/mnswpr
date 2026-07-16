// @ts-check

/**
 * A recorded mnswpr move-log entry — the `@cozy-games/move-log` / ADR-002 §1
 * envelope shape as instantiated by Minesweeper: a surfaced `type` discriminator
 * plus an opaque `payload` carrying the move's `{ r, c }`. This is what the replay
 * engine hands the reducers (the only fields they read).
 *
 * @typedef {{ type: string, payload: { r: number, c: number } }} MnswprRecord
 */

/**
 * Map a recorded move-log entry back to the rules move that produced it: `flag`
 * and `unflag` are both the toggle move `flag`; `reveal` and `chord` pass
 * through. Unknown kinds are ignored. Shared by the mnswpr replay adapters
 * (progress and full-board state) so both replay a stream through the core rules
 * identically.
 *
 * @param {MnswprRecord} record
 * @returns {{ type: 'reveal' | 'flag' | 'chord', r: number, c: number } | null}
 */
export function toMove(record) {
  if (!record) return null
  const { type, payload } = record
  const r = payload ? payload.r : 0
  const c = payload ? payload.c : 0
  switch (type) {
    case 'reveal': return { type: 'reveal', r, c }
    case 'chord': return { type: 'chord', r, c }
    case 'flag':
    case 'unflag': return { type: 'flag', r, c }
    default: return null
  }
}
