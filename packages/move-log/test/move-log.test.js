// @ts-check
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Imported via the PACKAGE NAME (not a relative path) to prove the workspace
// module resolves and is importable by other packages.
import {
  createMoveLog, withReceivedTs,
  serializeMoveLog, deserializeMoveLog, isMoveLog, assertMoveLog
} from '@cozy-games/move-log'

// A REAL mnswpr session/event stream — imported by the TEST, never the module.
// Relative path (not the package name) so no game dependency enters the manifest.
import { GameSession, MinesweeperRules } from '../../mnswpr/core/index.js'

// A dummy vocabulary version string, defined HERE, in the test — deliberately not
// tied to the module. The move log carries whatever version string the consumer
// supplies, verbatim, and validates only its own envelope invariants.
const VERSION = 'dummy-game/1'

describe('@cozy-games/move-log', () => {
  /** @type {import('@cozy-games/move-log').MoveEvent[]} */
  const events = [
    { seq: 1, clientTs: 0, type: 'tick', payload: {} },
    { seq: 2, clientTs: 50, type: 'boom', payload: { power: 3 } },
    { seq: 5, clientTs: 120, type: 'tick', payload: {} } // gaps allowed; strictly increasing
  ]

  it('carries the caller-supplied schema_version string verbatim', () => {
    const log = createMoveLog('mnswpr-moves/1', [])
    expect(log.schema_version).toBe('mnswpr-moves/1')
    // survives create → serialize → deserialize unchanged
    const restored = deserializeMoveLog(serializeMoveLog(createMoveLog('mnswpr-moves/1', events)))
    expect(restored.schema_version).toBe('mnswpr-moves/1')
  })

  it('wraps an ordered, timestamped, sequenced stream for a dummy vocabulary', () => {
    /** @type {import('@cozy-games/move-log').MoveLog} */
    const log = createMoveLog(VERSION, events)

    expect(log.schema_version).toBe(VERSION)
    expect(log.events).toHaveLength(3)
    expect(log.events.map(e => e.seq)).toEqual([1, 2, 5])
    expect(log.events.map(e => e.clientTs)).toEqual([0, 50, 120])
    expect(log.events[1]).toEqual({ seq: 2, clientTs: 50, type: 'boom', payload: { power: 3 } })
  })

  it('defaults to an empty run and copies entries (no aliasing of the input)', () => {
    expect(createMoveLog(VERSION)).toEqual({ schema_version: VERSION, events: [] })
    const input = [{ seq: 1, clientTs: 1, type: 'tick', payload: {} }]
    const log = createMoveLog(VERSION, input)
    input[0].clientTs = 999
    expect(log.events[0].clientTs).toBe(1) // log kept its own copy
  })

  it('rejects a non-string / empty schema_version', () => {
    // @ts-expect-error — deliberately wrong type
    expect(() => createMoveLog(1, [])).toThrow(TypeError)
    expect(() => createMoveLog('', [])).toThrow(TypeError)
    // @ts-expect-error — deliberately missing
    expect(() => createMoveLog(undefined, [])).toThrow(TypeError)
  })

  it('rejects a non-monotonic seq at construction', () => {
    expect(() => createMoveLog(VERSION, [
      { seq: 2, clientTs: 0, type: 'a', payload: {} },
      { seq: 1, clientTs: 1, type: 'b', payload: {} }
    ])).toThrow(RangeError)
  })
})

describe('generic over the game — a second, made-up vocabulary needs zero package changes', () => {
  // A non-Minesweeper vocabulary defined ENTIRELY here: `TType = 'a' | 'b'`, a
  // payload shape of `{ x: number }`. The package type-checks and validates it with
  // no change — mirror of the consumer's "adding a game_type needs no generic change".
  it('builds and validates MoveLog<"a" | "b", { x: number }>', () => {
    /** @type {import('@cozy-games/move-log').MoveLog<'a' | 'b', { x: number }>} */
    const log = createMoveLog('made-up-game/1', [
      { seq: 1, clientTs: 0, type: 'a', payload: { x: 1 } },
      { seq: 2, clientTs: 10, type: 'b', payload: { x: 2 } }
    ])
    expect(isMoveLog(log)).toBe(true)
    expect(log.schema_version).toBe('made-up-game/1')
    expect(log.events.map(e => e.type)).toEqual(['a', 'b'])
    expect(log.events.map(e => e.payload.x)).toEqual([1, 2])
    // round-trips losslessly like any other log
    expect(deserializeMoveLog(serializeMoveLog(log))).toEqual(log)
  })

  it('Minesweeper instantiates its own discriminator + payload with the same package', () => {
    /** @typedef {'reveal' | 'flag' | 'unflag' | 'chord'} MnswprType */
    /** @type {import('@cozy-games/move-log').MoveLog<MnswprType, { r: number, c: number }>} */
    const log = createMoveLog('mnswpr-moves/1', [
      { seq: 1, clientTs: 0, type: 'reveal', payload: { r: 0, c: 0 } },
      { seq: 2, clientTs: 5, type: 'flag', payload: { r: 1, c: 2 } }
    ])
    expect(log.events.map(e => e.type)).toEqual(['reveal', 'flag'])
    expect(log.events[0].payload).toEqual({ r: 0, c: 0 })
  })
})

