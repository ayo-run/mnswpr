// @ts-check

/**
 * Deterministic, seedable PRNG (mulberry32). A given seed always yields the same
 * sequence — this is what makes board generation reproducible and `replay()`
 * possible. Uses `Math.imul` (integer math), NOT `Math.random`, so it stays
 * inside the determinism guard.
 *
 * @param {number} seed - any 32-bit integer
 * @returns {() => number} a function returning floats in [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Integer in [0, n) from an rng function.
 * @param {() => number} rng
 * @param {number} n
 */
export function randInt(rng, n) {
  return Math.floor(rng() * n)
}
