// @ts-check
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Imported via the PACKAGE NAME to prove the new workspace module resolves.
import { PlaybackClock } from '@cozy-games/replay'
import { createMoveLog } from '@cozy-games/move-log'

/**
 * A hand-rolled deterministic scheduler — the injected-clock seam in action, with
 * zero reliance on vi internals. `advance(ms)` fires due timers in time order,
 * picking up timers scheduled from within a firing callback.
 */
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

const VERSION = 'dummy-game/1'

// Events at offsets 0, 100, 350 (clientTs rebased from 1000). Payload is opaque to the clock.
function envelope() {
  return createMoveLog(VERSION, [
    { seq: 1, clientTs: 1000, type: 'reveal', payload: { r: 0, c: 0 } },
    { seq: 2, clientTs: 1100, type: 'flag', payload: { r: 1, c: 2 } },
    { seq: 3, clientTs: 1350, type: 'chord', payload: { r: 4, c: 4 } }
  ])
}

const typesOf = records => records.map(r => r.type)

describe('PlaybackClock — construction & shape', () => {
  it('rebases to offsets: duration is the last offset, first event at 0', () => {
    const clock = new PlaybackClock(envelope(), fakeScheduler())
    expect(clock.duration).toBe(350)
    expect(clock.position()).toBe(0)
    expect(clock.isPlaying()).toBe(false)
  })

  it('validates the envelope (rejects a non-envelope)', () => {
    expect(() => new PlaybackClock(/** @type {any} */ (null))).toThrow()
    expect(() => new PlaybackClock(/** @type {any} */ ({ schema_version: 2, events: [] }))).toThrow()
  })

  it('handles an empty envelope gracefully', () => {
    const clock = new PlaybackClock(createMoveLog(VERSION, []), fakeScheduler())
    const seen = []
    clock.on(r => seen.push(r))
    expect(clock.duration).toBe(0)
    clock.play()
    expect(clock.isPlaying()).toBe(false) // nothing to play → ends immediately
    expect(seen).toEqual([])
  })
})

describe('PlaybackClock — play / pause with an injected scheduler', () => {
  it('fires events at their recorded offsets, exactly', () => {
    const s = fakeScheduler()
    const clock = new PlaybackClock(envelope(), s)
    const seen = []
    clock.on(r => seen.push({ type: r.type, at: s.clock() }))

    clock.play()
    // offset-0 event fires synchronously on play
    expect(seen).toEqual([{ type: 'reveal', at: 0 }])

    s.advance(100)
    expect(seen[1]).toEqual({ type: 'flag', at: 100 })

    s.advance(250) // reach offset 350
    expect(seen[2]).toEqual({ type: 'chord', at: 350 })
    expect(clock.isPlaying()).toBe(false) // ended
    expect(clock.position()).toBe(350)
  })

  it('pause freezes position and stops delivery', () => {
    const s = fakeScheduler()
    const clock = new PlaybackClock(envelope(), s)
    const seen = []
    clock.on(r => seen.push(r.type))

    clock.play()
    s.advance(150) // past offset 100, between 100 and 350
    clock.pause()
    expect(clock.position()).toBe(150)
    expect(seen).toEqual(['reveal', 'flag'])

    s.advance(1000) // no timers should fire while paused
    expect(seen).toEqual(['reveal', 'flag'])
    expect(clock.position()).toBe(150)
  })

  it('resumes from the paused position', () => {
    const s = fakeScheduler()
    const clock = new PlaybackClock(envelope(), s)
    const seen = []
    clock.on(r => seen.push({ type: r.type, at: s.clock() }))

    clock.play()
    s.advance(150)
    clock.pause()
    clock.play() // resume at 150; next event at 350 ⇒ 200ms away
    s.advance(200)
    expect(seen.map(e => e.type)).toEqual(['reveal', 'flag', 'chord'])
    expect(seen[2].at).toBe(350) // still fires at its true offset
  })
})

describe('PlaybackClock — seek determinism', () => {
  it('seek forward delivers exactly the events at offset <= t, in order, once', () => {
    const clock = new PlaybackClock(envelope(), fakeScheduler())
    const seen = []
    clock.on(r => seen.push(r))

    clock.seek(200) // offsets 0 and 100 are <= 200; 350 is not
    expect(typesOf(seen)).toEqual(['reveal', 'flag'])
    expect(clock.position()).toBe(200)

    clock.seek(200) // no movement ⇒ no new deliveries
    expect(typesOf(seen)).toEqual(['reveal', 'flag'])
  })

  it('seek boundary is inclusive (offset === t fires)', () => {
    const clock = new PlaybackClock(envelope(), fakeScheduler())
    const seen = []
    clock.on(r => seen.push(r))
    clock.seek(100)
    expect(typesOf(seen)).toEqual(['reveal', 'flag']) // offset 100 included
  })

  it('seek backward re-schedules with no duplicate or dropped events', () => {
    const clock = new PlaybackClock(envelope(), fakeScheduler())
    const seen = []
    clock.on(r => seen.push(r))

    clock.seek(400) // deliver all three
    expect(typesOf(seen)).toEqual(['reveal', 'flag', 'chord'])

    clock.seek(50) // rewind — no delivery; only offset-0 stays "passed"
    expect(typesOf(seen)).toEqual(['reveal', 'flag', 'chord']) // unchanged

    clock.seek(400) // forward again re-delivers the re-crossed events, once each
    expect(typesOf(seen)).toEqual(['reveal', 'flag', 'chord', 'flag', 'chord'])
  })

  it('seek while playing re-anchors and keeps firing correctly', () => {
    const s = fakeScheduler()
    const clock = new PlaybackClock(envelope(), s)
    const seen = []
    clock.on(r => seen.push(r.type))

    clock.play()
    s.advance(50) // only offset-0 delivered so far
    expect(seen).toEqual(['reveal'])

    clock.seek(120) // jump forward while playing ⇒ deliver offset-100 event
    expect(seen).toEqual(['reveal', 'flag'])

    s.advance(230) // reach 350 ⇒ final event
    expect(seen).toEqual(['reveal', 'flag', 'chord'])
    expect(clock.isPlaying()).toBe(false)
  })

  it('never delivers an event twice within a single forward pass', () => {
    const s = fakeScheduler()
    const clock = new PlaybackClock(envelope(), s)
    const seqs = []
    clock.on(r => seqs.push(r.seq))
    clock.play()
    s.advance(1000)
    expect(seqs).toEqual([1, 2, 3]) // each once, in order
  })
})

