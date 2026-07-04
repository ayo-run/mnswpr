// @ts-check
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Stub the firebase SDK at the adapter boundary so no real app/network is touched.
const fb = vi.hoisted(() => ({
  initializeApp: vi.fn(() => ({ __app: true })),
  getFirestore: vi.fn(() => ({ __internalStore: true })),
  connectFirestoreEmulator: vi.fn(),
  doc: vi.fn((...args) => ({ __ref: args })),
  getDoc: vi.fn(async () => ({ data: () => ({ passingStatus: 'ok' }) })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  setDoc: vi.fn(async () => {}),
  collection: vi.fn((...args) => ({ __col: args })),
  query: vi.fn((...args) => ({ __q: args })),
  where: vi.fn((...args) => ({ __where: args })),
  orderBy: vi.fn((...args) => ({ __order: args })),
  limit: vi.fn((...args) => ({ __limit: args }))
}))

vi.mock('firebase/app', () => ({ initializeApp: fb.initializeApp }))
vi.mock('firebase/firestore/lite', () => ({
  getFirestore: fb.getFirestore,
  connectFirestoreEmulator: fb.connectFirestoreEmulator,
  doc: fb.doc,
  getDoc: fb.getDoc,
  getDocs: fb.getDocs,
  setDoc: fb.setDoc,
  collection: fb.collection,
  query: fb.query,
  where: fb.where,
  orderBy: fb.orderBy,
  limit: fb.limit
}))

import { FirebaseAdapter } from '../adapters/firebase.js'

beforeEach(() => vi.clearAllMocks())

describe('FirebaseAdapter — consumer-supplied (injected) store', () => {
  it('uses an injected store as-is and initializes nothing', () => {
    // Stand-in for a privileged / server-side Firestore instance.
    const store = { __adminStore: true }
    const adapter = new FirebaseAdapter({ store, namespace: 'mw' })
    expect(adapter.store).toBe(store)
    expect(fb.initializeApp).not.toHaveBeenCalled()
    expect(fb.getFirestore).not.toHaveBeenCalled()
  })

  it('performs a write through the injected store', async () => {
    const store = { __adminStore: true }
    const adapter = new FirebaseAdapter({ store, namespace: 'mw' })
    const entry = { name: 'A', score: 42, category: 'beginner', time_stamp: 123 }

    await adapter.addScore('beginner', entry)

    // The collection was built from OUR store, and the entry was written.
    expect(fb.collection).toHaveBeenCalledWith(store, 'mw-scores', 'beginner', 'games')
    expect(fb.setDoc).toHaveBeenCalledTimes(1)
    expect(fb.setDoc.mock.calls[0][1]).toEqual(entry)
  })

  it('archives through the injected store', async () => {
    const store = { __adminStore: true }
    const adapter = new FirebaseAdapter({ store, namespace: 'mw' })
    await adapter.archive({ playerId: 'p1', score: 9, category: 'beginner', time_stamp: 5 })
    expect(fb.doc).toHaveBeenCalledWith(store, 'mw-all', 'p1', 'games', expect.any(String))
    expect(fb.setDoc).toHaveBeenCalledTimes(1)
  })

  it('does not auto-connect the emulator for an injected store (consumer owns it)', () => {
    new FirebaseAdapter({ store: { __s: 1 }, namespace: 'mw', emulator: { host: 'x', port: 1 } })
    expect(fb.connectFirestoreEmulator).not.toHaveBeenCalled()
  })

  it('prefers the injected store when both store and firebaseConfig are given', () => {
    const store = { __adminStore: true }
    const adapter = new FirebaseAdapter({ store, firebaseConfig: { projectId: 'p' } })
    expect(adapter.store).toBe(store)
    expect(fb.initializeApp).not.toHaveBeenCalled()
  })
})

describe('FirebaseAdapter — internal init (existing path, unbroken)', () => {
  it('still initializes its own store from firebaseConfig and writes', async () => {
    const adapter = new FirebaseAdapter({ firebaseConfig: { projectId: 'p' }, namespace: 'mw' })
    expect(fb.initializeApp).toHaveBeenCalledWith({ projectId: 'p' })
    expect(fb.getFirestore).toHaveBeenCalledTimes(1)
    expect(adapter.store).toEqual({ __internalStore: true })

    await adapter.addScore('beginner', { score: 1 })
    expect(fb.setDoc).toHaveBeenCalledTimes(1)
  })

  it('still connects the emulator when configured', () => {
    new FirebaseAdapter({ firebaseConfig: {}, emulator: { host: '127.0.0.1', port: 8080 } })
    expect(fb.connectFirestoreEmulator).toHaveBeenCalledWith({ __internalStore: true }, '127.0.0.1', 8080)
  })

  it('throws a clear error when neither store nor firebaseConfig is given', () => {
    expect(() => new FirebaseAdapter({})).toThrow(TypeError)
  })
})
