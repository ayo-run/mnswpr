import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  Grid, eightWay, orthogonal,
  GameSession, replay, mulberry32,
  MinesweeperRules, generateBoard, validateLayout, levels
} from '../core/index.js'
import { placeMines, excludeAround } from '../core/minesweeper/board.js'

const beginner = levels.beginner

// Reveal every non-mine cell of a session's board, reading the (already-placed)
// state — a deterministic way to drive a game to a win without hardcoding the
// layout. Returns the events for assertions.
function playToWin(session, clock) {
  // First reveal seeds the board (first-click safe); pick a corner.
  session.applyMove({ type: 'reveal', r: 0, c: 0 })
  const { grid, config } = session.state
  for (let r = 0; r < config.rows; r++) {
    for (let c = 0; c < config.cols; c++) {
      if (!grid.at(r, c).mine && grid.at(r, c).status !== 'revealed') {
        if (clock) clock.tick()
        session.applyMove({ type: 'reveal', r, c })
      }
    }
  }
}

describe('grid + neighbors (Layer 0)', () => {
  it('addresses cells and reports bounds', () => {
    const g = new Grid(3, 4, (r, c) => `${r},${c}`)
    expect(g.rows).toBe(3)
    expect(g.cols).toBe(4)
    expect(g.at(2, 3)).toBe('2,3')
    expect(g.inBounds(2, 3)).toBe(true)
    expect(g.inBounds(3, 0)).toBe(false)
    expect(g.inBounds(-1, 0)).toBe(false)
  })

  it('eightWay yields 8 neighbors interior, 3 in a corner', () => {
    const g = new Grid(5, 5)
    expect(eightWay(g, 2, 2)).toHaveLength(8)
    expect(eightWay(g, 0, 0)).toHaveLength(3)
    expect(orthogonal(g, 2, 2)).toHaveLength(4)
    expect(orthogonal(g, 0, 0)).toHaveLength(2)
  })
})

describe('rng (Layer 1)', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(12345)
    const b = mulberry32(12345)
    const seqA = [a(), a(), a()]
    const seqB = [b(), b(), b()]
    expect(seqA).toEqual(seqB)
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })
})

describe('board generation (Layer 2)', () => {
  it('places exactly `mines` mines, deterministically from the seed', () => {
    const mk = () => {
      const g = new Grid(beginner.rows, beginner.cols, () => ({ mine: false, adjacent: 0, status: 'hidden' }))
      const placed = placeMines(42, beginner, excludeAround(beginner, 0, 0), g)
      return { g, placed }
    }
    const one = mk()
    const two = mk()
    expect(one.placed.size).toBe(beginner.mines)
    expect([...one.placed].sort()).toEqual([...two.placed].sort())
  })

  it('keeps the first-click 3x3 neighborhood mine-free', () => {
    const g = new Grid(beginner.rows, beginner.cols, () => ({ mine: false, adjacent: 0, status: 'hidden' }))
    placeMines(7, beginner, excludeAround(beginner, 4, 4), g)
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        expect(g.at(4 + dr, 4 + dc).mine).toBe(false)
      }
    }
  })

  it('computes adjacency as the 8-way mine count', () => {
    const g = new Grid(beginner.rows, beginner.cols, () => ({ mine: false, adjacent: 0, status: 'hidden' }))
    placeMines(99, beginner, excludeAround(beginner, 0, 0), g)
    g.forEach((cell, r, c) => {
      if (cell.mine) return
      let n = 0
      for (const [nr, nc] of eightWay(g, r, c)) if (g.at(nr, nc).mine) n++
      expect(cell.adjacent).toBe(n)
    })
  })
})

