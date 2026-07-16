// @ts-check

/**
 * Firestore storage adapter for the leaderboard built on the **Admin** SDK
 * (`firebase-admin/firestore`), the server-side counterpart to
 * {@link ./firebase.js}'s `FirebaseAdapter` (which uses the **client**
 * `firebase/firestore/lite` SDK).
 *
 * Why a second adapter instead of one that takes either SDK by injection: the
 * two Firestore SDKs expose the same operations through INCOMPATIBLE shapes. The
 * client-lite SDK is a tree of free functions that take the store as an argument
 * — `doc(store, …)`, `getDoc(ref)`, `setDoc(ref, data)`, `query(coll, …)`. The
 * Admin SDK is method-based on the instance — `store.doc(path).get()`,
 * `store.collection(path).doc().set(data)`, `coll.where(…).orderBy(…).get()`.
 * There is no call-compatible intersection, so a single adapter cannot serve
 * both from the same code path. This adapter implements the SAME leaderboard
 * contract (`getConfig` / `listScores` / `addScore` / `archive`) against the
 * Admin API, so a privileged server context (e.g. a Cloud Function running the
 * ranked WRITE path that security rules deny to browsers) can reuse this exact
 * package — no fork of `@cozy-games/leaderboard`.
 *
 * Collections are IDENTICAL to `FirebaseAdapter`, so the two SDKs read and write
 * the same data: `{ns}-scores/{category}/games`, `{ns}-all/{playerId}/games`,
 * `{ns}-config/configuration`.
 *
 * ## Injection contract (methods called on the injected `store`)
 * An Admin Firestore instance (`getFirestore(adminApp)`) satisfies all of these:
 *   - `store.doc(path)` → DocumentReference
 *       - `.get()` → DocumentSnapshot (`.data()`)
 *       - `.set(data, { merge })` → Promise
 *   - `store.collection(path)` → CollectionReference (also a Query)
 *       - `.doc()` → DocumentReference with an auto-generated id
 *       - `.where(field, op, value)` / `.orderBy(field, direction)` / `.limit(n)` → Query (chainable)
 *       - `.get()` → QuerySnapshot (`.docs`, each a snapshot with `.data()`)
 *
 * The consumer ALWAYS supplies `store`; this adapter initializes no app and takes
 * no `firebase-admin` dependency of its own (keeping the package's open-core,
 * backend-agnostic boundary intact — see ADR 0001).
 */
export class FirebaseAdminAdapter {

  /**
   * @param {Object} options
   * @param {Object} [options.store] - an Admin Firestore instance (`getFirestore(adminApp)`); required (the constructor throws without it), consumer-supplied
   * @param {String} [options.namespace] - collection prefix (default `'lb'`)
   */
  constructor(options = {}) {
    if (!options.store) {
      throw new TypeError('FirebaseAdminAdapter: provide `store` (an Admin Firestore instance)')
    }
    this.store = options.store
    this.namespace = options.namespace || 'lb'
  }

  async getConfig() {
    const snapshot = await this.store.doc(`${this.namespace}-config/configuration`).get()
    return snapshot.data()
  }

  /**
   * @param {Object} q - { category, since, order, limit }
   * @returns {Promise<Object[]>} plain score records, best first
   */
  async listScores(q) {
    const games = this.store.collection(`${this.namespace}-scores/${q.category}/games`)
    if (q.since) {
      // Rolling window: Firestore requires the inequality field to sort first,
      // so fetch the in-window rows (newest first, capped) and rank by score
      // in-process. The cap is a safety bound for busy windows. Mirrors the
      // client adapter exactly.
      const snapshot = await games
        .where('time_stamp', '>=', q.since)
        .orderBy('time_stamp', 'desc')
        .limit(500)
        .get()
      const rows = snapshot.docs.map(d => d.data())
      rows.sort((a, b) => q.order === 'desc' ? b.score - a.score : a.score - b.score)
      return rows.slice(0, q.limit)
    }
    const snapshot = await games.orderBy('score', q.order).limit(q.limit).get()
    return snapshot.docs.map(d => d.data())
  }

  async addScore(category, entry) {
    await this.store.collection(`${this.namespace}-scores/${category}/games`).doc().set(entry)
  }

  async archive(entry) {
    const sessionId = new Date().toDateString().replace(/\s/g, '_')
    const gameId = new Date().toTimeString().replace(/\s/g, '_')
    const data = {}
    data[gameId] = {
      score: entry.score,
      category: entry.category,
      time_stamp: entry.time_stamp,
      ...(entry.meta || {})
    }
    await this.store.doc(`${this.namespace}-all/${entry.playerId}/games/${sessionId}`).set(data, { merge: true })
  }
}
