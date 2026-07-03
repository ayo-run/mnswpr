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
  constructor(options = {}) {
    this.client = options.client
    this.namespace = options.namespace || 'lb'
  }

  async getConfig() {
    const { data } = await this.client
      .from(`${this.namespace}_config`)
      .select('*')
      .eq('id', 'configuration')
      .maybeSingle()
    return data || undefined
  }

  /**
   * @param {Object} q - { category, since, order, limit }
   * @returns {Promise<Object[]>} plain score records (must expose `name`, `score`)
   */
  async listScores(q) {
    let builder = this.client
      .from(`${this.namespace}_scores`)
      .select('*')
      .eq('category', q.category)
    // Rolling window: Postgres does the range + order + limit server-side.
    if (q.since) builder = builder.gte('time_stamp', q.since.toISOString())
    const { data, error } = await builder
      .order('score', { ascending: q.order === 'asc' })
      .limit(q.limit)
    if (error) throw error
    return data || []
  }

  async addScore(category, entry) {
    const { error } = await this.client.from(`${this.namespace}_scores`).insert({
      name: entry.name,
      player_id: entry.playerId,
      score: entry.score,
      category: entry.category,
      time_stamp: entry.time_stamp,
      day: entry.day,
      week: entry.week,
      month: entry.month,
      meta: entry.meta || null
    })
    if (error) throw error
  }

  async archive(entry) {
    const { error } = await this.client.from(`${this.namespace}_archive`).insert({
      player_id: entry.playerId,
      score: entry.score,
      category: entry.category,
      time_stamp: entry.time_stamp,
      meta: entry.meta || null
    })
    if (error) throw error
  }
}