describe('generateBoard (Layer 2, pure)', () => {
  it('is callable in plain Node and returns a plain layout object', () => {
    // Non-square (rows ≠ cols) pins the rows-first orientation.
    const layout = generateBoard(4, 7, 5, { seed: 42 })
    expect(layout.rows).toBe(4)
    expect(layout.cols).toBe(7)
    expect(layout.mines).toBe(5)
    expect(layout.cells).toHaveLength(4)
    expect(layout.cells.every(row => row.length === 7)).toBe(true)
    // plain data only — no Grid instance, no class methods leaking out
    expect(layout.cells[0][0]).toEqual({ mine: expect.any(Boolean), adjacent: expect.any(Number) })
    expect(layout).toEqual(JSON.parse(JSON.stringify(layout)))
    // places exactly `mines` mines
    expect(layout.mineLocations).toHaveLength(5)
    let mineCount = 0
    for (const row of layout.cells) for (const cell of row) if (cell.mine) mineCount++
    expect(mineCount).toBe(5)
  })

  it('same injected RNG (seed) → identical layout', () => {
    const a = generateBoard(16, 16, 40, { rng: mulberry32(123) })
    const b = generateBoard(16, 16, 40, { rng: mulberry32(123) })
    expect(a).toEqual(b)
    // and the seed convenience wrapper matches an explicitly injected mulberry32
    expect(generateBoard(16, 16, 40, { seed: 123 })).toEqual(a)
    // a different seed diverges
    expect(generateBoard(16, 16, 40, { seed: 124 })).not.toEqual(a)
  })

  it('computes adjacency as the 8-way mine count', () => {
    const layout = generateBoard(9, 9, 10, { seed: 99 })
    const g = new Grid(9, 9, (r, c) => layout.cells[r][c])
    layout.cells.forEach((row, r) => row.forEach((cell, c) => {
      if (cell.mine) return
      let n = 0
      for (const [nr, nc] of eightWay(g, r, c)) if (g.at(nr, nc).mine) n++
      expect(cell.adjacent).toBe(n)
    }))
  })

  it('honors an exclude set (e.g. first-click safety)', () => {
    const exclude = new Set([0]) // key 0 == cell (0,0)
    const layout = generateBoard(9, 9, 10, { seed: 7, exclude })
    expect(layout.cells[0][0].mine).toBe(false)
  })

  it('rejects impossible dimensions and mine counts', () => {
    expect(() => generateBoard(0, 9, 1)).toThrow(RangeError)
    expect(() => generateBoard(3, 3, 10)).toThrow(RangeError) // more mines than cells
    expect(() => generateBoard(3, 3, -1)).toThrow(RangeError)
  })
})

describe('generateBoard first-move-safe (safeCell)', () => {
  it('never mines the safe cell across randomized runs (property-style)', () => {
    // Dense board so the safe cell is a demanding constraint, swept over many
    // injected-RNG streams — the guarantee must hold for every seed, not one.
    for (let seed = 0; seed < 200; seed++) {
      const layout = generateBoard(9, 9, 70, { rng: mulberry32(seed), safeCell: { r: 4, c: 5 } })
      expect(layout.cells[4][5].mine).toBe(false)
      // and it's a genuine constraint on top of a correct board: exact mine count
      expect(layout.mineLocations).toHaveLength(70)
    }
  })

  it('holds at edge coordinates — every corner and a border cell', () => {
    const corners = [{ r: 0, c: 0 }, { r: 0, c: 8 }, { r: 8, c: 0 }, { r: 8, c: 8 }]
    const borders = [{ r: 0, c: 4 }, { r: 4, c: 0 }, { r: 8, c: 4 }, { r: 4, c: 8 }]
    for (const safeCell of [...corners, ...borders]) {
      const layout = generateBoard(9, 9, 70, { seed: 123, safeCell })
      expect(layout.cells[safeCell.r][safeCell.c].mine).toBe(false)
    }
  })

  it('generates a max-density board (mines = cells − 1) with the one safe cell blank', () => {
    // 3x3 with 8 mines: every cell except the safe one must be a mine.
    const layout = generateBoard(3, 3, 8, { seed: 5, safeCell: { r: 1, c: 1 } })
    expect(layout.mineLocations).toHaveLength(8)
    expect(layout.cells[1][1].mine).toBe(false)
    let mines = 0
    for (const row of layout.cells) for (const cell of row) if (cell.mine) mines++
    expect(mines).toBe(8)
  })

  it('merges with an existing exclude set rather than replacing it', () => {
    const exclude = new Set([0]) // key 0 == cell (0,0)
    const layout = generateBoard(5, 5, 23, { seed: 9, exclude, safeCell: { r: 4, c: 4 } })
    expect(layout.cells[0][0].mine).toBe(false) // from exclude
    expect(layout.cells[4][4].mine).toBe(false) // from safeCell
    expect(layout.mineLocations).toHaveLength(23) // 25 − 2 excluded
  })

  it('rejects configurations where the mines cannot fit with the safe cell excluded', () => {
    // 3x3 = 9 cells, one reserved for safety ⇒ capacity 8; 9 mines can't fit.
    expect(() => generateBoard(3, 3, 9, { safeCell: { r: 0, c: 0 } })).toThrow(RangeError)
  })

  it('rejects an out-of-bounds or non-integer safe cell', () => {
    expect(() => generateBoard(9, 9, 10, { safeCell: { r: 9, c: 0 } })).toThrow(RangeError)
    expect(() => generateBoard(9, 9, 10, { safeCell: { r: -1, c: 0 } })).toThrow(RangeError)
    expect(() => generateBoard(9, 9, 10, { safeCell: { r: 0, c: 1.5 } })).toThrow(RangeError)
  })
})

