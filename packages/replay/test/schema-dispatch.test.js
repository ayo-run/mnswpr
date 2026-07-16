// @ts-check
import { describe, it, expect } from 'vitest'
import { PlaybackClock, readEnvelope } from '@cozy-games/replay'
import { createMoveLog } from '@cozy-games/move-log'

const VERSION = 'mnswpr-moves/1'

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

// A canonical `@cozy-games/move-log` envelope.
const canonical = () => createMoveLog(VERSION, [
  { seq: 1, clientTs: 0, type: 'reveal', payload: { r: 0, c: 0 } },
  { seq: 2, clientTs: 100, type: 'flag', payload: { r: 1, c: 1 } },
  { seq: 3, clientTs: 250, type: 'chord', payload: { r: 2, c: 2 } }
])

describe('canonical move-log envelopes play directly', () => {
  it('replays a canonical envelope through readEnvelope (not a bypass)', () => {
    const s = fakeScheduler()
    const clock = new PlaybackClock(canonical(), s)
    const seen = []
    clock.on(r => seen.push(r.type))
    clock.play()
    s.advance(250)
    expect(seen).toEqual(['reveal', 'flag', 'chord'])
  })

  it('readEnvelope returns the canonical records', () => {
    const records = readEnvelope(canonical())
    expect(records.map(r => r.seq)).toEqual([1, 2, 3])
    expect(records[0].type).toBe('reveal')
    expect(records[0].payload).toEqual({ r: 0, c: 0 })
  })

  it('is game-agnostic: any valid string schema_version plays (no allow-list)', () => {
    // A different game's vocabulary version — the engine plays it without any
    // per-game registration; genericness, not gatekeeping.
    const otherGame = createMoveLog('some-other-game/3', [
      { seq: 1, clientTs: 0, type: 'jump', payload: { x: 1 } }
    ])
    const records = readEnvelope(otherGame)
    expect(records.map(r => r.type)).toEqual(['jump'])
  })
})

describe('malformed envelopes fail loudly', () => {
  it('throws for a non-string schema_version', () => {
    const bad = { schema_version: 99, events: [{ seq: 1, clientTs: 0, type: 'x', payload: {} }] }
    expect(() => new PlaybackClock(/** @type {any} */ (bad), fakeScheduler())).toThrow(TypeError)
    expect(() => readEnvelope(bad)).toThrow(/schema_version must be a non-empty string/)
  })

  it('throws for a missing schema_version', () => {
    expect(() => readEnvelope({ events: [] })).toThrow(/schema_version must be a non-empty string/)
  })

  it('throws for a valid version but malformed events (not a canonical log)', () => {
    expect(() => readEnvelope({ schema_version: VERSION })).toThrow(/events must be an array/)
  })

  it('rejects a non-object envelope', () => {
    // @ts-expect-error — deliberately wrong type
    expect(() => readEnvelope(null)).toThrow(TypeError)
  })
})

describe('foreign generations normalize via a supplied reader (keyed by version string)', () => {
  // A toy FOREIGN format defined ENTIRELY in the test: a different field layout
  // that a normalizer maps back to canonical { seq, clientTs, type, payload }.
  // Adding support is one reader entry, keyed by its schema_version string.
  const v2Envelope = {
    schema_version: 'toy-v2/1',
    log: [
      { n: 1, ts: 0, kind: 'reveal', data: { r: 0, c: 0 } },
      { n: 2, ts: 120, kind: 'flag', data: { r: 1, c: 1 } }
    ]
  }
  const readV2 = env => env.log.map(e => ({ seq: e.n, clientTs: e.ts, type: e.kind, payload: e.data }))

  it('replays a foreign fixture via a supplied reader (same code path)', () => {
    const s = fakeScheduler()
    const clock = new PlaybackClock(v2Envelope, s, {}, { readers: { 'toy-v2/1': readV2 } })
    const seen = []
    clock.on(r => seen.push(r.type))
    clock.play()
    s.advance(120)
    expect(seen).toEqual(['reveal', 'flag'])
  })

  it('readEnvelope normalizes the foreign format to canonical records', () => {
    const records = readEnvelope(v2Envelope, { 'toy-v2/1': readV2 })
    expect(records).toEqual([
      { seq: 1, clientTs: 0, type: 'reveal', payload: { r: 0, c: 0 } },
      { seq: 2, clientTs: 120, type: 'flag', payload: { r: 1, c: 1 } }
    ])
  })

  it('fails loudly for the foreign format when no reader is registered', () => {
    // Default path validates it AS a canonical log — it has no `events`, so it
    // fails with the field-specific error, not a silent parse.
    expect(() => readEnvelope(v2Envelope)).toThrow(/events must be an array/)
  })

  it('validates a reader that returns a malformed (non-canonical) log', () => {
    // A buggy reader whose output breaks the monotonic-seq invariant is caught.
    const badReader = () => [
      { seq: 2, clientTs: 0, type: 'a', payload: {} },
      { seq: 1, clientTs: 1, type: 'b', payload: {} }
    ]
    expect(() => readEnvelope({ schema_version: 'toy-bad/1' }, { 'toy-bad/1': badReader })).toThrow(RangeError)
  })
})
