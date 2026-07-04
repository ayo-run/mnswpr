import { initializeApp } from 'firebase/app'
import {
  getFirestore, connectFirestoreEmulator,
  doc, getDoc, getDocs, setDoc, collection, query, where, orderBy, limit
} from 'firebase/firestore/lite'

/**
 * Firestore storage adapter for LeaderBoardService. Requires the `firebase`
 * peer dependency. Collections are namespaced: `{ns}-scores/{category}/games`,
 * `{ns}-all/{playerId}/games`, and `{ns}-config/configuration`.
 */
export class FirebaseAdapter {

  /**
   * Supply EITHER a ready Firestore instance via `store` (the injection point —
   * e.g. a privileged/server-side setup, or an app you already initialized), OR a
   * `firebaseConfig` for the package to initialize its own app. `store` wins when
   * both are given; with an injected store the package initializes nothing and
   * owns no app lifecycle (so `emulator` — a convenience of internal init — is
   * ignored; wire the emulator into your own store).
   *
   * @param {Object} options
   * @param {Object} [options.store] - a Firestore instance to use as-is (injection point)
   * @param {Object} [options.firebaseConfig] - Firebase app config for internal init (public; access governed by security rules)
   * @param {String} [options.namespace] - collection prefix
   * @param {{ host?: string, port?: number }} [options.emulator] - point the internally-created store at a local Firestore emulator (dev/test only)
   */
  constructor(options = {}) {
    this.namespace = options.namespace || 'lb'
    if (options.store) {
      this.store = options.store
      return
    }
    if (!options.firebaseConfig) {
      throw new TypeError('FirebaseAdapter: provide either `store` (a Firestore instance) or `firebaseConfig`')
    }
    const app = initializeApp(options.firebaseConfig)
    this.store = getFirestore(app)
    if (options.emulator) {
      const { host = '127.0.0.1', port = 8080 } = options.emulator
      connectFirestoreEmulator(this.store, host, port)
    }
  }

  async getConfig() {
    const ref = doc(this.store, `${this.namespace}-config`, 'configuration')
    const snapshot = await getDoc(ref)
    return snapshot.data()
  }

  /**
   * @param {Object} q - { category, since, order, limit }
   * @returns {Promise<Object[]>} plain score records, best first
   */
  async listScores(q) {
    const games = collection(this.store, `${this.namespace}-scores`, q.category, 'games')
    if (q.since) {
      // Rolling window: Firestore requires the inequality field to sort first,
      // so fetch the in-window rows (newest first, capped) and rank by score
      // client-side. The cap is a safety bound for busy windows.
      const snapshot = await getDocs(query(
        games, where('time_stamp', '>=', q.since), orderBy('time_stamp', 'desc'), limit(500)
      ))
      const rows = snapshot.docs.map(d => d.data())
      rows.sort((a, b) => q.order === 'desc' ? b.score - a.score : a.score - b.score)
      return rows.slice(0, q.limit)
    }
    const snapshot = await getDocs(query(games, orderBy('score', q.order), limit(q.limit)))
    return snapshot.docs.map(d => d.data())
  }

  async addScore(category, entry) {
    const ref = doc(collection(this.store, `${this.namespace}-scores`, category, 'games'))
    await setDoc(ref, entry)
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
    const ref = doc(this.store, `${this.namespace}-all`, entry.playerId, 'games', sessionId)
    await setDoc(ref, data, { merge: true })
  }
}
