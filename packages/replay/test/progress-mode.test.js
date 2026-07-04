// @ts-check
import { describe, it, expect } from 'vitest'
import { PlaybackClock } from '@cozy-games/replay'
import { createMoveLog } from '@cozy-games/move-log'

// A real mnswpr run + its reducer — imported by the TEST via relative paths, so
// no game dependency enters the replay engine's manifest.
import { GameSession, MinesweeperRules } from '../../mnswpr/core/index.js'
import { createProgressReducer } from '../../mnswpr/adapters/replay-progress.js'

/** Deterministic injected scheduler (the injected-clock seam), no vi needed. */
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

// 3x3, single mine at (0,0). Total safe = 8.
const layout = () => ({
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

// Drive a real session, recording BOTH the emitted move-events and the ground
// truth (revealedSafe) after each move — an independent source of truth.
const board = layout()
const TOTAL_SAFE = 8
const session = new GameSession(MinesweeperRules, { state: MinesweeperRules.fromLayout(board), clock: () => nowClock })
let nowClock = 0
const emitted = []
session.onMove(e => emitted.push(e))
const truthPoints = [] // { offset, revealedSafe } after each move

const script = [
  { at: 1000, move: { type: 'reveal', r: 0, c: 1 } }, // +1 safe cell
  { at: 1100, move: { type: 'reveal', r: 1, c: 0 } }, // +1 safe cell
  { at: 1200, move: { type: 'flag', r: 0, c: 0 } },   // flag the mine — no progress
  { at: 1300, move: { type: 'reveal', r: 2, c: 2 } }  // floods the rest → all 8
]
const baseT = script[0].at
for (const step of script) {
  nowClock = step.at
  session.applyMove(step.move)
  truthPoints.push({ offset: step.at - baseT, revealedSafe: session.state.revealedSafe })
}

const records = emitted.map(e => ({ seq: e.seq, t: e.t, event: e }))
const envelope = createMoveLog(records)

// Ground truth for the mnswpr reducer: revealedSafe / total at a given offset —
// derived from the session, NOT from the reducer under test.
function mnswprTruth(offset) {
  let revealedSafe = 0
  for (const p of truthPoints) if (p.offset <= offset) revealedSafe = p.revealedSafe
  return (revealedSafe / TOTAL_SAFE) * 100
}

// A second, unrelated adapter: percent of events delivered. Ground truth is the
// count of records at offset <= t.
const totalEvents = records.length
const dummyReduce = events => (events.length / totalEvents) * 100
function dummyTruth(offset) {
  return (records.filter(r => (r.t - baseT) <= offset).length / totalEvents) * 100
}

const CASES = [
  { name: 'mnswpr percent-cleared', adapter: { progress: createProgressReducer(board) }, truth: mnswprTruth },
  { name: 'dummy percent-of-events', adapter: { progress: dummyReduce }, truth: dummyTruth }
]

describe.each(CASES)('progress mode — same code path, adapter: $name', ({ adapter, truth }) => {
  const clamp = t => Math.max(0, Math.min(t, envelope.events[envelope.events.length - 1].t - baseT))

  it('progress() matches the source run at multiple points (via seek)', () => {
    const clock = new PlaybackClock(envelope, fakeScheduler(), adapter)
    for (const t of [-10, 0, 50, 100, 150, 200, 250, 300, 400]) {
      clock.seek(t)
      expect(clock.progress()).toBeCloseTo(truth(clamp(t)), 5)
    }
  })

  it('progress() matches the source run while playing (fake timers)', () => {
    const s = fakeScheduler()
    const clock = new PlaybackClock(envelope, s, adapter)
    const updates = []
    clock.onProgress(u => updates.push(u))
    clock.play()

    let last = 0
    for (const cp of [0, 100, 200, 300]) {
      s.advance(cp - last)
      last = cp
      expect(clock.progress()).toBeCloseTo(truth(cp), 5)
    }
    expect(clock.progress()).toBeCloseTo(truth(clock.duration), 5)

    // The pushed signal is non-decreasing during forward play and ends at 100.
    const vals = updates.map(u => u.progress)
    expect(vals).toEqual([...vals].sort((a, b) => a - b))
    expect(vals.at(-1)).toBeCloseTo(truth(clock.duration), 5)
    // Each emitted update matches ground truth at the position it reports.
    for (const u of updates) expect(u.progress).toBeCloseTo(truth(u.position), 5)
  })

  it('seek forward and backward move the progress signal correctly', () => {
    const clock = new PlaybackClock(envelope, fakeScheduler(), adapter)
    const vals = []
    clock.onProgress(u => vals.push(u.progress))

    clock.seek(clock.duration) // forward to the end
    expect(clock.progress()).toBeCloseTo(truth(clock.duration), 5)

    clock.seek(0) // jump back to the start
    expect(clock.progress()).toBeCloseTo(truth(0), 5)

    expect(vals[0]).toBeCloseTo(truth(clock.duration), 5) // went up first
    expect(vals.at(-1)).toBeCloseTo(truth(0), 5)          // then down
    expect(vals.at(-1)).toBeLessThan(vals[0])
  })
})

describe('progress mode — signal behavior', () => {
  it('does not emit for events that leave progress unchanged (flags)', () => {
    // mnswpr: the flag at offset 200 must NOT produce a progress update.
    const s = fakeScheduler()
    const clock = new PlaybackClock(envelope, s, { progress: createProgressReducer(board) })
    const updates = []
    clock.onProgress(u => updates.push(u))
    clock.play()
    s.advance(400)
    // reveals at 0, 100, 300 changed progress; the flag at 200 did not.
    expect(updates.map(u => u.position)).toEqual([0, 100, 300])
    expect(updates.map(u => Math.round(u.progress))).toEqual([13, 25, 100])
  })

  it('emits nothing when no progress adapter is supplied', () => {
    const clock = new PlaybackClock(envelope, fakeScheduler())
    const updates = []
    clock.onProgress(u => updates.push(u))
    clock.seek(clock.duration)
    expect(updates).toEqual([])
    expect(clock.progress()).toBe(null)
  })

  it('unsubscribe stops progress delivery', () => {
    const clock = new PlaybackClock(envelope, fakeScheduler(), { progress: dummyReduce })
    const updates = []
    const off = clock.onProgress(u => updates.push(u))
    clock.seek(100)
    off()
    clock.seek(300)
    expect(updates).toHaveLength(1) // only the first jump delivered
  })
})
