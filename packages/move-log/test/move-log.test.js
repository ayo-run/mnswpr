// @ts-check
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Imported via the PACKAGE NAME (not a relative path) to prove the new workspace
// module resolves and is importable by other packages.
import { createMoveLog, isMoveLog, SCHEMA_VERSION } from '@cozy-games/move-log'

/**
 * A dummy event vocabulary defined HERE, in the test — deliberately NOT mnswpr's.
 * The move log must type-check and work against any `T` the consumer supplies.
 * @typedef {{ kind: 'tick' } | { kind: 'boom', power: number }} DummyEvent
 */

describe('@cozy-games/move-log', () => {
  /** @type {import('@cozy-games/move-log').MoveEvent<DummyEvent>[]} */
  const events = [
    { t: 0, event: { kind: 'tick' } },
    { t: 50, event: { kind: 'boom', power: 3 } },
    { t: 120, event: { kind: 'tick' } }
  ]

  it('exposes schema_version typed as 1', () => {
    expect(SCHEMA_VERSION).toBe(1)
  })

  it('wraps an ordered, timestamped event stream for a dummy vocabulary', () => {
    /** @type {import('@cozy-games/move-log').MoveLog<DummyEvent>} */
    const log = createMoveLog(events)

    expect(log.schema_version).toBe(1)
    expect(log.events).toHaveLength(3)
    // order preserved, per-event timestamps present
    expect(log.events.map(e => e.t)).toEqual([0, 50, 120])
    expect(log.events[1]).toEqual({ t: 50, event: { kind: 'boom', power: 3 } })
  })

  it('defaults to an empty run and copies entries (no aliasing of the input)', () => {
    expect(createMoveLog()).toEqual({ schema_version: 1, events: [] })
    const input = [{ t: 1, event: { kind: 'tick' } }]
    const log = createMoveLog(input)
    input[0].t = 999
    expect(log.events[0].t).toBe(1) // log kept its own copy
  })

  it('is JSON-safe: stringify → parse round-trips without loss', () => {
    const log = createMoveLog(events)
    expect(JSON.parse(JSON.stringify(log))).toEqual(log)
  })

  it('rejects malformed input with a clear error', () => {
    // @ts-expect-error — not an array
    expect(() => createMoveLog('nope')).toThrow(TypeError)
    expect(() => createMoveLog([{ event: { kind: 'tick' } }])).toThrow(TypeError) // missing t
    expect(() => createMoveLog([{ t: 5 }])).toThrow(TypeError) // missing event
    expect(() => createMoveLog([{ t: 'soon', event: {} }])).toThrow(TypeError) // t not a number
  })

  it('isMoveLog recognizes well-formed logs and rejects others', () => {
    expect(isMoveLog(createMoveLog(events))).toBe(true)
    expect(isMoveLog(null)).toBe(false)
    expect(isMoveLog({ schema_version: 2, events: [] })).toBe(false) // wrong version
    expect(isMoveLog({ schema_version: 1, events: 'nope' })).toBe(false)
    expect(isMoveLog({ schema_version: 1, events: [{ event: {} }] })).toBe(false) // no timestamp
  })
})

describe('game-blindness guard (zero game-specific imports)', () => {
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
      if (file.includes('/test/')) return // the guard itself names games on purpose
      // Strip comments so prose that *names* a game isn't a false positive.
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
