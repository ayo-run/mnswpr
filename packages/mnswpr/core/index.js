// @ts-check

/**
 * `@cozy-games/mnswpr/core` — the headless, isomorphic Minesweeper core. No DOM, no
 * wall clock. Runs identically in a browser (offline play) or on a server
 * (authoritative timing / replay verification). See
 * docs/headless-core-and-client-design.md.
 */

// Layer 0 — generic grid (future @cozy-games/grid)
export { Grid } from './grid/grid.js'
export { eightWay, orthogonal } from './grid/neighbors.js'
export { toJSON, fromJSON } from './grid/serialize.js'

// Layer 1 — generic session & authority (future @cozy-games/game-session)
export { GameSession } from './session/session.js'
export { replay } from './session/replay.js'
export { mulberry32, randInt } from './session/rng.js'

// Layer 2 — Minesweeper rules & pure board generation
export { MinesweeperRules, MOVE_EVENT_TYPES } from './minesweeper/rules.js'
export { generateBoard, validateLayout } from './minesweeper/board.js'

// Shared level presets (also consumed by the DOM client)
export { levels } from '../levels.js'

// Public type aliases — re-exported so consumers can
// `import type { Layout, … } from '@cozy-games/mnswpr/core'` against the barrel,
// without reaching into internal `core/minesweeper/*` modules or an ambient shim.
// These are type-only; they add nothing to the runtime bundle.
/** @typedef {import('./minesweeper/board.js').Layout} Layout */
/** @typedef {import('./minesweeper/board.js').LayoutCell} LayoutCell */
/** @typedef {import('./minesweeper/board.js').Config} Config */
/** @typedef {import('./minesweeper/rules.js').Move} Move */
/** @typedef {import('./minesweeper/rules.js').MoveEvent} MoveEvent */
/** @typedef {import('./minesweeper/rules.js').MoveEventType} MoveEventType */
/** @typedef {import('./minesweeper/rules.js').Phase} Phase */
