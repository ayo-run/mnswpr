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
    constructor(options?: {
        store?: any;
        namespace?: string;
    });
    store: any;
    namespace: string;
    getConfig(): Promise<any>;
    /**
     * @param {Object} q - { category, since, order, limit }
     * @returns {Promise<Object[]>} plain score records, best first
     */
    listScores(q: any): Promise<any[]>;
    addScore(category: any, entry: any): Promise<void>;
    archive(entry: any): Promise<void>;
}