describe('rules (Layer 2)', () => {
  it('first reveal is never a mine and opens a region', () => {
    const s = MinesweeperRules.init(3, beginner)
    const { state, events } = MinesweeperRules.apply(s, { type: 'reveal', r: 0, c: 0 })
    expect(state.phase).toBe('active')
    expect(state.grid.at(0, 0).mine).toBe(false)
    expect(events[0].type).toBe('reveal')
    // first click is inside a mine-free 3x3, so it's blank and floods
    expect(events[0].cells.length).toBeGreaterThan(1)
  })

  it('revealing a mine loses and emits explode with all mines', () => {
    const s = MinesweeperRules.init(5, beginner)
    MinesweeperRules.apply(s, { type: 'reveal', r: 0, c: 0 })
    const mine = firstMine(s.grid)
    const { state, events } = MinesweeperRules.apply(s, { type: 'reveal', r: mine.r, c: mine.c })
    expect(state.phase).toBe('lost')
    expect(events[0].type).toBe('explode')
    expect(events[0].mines.length).toBe(beginner.mines)
  })

  it('toggles flags and blocks revealing a flagged cell', () => {
    let s = MinesweeperRules.init(1, beginner)
    s = MinesweeperRules.apply(s, { type: 'reveal', r: 0, c: 0 }).state
    const hidden = firstHidden(s.grid)
    let r = MinesweeperRules.apply(s, { type: 'flag', r: hidden.r, c: hidden.c })
    expect(r.events[0]).toMatchObject({ type: 'flag', flagged: true })
    // revealing a flagged cell is a no-op
    r = MinesweeperRules.apply(r.state, { type: 'reveal', r: hidden.r, c: hidden.c })
    expect(r.events).toHaveLength(0)
    expect(r.state.grid.at(hidden.r, hidden.c).status).toBe('flagged')
  })

  it('project never leaks an unrevealed mine mid-game, but reveals mines when over', () => {
    const s = MinesweeperRules.init(8, beginner)
    const active = MinesweeperRules.apply(s, { type: 'reveal', r: 0, c: 0 }).state
    const view = MinesweeperRules.project(active)
    for (const cell of view.cells) {
      if (cell.status !== 'revealed') expect(cell.mine).not.toBe(true)
    }
    // now lose and re-project
    const mine = firstMine(active.grid)
    const lost = MinesweeperRules.apply(active, { type: 'reveal', r: mine.r, c: mine.c }).state
    const overView = MinesweeperRules.project(lost)
    expect(overView.cells.some(c => c.status === 'hidden' && c.mine === true)).toBe(true)
  })
})

