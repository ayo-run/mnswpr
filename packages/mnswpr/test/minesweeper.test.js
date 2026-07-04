import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Minesweeper from '../mnswpr.js'
import { MinesweeperRules } from '../core/index.js'

// Ask the (deterministic) core for a seed whose first-click-safe board places
// the single mine at `targetCol`. Lets the DOM tests below pin a layout honestly
// via the client's `seed` option, instead of hoping a Math.random value lands it.
function findSeedForMine(setting, firstClick, targetCol) {
  for (let seed = 1; seed < 100000; seed++) {
    const state = MinesweeperRules.init(seed, setting)
    MinesweeperRules.apply(state, { type: 'reveal', r: firstClick.r, c: firstClick.c })
    let mineCol = -1
    state.grid.forEach((cell, r, c) => { if (cell.mine) mineCol = c })
    if (mineCol === targetCol) return seed
  }
  throw new Error('no seed found for target mine column')
}

// Build a fresh board mounted on #app and return its grid <table>.
function mountGame() {
  document.body.innerHTML = '<div id="app"></div>'
  const game = new Minesweeper('app', 'dev')
  game.initialize()
  return document.getElementById('grid')
}

function leftClick(cell) {
  cell.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))
  cell.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }))
}

function rightClick(cell) {
  cell.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }))
}

function everyCell(grid, fn) {
  for (let i = 0; i < grid.rows.length; i++) {
    for (let j = 0; j < grid.rows[i].cells.length; j++) {
      fn(grid.rows[i].cells[j])
    }
  }
}

describe('Minesweeper board', () => {
  beforeEach(() => {
    localStorage.clear()
    // Fake timers stop the requestAnimationFrame game clock from running during tests.
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // Mount a game on a custom board injected via the cached 'setting' localStorage
  // key. `options.seed` pins the (deterministic) mine layout.
  function mountCustomGame(setting, hooks, options) {
    localStorage.setItem('setting', JSON.stringify(setting))
    document.body.innerHTML = '<div id="app"></div>'
    const game = new Minesweeper('app', 'dev', hooks, options)
    game.initialize()
    return document.getElementById('grid')
  }

  it('renders the beginner grid (9x9) by default', () => {
    const grid = mountGame()
    expect(grid.rows.length).toBe(9)
    everyCell(grid, cell => expect(cell.parentNode.cells.length).toBe(9))
  })

  it('starts inactive with every cell in the default state', () => {
    const grid = mountGame()
    expect(grid.getAttribute('game-status')).toBe('inactive')
    everyCell(grid, cell => expect(cell.getAttribute('data-status')).toBe('default'))
  })

  it('activates the game and reveals the cell on the first click', () => {
    const grid = mountGame()
    const cell = grid.rows[0].cells[0]
    leftClick(cell)
    expect(grid.getAttribute('game-status')).not.toBe('inactive')
    expect(cell.getAttribute('data-status')).not.toBe('default')
  })

  it('never loses on the first click, across many random boards', () => {
    // Exercises mine placement + first-click mine transfer (the Set-backed logic).
    for (let i = 0; i < 30; i++) {
      const grid = mountGame()
      leftClick(grid.rows[0].cells[0])
      expect(grid.getAttribute('game-status')).not.toBe('over')
    }
  })

  it('flags and unflags a cell on right click', () => {
    const grid = mountGame()
    const cell = grid.rows[0].cells[0]

    rightClick(cell)
    expect(cell.getAttribute('data-status')).toBe('flagged')
    expect(cell.className).toBe('flag')

    rightClick(cell)
    expect(cell.getAttribute('data-status')).toBe('default')
  })

  it('resets the board back to the inactive state', () => {
    const grid = mountGame()
    leftClick(grid.rows[0].cells[0])
    expect(grid.getAttribute('game-status')).not.toBe('inactive')

    const resetButton = document.querySelector('#game-board button')
    resetButton.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))

    expect(grid.getAttribute('game-status')).toBe('inactive')
    everyCell(grid, cell => expect(cell.getAttribute('data-status')).toBe('default'))
  })

  it('highlights the pressed cell and clears it when the press moves away', () => {
    const grid = mountGame()
    const a = grid.rows[5].cells[5]
    const b = grid.rows[5].cells[6]
    const c = grid.rows[5].cells[7]

    // Press-and-hold left on A -> A highlighted.
    a.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))
    expect(a.getAttribute('data-status')).toBe('highlighted')

    // Drag the held press across B then C. Each move must clear the previous
    // highlight and leave no stale ones behind.
    b.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    c.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))

    expect(a.getAttribute('data-status')).toBe('default')
    expect(b.getAttribute('data-status')).toBe('default')
    expect(c.getAttribute('data-status')).toBe('highlighted')

    // Exactly one cell should remain highlighted across the whole grid.
    let highlighted = 0
    everyCell(grid, cell => {
      if (cell.getAttribute('data-status') === 'highlighted') highlighted++
    })
    expect(highlighted).toBe(1)
  })

  it('declares a win once every safe cell is revealed', () => {
    // A mine-free 3x3 board: one click cascades to reveal all 9 safe cells.
    let finished = null
    const grid = mountCustomGame(
      { rows: 3, cols: 3, mines: 0, id: 'test', name: 'test' },
      { levelChanged: () => {}, gameDone: (g) => { finished = g.status } }
    )

    leftClick(grid.rows[1].cells[1])

    expect(finished).toBe('win')
    expect(grid.getAttribute('game-status')).toBe('done')
    everyCell(grid, cell => expect(cell.getAttribute('data-status')).not.toBe('default'))
  })

  it('does not declare a win until the last safe cell is revealed', () => {
    // 1x3 board; pin the single mine to the middle column so neither end cascades.
    const setting = { rows: 1, cols: 3, mines: 1, id: 'test', name: 'test' }
    const seed = findSeedForMine(setting, { r: 0, c: 0 }, 1)
    const grid = mountCustomGame(setting, undefined, { seed })

    // First safe cell (col 0): adjacent to the mine, shows "1", no cascade -> not yet won.
    leftClick(grid.rows[0].cells[0])
    expect(grid.getAttribute('game-status')).toBe('active')

    // Revealing the remaining safe cell (col 2) completes the board.
    leftClick(grid.rows[0].cells[2])
    expect(grid.getAttribute('game-status')).toBe('done')
  })

  it('flood fill stops at a flagged cell and never reveals it', () => {
    // 1x4 board; pin the mine to the last column so cols 0-2 are a safe run.
    const setting = { rows: 1, cols: 4, mines: 1, id: 'test', name: 'test' }
    const seed = findSeedForMine(setting, { r: 0, c: 0 }, 3)
    const grid = mountCustomGame(setting, undefined, { seed })

    // Flag a safe cell (col 2) sitting between the blank region and the mine.
    // (full press + release so the internal right-button flag resets)
    const flag = grid.rows[0].cells[2]
    flag.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }))
    flag.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true }))
    expect(flag.getAttribute('data-status')).toBe('flagged')

    // Click the far blank cell; the cascade must stop at the flag.
    leftClick(grid.rows[0].cells[0])

    expect(grid.rows[0].cells[0].getAttribute('data-status')).toBe('empty')
    expect(flag.getAttribute('data-status')).toBe('flagged')
    // A safe cell is still hidden (behind the flag), so it is not a win.
    expect(grid.getAttribute('game-status')).toBe('active')
  })
})
