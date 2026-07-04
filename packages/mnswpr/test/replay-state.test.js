import { describe, it, expect } from 'vitest'
import { GameSession, MinesweeperRules } from '../core/index.js'
import { createStateReducer } from '../adapters/replay-state.js'

// Drive a session over an injected layout, capturing the real move-event stream.
function record(layout, moves) {
  const session = new GameSession(MinesweeperRules, { state: MinesweeperRules.fromLayout(layout) })
  const events = []
  session.onMove(e => events.push(e))
  for (const m of moves) session.applyMove(m)
  return { events: events.map(event => ({ seq: event.seq, t: event.t, event })), session }
}

// 3x3, single mine at (0,0). Total safe = 8.
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

describe('mnswpr state reducer (full-board reconstruction)', () => {
  const layout = smallBoard()
  const { events } = record(layout, [
    { type: 'reveal', r: 0, c: 1 },
    { type: 'reveal', r: 1, c: 0 },
    { type: 'flag', r: 0, c: 0 },
    { type: 'reveal', r: 2, c: 2 } // floods the rest
  ])
  const state = createStateReducer(layout)
  const status = (b, r, c) => b.cells[r][c].status

  it('empty slice → pristine board (all hidden, fresh)', () => {
    const b = state([])
    expect(b.rows).toBe(3)
    expect(b.cols).toBe(3)
    expect(b.phase).toBe('fresh')
    expect(b.revealedSafe).toBe(0)
    expect(b.cells.flat().every(c => c.status === 'hidden')).toBe(true)
  })

  it('reconstructs the exact board state at several event indices', () => {
    // index 1 — after reveal(0,1): just that cell open
    let b = state(events.slice(0, 1))
    expect(status(b, 0, 1)).toBe('revealed')
    expect(status(b, 0, 0)).toBe('hidden')
    expect(status(b, 1, 0)).toBe('hidden')
    expect(b.revealedSafe).toBe(1)
    expect(b.phase).toBe('active')

    // index 2 — after reveal(1,0)
    b = state(events.slice(0, 2))
    expect(status(b, 0, 1)).toBe('revealed')
    expect(status(b, 1, 0)).toBe('revealed')
    expect(b.revealedSafe).toBe(2)

    // index 3 — after flag(0,0): mine flagged, nothing new revealed
    b = state(events.slice(0, 3))
    expect(status(b, 0, 0)).toBe('flagged')
    expect(b.revealedSafe).toBe(2)

    // index 4 — after reveal(2,2): floods all safe cells; mine stays flagged; won
    b = state(events.slice(0, 4))
    expect(b.phase).toBe('won')
    expect(b.revealedSafe).toBe(8)
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        expect(status(b, r, c)).toBe(r === 0 && c === 0 ? 'flagged' : 'revealed')
      }
    }
  })

  it('carries mine/adjacent metadata for rendering', () => {
    const b = state(events)
    expect(b.cells[0][0].mine).toBe(true)
    expect(b.cells[0][1].mine).toBe(false)
    expect(b.cells[0][1].adjacent).toBe(1)
  })

  it('is stateless: the same slice reconstructs an equal board', () => {
    expect(state(events.slice(0, 2))).toEqual(state(events.slice(0, 2)))
    // and reconstructing a shorter slice after a longer one is unaffected
    const full = state(events)
    expect(state(events.slice(0, 1)).revealedSafe).toBe(1)
    expect(full.revealedSafe).toBe(8)
  })

  it('counts chord reveals in the reconstructed board', () => {
    // reveal a number, flag the mine, then chord it open.
    const { events: chordEvents } = record(smallBoard(), [
      { type: 'reveal', r: 0, c: 1 },
      { type: 'flag', r: 0, c: 0 },
      { type: 'chord', r: 0, c: 1 }
    ])
    const b = createStateReducer(smallBoard())(chordEvents)
    expect(b.revealedSafe).toBe(8)
    expect(b.cells[2][2].status).toBe('revealed')
  })
})
