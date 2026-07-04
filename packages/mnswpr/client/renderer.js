// @ts-check

/**
 * The renderer — the ONLY place the client touches game DOM. It consumes core
 * events + the projected view and reproduces the exact attributes/classes the
 * game has always used (`data-status`, `data-value`, class names), so existing
 * CSS and the jsdom tests are unaffected. It reads nothing from the core beyond
 * the projected view, so board secrecy stays a drop-in later (invariant #3).
 */

function cellAt(grid, r, c) {
  return grid.rows[r].cells[c]
}

/** Reveal a safe cell — matches the old revealSafeCell() DOM exactly. */
function renderRevealed(grid, r, c, adjacent) {
  const cell = cellAt(grid, r, c)
  cell.className = 'clicked'
  cell.setAttribute('data-status', 'clicked')
  const span = document.createElement('span')
  if (adjacent === 0) {
    span.innerHTML = ' '
    cell.innerHTML = ''
    cell.appendChild(span)
    cell.setAttribute('data-status', 'empty')
  } else {
    span.innerHTML = String(adjacent)
    cell.innerHTML = ''
    cell.appendChild(span)
    cell.setAttribute('data-value', String(adjacent))
  }
}

/** Toggle a flag — matches the old rightClickCell() DOM. */
function renderFlag(grid, r, c, flagged) {
  const cell = cellAt(grid, r, c)
  if (flagged) {
    cell.className = 'flag'
    cell.setAttribute('data-status', 'flagged')
  } else {
    cell.className = ''
    cell.setAttribute('data-status', 'default')
  }
}

/** @returns {Set<string>} "r,c" keys of every mine in the terminal view */
function mineSet(view) {
  const set = new Set()
  for (const cell of view.cells) {
    if (cell.mine) set.add(`${cell.r},${cell.c}`)
  }
  return set
}

/**
 * Apply per-move events to the grid (reveal / flag / the clicked mine on
 * explode). Terminal board reveal is handled separately by revealBoard().
 * @param {HTMLTableElement} grid
 * @param {object[]} events
 */
export function renderEvents(grid, events) {
  for (const ev of events) {
    if (ev.type === 'reveal') {
      for (const c of ev.cells) renderRevealed(grid, c.r, c.c, c.adjacent)
    } else if (ev.type === 'flag') {
      renderFlag(grid, ev.r, ev.c, ev.flagged)
    } else if (ev.type === 'explode') {
      const cell = cellAt(grid, ev.r, ev.c)
      cell.className = 'clicked'
      cell.setAttribute('data-status', 'clicked')
    }
  }
}

/**
 * Reveal the whole board at game end, reproducing the old handleWinRevelation /
 * handleLostRevelation output. On a win, mines are marked correct; on a loss,
 * unflagged mines detonate and wrong flags are marked.
 * @param {HTMLTableElement} grid
 * @param {{ phase: string, cells: object[] }} view
 * @param {{ rows: number, cols: number }} setting
 */
export function revealBoard(grid, view, setting) {
  const won = view.phase === 'won'
  const mines = mineSet(view)
  for (let r = 0; r < setting.rows; r++) {
    for (let c = 0; c < setting.cols; c++) {
      const cell = cellAt(grid, r, c)
      const isMine = mines.has(`${r},${c}`)
      const isFlagged = cell.getAttribute('data-status') === 'flagged'
      if (won) {
        if (isMine) {
          cell.innerHTML = ':)'
          cell.className = 'correct'
          cell.setAttribute('data-status', 'clicked')
          cell.setAttribute('title', 'Correct')
        }
      } else if (isFlagged) {
        if (isMine) {
          cell.innerHTML = ':)'
          cell.className = 'correct'
          cell.setAttribute('title', 'Correct')
        } else {
          cell.innerHTML = 'X'
          cell.className = 'wrong'
          cell.setAttribute('title', 'Wrong')
        }
      } else if (isMine) {
        cell.className = 'mine'
        cell.setAttribute('data-status', 'clicked')
      }
    }
  }
}