describe('payload is opaque — any present value is accepted, never inspected', () => {
  it('accepts object, array, primitive, and null payloads', () => {
    const log = createMoveLog(VERSION, [
      { seq: 1, clientTs: 0, type: 'obj', payload: { a: 1 } },
      { seq: 2, clientTs: 1, type: 'arr', payload: [1, 2, 3] },
      { seq: 3, clientTs: 2, type: 'str', payload: 'hello' },
      { seq: 4, clientTs: 3, type: 'num', payload: 42 },
      { seq: 5, clientTs: 4, type: 'nul', payload: null }
    ])
    expect(isMoveLog(log)).toBe(true)
    expect(deserializeMoveLog(serializeMoveLog(log))).toEqual(log)
  })

  it('rejects a MISSING payload (the only payload invariant)', () => {
    expect(() => createMoveLog(VERSION, [
      // @ts-expect-error — deliberately missing payload
      { seq: 1, clientTs: 0, type: 'x' }
    ])).toThrow(TypeError)
    expect(() => deserializeMoveLog(JSON.stringify({
      schema_version: VERSION, events: [{ seq: 1, clientTs: 0, type: 'x' }]
    }))).toThrow(TypeError)
  })
})

describe('serialization round-trip', () => {
  const events = [
    { seq: 1, clientTs: 0, type: 'reveal', payload: { r: 0, c: 0 } },
    { seq: 2, clientTs: 50, type: 'flag', payload: { r: 1, c: 2 } },
    { seq: 3, clientTs: 90, type: 'chord', payload: { r: 4, c: 4 } }
  ]

  it('preserves order, timestamps, types, payloads, and sequence numbers exactly', () => {
    const log = createMoveLog(VERSION, events)
    const restored = deserializeMoveLog(serializeMoveLog(log))

    expect(restored).toEqual(log) // full structural fidelity
    expect(restored.schema_version).toBe(VERSION)
    expect(restored.events.map(e => e.seq)).toEqual([1, 2, 3])
    expect(restored.events.map(e => e.clientTs)).toEqual([0, 50, 90])
    expect(restored.events.map(e => e.type)).toEqual(['reveal', 'flag', 'chord'])
    expect(restored.events.map(e => e.payload)).toEqual([{ r: 0, c: 0 }, { r: 1, c: 2 }, { r: 4, c: 4 }])
  })

  it('serializeMoveLog produces a JSON string parseable back to the same object', () => {
    const log = createMoveLog(VERSION, events)
    const json = serializeMoveLog(log)
    expect(typeof json).toBe('string')
    expect(JSON.parse(json)).toEqual(log)
  })

  it('rejects each malformed fixture with a distinct, clear error', () => {
    const valid = serializeMoveLog(createMoveLog(VERSION, events))
    const entry = { seq: 1, clientTs: 0, type: 'reveal', payload: {} }

    // not a string
    // @ts-expect-error — deliberately wrong type
    expect(() => deserializeMoveLog({})).toThrow(TypeError)
    // invalid JSON syntax
    expect(() => deserializeMoveLog('{not json')).toThrow(SyntaxError)
    // missing schema_version
    expect(() => deserializeMoveLog(JSON.stringify({ events: [] }))).toThrow(TypeError)
    // non-string schema_version
    expect(() => deserializeMoveLog(JSON.stringify({ schema_version: 1, events: [] }))).toThrow(TypeError)
    // empty-string schema_version
    expect(() => deserializeMoveLog(JSON.stringify({ schema_version: '', events: [] }))).toThrow(TypeError)
    // events not an array
    expect(() => deserializeMoveLog(JSON.stringify({ schema_version: VERSION, events: 'nope' }))).toThrow(TypeError)
    // non-integer seq
    expect(() => deserializeMoveLog(JSON.stringify({ schema_version: VERSION, events: [{ ...entry, seq: 1.5 }] }))).toThrow(TypeError)
    // non-finite clientTs
    expect(() => deserializeMoveLog(JSON.stringify({ schema_version: VERSION, events: [{ ...entry, clientTs: 'soon' }] }))).toThrow(TypeError)
    // empty / non-string type
    expect(() => deserializeMoveLog(JSON.stringify({ schema_version: VERSION, events: [{ ...entry, type: '' }] }))).toThrow(TypeError)
    expect(() => deserializeMoveLog(JSON.stringify({ schema_version: VERSION, events: [{ ...entry, type: 7 }] }))).toThrow(TypeError)
    // missing payload
    expect(() => deserializeMoveLog(JSON.stringify({ schema_version: VERSION, events: [{ seq: 1, clientTs: 0, type: 'reveal' }] }))).toThrow(TypeError)
    // shuffled / non-monotonic seq
    const shuffled = JSON.stringify({
      schema_version: VERSION,
      events: [{ seq: 3, clientTs: 0, type: 'a', payload: {} }, { seq: 1, clientTs: 1, type: 'b', payload: {} }]
    })
    expect(() => deserializeMoveLog(shuffled)).toThrow(RangeError)

    // distinct messages, not one generic error
    const messages = [
      captureMessage(() => deserializeMoveLog('{not json')),
      captureMessage(() => deserializeMoveLog(JSON.stringify({ events: [] }))),
      captureMessage(() => deserializeMoveLog(JSON.stringify({ schema_version: VERSION, events: [{ ...entry, type: '' }] }))),
      captureMessage(() => deserializeMoveLog(JSON.stringify({ schema_version: VERSION, events: [{ seq: 1, clientTs: 0, type: 'reveal' }] }))),
      captureMessage(() => deserializeMoveLog(shuffled))
    ]
    expect(new Set(messages).size).toBe(messages.length)

    // sanity: the valid fixture still deserializes
    expect(isMoveLog(deserializeMoveLog(valid))).toBe(true)
  })

  it('never returns a partially-parsed log (throws before returning)', () => {
    const partlyBad = JSON.stringify({
      schema_version: VERSION,
      events: [{ seq: 1, clientTs: 0, type: 'ok', payload: { ok: true } }, { seq: 2, clientTs: 'bad', type: 'x', payload: {} }]
    })
    let result = 'sentinel'
    expect(() => { result = deserializeMoveLog(partlyBad) }).toThrow(TypeError)
    expect(result).toBe('sentinel') // assignment never happened
  })

  it('isMoveLog / assertMoveLog agree on validity', () => {
    const log = createMoveLog(VERSION, events)
    expect(isMoveLog(log)).toBe(true)
    expect(assertMoveLog(log)).toBe(log)
    expect(isMoveLog(null)).toBe(false)
    expect(isMoveLog({ schema_version: VERSION, events: [{ seq: 1, clientTs: 0, type: 'x' }] })).toBe(false)
  })
})

