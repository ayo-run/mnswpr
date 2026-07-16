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
    constructor(options?: {
        store?: any;
        firebaseConfig?: any;
        namespace?: string;
        emulator?: {
            host?: string;
            port?: number;
        };
    });
    namespace: string;
    store: any;
    getConfig(): Promise<import("firebase/firestore/lite").DocumentData>;
    /**
     * @param {Object} q - { category, since, order, limit }
     * @returns {Promise<Object[]>} plain score records, best first
     */
    listScores(q: any): Promise<any[]>;
    addScore(category: any, entry: any): Promise<void>;
    archive(entry: any): Promise<void>;
}
