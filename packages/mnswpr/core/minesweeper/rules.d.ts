/**
 * Minesweeper as a pure, deterministic state machine — no DOM, no wall clock.
 * `GameSession` (Layer 1) drives it; the client renders the events it emits.
 *
 * @typedef {import('./board.js').Config} Config
 * @typedef {import('./board.js').Cell} Cell
 * @typedef {'fresh' | 'active' | 'won' | 'lost'} Phase
 * @typedef {{ seed: number, config: Config, grid: Grid<Cell>, phase: Phase, minesPlaced: boolean, revealedSafe: number }} State
 * @typedef {{ type: 'reveal', r: number, c: number } | { type: 'flag', r: number, c: number } | { type: 'chord', r: number, c: number }} Move
 * @typedef {object} Event
 */
/**
 * The typed move-event vocabulary emitted by the session (one per effective
 * move). This is the game's public event language — consumed later by the shared
 * envelope. `type` + `r`/`c` are game meaning (classified here); `t` (injected
 * clock) and `seq` (monotonic) are stamped by `GameSession` when it emits.
 *
 * Note `flag` vs `unflag`: both come from a `flag` move — the distinction is the
 * outcome (did the toggle set or clear the flag), which only the rules can tell.
 *
 * @typedef {'reveal' | 'flag' | 'unflag' | 'chord'} MoveEventType
 * @typedef {{ type: MoveEventType, r: number, c: number, t: number, seq: number }} MoveEvent
 */
/** The move-event vocabulary as runtime data (the `MoveEvent` `type` domain). */
export const MOVE_EVENT_TYPES: readonly ["reveal", "flag", "unflag", "chord"];
/**
 * The GameRules contract consumed by GameSession/replay: init / apply / status /
 * project, plus serialize / deserialize for snapshotting. Deterministic and
 * DOM-free.
 */
export const MinesweeperRules: any;
/**
 * Minesweeper as a pure, deterministic state machine — no DOM, no wall clock.
 * `GameSession` (Layer 1) drives it; the client renders the events it emits.
 */
export type Config = import("./board.js").Config;
/**
 * Minesweeper as a pure, deterministic state machine — no DOM, no wall clock.
 * `GameSession` (Layer 1) drives it; the client renders the events it emits.
 */
export type Cell = import("./board.js").Cell;
/**
 * Minesweeper as a pure, deterministic state machine — no DOM, no wall clock.
 * `GameSession` (Layer 1) drives it; the client renders the events it emits.
 */
export type Phase = "fresh" | "active" | "won" | "lost";
/**
 * Minesweeper as a pure, deterministic state machine — no DOM, no wall clock.
 * `GameSession` (Layer 1) drives it; the client renders the events it emits.
 */
export type State = {
    seed: number;
    config: Config;
    grid: Grid<Cell>;
    phase: Phase;
    minesPlaced: boolean;
    revealedSafe: number;
};
/**
 * Minesweeper as a pure, deterministic state machine — no DOM, no wall clock.
 * `GameSession` (Layer 1) drives it; the client renders the events it emits.
 */
export type Move = {
    type: "reveal";
    r: number;
    c: number;
} | {
    type: "flag";
    r: number;
    c: number;
} | {
    type: "chord";
    r: number;
    c: number;
};
/**
 * Minesweeper as a pure, deterministic state machine — no DOM, no wall clock.
 * `GameSession` (Layer 1) drives it; the client renders the events it emits.
 */
export type Event = object;
/**
 * The typed move-event vocabulary emitted by the session (one per effective
 * move). This is the game's public event language — consumed later by the shared
 * envelope. `type` + `r`/`c` are game meaning (classified here); `t` (injected
 * clock) and `seq` (monotonic) are stamped by `GameSession` when it emits.
 *
 * Note `flag` vs `unflag`: both come from a `flag` move — the distinction is the
 * outcome (did the toggle set or clear the flag), which only the rules can tell.
 */
export type MoveEventType = "reveal" | "flag" | "unflag" | "chord";
/**
 * The typed move-event vocabulary emitted by the session (one per effective
 * move). This is the game's public event language — consumed later by the shared
 * envelope. `type` + `r`/`c` are game meaning (classified here); `t` (injected
 * clock) and `seq` (monotonic) are stamped by `GameSession` when it emits.
 *
 * Note `flag` vs `unflag`: both come from a `flag` move — the distinction is the
 * outcome (did the toggle set or clear the flag), which only the rules can tell.
 */
export type MoveEvent = {
    type: MoveEventType;
    r: number;
    c: number;
    t: number;
    seq: number;
};
import { Grid } from '../grid/grid.js';