describe('board injection (fromLayout, Layer 2)', () => {
  // A hand-built 3x3 with a single mine at (0,0). Adjacency: the mine's three
  // neighbors (0,1),(1,0),(1,1) are 1; everything else is 0.
  const knownLayout = () => ({
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

  it('creates a game instance from an injected layout and scripts moves to known states', () => {
    const session = new GameSession(MinesweeperRules, { state: MinesweeperRules.fromLayout(knownLayout()) })
    expect(session.status()).toBe('fresh')

    // Reveal a numbered (non-zero) cell: it activates the game and reveals just
    // itself, carrying the layout's adjacency — proof the injected board is live.
    const first = session.applyMove({ type: 'reveal', r: 0, c: 1 })
    expect(session.status()).toBe('active')
    expect(first.events[0].cells).toEqual([{ r: 0, c: 1, adjacent: 1 }])

    // Stepping on the injected mine loses and reports it (before any flood wins).
    const boom = session.applyMove({ type: 'reveal', r: 0, c: 0 })
    expect(session.status()).toBe('lost')
    expect(boom.events[0]).toMatchObject({ type: 'explode', r: 0, c: 0 })
    expect(boom.events[0].mines).toEqual([{ r: 0, c: 0 }])
  })

  it('a zero cell floods the connected safe region on an injected board', () => {
    const session = new GameSession(MinesweeperRules, { state: MinesweeperRules.fromLayout(knownLayout()) })
    // (2,2) is a zero far from the mine; flood opens all 8 safe cells → win.
    const flood = session.applyMove({ type: 'reveal', r: 2, c: 2 })
    expect(flood.events[0].cells.length).toBe(8)
    expect(session.status()).toBe('won')
  })

  it('an injected board can be played to a win, every safe cell revealed', () => {
    const session = new GameSession(MinesweeperRules, { state: MinesweeperRules.fromLayout(knownLayout()) })
    // Reveal all 8 non-mine cells; avoid (0,0).
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (r === 0 && c === 0) continue
        session.applyMove({ type: 'reveal', r, c })
      }
    }
    expect(session.status()).toBe('won')
  })

  it('plays identically to a generated board: injecting a generated layout reproduces its play', () => {
    // Generate a board, then inject that exact layout. Revealing any cell must
    // report the layout's own adjacency, and mines must sit where the layout says.
    const layout = generateBoard(9, 9, 10, { seed: 42, safeCell: { r: 4, c: 4 } })
    const state = MinesweeperRules.fromLayout(layout)
    const { events } = MinesweeperRules.apply(state, { type: 'reveal', r: 4, c: 4 })
    expect(state.phase).toBe('active')
    // (4,4) was forced safe; its revealed adjacency matches the layout.
    const seen = events[0].cells.find(cell => cell.r === 4 && cell.c === 4)
    expect(seen.adjacent).toBe(layout.cells[4][4].adjacent)
    // The mines are exactly the layout's mines.
    const mines = []
    state.grid.forEach((cell, r, c) => { if (cell.mine) mines.push([r, c]) })
    expect(mines.sort()).toEqual([...layout.mineLocations].sort())
  })

  it('two sessions from the same layout with the same script transition identically', () => {
    const script = [{ type: 'reveal', r: 2, c: 2 }, { type: 'flag', r: 0, c: 0 }, { type: 'reveal', r: 0, c: 1 }]
    const run = () => {
      const s = new GameSession(MinesweeperRules, { state: MinesweeperRules.fromLayout(knownLayout()) })
      return script.map(m => s.applyMove(m).view)
    }
    expect(run()).toEqual(run())
  })

  it('rejects malformed layouts with a clear error', () => {
    expect(() => MinesweeperRules.fromLayout(null)).toThrow(TypeError)
    expect(() => MinesweeperRules.fromLayout('nope')).toThrow(TypeError)
    // dimensions don't match the cells grid
    expect(() => MinesweeperRules.fromLayout({ ...knownLayout(), rows: 4 })).toThrow(RangeError)
    // mine count disagrees with the actual mined cells
    expect(() => MinesweeperRules.fromLayout({ ...knownLayout(), mines: 2 })).toThrow(RangeError)
    // a cell missing its shape
    const badCells = knownLayout()
    badCells.cells[1][1] = { mine: false } // no `adjacent`
    expect(() => MinesweeperRules.fromLayout(badCells)).toThrow(TypeError)
    // mineLocations pointing at a non-mined cell
    const badLocs = knownLayout()
    badLocs.mineLocations = [[2, 2]]
    expect(() => MinesweeperRules.fromLayout(badLocs)).toThrow(RangeError)
  })

  it('validateLayout accepts a freshly generated board', () => {
    expect(() => validateLayout(generateBoard(16, 16, 40, { seed: 3 }))).not.toThrow()
  })

  it('leaves existing seed-based construction unaffected', () => {
    // No `state` supplied ⇒ the session still generates from seed/config as before.
    const session = new GameSession(MinesweeperRules, { seed: 3, config: beginner })
    const { events } = session.applyMove({ type: 'reveal', r: 0, c: 0 })
    expect(session.status()).toBe('active')
    expect(session.state.grid.at(0, 0).mine).toBe(false) // first-click safety intact
    expect(events[0].cells.length).toBeGreaterThan(1)
  })
})

