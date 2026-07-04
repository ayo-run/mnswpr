// @ts-check
import { describe, it, expect, vi } from 'vitest'
import { SupabaseAdapter } from '../adapters/supabase.js'

// A chainable stand-in for a supabase-js client (consumer-constructed — the
// package takes no supabase dependency). A privileged/service-role client is
// supplied the same way.
function mockClient() {
  const insert = vi.fn(async () => ({ error: null }))
  const from = vi.fn(() => ({ insert }))
  return { from, insert }
}

describe('SupabaseAdapter — consumer-supplied client (injection point exists)', () => {
  it('uses the injected client as-is', () => {
    const client = mockClient()
    const adapter = new SupabaseAdapter({ client, namespace: 'mw' })
    expect(adapter.client).toBe(client)
  })

  it('performs a write through the injected client', async () => {
    const client = mockClient()
    const adapter = new SupabaseAdapter({ client, namespace: 'mw' })

    await adapter.addScore('beginner', {
      name: 'A', playerId: 'p1', score: 5, category: 'beginner', time_stamp: 't'
    })

    expect(client.from).toHaveBeenCalledWith('mw_scores')
    expect(client.insert).toHaveBeenCalledTimes(1)
    expect(client.insert.mock.calls[0][0]).toMatchObject({ name: 'A', player_id: 'p1', score: 5 })
  })

  it('archives through the injected client', async () => {
    const client = mockClient()
    const adapter = new SupabaseAdapter({ client, namespace: 'mw' })
    await adapter.archive({ playerId: 'p1', score: 9, category: 'beginner', time_stamp: 't' })
    expect(client.from).toHaveBeenCalledWith('mw_archive')
    expect(client.insert.mock.calls[0][0]).toMatchObject({ player_id: 'p1', score: 9 })
  })

  it('surfaces backend errors from the injected client', async () => {
    const insert = vi.fn(async () => ({ error: new Error('permission denied') }))
    const client = { from: vi.fn(() => ({ insert })) }
    const adapter = new SupabaseAdapter({ client, namespace: 'mw' })
    await expect(adapter.addScore('beginner', { playerId: 'p' })).rejects.toThrow('permission denied')
  })
})
