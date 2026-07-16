/**
 * Layer 1 — owns lifecycle, the (injected) clock, and the move log; delegates all
 * game meaning to an injected `rules` object. This is where timing authority
 * lives: on the client `clock` is `Date.now` (cosmetic); on a server it is the
 * server's clock (authoritative). The session never calls a wall clock itself.
 * Future home: @cozy-games/game-session.
 *
 * @typedef {{ init: Function, apply: Function, status: Function, project: Function, serialize?: Function, deserialize?: Function, toMoveEvent?: Function }} Rules
 */
export class GameSession {
    /**
     * Rebuild a session from a {@link serialize} snapshot (or its JSON round-trip).
     * The clock is re-injected — it's a live function, not serializable — while the
     * log and timing anchors are restored so `elapsed()` resumes correctly.
     * Requires the rules to implement `deserialize`.
     *
     * @param {Rules} rules
     * @param {{ state: object, log: Array<{ move: object, t: number }>, t0: number | null, tEnd: number | null, seq?: number }} snapshot
     * @param {{ clock?: () => number }} [opts]
     * @returns {GameSession}
     */
    static deserialize(rules: Rules, snapshot: {
        state: object;
        log: Array<{
            move: object;
            t: number;
        }>;
        t0: number | null;
        tEnd: number | null;
        seq?: number;
    }, { clock }?: {
        clock?: () => number;
    }): GameSession;
    /**
     * Start from either `{ seed, config }` (the rules generate the board) or a
     * pre-built `{ state }` (e.g. a rules factory that injected an explicit board);
     * `state` wins when both are given. The session stays generic — it just holds
     * whatever state the rules produced.
     *
     * @param {Rules} rules
     * @param {{ seed?: number, config?: object, state?: object, clock?: () => number }} opts
     */
    constructor(rules: Rules, { seed, config, state, clock }: {
        seed?: number;
        config?: object;
        state?: object;
        clock?: () => number;
    });
    rules: Rules;
    clock: () => number;
    state: any;
    /** @type {Array<{ move: object, t: number }>} */
    _log: Array<{
        move: object;
        t: number;
    }>;
    _t0: number;
    _tEnd: number;
    /** @type {Set<(event: object) => void>} */
    _moveHandlers: Set<(event: object) => void>;
    _seq: number;
    /**
     * Subscribe to typed move-events — one per effective move (reveal / flag /
     * unflag / chord), each carrying `{ type, r, c, t, seq }`. Returns an
     * unsubscribe function. Pure in-process pub/sub: no DOM, no rendering. Requires
     * the rules to implement `toMoveEvent`.
     *
     * @param {(event: object) => void} handler
     * @returns {() => void} unsubscribe
     */
    onMove(handler: (event: object) => void): () => void;
    /**
     * Apply a move: stamp it, fold it through the rules, and return the projected
     * view + events + authoritative elapsed time.
     * @param {object} move
     */
    applyMove(move: object): {
        events: any;
        view: any;
        time: number;
    };
    /** @param {object} event */
    _emitMove(event: object): void;
    status(): any;
    view(): any;
    log(): {
        move: object;
        t: number;
    }[];
    /** Authoritative elapsed ms: first move → terminal move (or → now if ongoing). */
    elapsed(): number;
    /** The signed-off result, or null while the game is still in progress. */
    result(): {
        status: any;
        time: number;
        seed: any;
        config: any;
        log: {
            move: object;
            t: number;
        }[];
    };
    /**
     * Full, JSON-safe snapshot of the whole session — game state (board + per-cell
     * status, via the rules' own serializer) plus the move log and timing anchors
     * (`t0`/`tEnd`) that `elapsed()` derives from. Everything needed to later resume
     * (core-05); the live `clock` is deliberately excluded (it's re-injected on
     * {@link GameSession.deserialize}). Requires the rules to implement `serialize`.
     *
     * @returns {{ state: object, log: Array<{ move: object, t: number }>, t0: number | null, tEnd: number | null, seq: number }}
     */
    serialize(): {
        state: object;
        log: Array<{
            move: object;
            t: number;
        }>;
        t0: number | null;
        tEnd: number | null;
        seq: number;
    };
}
/**
 * Layer 1 — owns lifecycle, the (injected) clock, and the move log; delegates all
 * game meaning to an injected `rules` object. This is where timing authority
 * lives: on the client `clock` is `Date.now` (cosmetic); on a server it is the
 * server's clock (authoritative). The session never calls a wall clock itself.
 * Future home:
 */
export type Rules = {
    init: Function;
    apply: Function;
    status: Function;
    project: Function;
    serialize?: Function;
    deserialize?: Function;
    toMoveEvent?: Function;
};