describe('received timestamps (additive receivedTs)', () => {
  const base = [
    { seq: 1, clientTs: 0, type: 'reveal', payload: { r: 0, c: 0 } },
    { seq: 2, clientTs: 50, type: 'flag', payload: { r: 1, c: 2 } }
  ]

  it('accepts an optional receivedTs per event and round-trips it', () => {
    const log = createMoveLog(VERSION, [
      { seq: 1, clientTs: 0, type: 'a', payload: {}, receivedTs: 1000 },
      { seq: 2, clientTs: 50, type: 'b', payload: {}, receivedTs: 1060 }
    ])
    expect(log.events[0].receivedTs).toBe(1000)
    const restored = deserializeMoveLog(serializeMoveLog(log))
    expect(restored).toEqual(log)
    expect(restored.events.map(e => e.receivedTs)).toEqual([1000, 1060])
  })

  it('is valid with receivedTs on only some events', () => {
    const log = createMoveLog(VERSION, [
      { seq: 1, clientTs: 0, type: 'a', payload: {}, receivedTs: 1000 },
      { seq: 2, clientTs: 50, type: 'b', payload: {} } // no receivedTs
    ])
    expect(isMoveLog(log)).toBe(true)
    expect('receivedTs' in log.events[1]).toBe(false)
    expect(deserializeMoveLog(serializeMoveLog(log))).toEqual(log)
  })

  it('REGRESSION: a log with no receivedTs anywhere stays fully valid and leaks no key', () => {
    const log = createMoveLog(VERSION, base)
    expect(isMoveLog(log)).toBe(true)
    expect(log.events.every(e => !('receivedTs' in e))).toBe(true)
    const restored = deserializeMoveLog(serializeMoveLog(log))
    expect(restored).toEqual(log)
    expect(restored.events.every(e => !('receivedTs' in e))).toBe(true)
  })

  it('rejects a non-finite / non-numeric receivedTs', () => {
    expect(() => createMoveLog(VERSION, [{ seq: 1, clientTs: 0, type: 'x', payload: {}, receivedTs: 'soon' }])).toThrow(TypeError)
    expect(() => createMoveLog(VERSION, [{ seq: 1, clientTs: 0, type: 'x', payload: {}, receivedTs: Infinity }])).toThrow(TypeError)
    expect(() => deserializeMoveLog(JSON.stringify({
      schema_version: VERSION,
      events: [{ seq: 1, clientTs: 0, type: 'x', payload: {}, receivedTs: 'later' }]
    }))).toThrow(TypeError)
  })

  it('withReceivedTs attaches host-received times additively without mutating the input', () => {
    const log = createMoveLog(VERSION, base)
    let clock = 900
    const stamped = withReceivedTs(log, () => (clock += 10))

    // input untouched
    expect(log.events.every(e => !('receivedTs' in e))).toBe(true)
    // output stamped, still a valid log, round-trips
    expect(stamped.events.map(e => e.receivedTs)).toEqual([910, 920])
    expect(stamped.schema_version).toBe(VERSION)
    expect(deserializeMoveLog(serializeMoveLog(stamped))).toEqual(stamped)
  })

  it('withReceivedTs leaves events unstamped when the stamp returns undefined', () => {
    const log = createMoveLog(VERSION, base)
    const stamped = withReceivedTs(log, (e) => (e.seq === 1 ? 1234 : undefined))
    expect(stamped.events[0].receivedTs).toBe(1234)
    expect('receivedTs' in stamped.events[1]).toBe(false)
    expect(isMoveLog(stamped)).toBe(true)
  })

  it('withReceivedTs rejects a stamp that returns a non-finite number', () => {
    const log = createMoveLog(VERSION, base)
    expect(() => withReceivedTs(log, () => NaN)).toThrow(TypeError)
  })
})