describe('state serialization (serialize / deserialize)', () => {
  // Drive a fresh session to a genuine MID-GAME state: opening flood + a flag on
  // a mine (which stays flagged and never needs revealing to win). Returns the
  // session, its clock, and the flagged mine's coordinates.
  function midGame(seed = 21) {
    const clock = makeClock()
    const session = new GameSession(MinesweeperRules, { seed, config: beginner, clock })
    clock.tick()
    session.applyMove({ type: 'reveal', r: 0, c: 0 }) // opening flood → active
    const mine = firstMine(session.state.grid)
    clock.tick()
    session.applyMove({ type: 'flag', r: mine.r, c: mine.c })
    return { session, clock, mine }
  }

  it('round-trips a mid-game snapshot through JSON without loss', () => {
    const { session } = midGame()
    expect(session.status()).toBe('active') // genuinely mid-game, not fresh/finished

    const snap = session.serialize()
    const roundTripped = JSON.parse(JSON.stringify(snap))
    expect(roundTripped).toEqual(snap) // JSON-safe: stringify → parse is lossless

    // deserialize → re-serialize reproduces the exact snapshot
    const revived = GameSession.deserialize(MinesweeperRules, roundTripped, { clock: makeClock() })
    expect(revived.serialize()).toEqual(snap)
  })

  it('snapshot covers layout, revealed + flagged cells, and session/clock state', () => {
    const { session, mine } = midGame()
    const snap = session.serialize()

    // board layout
    expect(snap.state.grid.rows).toBe(beginner.rows)
    expect(snap.state.grid.cols).toBe(beginner.cols)
    expect(snap.state.grid.cells).toHaveLength(beginner.rows * beginner.cols)
    expect(snap.state.grid.cells[0]).toEqual({ mine: expect.any(Boolean), adjacent: expect.any(Number), status: expect.any(String) })

    // per-cell state: the flood left revealed cells, and our flagged mine is flagged
    expect(snap.state.grid.cells.some(c => c.status === 'revealed')).toBe(true)
    expect(snap.state.grid.cells[mine.r * beginner.cols + mine.c].status).toBe('flagged')

    // session / clock state: timer started (t0 set), still running (tEnd null), log intact
    expect(snap.t0).not.toBeNull()
    expect(snap.tEnd).toBeNull()
    expect(snap.log).toHaveLength(2)
    expect(snap.log[0]).toEqual({ move: { type: 'reveal', r: 0, c: 0 }, t: expect.any(Number) })
  })

  it('a deserialized session resumes and plays identically to the original', () => {
    const playToWin = (session, clock) => {
      const { grid, config } = session.state
      for (let r = 0; r < config.rows; r++) {
        for (let c = 0; c < config.cols; c++) {
          if (!grid.at(r, c).mine && grid.at(r, c).status !== 'revealed') {
            clock.tick()
            session.applyMove({ type: 'reveal', r, c })
          }
        }
      }
    }

    const { session, clock } = midGame(33)
    const snap = session.serialize()
    // Revive on a clock continuing from the same instant, so timing stays aligned.
    const reviveClock = makeClock(clock())
    const revived = GameSession.deserialize(MinesweeperRules, JSON.parse(JSON.stringify(snap)), { clock: reviveClock })

    playToWin(session, clock)
    playToWin(revived, reviveClock)

    expect(revived.status()).toBe(session.status())
    expect(revived.status()).toBe('won')
    expect(revived.view()).toEqual(session.view())
    expect(revived.elapsed()).toBe(session.elapsed())
    expect(revived.result()).toEqual(session.result())
  })

  it('rules.serialize / deserialize round-trips a state and revives a real Grid', () => {
    const state = MinesweeperRules.init(7, beginner)
    MinesweeperRules.apply(state, { type: 'reveal', r: 0, c: 0 })
    const snap = MinesweeperRules.serialize(state)
    const revived = MinesweeperRules.deserialize(JSON.parse(JSON.stringify(snap)))
    expect(revived.grid).toBeInstanceOf(Grid) // not a plain object — a live Grid
    expect(revived.grid.at(0, 0)).toEqual(state.grid.at(0, 0))
    expect(MinesweeperRules.serialize(revived)).toEqual(snap)
  })

  it('serialize throws clearly when the rules lack a serializer', () => {
    const bareRules = { init: () => ({}), apply: s => ({ state: s, events: [] }), status: () => 'fresh', project: s => s }
    const session = new GameSession(bareRules, { state: {} })
    expect(() => session.serialize()).toThrow(TypeError)
  })
})

