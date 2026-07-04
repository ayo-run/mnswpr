// @ts-check
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Imported via the PACKAGE NAME (not a relative path) to prove the workspace
// module resolves and is importable by other packages.
import {
  createMoveLog, serializeMoveLog, deserializeMoveLog, isMoveLog, assertMoveLog, SCHEMA_VERSION
} from '@cozy-games/move-log'

// A REAL mnswpr session/event stream — imported by the TEST, never the module.
// Relative path (not the package name) so no game dependency enters the manifest.
import { GameSession, MinesweeperRules } from '../../mnswpr/core/index.js'

/**
 * A dummy event vocabulary defined HERE, in the test — deliberately NOT mnswpr's.
 * The move log must type-check and work against any `T` the consumer supplies.
 * @typedef {{ kind: 'tick' } | { kind: 'boom', power: number }} DummyEvent
 */

describe('@cozy-games/move-log', () => {
  /** @type {import('@cozy-games/move-log').MoveEvent<DummyEvent>[]} */
  const events = [
    { seq: 1, t: 0, event: { kind: 'tick' } },
    { seq: 2, t: 50, event: { kind: 'boom', power: 3 } },
    { seq: 5, t: 120, event: { kind: 'tick' } } // gaps allowed; strictly increasing
  ]

  it('exposes schema_version typed as 1', () => {
    expect(SCHEMA_VERSION).toBe(1)
  })

  it('wraps an ordered, timestamped, sequenced stream for a dummy vocabulary', () => {
    /** @type {import('@cozy-games/move-log').MoveLog<DummyEvent>} */
    const log = createMoveLog(events)

    expect(log.schema_version).toBe(1)
    expect(log.events).toHaveLength(3)
    expect(log.events.map(e => e.seq)).toEqual([1, 2, 5])
    expect(log.events.map(e => e.t)).toEqual([0, 50, 120])
    expect(log.events[1]).toEqual({ seq: 2, t: 50, event: { kind: 'boom', power: 3 } })
  })

  it('defaults to an empty run and copies entries (no aliasing of the input)', () => {
    expect(createMoveLog()).toEqual({ schema_version: 1, events: [] })
    const input = [{ seq: 1, t: 1, event: { kind: 'tick' } }]
    const log = createMoveLog(input)
    input[0].t = 999
    expect(log.events[0].t).toBe(1) // log kept its own copy
  })

  it('rejects a non-monotonic seq at construction', () => {
    expect(() => createMoveLog([
      { seq: 2, t: 0, event: {} },
      { seq: 1, t: 1, event: {} }
    ])).toThrow(RangeError)
  })
})

describe('serialization round-trip', () => {
  const events = [
    { seq: 1, t: 0, event: { type: 'reveal', r: 0, c: 0 } },
    { seq: 2, t: 50, event: { type: 'flag', r: 1, c: 2 } },
    { seq: 3, t: 90, event: { type: 'chord', r: 4, c: 4 } }
  ]

  it('preserves order, timestamps, and sequence numbers exactly', () => {
    const log = createMoveLog(events)
    const restored = deserializeMoveLog(serializeMoveLog(log))

    expect(restored).toEqual(log) // full structural fidelity
    expect(restored.events.map(e => e.seq)).toEqual([1, 2, 3])
    expect(restored.events.map(e => e.t)).toEqual([0, 50, 90])
    expect(restored.events.map(e => e.event.type)).toEqual(['reveal', 'flag', 'chord'])
  })

  it('serializeMoveLog produces a JSON string parseable back to the same object', () => {
    const log = createMoveLog(events)
    const json = serializeMoveLog(log)
    expect(typeof json).toBe('string')
    expect(JSON.parse(json)).toEqual(log)
  })

  it('rejects each malformed fixture with a distinct, clear error', () => {
    const valid = serializeMoveLog(createMoveLog(events))

    // not a string
    // @ts-expect-error — deliberately wrong type
    expect(() => deserializeMoveLog({})).toThrow(TypeError)
    // invalid JSON syntax
    expect(() => deserializeMoveLog('{not json')).toThrow(SyntaxError)
    // missing schema_version
    expect(() => deserializeMoveLog(JSON.stringify({ events: [] }))).toThrow(RangeError)
    // wrong schema_version
    expect(() => deserializeMoveLog(JSON.stringify({ schema_version: 2, events: [] }))).toThrow(RangeError)
    // events not an array
    expect(() => deserializeMoveLog(JSON.stringify({ schema_version: 1, events: 'nope' }))).toThrow(TypeError)
    // missing 'event' field
    expect(() => deserializeMoveLog(JSON.stringify({ schema_version: 1, events: [{ seq: 1, t: 0 }] }))).toThrow(TypeError)
    // bad timestamp type
    expect(() => deserializeMoveLog(JSON.stringify({ schema_version: 1, events: [{ seq: 1, t: 'soon', event: {} }] }))).toThrow(TypeError)
    // bad seq type
    expect(() => deserializeMoveLog(JSON.stringify({ schema_version: 1, events: [{ seq: 1.5, t: 0, event: {} }] }))).toThrow(TypeError)
    // shuffled / non-monotonic seq
    const shuffled = JSON.stringify({
      schema_version: 1,
      events: [{ seq: 3, t: 0, event: {} }, { seq: 1, t: 1, event: {} }]
    })
    expect(() => deserializeMoveLog(shuffled)).toThrow(RangeError)

    // distinct messages, not one generic error
    const messages = [
      captureMessage(() => deserializeMoveLog('{not json')),
      captureMessage(() => deserializeMoveLog(JSON.stringify({ events: [] }))),
      captureMessage(() => deserializeMoveLog(JSON.stringify({ schema_version: 1, events: [{ seq: 1, t: 0 }] }))),
      captureMessage(() => deserializeMoveLog(shuffled))
    ]
    expect(new Set(messages).size).toBe(messages.length)

    // sanity: the valid fixture still deserializes
    expect(isMoveLog(deserializeMoveLog(valid))).toBe(true)
  })

  it('never returns a partially-parsed log (throws before returning)', () => {
    const partlyBad = JSON.stringify({
      schema_version: 1,
      events: [{ seq: 1, t: 0, event: { ok: true } }, { seq: 2, t: 'bad', event: {} }]
    })
    let result = 'sentinel'
    expect(() => { result = deserializeMoveLog(partlyBad) }).toThrow(TypeError)
    expect(result).toBe('sentinel') // assignment never happened
  })

  it('isMoveLog / assertMoveLog agree on validity', () => {
    const log = createMoveLog(events)
    expect(isMoveLog(log)).toBe(true)
    expect(assertMoveLog(log)).toBe(log)
    expect(isMoveLog(null)).toBe(false)
    expect(isMoveLog({ schema_version: 1, events: [{ seq: 1, t: 0 }] })).toBe(false)
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

    // Wrap the stream: lift the recording metadata (seq, t) to the log level.
    const log = createMoveLog(emitted.map(e => ({ seq: e.seq, t: e.t, event: e })))
    const restored = deserializeMoveLog(serializeMoveLog(log))

    expect(restored).toEqual(log)
    expect(restored.events.map(e => e.seq)).toEqual([1, 2, 3, 4, 5])
    expect(restored.events.map(e => e.t)).toEqual([1050, 1100, 1150, 1200, 1250])
    expect(restored.events.map(e => e.event.type)).toEqual(['reveal', 'flag', 'unflag', 'flag', 'chord'])
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
