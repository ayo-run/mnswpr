import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Minesweeper from '../lib/mnswpr.js'

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
    // Fake timers stop the 1ms game clock interval from running during tests.
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

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
})
