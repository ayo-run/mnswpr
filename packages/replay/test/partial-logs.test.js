// @ts-check
import { describe, it, expect } from 'vitest'
import { PlaybackClock } from '@cozy-games/replay'
import { createMoveLog } from '@cozy-games/move-log'

const VERSION = 'mnswpr-moves/1'

// Real mnswpr run + reducers — imported by the TEST (relative), so no game
// dependency enters the engine's manifest.
import { GameSession, MinesweeperRules } from '../../mnswpr/core/index.js'
import { createProgressReducer } from '../../mnswpr/adapters/replay-progress.js'
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

const board = () => ({
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

// A TRUNCATED recording: two opening reveals, then the log just stops — the game
// is still 'active' (2 of 8 safe cells), no win/loss ever recorded.
function truncatedEnvelope() {
  let now = 0
  const session = new GameSession(MinesweeperRules, { state: MinesweeperRules.fromLayout(board()), clock: () => now })
  const emitted = []
  session.onMove(e => emitted.push(e))
  now = 1000; session.applyMove({ type: 'reveal', r: 0, c: 1 })
  now = 1200; session.applyMove({ type: 'reveal', r: 1, c: 0 })
  // ...stream cut here — no terminal event.
  const baseT = 1000
  return {
    envelope: createMoveLog(VERSION, emitted.map(e => ({ seq: e.seq, clientTs: e.t, type: e.type, payload: { r: e.r, c: e.c } }))),
    lastOffset: 1200 - baseT // 200
  }
}

describe('partial/incomplete recordings — progress mode', () => {
  it('replays to the last event without error and freezes progress (no jump to 100%)', () => {
    const { envelope, lastOffset } = truncatedEnvelope()
    const s = fakeScheduler()
    const clock = new PlaybackClock(envelope, s, { progress: createProgressReducer(board()) })

    const progressUpdates = []
    const ends = []
    clock.onProgress(u => progressUpdates.push(u))
    clock.onEnd(u => ends.push(u))

    expect(() => { clock.play(); s.advance(10_000) }).not.toThrow() // long past the last event

    // Frozen at the true value for 2/8 safe cells — NOT extrapolated to 100.
    expect(clock.progress()).toBeCloseTo(25, 5)
    expect(clock.isPlaying()).toBe(false)

    // "ended" fired once, at the last event's offset.
    expect(ends).toHaveLength(1)
    expect(ends[0].position).toBe(lastOffset)

    // Progress held at its last value after the stream ended.
    expect(progressUpdates.at(-1).progress).toBeCloseTo(25, 5)
  })

  it('progress stays frozen when time advances past the end', () => {
    const { envelope } = truncatedEnvelope()
    const s = fakeScheduler()
    const clock = new PlaybackClock(envelope, s, { progress: createProgressReducer(board()) })
    clock.play()
    s.advance(300)
    const atEnd = clock.progress()
    s.advance(5000) // way past
    expect(clock.progress()).toBe(atEnd) // no drift, no extrapolation
    expect(atEnd).toBeCloseTo(25, 5)
  })
})

describe('partial/incomplete recordings — full-board mode', () => {
  it('reconstructs the last recorded state without error and ends cleanly', () => {
    const { envelope, lastOffset } = truncatedEnvelope()
    const s = fakeScheduler()
    const clock = new PlaybackClock(envelope, s, { state: createStateReducer(board()) }, { fullBoard: true })
    const ends = []
    clock.onEnd(u => ends.push(u))

    expect(() => { clock.play(); s.advance(10_000) }).not.toThrow()

    const b = clock.state()
    expect(b.phase).toBe('active') // never reached a terminal state — and that's fine
    expect(b.revealedSafe).toBe(2)
    expect(b.cells[0][1].status).toBe('revealed')
    expect(b.cells[2][2].status).toBe('hidden') // rest still unopened

    expect(ends).toHaveLength(1)
    expect(ends[0].position).toBe(lastOffset)
  })
})

describe('the "ended" signal', () => {
  it('fires identically for a complete run and a truncated one', () => {
    // Complete run: play the board to a win.
    let now = 0
    const session = new GameSession(MinesweeperRules, { state: MinesweeperRules.fromLayout(board()), clock: () => now })
    const emitted = []
    session.onMove(e => emitted.push(e))
    now = 1000; session.applyMove({ type: 'reveal', r: 2, c: 2 }) // floods all 8 → won
    const complete = createMoveLog(VERSION, emitted.map(e => ({ seq: e.seq, clientTs: e.t, type: e.type, payload: { r: e.r, c: e.c } })))

    const s = fakeScheduler()
    const clock = new PlaybackClock(complete, s)
    const ends = []
    clock.onEnd(u => ends.push(u))
    clock.play()
    s.advance(1000)
    expect(ends).toHaveLength(1)
    expect(ends[0].position).toBe(clock.duration) // last event's offset
  })

  it('fires on seek to the end and re-arms after seeking back', () => {
    const { envelope } = truncatedEnvelope()
    const clock = new PlaybackClock(envelope, fakeScheduler())
    const ends = []
    clock.onEnd(() => ends.push(1))

    clock.seek(clock.duration) // reach the end
    expect(ends).toHaveLength(1)

    clock.seek(clock.duration) // still at the end — no re-fire
    expect(ends).toHaveLength(1)

    clock.seek(0)              // move back — re-arm
    clock.seek(clock.duration) // reach the end again
    expect(ends).toHaveLength(2)
  })

  it('does not fire for an empty envelope', () => {
    const clock = new PlaybackClock(createMoveLog(VERSION, []), fakeScheduler())
    const ends = []
    clock.onEnd(() => ends.push(1))
    clock.play()
    clock.seek(0)
    expect(ends).toEqual([])
  })
})