describe('integration: wraps a real mnswpr event stream (core-06)', () => {
  // 3x3, single mine at (0,0); adjacency computed. Lets us script exact moves.
  const layout = {
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

  it('records an mnswpr session end-to-end and round-trips it losslessly', () => {
    let now = 1000
    const clock = () => now
    const session = new GameSession(MinesweeperRules, { state: MinesweeperRules.fromLayout(layout), clock })

    // Capture the real core-06 move-events ({ type, r, c, t, seq }).
    /** @type {any[]} */
    const emitted = []
    session.onMove(e => emitted.push(e))

    now = 1050; session.applyMove({ type: 'reveal', r: 0, c: 1 })
    now = 1100; session.applyMove({ type: 'flag', r: 0, c: 0 })
    now = 1150; session.applyMove({ type: 'flag', r: 0, c: 0 }) // unflag
    now = 1200; session.applyMove({ type: 'flag', r: 0, c: 0 }) // re-flag the mine
    now = 1250; session.applyMove({ type: 'chord', r: 0, c: 1 }) // 1 flag == value → chord

    expect(emitted.map(e => e.type)).toEqual(['reveal', 'flag', 'unflag', 'flag', 'chord'])

    // Wrap the stream: the log-owned metadata (seq, clientTs) is lifted to the log
    // level; the surfaced `type` discriminator + opaque game `payload` (the move
    // coords) stay put — exactly the ADR §1 split.
    const log = createMoveLog('mnswpr-moves/1', emitted.map(e => ({
      seq: e.seq, clientTs: e.t, type: e.type, payload: { r: e.r, c: e.c }
    })))
    const restored = deserializeMoveLog(serializeMoveLog(log))

    expect(restored).toEqual(log)
    expect(restored.schema_version).toBe('mnswpr-moves/1')
    expect(restored.events.map(e => e.seq)).toEqual([1, 2, 3, 4, 5])
    expect(restored.events.map(e => e.clientTs)).toEqual([1050, 1100, 1150, 1200, 1250])
    expect(restored.events.map(e => e.type)).toEqual(['reveal', 'flag', 'unflag', 'flag', 'chord'])
    // sequence is strictly increasing — the log's own invariant, verified on real data
    const seqs = restored.events.map(e => e.seq)
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b))
  })
})

describe('game-agnosticism guard (zero game-specific imports)', () => {
  const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..')

  // The set of game packages the move log must never depend on or import.
  const GAME_REFERENCES = /mnswpr|minesweeper/i

  it('manifest declares no dependency on a game package', () => {
    const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
    const deps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies
    }
    const offenders = Object.keys(deps).filter(name => GAME_REFERENCES.test(name))
    expect(offenders).toEqual([])
  })

  it('no source file imports or references a game package', () => {
    const offenders = []
    walk(pkgDir, file => {
      if (!file.endsWith('.js')) return
      if (file.includes('/test/')) return // the test may name/import games on purpose
      // Strip comments so prose that *names* a game isn't a false positive.
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      if (GAME_REFERENCES.test(code)) offenders.push(file)
    })
    expect(offenders).toEqual([])
  })
})

function captureMessage(fn) {
  try {
    fn()
    return null
  } catch (err) {
    return err.message
  }
}

function walk(dir, fn) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, fn)
    else fn(p)
  }
}
