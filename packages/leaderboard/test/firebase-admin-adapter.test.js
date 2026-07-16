// @ts-check
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FirebaseAdminAdapter } from '../adapters/firebase-admin.js'

/**
 * A faithful stand-in for a `firebase-admin/firestore` instance: METHOD-based
 * (`store.doc(path).get()`, `store.collection(path).doc().set()`, chained
 * `where`/`orderBy`/`limit().get()`) — unlike the client-lite SDK's free
 * functions. Records every call and path so we can assert the adapter drives the
 * Admin API correctly. `queryDocs` is what a collection `.get()` returns.
 */
function makeAdminStore(queryDocs = []) {
  const calls = { collectionPaths: [], docPaths: [], where: [], orderBy: [], limit: [], sets: [], autoDocs: 0, gets: 0 }

  const autoDoc = {
    set: vi.fn(async (data) => { calls.sets.push({ via: 'collection.doc', data }) })
  }

  function makeCollection() {
    const col = {
      where: vi.fn((...a) => { calls.where.push(a); return col }),
      orderBy: vi.fn((...a) => { calls.orderBy.push(a); return col }),
      limit: vi.fn((...a) => { calls.limit.push(a); return col }),
      get: vi.fn(async () => { calls.gets++; return { docs: queryDocs.map(d => ({ data: () => d })) } }),
      doc: vi.fn(() => { calls.autoDocs++; return autoDoc })
    }
    return col
  }

  function makeDoc(path) {
    return {
      get: vi.fn(async () => ({ data: () => ({ passingStatus: 'ok' }), exists: true })),
      set: vi.fn(async (data, opts) => { calls.sets.push({ via: 'doc', path, data, opts }) })
    }
  }

  const store = {
    collection: vi.fn((path) => { calls.collectionPaths.push(path); return makeCollection() }),
    doc: vi.fn((path) => { calls.docPaths.push(path); return makeDoc(path) })
  }

  return { store, calls, autoDoc }
}

describe('FirebaseAdminAdapter — Admin (method-based) injected store', () => {
  it('requires an injected store', () => {
    expect(() => new FirebaseAdminAdapter({})).toThrow(TypeError)
  })

  it('defaults the namespace to "lb"', () => {
    const { store } = makeAdminStore()
    expect(new FirebaseAdminAdapter({ store }).namespace).toBe('lb')
  })

  it('reads config from {ns}-config/configuration via store.doc().get()', async () => {
    const { store, calls } = makeAdminStore()
    const adapter = new FirebaseAdminAdapter({ store, namespace: 'mw' })
    const config = await adapter.getConfig()
    expect(calls.docPaths).toEqual(['mw-config/configuration'])
    expect(config).toEqual({ passingStatus: 'ok' })
  })

  it('lists all-time scores ordered by score, capped at limit', async () => {
    const docs = [{ name: 'A', score: 5 }, { name: 'B', score: 9 }]
    const { store, calls } = makeAdminStore(docs)
    const adapter = new FirebaseAdminAdapter({ store, namespace: 'mw' })

    const rows = await adapter.listScores({ category: 'beginner', since: null, order: 'asc', limit: 10 })

    expect(calls.collectionPaths).toEqual(['mw-scores/beginner/games'])
    expect(calls.orderBy).toEqual([['score', 'asc']])
    expect(calls.limit).toEqual([[10]])
    expect(calls.where).toEqual([]) // no time filter on the all-time window
    expect(rows).toEqual(docs)
  })

  it('lists a rolling window: filters by time_stamp, then ranks by score in-process and slices to limit', async () => {
    // Returned newest-first by the query; the adapter must re-rank by score and
    // slice to `limit` (here 2), exactly like the client adapter.
    const windowDocs = [{ score: 3 }, { score: 8 }, { score: 1 }, { score: 5 }]
    const { store, calls } = makeAdminStore(windowDocs)
    const adapter = new FirebaseAdminAdapter({ store, namespace: 'mw' })
    const since = new Date('2026-07-01T00:00:00Z')

    const rows = await adapter.listScores({ category: 'expert', since, order: 'desc', limit: 2 })

    expect(calls.collectionPaths).toEqual(['mw-scores/expert/games'])
    expect(calls.where).toEqual([['time_stamp', '>=', since]])
    expect(calls.orderBy).toEqual([['time_stamp', 'desc']])
    expect(calls.limit).toEqual([[500]])
    // desc → highest score first, top 2
    expect(rows).toEqual([{ score: 8 }, { score: 5 }])
  })

  it('writes a ranked score to an auto-id doc under {ns}-scores/{category}/games', async () => {
    const { store, calls, autoDoc } = makeAdminStore()
    const adapter = new FirebaseAdminAdapter({ store, namespace: 'mw' })
    const entry = { name: 'A', score: 42, category: 'beginner', time_stamp: 123 }

    await adapter.addScore('beginner', entry)

    expect(calls.collectionPaths).toEqual(['mw-scores/beginner/games'])
    expect(calls.autoDocs).toBe(1)
    expect(autoDoc.set).toHaveBeenCalledWith(entry)
  })

  it('archives to {ns}-all/{playerId}/games/{session} with merge', async () => {
    const { store, calls } = makeAdminStore()
    const adapter = new FirebaseAdminAdapter({ store, namespace: 'mw' })

    await adapter.archive({ playerId: 'p1', score: 9, category: 'beginner', time_stamp: 5, meta: { isMobile: true } })

    const set = calls.sets.find(s => s.via === 'doc')
    expect(set).toBeTruthy()
    expect(set.path).toMatch(/^mw-all\/p1\/games\//)
    expect(set.opts).toEqual({ merge: true })
    // one gameId key, carrying the score + merged meta
    const gameEntry = Object.values(set.data)[0]
    expect(gameEntry).toMatchObject({ score: 9, category: 'beginner', time_stamp: 5, isMobile: true })
  })
})

beforeEach(() => vi.clearAllMocks())