describe('resume from serialized state (Layer 1)', () => {
  // Reveal every remaining non-mine cell in row-major order, ticking the injected
  // clock before each move — a deterministic way to finish an in-progress board.
  const finish = (session, clock) => {
    const { grid, config } = session.state
    for (let r = 0; r < config.rows; r++) {
      for (let c = 0; c < config.cols; c++) {
        if (!grid.at(r, c).mine && grid.at(r, c).status !== 'revealed') {
          clock.tick()
          session.applyMove({ type: 'reveal', r, c })
        }
      }
    }
  }

  const validSnapshot = () => {
    const s = new GameSession(MinesweeperRules, { seed: 1, config: beginner, clock: makeClock() })
    s.applyMove({ type: 'reveal', r: 0, c: 0 })
    return JSON.parse(JSON.stringify(s.serialize()))
  }

  it('play N moves → serialize → restore → finish: final state identical to an uninterrupted run', () => {
    // Uninterrupted reference run.
    const clockU = makeClock()
    const uninterrupted = new GameSession(MinesweeperRules, { seed: 77, config: beginner, clock: clockU })
    clockU.tick()
    uninterrupted.applyMove({ type: 'reveal', r: 0, c: 0 })
    finish(uninterrupted, clockU)

    // Interrupted: identical opening move, snapshot, restore on the SAME clock
    // instant, then finish with the identical remaining moves.
    const clockI = makeClock()
    const before = new GameSession(MinesweeperRules, { seed: 77, config: beginner, clock: clockI })
    clockI.tick()
    before.applyMove({ type: 'reveal', r: 0, c: 0 })
    const snap = JSON.parse(JSON.stringify(before.serialize()))
    const resumed = GameSession.deserialize(MinesweeperRules, snap, { clock: clockI })
    finish(resumed, clockI)

    expect(resumed.status()).toBe('won')
    expect(resumed.view()).toEqual(uninterrupted.view())     // identical board + progress
    expect(resumed.result()).toEqual(uninterrupted.result()) // identical log + time
  })

  it('elapsed time continues (not reset) after restore, on the injected clock', () => {
    const clock = makeClock() // 1000
    const s = new GameSession(MinesweeperRules, { seed: 21, config: beginner, clock })
    clock.tick() // 1050
    s.applyMove({ type: 'reveal', r: 0, c: 0 }) // t0 = 1050
    clock.tick(); clock.tick() // 1150
    expect(s.elapsed()).toBe(100) // 1150 − 1050

    const snap = JSON.parse(JSON.stringify(s.serialize()))
    // Resume on a fresh clock that continues from the same instant (1150).
    const reviveClock = makeClock(clock())
    const resumed = GameSession.deserialize(MinesweeperRules, snap, { clock: reviveClock })

    // Preserved, not reset to zero.
    expect(resumed.elapsed()).toBe(100)

    // And it keeps advancing on the injected clock as play continues.
    reviveClock.tick() // 1200
    const mine = firstMine(resumed.state.grid)
    resumed.applyMove({ type: 'flag', r: mine.r, c: mine.c })
    expect(resumed.elapsed()).toBe(150) // 1200 − 1050
    expect(resumed.elapsed()).toBeGreaterThan(100)
  })

  it('a finished (won/lost) session round-trips with its final elapsed frozen', () => {
    const clock = makeClock()
    const s = new GameSession(MinesweeperRules, { seed: 5, config: beginner, clock })
    clock.tick()
    s.applyMove({ type: 'reveal', r: 0, c: 0 })
    finish(s, clock)
    expect(s.status()).toBe('won')
    const finalTime = s.elapsed()

    const resumed = GameSession.deserialize(
      MinesweeperRules,
      JSON.parse(JSON.stringify(s.serialize())),
      { clock: makeClock(999999) } // a wildly different clock must not change a frozen time
    )
    expect(resumed.status()).toBe('won')
    expect(resumed.elapsed()).toBe(finalTime)
  })

  it('rejects invalid or corrupt snapshots with a clear error', () => {
    const good = validSnapshot()
    // envelope corruption (caught by GameSession.deserialize)
    expect(() => GameSession.deserialize(MinesweeperRules, null)).toThrow(TypeError)
    expect(() => GameSession.deserialize(MinesweeperRules, { ...good, log: 'nope' })).toThrow(TypeError)
    expect(() => GameSession.deserialize(MinesweeperRules, { ...good, log: [{ move: {}, t: 'soon' }] })).toThrow(TypeError)
    expect(() => GameSession.deserialize(MinesweeperRules, { ...good, t0: 'later' })).toThrow(TypeError)
    // game-state corruption (delegated to rules.deserialize)
    expect(() => GameSession.deserialize(MinesweeperRules, { ...good, state: null })).toThrow(TypeError)
    expect(() => GameSession.deserialize(MinesweeperRules, { ...good, state: { ...good.state, phase: 'bogus' } })).toThrow(RangeError)
    const truncated = { ...good, state: { ...good.state, grid: { ...good.state.grid, cells: good.state.grid.cells.slice(1) } } }
    expect(() => GameSession.deserialize(MinesweeperRules, truncated)).toThrow(RangeError)
  })

  it('rules.deserialize rejects a malformed state snapshot directly', () => {
    expect(() => MinesweeperRules.deserialize(null)).toThrow(TypeError)
    expect(() => MinesweeperRules.deserialize({})).toThrow(TypeError) // missing config/grid
    const good = validSnapshot().state
    expect(() => MinesweeperRules.deserialize({ ...good, grid: { ...good.grid, rows: good.grid.rows + 1 } })).toThrow(RangeError)
  })
})

