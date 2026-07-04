// @ts-check
import { describe, it, expect } from 'vitest'
import { PlaybackClock, readEnvelope } from '@cozy-games/replay'
import { createMoveLog } from '@cozy-games/move-log'

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

// A canonical v1 envelope.
const v1 = () => createMoveLog([
  { seq: 1, t: 0, event: { type: 'reveal', r: 0, c: 0 } },
  { seq: 2, t: 100, event: { type: 'flag', r: 1, c: 1 } },
  { seq: 3, t: 250, event: { type: 'chord', r: 2, c: 2 } }
])

describe('schema_version dispatch — v1 (built-in)', () => {
  it('replays a v1 envelope through the dispatch path (not a bypass)', () => {
    const s = fakeScheduler()
    const clock = new PlaybackClock(v1(), s)
    const seen = []
    clock.on(r => seen.push(r.event.type))
    clock.play()
    s.advance(250)
    expect(seen).toEqual(['reveal', 'flag', 'chord'])
  })

  it('readEnvelope returns the canonical records for v1', () => {
    const records = readEnvelope(v1())
    expect(records.map(r => r.seq)).toEqual([1, 2, 3])
    expect(records[0].event.type).toBe('reveal')
  })
})

describe('schema_version dispatch — unknown versions fail loudly', () => {
  it('throws a specific error for a synthetic future version (99)', () => {
    const future = { schema_version: 99, events: [{ seq: 1, t: 0, event: {} }] }
    expect(() => new PlaybackClock(future, fakeScheduler())).toThrow(/unsupported envelope schema_version 99 \(supported: 1\)/)
    expect(() => readEnvelope(future)).toThrow(RangeError)
  })

  it('throws for a missing schema_version', () => {
    expect(() => readEnvelope({ events: [] })).toThrow(/unsupported envelope schema_version undefined/)
  })

  it('rejects a non-object envelope', () => {
    // @ts-expect-error — deliberately wrong type
    expect(() => readEnvelope(null)).toThrow(TypeError)
  })
})

describe('schema_version dispatch — adding a version', () => {
  // A toy v2 format defined ENTIRELY in the test: a different field layout that a
  // normalizer maps back to canonical { seq, t, event }. Adding it is one entry.
  const v2Envelope = {
    schema_version: 2,
    log: [
      { n: 1, ts: 0, payload: { type: 'reveal', r: 0, c: 0 } },
      { n: 2, ts: 120, payload: { type: 'flag', r: 1, c: 1 } }
    ]
  }
  const readV2 = env => env.log.map(e => ({ seq: e.n, t: e.ts, event: e.payload }))

  it('replays a v2 fixture via a supplied reader (same code path)', () => {
    const s = fakeScheduler()
    const clock = new PlaybackClock(v2Envelope, s, {}, { readers: { 2: readV2 } })
    const seen = []
    clock.on(r => seen.push(r.event.type))
    clock.play()
    s.advance(120)
    expect(seen).toEqual(['reveal', 'flag'])
  })

  it('readEnvelope normalizes v2 to canonical records with an extra reader', () => {
    const records = readEnvelope(v2Envelope, { 2: readV2 })
    expect(records).toEqual([
      { seq: 1, t: 0, event: { type: 'reveal', r: 0, c: 0 } },
      { seq: 2, t: 120, event: { type: 'flag', r: 1, c: 1 } }
    ])
  })

  it('still rejects v2 when no reader is registered', () => {
    expect(() => readEnvelope(v2Envelope)).toThrow(/unsupported envelope schema_version 2 \(supported: 1\)/)
  })

  it('validates a reader that returns a malformed (non-canonical) log', () => {
    // A buggy reader whose output breaks the monotonic-seq invariant is caught.
    const badReader = () => [{ seq: 2, t: 0, event: {} }, { seq: 1, t: 1, event: {} }]
    expect(() => readEnvelope({ schema_version: 3 }, { 3: badReader })).toThrow(RangeError)
  })
})
