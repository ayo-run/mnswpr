import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  Grid, eightWay, orthogonal,
  GameSession, replay, mulberry32,
  MinesweeperRules, generateBoard, levels
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

function makeClock() {
  let t = 1000
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
