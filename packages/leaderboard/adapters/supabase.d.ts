/**
 * Supabase (Postgres) storage adapter for LeaderBoardService.
 *
 * You pass in a supabase-js client you constructed yourself, so this package
 * takes NO supabase dependency:
 *
 *   import { createClient } from '@supabase/supabase-js'
 *   const client = createClient(url, anonKey)
 *   const adapter = new SupabaseAdapter({ client, namespace: 'mw' })
 *
 * Expects three tables (see leaderboard/README.md for the SQL + row-level
 * security): `{ns}_scores`, `{ns}_archive`, `{ns}_config`. Column names are
 * snake_case; this adapter maps the generic entry's `playerId` <-> `player_id`.
 */
export class SupabaseAdapter {
    /**
     * @param {Object} options
     * @param {Object} options.client - a supabase-js client
     * @param {String} [options.namespace] - table prefix
     */
    constructor(options?: {
        client: any;
        namespace?: string;
    });
    client: any;
    namespace: string;
    getConfig(): Promise<any>;
    /**
     * @param {Object} q - { category, since, order, limit }
     * @returns {Promise<Object[]>} plain score records (must expose `name`, `score`)
     */
    listScores(q: any): Promise<any[]>;
    addScore(category: any, entry: any): Promise<void>;
    archive(entry: any): Promise<void>;
}
