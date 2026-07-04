import { describe, it, expect } from 'vitest'
import { GameSession, MinesweeperRules, generateBoard, levels } from '../core/index.js'
import { createProgressReducer } from '../adapters/replay-progress.js'

// Drive a session over an injected layout, capturing the real core-06 move-event
// stream (onMove). Returns the emitted events and the session.
function record(layout, moves) {
  const session = new GameSession(MinesweeperRules, { state: MinesweeperRules.fromLayout(layout) })
  const events = []
  session.onMove(e => events.push(e))
  for (const m of moves) session.applyMove(m)
  return { events: events.map(event => ({ seq: event.seq, t: event.t, event })), session }
}

// 3x3, single mine at (0,0); adjacency computed. Total safe = 8.
const smallBoard = () => ({
  rows: 3,
  cols: 3,
  mines: 1,
  cells: [
    [{ mine: true, adjacent: 0 }, { mine: false, adjacent: 1 }, { mine: false, adjacent: 0 }],
    [{ mine: false, adjacent: 1 }, { mine: false, adjacent: 1 }, { mine: false, adjacent: 0 }],
    [{ mine: false, adjacent: 0 }, { mine: false, adjacent: 0 }, { mine: false, adjacent: 0 }]
  ],
  mineLocations: [[0, 0]]
})

describe('mnswpr progress reducer (percent-cleared)', () => {
  it('progresses a scripted full game from 0% to 100%, monotonically', () => {
    // A real generated board; reveal every safe cell in row-major order to win.
    const layout = generateBoard(9, 9, 10, { seed: 7, safeCell: { r: 0, c: 0 } })
    const progress = createProgressReducer(layout)

    const session = new GameSession(MinesweeperRules, { state: MinesweeperRules.fromLayout(layout) })
    const events = []
    session.onMove(e => events.push({ seq: e.seq, t: e.t, event: e }))
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (!session.state.grid.at(r, c).mine) session.applyMove({ type: 'reveal', r, c })
      }
    }
    expect(session.status()).toBe('won')

    expect(progress([])).toBe(0)                       // nothing revealed yet
    expect(progress(events)).toBe(100)                 // full clear
    expect(progress(events.slice(0, 1))).toBeGreaterThan(0) // first reveal opens a region

    // monotonic non-decreasing across every prefix
    let prev = -1
    for (let k = 0; k <= events.length; k++) {
      const p = progress(events.slice(0, k))
      expect(p).toBeGreaterThanOrEqual(prev)
      prev = p
    }
  })

  it('counts flooded reveals by cells opened, not by event count', () => {
    const layout = smallBoard()
    const progress = createProgressReducer(layout)
    // Revealing the far corner (2,2) floods every one of the 8 safe cells.
    const { events } = record(layout, [{ type: 'reveal', r: 2, c: 2 }])
    expect(events).toHaveLength(1)      // one event...
    expect(progress(events)).toBe(100)  // ...but all 8 safe cells cleared
  })

  it('flag and unflag events leave progress unchanged', () => {
    const layout = smallBoard()
    const progress = createProgressReducer(layout)
    // reveal one numbered cell (1/8), then flag + unflag the mine.
    const { events } = record(layout, [
      { type: 'reveal', r: 0, c: 1 }, // reveals just itself (adjacent 1)
      { type: 'flag', r: 0, c: 0 },   // flag the mine
      { type: 'flag', r: 0, c: 0 }    // unflag it
    ])
    expect(events.map(e => e.event.type)).toEqual(['reveal', 'flag', 'unflag'])

    const afterReveal = progress(events.slice(0, 1))
    expect(afterReveal).toBeCloseTo(12.5, 5) // 1 / 8
    expect(progress(events.slice(0, 2))).toBe(afterReveal) // + flag: unchanged
    expect(progress(events)).toBe(afterReveal)             // + unflag: unchanged
  })

  it('counts the cells a chord reveals', () => {
    const layout = smallBoard()
    const progress = createProgressReducer(layout)
    // reveal (0,1)=1, flag the mine (0,0), then chord (0,1): its 1 flag matches
    // its value, so it reveals the rest of the board.
    const { events } = record(layout, [
      { type: 'reveal', r: 0, c: 1 },
      { type: 'flag', r: 0, c: 0 },
      { type: 'chord', r: 0, c: 1 }
    ])
    expect(events.map(e => e.event.type)).toEqual(['reveal', 'flag', 'chord'])

    expect(progress(events.slice(0, 1))).toBeCloseTo(12.5, 5) // 1/8 after reveal
    expect(progress(events.slice(0, 2))).toBeCloseTo(12.5, 5) // flag doesn't advance
    expect(progress(events)).toBe(100)                        // chord clears the rest
  })

  it('reflects a partial game (lost run stops where it stopped)', () => {
    // Reveal a couple of cells then step on the mine — progress reflects only the
    // safe cells cleared before the loss.
    const layout = smallBoard()
    const progress = createProgressReducer(layout)
    const { events, session } = record(layout, [
      { type: 'reveal', r: 0, c: 1 },
      { type: 'reveal', r: 1, c: 0 },
      { type: 'reveal', r: 0, c: 0 } // mine → lost
    ])
    expect(session.status()).toBe('lost')
    expect(progress(events)).toBeCloseTo(25, 5) // 2 of 8 safe cells cleared
  })

  it('is usable as the replay engine progress adapter (shape check)', () => {
    // The reducer matches ProgressReducer<T>: (events) => number in [0,100].
    const { rows, cols, mines } = levels.beginner
    const progress = createProgressReducer(generateBoard(rows, cols, mines, { seed: 1 }))
    const v = progress([])
    expect(typeof v).toBe('number')
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThanOrEqual(100)
  })
})
