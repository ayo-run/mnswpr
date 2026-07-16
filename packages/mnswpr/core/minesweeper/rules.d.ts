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
 * @typedef {{ seed: number, config: Config, phase: Phase, minesPlaced: boolean, revealedSafe: number, grid: { rows: number, cols: number, cells: Cell[] } }} Snapshot
 * @typedef {{ r: number, c: number, status: 'revealed', adjacent: number, mine: boolean } | { r: number, c: number, status: 'flagged' } | { r: number, c: number, status: 'hidden', mine: true }} ProjectedCell
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
export namespace MinesweeperRules {
    /**
     * @param {number} seed
     * @param {Config} config
     * @returns {State}
     */
    export function init(seed: number, config: Config): State;
    /**
     * Build a game state from an explicit, pre-built layout (as returned by
     * `generateBoard`) instead of generating one from a seed. Parallel to
     * {@link init}: it yields a `State` a `GameSession` can drive identically —
     * same rules, same transitions — the only difference being that the board is
     * fixed up front, so the opening reveal is NOT made safe (first-click safety is
     * a property of internal generation, not of a caller-supplied board). The
     * layout is validated first and a malformed one throws.
     *
     * @param {import('./board.js').Layout} layout
     * @param {{ seed?: number }} [opts] - seed is metadata only (no generation happens); defaults to 0
     * @returns {State}
     */
    export function fromLayout(layout: import("./board.js").Layout, { seed }?: {
        seed?: number;
    }): State;
    /** @param {State} state @returns {Phase} */
    export function status(state: State): Phase;
    /**
     * Fold a move into the state. Terminal states are absorbing.
     * @param {State} state
     * @param {Move} move
     * @returns {{ state: State, events: Event[] }}
     */
    export function apply(state: State, move: Move): {
        state: State;
        events: Event[];
    };
    export { project };
    /**
     * Classify an applied move into a typed move-event kind, or `null` if the move
     * was a no-op (the rules produced no events — e.g. clicking a revealed cell).
     * The session stamps the returned `{ type, r, c }` with `t` and `seq`. This is
     * the seam that turns a raw `Move` into the {@link MoveEvent} vocabulary and,
     * critically, splits a `flag` move into `flag`/`unflag` by its outcome.
     *
     * @param {Move} move
     * @param {Event[]} events - the rules events this move produced
     * @returns {{ type: MoveEventType, r: number, c: number } | null}
     */
    export function toMoveEvent(move: Move, events: Event[]): {
        type: MoveEventType;
        r: number;
        c: number;
    } | null;
    /**
     * Snapshot a game state as a plain, JSON-safe object: the whole board (every
     * cell's mine/adjacent/status, via the Layer-0 grid serializer) plus phase and
     * progress. Inverse of {@link deserialize}. The `grid` instance is the only
     * non-JSON-safe field of `State`; everything else (seed, config, flags) is
     * already plain data.
     *
     * @param {State} state
     * @returns {Snapshot}
     */
    export function serialize(state: State): Snapshot;
    /**
     * Rebuild a game state from {@link serialize} output (or its JSON round-trip).
     * Cells are cloned so the revived state shares no references with the snapshot.
     *
     * @param {Snapshot} snap
     * @returns {State}
     */
    export function deserialize(snap: Snapshot): State;
}
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
 * Minesweeper as a pure, deterministic state machine — no DOM, no wall clock.
 * `GameSession` (Layer 1) drives it; the client renders the events it emits.
 */
export type Snapshot = {
    seed: number;
    config: Config;
    phase: Phase;
    minesPlaced: boolean;
    revealedSafe: number;
    grid: {
        rows: number;
        cols: number;
        cells: Cell[];
    };
};
/**
 * Minesweeper as a pure, deterministic state machine — no DOM, no wall clock.
 * `GameSession` (Layer 1) drives it; the client renders the events it emits.
 */
export type ProjectedCell = {
    r: number;
    c: number;
    status: "revealed";
    adjacent: number;
    mine: boolean;
} | {
    r: number;
    c: number;
    status: "flagged";
} | {
    r: number;
    c: number;
    status: "hidden";
    mine: true;
};
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
/**
 * Project full state down to what a client is allowed to know: revealed cells
 * (+ their adjacency), flags, and — only once the game is over — the mines. An
 * unrevealed mine is NEVER included mid-game, so this is safe to send over a wire
 * (invariant #3). Hidden, unrevealed, non-mine cells are simply omitted.
 *
 * @param {State} state
 * @returns {{ config: Config, phase: Phase, cells: ProjectedCell[] }}
 */
declare function project(state: State): {
    config: Config;
    phase: Phase;
    cells: ProjectedCell[];
};
import { Grid } from '../grid/grid.js';
export {};
