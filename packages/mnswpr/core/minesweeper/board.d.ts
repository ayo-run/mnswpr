/**
 * The set of cells kept mine-free for first-click safety: the clicked cell, plus
 * its 8 neighbors when the board has room for all mines outside that 3x3. Falls
 * back to just the clicked cell on boards too dense to spare the neighborhood.
 *
 * @param {Config} config
 * @returns {Set<number>} coordinate keys (r * cols + c)
 */
export function excludeAround(config: Config, r: any, c: any): Set<number>;
/**
 * Deterministically place mines and compute adjacency counts, mutating the grid
 * in place. Pure function of (seed, config, exclude) — same inputs, same board.
 * Thin convenience wrapper over {@link fillMines} that builds the RNG from a seed.
 *
 * @param {number} seed
 * @param {Config} config
 * @param {Set<number>} exclude - coordinate keys never to mine (first-click safety)
 * @param {import('../grid/grid.js').Grid<Cell>} grid
 * @returns {Set<number>} the mined coordinate keys
 */
export function placeMines(seed: number, config: Config, exclude: Set<number>, grid: import("../grid/grid.js").Grid<Cell>): Set<number>;
/**
 * The injected-RNG seam under {@link placeMines}: place mines and compute
 * adjacency counts, mutating the grid in place. Takes an rng function (any
 * `() => [0, 1)`), so callers own determinism — same rng sequence, same board.
 *
 * @param {() => number} rng
 * @param {Config} config
 * @param {Set<number>} exclude - coordinate keys never to mine (first-click safety)
 * @param {import('../grid/grid.js').Grid<Cell>} grid
 * @returns {Set<number>} the mined coordinate keys
 */
export function fillMines(rng: () => number, config: Config, exclude: Set<number>, grid: import("../grid/grid.js").Grid<Cell>): Set<number>;
/**
 * Assert a plain layout object (as produced by {@link generateBoard}) is
 * well-formed before it's injected into a game: correct dimensions, cell shape,
 * a mine count that matches its own cells, and in-bounds mine positions. Throws a
 * clear error on the first problem so a malformed board can't silently corrupt
 * win detection or adjacency. Returns the layout for convenient chaining.
 *
 * @param {unknown} layout
 * @returns {Layout}
 */
export function validateLayout(layout: unknown): Layout;
/**
 * Pure, Node-runnable board generation: given a size, a mine count, and an
 * injected RNG, produce a plain layout object — no DOM, no I/O, no `Grid` class
 * leaking out. This is the headless entry point behind `@cozy-games/mnswpr/core`;
 * the DOM client reaches the same generator lazily through `MinesweeperRules`.
 *
 * The injected `rng` is the determinism seam: the same rng sequence always
 * yields the same layout. `seed` is a convenience — when no `rng` is given it is
 * wrapped with {@link mulberry32}, keeping generation reproducible and free of
 * `Math.random` (invariant #4).
 *
 * First-move safety: pass `safeCell: { r, c }` to guarantee that cell is never a
 * mine — the coordinate-friendly front door to the low-level `exclude` set, so
 * callers don't have to know the `r * cols + c` key encoding. It merges with any
 * `exclude` given, and the capacity check below rejects layouts where the mines
 * can't fit once it's carved out. For 3x3 first-click *flood* safety (the clicked
 * cell plus its 8 neighbors), see {@link excludeAround}.
 *
 * @param {number} rows - number of rows (board height)
 * @param {number} cols - number of columns (board width)
 * @param {number} mines - number of mines to place
 * @param {{ rng?: () => number, seed?: number, exclude?: Set<number>, safeCell?: { r: number, c: number } }} [options]
 * @returns {Layout} a plain, serializable layout object
 */
export function generateBoard(rows: number, cols: number, mines: number, { rng, seed, exclude, safeCell }?: {
    rng?: () => number;
    seed?: number;
    exclude?: Set<number>;
    safeCell?: {
        r: number;
        c: number;
    };
}): Layout;
export type Config = {
    rows: number;
    cols: number;
    mines: number;
    id?: string;
};
export type Cell = {
    mine: boolean;
    adjacent: number;
    status: "hidden" | "flagged" | "revealed";
};
export type LayoutCell = {
    mine: boolean;
    adjacent: number;
};
export type Layout = {
    rows: number;
    cols: number;
    mines: number;
    cells: LayoutCell[][];
    mineLocations: [number, number][];
};
