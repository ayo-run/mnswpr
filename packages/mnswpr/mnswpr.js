// @ts-check

/**
 * import styles for vite bundling
 */
import './mnswpr.css'

import {
  StorageService,
  TimerService
} from '@cozy-games/utils'
import { levels } from './levels.js'
import { MinesweeperRules } from './core/index.js'
import { LocalTransport } from './client/transport.js'
import { renderEvents, revealBoard } from './client/renderer.js'

const TEST_MODE = false // set to true if you want to test the game with visual hints
const MOBILE_BUSY_DELAY = 250
const PC_BUSY_DELAY = 500

/**
 * Create Minesweeper game board.
 *
 * This is the DOM CLIENT: it builds the board, handles input, and renders. All
 * game state and rules live in the headless core (`./core`); the client drives
 * it through a Transport and paints the events it emits (see
 * docs/headless-core-and-client-design.md).
 *
 * @param {String} appId
 * @param {String} version
 * @param {{
 * levelChanged: (setting: any) => void,
 * gameDone: (game: any) => void
 * } | undefined } hooks
 * @param {{ seed?: number }} [options] - `seed` pins the (deterministic) board,
 *   mainly for tests/replay; omit for a fresh random game each time.
 */
const Minesweeper = function(appId, version, hooks = undefined, options = {}) {
  const _this = this
  const storageService = new StorageService()
  const timerService = new TimerService()

  if (!hooks) {
    hooks = {
      levelChanged: () => {},
      gameDone: () => {}
    }
  }

  const configuredSeed = options.seed

  let grid = document.createElement('table')
  grid.setAttribute('id', 'grid')
  let flagsDisplay = document.createElement('span')
  let smileyDisplay = document.createElement('span')
  let timerDisplay = document.createElement('span')
  let appElement = document.getElementById(appId)
  if (!appElement) {
    const body = document.getElementsByTagName('body')[0]
    appElement = document.createElement('div')
    body.append(appElement)
  }

  let isMobile = false
  let isLeft = false
  let isRight = false
  let pressed = undefined
  let bothPressed = undefined
  let skip = false
  let skipCondition = false
  let mouseUpCallBackArray = [
    clickCell,
    middleClickCell
  ]
  let mouseDownCallBackArray = [
    highlightCell, // left-click down
    highlightSurroundingCell, // middle-click down
    rightClickCell // right-click down
  ]
  let isBusy = false
  let clickedCell
  let cachedSetting = storageService.getFromLocal('setting')
  let setting = cachedSetting || levels.beginner
  if (TEST_MODE) {
    setting = {
      rows: 10,
      cols: 10,
      mines: 10,
      id: 'test',
      name: 'test'
    }
  }
  storageService.saveToLocal('setting', setting)
  let flagsCount = setting.mines
  // Cells currently highlighted, so removeHighlights only resets these (<=9) instead of the whole grid
  let highlightedCells = []
  // The headless game for the current board; recreated on every generateGrid.
  let transport

  this.initialize = function() {
    const headingElement = document.createElement('h1')
    const gameBoard = document.createElement('div')

    const versionLink = version === 'dev' ? 'dev' : `<a href="https://github.com/ayo-run/mnswpr/releases/tag/v${version}">v${version}</a>`

    headingElement.innerHTML = `<span>Minesweeper</span><sup>${versionLink}</sup>`
    document.title = `mnswpr [${version}]`
    gameBoard.setAttribute('id', 'game-board')
    gameBoard.append(initializeToolbar(), grid, initializeFootbar())
    if(appElement) {
      appElement.innerHTML = ''
      appElement.append(headingElement, gameBoard)
    }
    initializeGlobalEventHandlers()
    generateGrid({ initial: true })
  }

  function initializeFootbar() {
    const footBar = document.createElement('div')

    const resetButton = document.createElement('button')
    resetButton.innerText = 'Reset'
    resetButton.onmousedown = () => generateGrid()
    footBar.append(resetButton)

    let levelsDropdown = document.createElement('select')
    levelsDropdown.onchange = () => updateSetting(levelsDropdown.value)

    const levelsKeys = Object.keys(levels)
    levelsKeys.forEach(key => {
      const levelOption = document.createElement('option')
      levelOption.value = levels[key].id
      levelOption.text = levels[key].name
      if (setting.id === levelOption.value) {
        levelOption.selected = true
      }
      levelsDropdown.add(levelOption, null)
    })

    if (TEST_MODE) {
      const testLevel = document.createElement('span')
      testLevel.innerText = 'Test Mode'
      footBar.append(testLevel)
    } else {
      footBar.append(levelsDropdown)
    }

    return footBar
  }

  function initializeToolbar() {
    const toolbar = document.createElement('div')

    const flagsWrapper = document.createElement('div')
    flagsWrapper.append(flagsDisplay)
    flagsWrapper.style.height = '20px'
    toolbar.append(flagsWrapper)

    const smileyWrapper = document.createElement('div')
    smileyWrapper.append(smileyDisplay)
    // toolbar.append(smileyWrapper);

    const timerWrapper = document.createElement('div')
    timerWrapper.append(timerDisplay)
    timerWrapper.style.height = '20px'
    toolbar.append(timerWrapper)

    toolbar.style.cursor = 'pointer'
    toolbar.style.padding = '10px 35px'
    toolbar.style.display = 'flex'
    toolbar.style.justifyContent = 'space-between'
    toolbar.onmousedown = () => generateGrid()

    return toolbar
  }

  /**
   * Updates the game level
   * @param {String} key
   */
  function updateSetting(key) {
    setting = levels[key]
    storageService.saveToLocal('setting', setting)
    generateGrid({ initial: true })
  }

  /**
   * Generate the Game Board
   * @param {{
   * initial: boolean
   * }} options - Game Board Options
   */
  function generateGrid(options = { initial: false }) {
    grid.innerHTML = ''
    grid.oncontextmenu = () => false
    flagsCount = setting.mines
    highlightedCells = []

    for (let i = 0; i < setting.rows; i++) {
      let row = grid.insertRow(i)
      row.oncontextmenu = () => false
      for (let j=0; j<setting.cols; j++) {
        let cell = row.insertCell(j)
        initializeEventHandlers(cell)

        if ('ontouchstart' in document.documentElement) {
          isMobile = true
          initializeTouchEventHandlers(cell)
        }

        let status = document.createAttribute('data-status')
        status.value = 'default'
        cell.setAttributeNode(status)
      }
    }

    let gameStatus = document.createAttribute('game-status')
    gameStatus.value = 'inactive'
    grid.setAttributeNode(gameStatus)

    if (appElement) {
      appElement.style.margin = '0 auto'
    }

    // A fresh headless game. Mines are placed by the core on the first reveal
    // (first-click safe), so there is nothing to seed into the DOM here.
    const gameSeed = configuredSeed !== undefined ? configuredSeed : Math.floor(Math.random() * 0x7fffffff)
    transport = new LocalTransport(MinesweeperRules, { seed: gameSeed, config: setting, clock: () => Date.now() })
    transport.onEvent(onCoreEvent)

    /**
     * TODO: add hook afterGridGenerated
     *   - for initializing the leaderboard
     */
    if (options.initial)
      hooks.levelChanged(setting)

    timerService.initialize(timerDisplay)
    updateFlagsCountDisplay()
  }

  /**
   * Paint the events from a core move, and drive the win/loss transition. Fired
   * synchronously by the LocalTransport; a RemoteTransport would fire it on the
   * server's reply with no change here.
   * @param {{ events: object[], view: object }} payload
   */
  function onCoreEvent(payload) {
    renderEvents(grid, payload.events)
    for (const ev of payload.events) {
      if (ev.type === 'explode' || ev.type === 'win') {
        finishGame(payload.view)
        break
      }
    }
  }

  /** Terminal transition: reveal the board, update displays, fire gameDone. */
  function finishGame(view) {
    const won = view.phase === 'won'
    if (won) {
      grid.setAttribute('game-status', 'win')
      updateFlagsCountDisplay(0)
    } else {
      flagsDisplay.innerHTML = '&#128561;'
      grid.setAttribute('game-status', 'over')
    }
    revealBoard(grid, view, setting)
    grid.setAttribute('game-status', 'done')

    const time = timerService.stop()
    const game = {
      time,
      status: won ? 'win' : 'loss',
      level: setting.id,
      time_stamp: new Date(),
      isMobile
    }

    /**
     * TODO: add hook after gameSession send back `game`
     *   - for sending the game score to the db
     */
    hooks.gameDone(game)
  }

  function setBusy() {
    isBusy = true
    if (isMobile) {
      setTimeout(() => isBusy = false, MOBILE_BUSY_DELAY)
    } else {
      setTimeout(() => isBusy = false, PC_BUSY_DELAY)
    }
  }

  function updateFlagsCountDisplay(count = flagsCount) {
    if (grid.getAttribute('game-status') != 'win') {
      flagsDisplay.innerHTML = `${count}`
      return
    }
    flagsDisplay.innerHTML = '&#128513;'
  }

  /**
   *
   * @param {HTMLTableCellElement} cell
   */
  function initializeTouchEventHandlers(cell) {
    let ontouchleave = function() {
      if (clickedCell === this) {
        clickedCell = undefined
      }
    }
    cell.addEventListener('touchleave', ontouchleave)

    let ontouchend = function() {
      endTouchTimer()
    }
    cell.addEventListener('touchend', ontouchend)

    let ontouchstart = function(e) {
      isMobile = true
      if (!isBusy && typeof e === 'object') {
        startTouchTimer(this)
      }
    }
    cell.addEventListener('touchstart', ontouchstart)

  }

  /**
   * Wire the document/window/grid-level input handlers. These don't depend on
   * any individual cell, so they're set up once instead of being reassigned
   * for every cell during grid generation.
   */
  function initializeGlobalEventHandlers() {
    document.onkeydown = function(e) {
      if (e.keyCode == 32 || e.keyCode == 113) {
        generateGrid()
        if ('preventDefault' in e) {
          e.preventDefault()
        } else {
          return false
        }
      }
      resetMouseEventFlags()
    }

    window.onblur = function() {
      resetMouseEventFlags()
    }

    grid.onmouseleave = function() {
      removeHighlights()
    }

    document.oncontextmenu = () => false

    document.onmouseup = function() {
      resetMouseEventFlags()
    }

    document.onmousedown = function(e) {
      isMobile = false
      switch (e.button) {
        case 0: pressed = 'left'; isLeft = true; break
        case 1: pressed = 'middle'; break
        case 2: isRight = true; break
      }
    }
  }

  function initializeEventHandlers(_cell) {

    let cell = _cell
    skip = false
    skipCondition = false

    resetMouseEventFlags()

    // Set grid status to active on first click
    cell.onmouseup = function(e) {
      pressed = undefined
      let dont = false

      if (bothPressed) {
        bothPressed = false
        if (e.button == '2') {
          skipCondition = true
        } else if (e.button == '0') {
          dont = true
        }
        if (getStatus(this) == 'clicked') {
          middleClickCell(this)
          return
        }
      }
      switch(e.button) {
        case 0: {
          isLeft = false
          if (skipCondition) {
            skip = true
          }
          break
        }
        case 2: isRight = false; break
      }
      removeHighlights()
      if (skip || dont) {
        skip = false
        skipCondition = false
        return
      }
      if (!isBusy && typeof e === 'object' && e.button != 2) {
        mouseUpCallBackArray[e.button].call(_this, this)
      }
    }


    cell.onmousedown = function(e) {
      skip = false
      if (!isBusy && typeof e === 'object') {
        switch(e.button) {
          case 0: isLeft = true; break
          case 2: isRight = true; break
        }

        if (isLeft && isRight) {
          bothPressed = true
          highlightSurroundingCell(this)
          return
        }

        if (e.button == '1') {
          pressed = 'middle'
          highlightSurroundingCell(this)
        } else if (e.button == '0') {
          pressed = 'left'
          if (getStatus(this) == 'clicked') {
            highlightSurroundingCell(this)
          } else {
            highlightCell(this)
          }
        }

        if (e.button == '2') mouseDownCallBackArray[e.button].call(_this, this)
      }
    }

    cell.onmousemove = function(e) {
      if ((pressed || bothPressed) && typeof e === 'object') {
        removeHighlights()
        if (pressed == 'middle' || (isLeft && isRight)) {
          highlightSurroundingCell(this)
        } else if (pressed == 'left') {
          if (getStatus(this) == 'clicked') {
            highlightSurroundingCell(this)
          } else {
            highlightCell(this)
          }
        }
      }
    }

    cell.oncontextmenu = () => false
    cell.onselectstart = () => false
    cell.setAttribute('unselectable', 'on')
  }

  function isEqual(x, y) {
    if (!x) return false
    return x === y
  }

  function startTouchTimer(cell) {
    if (isEqual(clickedCell, cell)) {
      return
    }
    clickedCell = cell
    setTimeout(() => {
      if (isEqual(clickedCell, cell)) {
        rightClickCell(cell)
        setBusy()
      }
    }, 500)
  }

  function endTouchTimer() {
    clickedCell = undefined
  }

  function resetMouseEventFlags() {
    pressed = undefined
    bothPressed = undefined
    isLeft = false
    isRight = false
    removeHighlights()
    skip = true
  }

  function activateGame() {
    grid.setAttribute('game-status', 'active')
    // start timer
    timerService.start()
  }

  function gameIsDone() {
    return grid.getAttribute('game-status') == 'over' || grid.getAttribute('game-status') == 'done'
  }

  function removeHighlights() {
    for (let i = 0; i < highlightedCells.length; i++) {
      const currentCell = highlightedCells[i]
      // guard: a tracked cell may have been flagged/clicked since it was highlighted
      if (getStatus(currentCell) == 'highlighted') setStatus(currentCell, 'default')
    }
    highlightedCells = []
  }

  function highlightCell(cell) {
    if (isFlagged(cell)) return
    if (!gameIsDone() && getStatus(cell) == 'default') {
      setStatus(cell, 'highlighted')
      highlightedCells.push(cell)
    }
  }

  function highlightSurroundingCell(cell) {
    let cellRow = cell.parentNode.rowIndex
    let cellCol = cell.cellIndex

    highlightCell(cell)
    for (let i = Math.max(cellRow-1,0); i <= Math.min(cellRow+1, setting.rows - 1); i++) {
      for(let j = Math.max(cellCol-1,0); j <= Math.min(cellCol+1, setting.cols - 1); j++) {
        let currentCell = grid.rows[i].cells[j]
        highlightCell(currentCell)
      }
    }
  }

  function increaseFlagsCount() {
    flagsCount++
    updateFlagsCountDisplay()
  }

  function decreaseFlagsCount() {
    flagsCount--
    updateFlagsCountDisplay()
  }

  function isFlagged(cell) {
    return getStatus(cell) == 'flagged'
  }

  function setStatus(cell, status) {
    cell.setAttribute('data-status', status)
  }

  function getCol(cell) {
    return cell.cellIndex
  }

  function getRow(cell) {
    return cell.parentNode.rowIndex
  }

  function getStatus(cell) {
    if (!cell) return undefined
    return cell.getAttribute('data-status')
  }

  // ---- input → core move adapters ----

  function rightClickCell(cell) {
    if (isFlagged(cell)) setBusy()
    if (grid.getAttribute('game-status') == 'inactive') {
      activateGame()
    }
    if (grid.getAttribute('game-status') != 'active') return

    const status = getStatus(cell)
    if (status == 'clicked' || status == 'empty') return

    const move = { type: 'flag', r: getRow(cell), c: getCol(cell) }
    if (status == 'default' || status == 'highlighted') {
      if (flagsCount <= 0) return
      transport.send(move) // renderer paints the flag
      decreaseFlagsCount()
    } else {
      transport.send(move) // toggles the flag off
      increaseFlagsCount()
    }
    if ('vibrate' in navigator) {
      navigator.vibrate(100)
    }
  }

  function clickCell(cell) {
    if (isFlagged(cell)) setBusy()
    if (grid.getAttribute('game-status') == 'inactive') {
      activateGame()
    }
    if (grid.getAttribute('game-status') != 'active') return
    if (isFlagged(cell) || grid.getAttribute('game-status') == 'over') {
      return
    }

    const r = getRow(cell)
    const c = getCol(cell)
    // An already-open number chords; anything else is a reveal. The core places
    // mines on the first reveal (first-click safe), so no transfer is needed.
    if (getStatus(cell) == 'clicked') {
      transport.send({ type: 'chord', r, c })
      return
    }
    transport.send({ type: 'reveal', r, c })
  }

  function middleClickCell(cell) {
    if (grid.getAttribute('game-status') != 'active' || getStatus(cell) !== 'clicked') {
      return
    }
    transport.send({ type: 'chord', r: getRow(cell), c: getCol(cell) })
  }
}

export default Minesweeper
