import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  Grid, eightWay, orthogonal,
  GameSession, replay, mulberry32,
  MinesweeperRules, levels
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
