// @ts-check
import { describe, it, expect } from 'vitest'
import { PlaybackClock } from '@cozy-games/replay'
import { createMoveLog } from '@cozy-games/move-log'

const VERSION = 'mnswpr-moves/1'

// Real mnswpr run + state reducer — imported by the TEST (relative), so no game
// dependency enters the engine's manifest.
import { GameSession, MinesweeperRules } from '../../mnswpr/core/index.js'
import { createStateReducer } from '../../mnswpr/adapters/replay-state.js'

function fakeScheduler(start = 0) {
  let now = start
  let nextId = 1
  const timers = new Map()
  return {
    clock: () => now,
    setTimeout: (fn, ms) => {
      const id = nextId++
      timers.set(id, { at: now + Math.max(0, ms), fn })
      return id
    },
    clearTimeout: (id) => { timers.delete(id) },
    advance(ms) {
      const target = now + ms
      for (;;) {
        let due = null
        for (const [id, timer] of timers) {
          if (timer.at <= target && (due === null || timer.at < due.at)) due = { id, ...timer }
        }
        if (!due) break
        timers.delete(due.id)
        now = due.at
        due.fn()
      }
      now = target
    }
  }
}

const board = {
  rows: 3,
  cols: 3,
  mines: 1,
  cells: [
    [{ mine: true, adjacent: 0 }, { mine: false, adjacent: 1 }, { mine: false, adjacent: 0 }],
    [{ mine: false, adjacent: 1 }, { mine: false, adjacent: 1 }, { mine: false, adjacent: 0 }],
    [{ mine: false, adjacent: 0 }, { mine: false, adjacent: 0 }, { mine: false, adjacent: 0 }]
  ],
  mineLocations: [[0, 0]]
}

// Record a real run: reveal, reveal, flag the mine, then flood the rest.
let nowClock = 0
const session = new GameSession(MinesweeperRules, { state: MinesweeperRules.fromLayout(board), clock: () => nowClock })
const emitted = []
session.onMove(e => emitted.push(e))
const baseT = 1000
for (const step of [
  { at: 1000, move: { type: 'reveal', r: 0, c: 1 } },
  { at: 1100, move: { type: 'reveal', r: 1, c: 0 } },
  { at: 1200, move: { type: 'flag', r: 0, c: 0 } },
  { at: 1300, move: { type: 'reveal', r: 2, c: 2 } }
]) {
  nowClock = step.at
  session.applyMove(step.move)
}
const records = emitted.map(e => ({ seq: e.seq, clientTs: e.t, type: e.type, payload: { r: e.r, c: e.c } }))
const envelope = createMoveLog(VERSION, records)
const reduce = createStateReducer(board)

// Independent ground truth: reduce over records at offset <= t.
const truth = t => reduce(records.filter(r => (r.clientTs - baseT) <= t))

describe('full-board mode — flag gating (inert by default)', () => {
  it('does nothing when the flag is off, even with a state reducer', () => {
    const clock = new PlaybackClock(envelope, fakeScheduler(), { state: reduce })
    const updates = []
    clock.onState(u => updates.push(u))
    clock.seek(clock.duration)
    expect(clock.state()).toBe(null)
    expect(updates).toEqual([])
  })

  it('is inert when the flag is on but no state reducer is supplied', () => {
    const clock = new PlaybackClock(envelope, fakeScheduler(), {}, { fullBoard: true })
    clock.seek(clock.duration)
    expect(clock.state()).toBe(null)
  })
})

describe('full-board mode — reconstruction (flag on)', () => {
  const make = () => new PlaybackClock(envelope, fakeScheduler(), { state: reduce }, { fullBoard: true })

  it('state() reconstructs the board at multiple seek points', () => {
    const clock = make()
    for (const t of [-5, 0, 50, 100, 150, 200, 300, 400]) {
      clock.seek(t)
      const clamped = Math.max(0, Math.min(t, clock.duration))
      expect(clock.state()).toEqual(truth(clamped))
    }
  })

  it('seek reconstructs the correct concrete state (forward then backward)', () => {
    const clock = make()

    clock.seek(clock.duration) // end
    let b = clock.state()
    expect(b.phase).toBe('won')
    expect(b.revealedSafe).toBe(8)
    expect(b.cells[0][0].status).toBe('flagged')

    clock.seek(100) // back to just after the two opening reveals
    b = clock.state()
    expect(b.phase).toBe('active')
    expect(b.revealedSafe).toBe(2)
    expect(b.cells[0][1].status).toBe('revealed')
    expect(b.cells[2][2].status).toBe('hidden')

    clock.seek(0) // back to the very first reveal
    expect(clock.state().revealedSafe).toBe(1)
  })

  it('onState streams a reconstruction on every delivery (incl. the flag)', () => {
    const s = fakeScheduler()
    const clock = new PlaybackClock(envelope, s, { state: reduce }, { fullBoard: true })
    const updates = []
    clock.onState(u => updates.push(u))
    clock.play()
    s.advance(400)
    expect(updates.map(u => u.position)).toEqual([0, 100, 200, 300])
    expect(updates.at(-1).state.phase).toBe('won')
  })

  it('onState fires on backward seek', () => {
    const clock = make()
    const updates = []
    clock.onState(u => updates.push(u))
    clock.seek(clock.duration) // forward (delivers all at once → 1 update)
    clock.seek(0)              // backward → 1 update
    expect(updates).toHaveLength(2)
    expect(updates.at(-1).state.revealedSafe).toBe(1)
  })

  it('rejects a non-function state reducer at construction', () => {
    expect(() => new PlaybackClock(envelope, fakeScheduler(), { state: /** @type {any} */ (5) })).toThrow(TypeError)
  })
})
