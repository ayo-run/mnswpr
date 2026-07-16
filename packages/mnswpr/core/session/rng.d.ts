/**
 * Deterministic, seedable PRNG (mulberry32). A given seed always yields the same
 * sequence — this is what makes board generation reproducible and `replay()`
 * possible. Uses `Math.imul` (integer math), NOT `Math.random`, so it stays
 * inside the determinism guard.
 *
 * @param {number} seed - any 32-bit integer
 * @returns {() => number} a function returning floats in [0, 1)
 */
export function mulberry32(seed: number): () => number;
/**
 * Integer in [0, n) from an rng function.
 * @param {() => number} rng
 * @param {number} n
 */
export function randInt(rng: () => number, n: number): number;
