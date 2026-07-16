/**
 * The WRITE surface of the leaderboard: submitting a completed game — the
 * personal archive plus, if it qualifies, a ranked entry with denormalized
 * day/week/month bucket keys. Importable WITHOUT any read/render code — no DOM,
 * no list rendering, no `listScores` — so a consumer can wire writes to a
 * separate, more-privileged backend instance (leaderboard-01) and pull in none
 * of the read surface.
 *
 * The WRITE side calls `adapter.archive` (optional) and `adapter.addScore`; it
 * also reads the ranking `config` once (an adapter call, not read/render code)
 * to power the default qualifier.
 */
export class LeaderBoardWriter {
    /**
     * @param {Object} options
     * @param {Object} options.adapter - storage backend; the WRITE side uses `addScore`, optional `archive`, and `getConfig`
     * @param {(entry: Object) => boolean} [options.qualifies] - whether an entry is ranked; defaults to server passingStatus vs entry.status
     */
    constructor(options?: {
        adapter: any;
        qualifies?: (entry: any) => boolean;
    });
    adapter: any;
    qualifies: (entry: any) => boolean;
    configuration: any;
    /**
     * Default ranking gate: if the server config names a `passingStatus`, only
     * entries whose `status` matches qualify; otherwise every entry qualifies.
     */
    _defaultQualifies(entry: any): boolean;
    /**
     * Submit a completed game. Always archives it (personal history); if it
     * qualifies, also writes a ranked entry with denormalized bucket keys. Both
     * writes go through the adapter, so the storage backend is pluggable. The
     * caller owns display-name/nickname UX.
     * @param {Object} entry - { name, playerId, score, category, time_stamp, status?, meta? }
     */
    submit(entry: any): Promise<void>;
}