describe('session + timing (Layer 1)', () => {
  it('reports authoritative elapsed time from the injected clock', () => {
    const clock = makeClock()
    const session = new GameSession(MinesweeperRules, { seed: 21, config: beginner, clock })
    expect(session.elapsed()).toBe(0) // no move yet
    playToWin(session, clock)
    expect(session.status()).toBe('won')
    // time is (terminal tick − first tick), owned by the clock, not the client
    expect(session.elapsed()).toBeGreaterThan(0)
    const result = session.result()
    expect(result.status).toBe('won')
    expect(result.seed).toBe(21)
  })
})

describe('replay verification (Layer 1)', () => {
  it('accepts a genuine winning log and recomputes the same time', () => {
    const clock = makeClock()
    const session = new GameSession(MinesweeperRules, { seed: 33, config: beginner, clock })
    playToWin(session, clock)
    const submission = session.result()
    const verdict = replay(MinesweeperRules, submission)
    expect(verdict.valid).toBe(true)
    expect(verdict.status).toBe('won')
    expect(verdict.time).toBe(submission.time)
  })

  it('rejects a truncated (non-terminal) log', () => {
    const clock = makeClock()
    const session = new GameSession(MinesweeperRules, { seed: 33, config: beginner, clock })
    playToWin(session, clock)
    const submission = session.result()
    const truncated = { ...submission, log: submission.log.slice(0, 2) }
    const verdict = replay(MinesweeperRules, truncated)
    expect(verdict.valid).toBe(false)
    expect(verdict.reason).toMatch(/terminal/)
  })

  it('rejects non-monotonic timestamps', () => {
    const clock = makeClock()
    const session = new GameSession(MinesweeperRules, { seed: 33, config: beginner, clock })
    playToWin(session, clock)
    const submission = session.result()
    const tampered = { ...submission, log: submission.log.map((e, i) => ({ ...e, t: i === 1 ? -5 : e.t })) }
    const verdict = replay(MinesweeperRules, tampered)
    expect(verdict.valid).toBe(false)
    expect(verdict.reason).toMatch(/monotonic/)
  })

  it('is deterministic: same seed + same log ⇒ same board', () => {
    const a = MinesweeperRules.init(777, beginner)
    const b = MinesweeperRules.init(777, beginner)
    MinesweeperRules.apply(a, { type: 'reveal', r: 2, c: 2 })
    MinesweeperRules.apply(b, { type: 'reveal', r: 2, c: 2 })
    const minesA = []
    const minesB = []
    a.grid.forEach((cell, r, c) => { if (cell.mine) minesA.push(r * beginner.cols + c) })
    b.grid.forEach((cell, r, c) => { if (cell.mine) minesB.push(r * beginner.cols + c) })
    expect(minesA).toEqual(minesB)
  })
})

describe('determinism guard (invariant #4)', () => {
  it('no Date/Math.random in core/ outside the rng seam', () => {
    const coreDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'core')
    const offenders = []
    walk(coreDir, file => {
      if (!file.endsWith('.js')) return
      // Scan code only — strip comments so prose that *names* these APIs
      // (e.g. "uses Math.imul, not Math.random") isn't a false positive.
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      if (/\bMath\.random\b/.test(code) || /\bDate\.now\b/.test(code) || /\bnew Date\b/.test(code)) {
        offenders.push(file)
      }
    })
    expect(offenders).toEqual([])
  })
})

// ---- helpers ----

function makeClock(start = 1000) {
  let t = start
  return Object.assign(() => t, { tick() { t += 50 } })
}

function firstMine(grid) {
  let found = null
  grid.forEach((cell, r, c) => { if (!found && cell.mine) found = { r, c } })
  return found
}

function firstHidden(grid) {
  let found = null
  grid.forEach((cell, r, c) => { if (!found && cell.status === 'hidden' && !cell.mine) found = { r, c } })
  return found
}

function walk(dir, fn) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, fn)
    else fn(p)
  }
}
