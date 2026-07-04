// @ts-check

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
export function replay(rules, { seed, config, log }) {
  let state = rules.init(seed, config)
  let monotonic = true
  let prevT = -Infinity
  let t0 = null
  let tEnd = null

  for (const { move, t } of log) {
    if (t < prevT) monotonic = false
    prevT = t
    const before = rules.status(state)
    state = rules.apply(state, move).state
    const after = rules.status(state)
    if (before === 'fresh' && after !== 'fresh' && t0 === null) t0 = t
    if ((after === 'won' || after === 'lost') && tEnd === null) tEnd = t
  }

  const status = rules.status(state)
  const terminal = status === 'won' || status === 'lost'
  const time = t0 !== null && tEnd !== null ? tEnd - t0 : 0
  const valid = monotonic && terminal
  const reason = valid
    ? null
    : !monotonic
      ? 'non-monotonic timestamps'
      : 'log does not reach a terminal state'
  return { status, time, valid, reason }
}
