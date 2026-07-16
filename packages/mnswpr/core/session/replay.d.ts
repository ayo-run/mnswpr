/**
 * Deterministically re-run a submitted game from `{ seed, config, log }` and
 * report the authoritative outcome. A server calls this at submit time to verify
 * a score without trusting the client: it recomputes the result and time from the
 * moves, and rejects logs that don't terminate or whose timestamps aren't
 * monotonic. (The "verifiable-replay" anti-cheat path — no live server needed.)
 *
 * @param {{ init: Function, apply: Function, status: Function }} rules
 * @param {{ seed: number, config: object, log: Array<{ move: object, t: number }> }} submission
 * @returns {{ status: string, time: number, valid: boolean, reason: string | null }}
 */
export function replay(rules: {
    init: Function;
    apply: Function;
    status: Function;
}, { seed, config, log }: {
    seed: number;
    config: object;
    log: Array<{
        move: object;
        t: number;
    }>;
}): {
    status: string;
    time: number;
    valid: boolean;
    reason: string | null;
};