describe('PlaybackClock — with vi fake timers', () => {
  afterEach(() => { vi.useRealTimers() })

  it('play/pause/seek work under vi.useFakeTimers()', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    // Default deps ⇒ Date.now + global setTimeout, both faked by vi.
    const clock = new PlaybackClock(envelope())
    const seen = []
    clock.on(r => seen.push(r.type))

    clock.play()
    expect(seen).toEqual(['reveal']) // offset 0 immediate
    vi.advanceTimersByTime(100)
    expect(seen).toEqual(['reveal', 'flag'])
    clock.pause()
    vi.advanceTimersByTime(1000)
    expect(seen).toEqual(['reveal', 'flag']) // paused ⇒ frozen
    clock.play()
    vi.advanceTimersByTime(250)
    expect(seen).toEqual(['reveal', 'flag', 'chord'])
  })
})

describe('PlaybackClock — progress reducer (adapter seam)', () => {
  /**
   * A dummy adapter defined HERE, in the test — the engine interprets nothing.
   * @typedef {{ type: string }} DummyEvent
   * @type {import('@cozy-games/replay').ProgressReducer}
   */
  const byCount = events => (events.length / 3) * 100 // 3 = total in envelope()

  it('runs against a dummy adapter: progress reflects the delivered slice', () => {
    const clock = new PlaybackClock(envelope(), fakeScheduler(), { progress: byCount })
    expect(clock.progress()).toBe(0) // nothing delivered yet

    clock.seek(0) // offset-0 event delivered ⇒ 1/3
    expect(clock.progress()).toBeCloseTo(33.333, 2)

    clock.seek(100) // 2/3
    expect(clock.progress()).toBeCloseTo(66.667, 2)

    clock.seek(400) // all 3 ⇒ 100
    expect(clock.progress()).toBe(100)

    clock.seek(50) // rewind ⇒ back to 1/3
    expect(clock.progress()).toBeCloseTo(33.333, 2)
  })

  it('advances as playback advances', () => {
    const s = fakeScheduler()
    const clock = new PlaybackClock(envelope(), s, { progress: byCount })
    clock.play()
    expect(clock.progress()).toBeCloseTo(33.333, 2) // offset-0 fired on play
    s.advance(100)
    expect(clock.progress()).toBeCloseTo(66.667, 2)
    s.advance(250)
    expect(clock.progress()).toBe(100)
  })

  it('returns null when no adapter (or no progress reducer) is supplied', () => {
    expect(new PlaybackClock(envelope(), fakeScheduler()).progress()).toBe(null)
    expect(new PlaybackClock(envelope(), fakeScheduler(), {}).progress()).toBe(null)
  })

  it('clamps the reducer output into [0, 100]', () => {
    const over = new PlaybackClock(envelope(), fakeScheduler(), { progress: () => 999 })
    const under = new PlaybackClock(envelope(), fakeScheduler(), { progress: () => -50 })
    expect(over.progress()).toBe(100)
    expect(under.progress()).toBe(0)
  })

  it('throws if the reducer returns a non-number', () => {
    const clock = new PlaybackClock(envelope(), fakeScheduler(), { progress: () => /** @type {any} */ ('nope') })
    expect(() => clock.progress()).toThrow(TypeError)
  })

  it('rejects a non-function progress at construction', () => {
    expect(() => new PlaybackClock(envelope(), fakeScheduler(), { progress: /** @type {any} */ (42) })).toThrow(TypeError)
  })
})

describe('game-agnosticism guard (envelope only, no game imports)', () => {
  const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..')
  const GAME_REFERENCES = /mnswpr|minesweeper/i

  it('engine never interprets a move payload (no `.payload` access in engine source)', () => {
    const offenders = []
    walk(pkgDir, file => {
      if (!file.endsWith('.js') || file.includes('/test/')) return
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      if (/\.payload\b/.test(code)) offenders.push(file)
    })
    expect(offenders).toEqual([]) // engine references only envelope metadata (seq/clientTs) + opaque records
  })

  it('manifest depends only on the envelope, never a game package', () => {
    const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }
    expect(Object.keys(deps).filter(name => GAME_REFERENCES.test(name))).toEqual([])
  })

  it('no source file imports or references a game package', () => {
    const offenders = []
    walk(pkgDir, file => {
      if (!file.endsWith('.js') || file.includes('/test/')) return
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      if (GAME_REFERENCES.test(code)) offenders.push(file)
    })
    expect(offenders).toEqual([])
  })
})

function walk(dir, fn) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, fn)
    else fn(p)
  }
}
