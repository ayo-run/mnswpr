// @ts-check
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { LeaderBoardReader } from '../leaderboard-read.js'
import { LeaderBoardWriter } from '../leaderboard-write.js'
import { LeaderBoardService } from '../leader-board.js'

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = (file) => readFileSync(join(pkgDir, file), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '') // strip block comments
  .replace(/\/\/.*$/gm, '')          // strip line comments

describe('read/write surface separation — imports', () => {
  it('the READ module pulls in no write-path code', () => {
    const code = source('leaderboard-read.js')
    // no import of the write module or its unique dependency (bucket keys)
    expect(code).not.toMatch(/from\s+['"][^'"]*leaderboard-write/)
    expect(code).not.toMatch(/date-bucket|buckets/)
    // no write operations
    expect(code).not.toMatch(/\bsubmit\b|\baddScore\b|\barchive\b/)
  })

  it('the WRITE module pulls in no read/render code', () => {
    const code = source('leaderboard-write.js')
    expect(code).not.toMatch(/from\s+['"][^'"]*leaderboard-read/)
    // no DOM / rendering / listing
    expect(code).not.toMatch(/\bdocument\b|\brender\b|\blistScores\b|createElement/)
  })
})

describe('read surface — usable standalone (no writes)', () => {
  it('renders a ranked list via listScores and never calls write methods', async () => {
    const listScores = vi.fn(async () => [{ name: 'Ada', score: 10 }, { name: 'Bo', score: 20 }])
    // A deliberately read-only adapter: no addScore/archive at all.
    const adapter = { listScores }
    const reader = new LeaderBoardReader({ adapter, scoreOrder: 'asc', formatScore: String })

    const el = await reader.render('beginner', 'Best Times')
    expect(el.querySelector('h3')).toBeTruthy()          // heading rendered
    expect(el.querySelectorAll('button')).toHaveLength(4) // four duration tabs
    expect(listScores).toHaveBeenCalledTimes(1)           // 'today' window loaded once

    // The list fills asynchronously — wait for the rows to appear (names use innerHTML).
    await vi.waitFor(() => {
      expect(el.textContent).toContain('Ada')
      expect(el.textContent).toContain('Bo')
    })

    // Reader exposes no write API.
    expect(typeof (/** @type {any} */ (reader).submit)).toBe('undefined')
  })
})

describe('write surface — usable standalone with an injected instance', () => {
  it('submits a completed game through the injected adapter (archive + ranked write)', async () => {
    const archive = vi.fn(async () => {})
    const addScore = vi.fn(async () => {})
    // Injected, write-capable adapter (no listScores/render needed).
    const adapter = { archive, addScore }
    const writer = new LeaderBoardWriter({ adapter })

    await writer.submit({
      name: 'Ada', playerId: 'p1', score: 42, category: 'beginner', time_stamp: Date.UTC(2026, 6, 3)
    })

    expect(archive).toHaveBeenCalledTimes(1)
    expect(addScore).toHaveBeenCalledTimes(1)
    const [category, doc] = addScore.mock.calls[0]
    expect(category).toBe('beginner')
    expect(doc).toMatchObject({ name: 'Ada', playerId: 'p1', score: 42 })
    // denormalized bucket keys are computed on the write side
    expect(doc).toEqual(expect.objectContaining({ day: expect.any(String), week: expect.any(String), month: expect.any(String) }))

    // Writer exposes no read/render API.
    expect(typeof (/** @type {any} */ (writer).render)).toBe('undefined')
  })

  it('honors an explicit qualifies gate (skips the ranked write, still archives)', async () => {
    const archive = vi.fn(async () => {})
    const addScore = vi.fn(async () => {})
    const writer = new LeaderBoardWriter({ adapter: { archive, addScore }, qualifies: () => false })
    await writer.submit({ playerId: 'p1', score: 1, category: 'beginner', time_stamp: 0 })
    expect(archive).toHaveBeenCalledTimes(1)
    expect(addScore).not.toHaveBeenCalled()
  })
})

describe('facade — combined surface unchanged (regression)', () => {
  it('LeaderBoardService delegates render (read) and submit (write)', async () => {
    const listScores = vi.fn(async () => [{ name: 'Ada', score: 10 }])
    const archive = vi.fn(async () => {})
    const addScore = vi.fn(async () => {})
    const adapter = { listScores, archive, addScore }
    const service = new LeaderBoardService({ adapter, formatScore: String })

    // read
    const el = await service.render('beginner', 'Best')
    expect(el.querySelector('h3')).toBeTruthy()
    expect(listScores).toHaveBeenCalled()
    await vi.waitFor(() => expect(el.textContent).toContain('Ada'))

    // write
    await service.submit({ name: 'Ada', playerId: 'p1', score: 5, category: 'beginner', time_stamp: 0 })
    expect(addScore).toHaveBeenCalledTimes(1)

    // composed surfaces are reachable
    expect(service.reader).toBeInstanceOf(LeaderBoardReader)
    expect(service.writer).toBeInstanceOf(LeaderBoardWriter)
  })
})
