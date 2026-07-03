import { describe, it, expect, beforeEach } from 'vitest'
import { StorageService } from '@cozy-games/utils/storage/storage.js'

describe('StorageService', () => {
  let storage

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    storage = new StorageService()
  })

  it('round-trips an object through localStorage', () => {
    storage.saveToLocal('setting', { rows: 9, cols: 9, mines: 10 })
    expect(storage.getFromLocal('setting')).toEqual({ rows: 9, cols: 9, mines: 10 })
  })

  it('round-trips an object through sessionStorage', () => {
    storage.saveToSession('setting', { id: 'beginner' })
    expect(storage.getFromSession('setting')).toEqual({ id: 'beginner' })
  })

  it('returns null for a missing key', () => {
    expect(storage.getFromLocal('missing')).toBeNull()
  })

  it('treats a stored undefined as undefined, not a thrown parse error', () => {
    storage.saveToLocal('setting', undefined)
    expect(storage.getFromLocal('setting')).toBeUndefined()
  })
})
