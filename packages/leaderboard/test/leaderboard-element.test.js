// @ts-check
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { configureLeaderboard } from '../leaderboard-element.js'

/**
 * Characterization tests for <cozy-leaderboard>: every externally observable
 * behavior of the element, written against the element's public surface only
 * (attributes, properties, produced DOM, adapter calls) so the implementation
 * can be refactored while this suite stays green.
 *
 * Two behaviors are deliberately NOT pinned here:
 *  - entry names render via innerHTML today (an XSS hazard); only the text is
 *    asserted, so a safe text rendering also passes.
 *  - score-order / format attribute CHANGES after the first mount are silently
 *    ignored today (the per-element service caches its config); honoring them
 *    is an allowed improvement.
 */

const DEFAULT_EMPTY_MESSAGES = [
  'Be the first to enter the leader board!',
  'No scores yet — claim the top spot!',
  'This board is wide open. Conquer it!',
  'No champions here yet. Will it be you?',
  'Blank slate — set the score to beat!',
  'Nobody\'s here yet. Be the first!',
  'The top spot is up for grabs. Take it!',
  'Empty board. Time to make your mark!'
]

const makeAdapter = (rows = [], overrides = {}) => ({
  listScores: vi.fn(async () => rows),
  addScore: vi.fn(async () => {}),
  archive: vi.fn(async () => {}),
  getConfig: vi.fn(async () => undefined),
  ...overrides
})

// Reset every shared-config key; `undefined` falls through all fallback chains.
const resetSharedConfig = () => configureLeaderboard({
  adapter: undefined,
  scoreOrder: undefined,
  format: undefined,
  formatScore: undefined,
  qualifies: undefined,
  labels: undefined,
  tooltips: undefined,
  emptyMessages: undefined,
  loadingText: undefined,
  errorText: undefined,
  anonymousName: undefined
})

/**
 * Create a disconnected element, apply attributes and per-element override
 * properties (they must be set before connect), then connect it — the
 * documented composition flow.
 */
const mount = (attrs = {}, props = {}) => {
  const el = /** @type {any} */ (document.createElement('cozy-leaderboard'))
  Object.entries(attrs).forEach(([name, value]) => el.setAttribute(name, value))
  Object.assign(el, props)
  document.body.append(el)
  return el
}

const tabButtons = el => [...el.querySelectorAll('button')]
const tabByLabel = (el, label) => tabButtons(el).find(b => b.textContent === label)
const rowsText = el => el.textContent

beforeEach(() => resetSharedConfig())
afterEach(() => { document.body.innerHTML = '' })

describe('unconfigured state', () => {
  it('renders the not-configured message when no adapter exists anywhere', async () => {
    const el = mount({ category: 'beginner', title: 'Best Times' })
    await vi.waitFor(() => {
      const em = el.querySelector('em')
      expect(em).toBeTruthy()
      expect(em.textContent).toBe('Leaderboard not configured.')
    })
  })

  it('mounts the board when configureLeaderboard() supplies an adapter later', async () => {
    const el = mount({ category: 'beginner', title: 'Best Times' })
    await vi.waitFor(() => expect(el.textContent).toContain('Leaderboard not configured.'))

    const adapter = makeAdapter([{ name: 'Ada', score: 3 }])
    configureLeaderboard({ adapter })
    await vi.waitFor(() => {
      expect(el.querySelector('h3')).toBeTruthy()
      expect(rowsText(el)).toContain('Ada')
    })
  })
})

describe('board structure', () => {
  it('renders heading, four duration tabs with tooltips, and ranked rows', async () => {
    const adapter = makeAdapter([
      { name: 'Ada', score: 3 },
      { name: 'Bo', score: 5 }
    ])
    const el = mount({ category: 'beginner', title: 'Best Times' }, { adapter })

    await vi.waitFor(() => expect(rowsText(el)).toContain('Ada'))

    const heading = el.querySelector('h3')
    expect(heading.textContent).toBe('Best Times')

    const tabs = tabButtons(el)
    expect(tabs.map(t => t.textContent)).toEqual(['Today', 'Week', 'Month', 'All Time'])
    expect(tabs.map(t => t.getAttribute('title'))).toEqual([
      'Last 24 hours', 'Last 7 days', 'Last 30 days', 'All time'
    ])
    tabs.forEach(t => expect(t.type).toBe('button'))

    // Ranked rows: index, name (with hover title), formatted score.
    expect(rowsText(el)).toContain('#1')
    expect(rowsText(el)).toContain('#2')
    expect(rowsText(el)).toContain('3')
    expect(rowsText(el)).toContain('5')
    const nameCells = [...el.querySelectorAll('[title="Ada"], [title="Bo"]')]
    expect(nameCells).toHaveLength(2)
  })

  it('shows the loading text while the query is in flight', async () => {
    let resolve
    const adapter = makeAdapter([], {
      listScores: vi.fn(() => new Promise(r => { resolve = r }))
    })
    const el = mount({ category: 'beginner', title: 'Best Times' }, { adapter })

    await vi.waitFor(() => expect(rowsText(el)).toContain('Loading…'))
    expect(el.querySelector('h3')).toBeTruthy() // heading + tabs render before data

    resolve([{ name: 'Ada', score: 3 }])
    await vi.waitFor(() => expect(rowsText(el)).toContain('Ada'))
    expect(rowsText(el)).not.toContain('Loading…')
  })

  it('marks the active tab and leaves the others inactive', async () => {
    const adapter = makeAdapter([])
    const el = mount({ category: 'beginner', title: 'Best Times' }, { adapter })
    await vi.waitFor(() => expect(tabButtons(el)).toHaveLength(4))

    const today = tabByLabel(el, 'Today')
    const week = tabByLabel(el, 'Week')
    expect(today.style.fontWeight).toBe('bold')
    expect(today.style.borderBottom).toContain('orange')
    expect(week.style.fontWeight).toBe('normal')
    expect(week.style.borderBottom).toContain('transparent')
  })
})

describe('queries', () => {
  it('queries the \'today\' rolling window by default, limited to 10', async () => {
    const adapter = makeAdapter([])
    mount({ category: 'beginner', title: 'Best Times' }, { adapter })

    await vi.waitFor(() => expect(adapter.listScores).toHaveBeenCalled())
    const q = adapter.listScores.mock.calls[0][0]
    expect(q.category).toBe('beginner')
    expect(q.order).toBe('asc')
    expect(q.limit).toBe(10)
    expect(q.since).toBeInstanceOf(Date)
    const dayMs = 24 * 60 * 60 * 1000
    expect(Math.abs(Date.now() - dayMs - q.since.getTime())).toBeLessThan(5000)
  })

  it('honors the duration attribute on first mount (all → no time filter)', async () => {
    const adapter = makeAdapter([])
    const el = mount({ category: 'beginner', title: 'Best', duration: 'all' }, { adapter })

    await vi.waitFor(() => expect(adapter.listScores).toHaveBeenCalled())
    expect(adapter.listScores.mock.calls[0][0].since).toBeNull()
    await vi.waitFor(() =>
      expect(tabByLabel(el, 'All Time').style.fontWeight).toBe('bold'))
  })

  it('passes score-order=\'desc\' through to the query', async () => {
    const adapter = makeAdapter([])
    mount({ category: 'beginner', title: 'Best', 'score-order': 'desc' }, { adapter })
    await vi.waitFor(() => expect(adapter.listScores).toHaveBeenCalled())
    expect(adapter.listScores.mock.calls[0][0].order).toBe('desc')
  })

  it('re-queries the clicked tab window in place', async () => {
    const adapter = makeAdapter([])
    const el = mount({ category: 'beginner', title: 'Best' }, { adapter })
    await vi.waitFor(() => expect(tabButtons(el)).toHaveLength(4))

    tabByLabel(el, 'Week').click()
    await vi.waitFor(() => expect(adapter.listScores).toHaveBeenCalledTimes(2))
    const q = adapter.listScores.mock.calls[1][0]
    const weekMs = 7 * 24 * 60 * 60 * 1000
    expect(Math.abs(Date.now() - weekMs - q.since.getTime())).toBeLessThan(5000)
    await vi.waitFor(() =>
      expect(tabByLabel(el, 'Week').style.fontWeight).toBe('bold'))
    expect(tabByLabel(el, 'Today').style.fontWeight).toBe('normal')
  })

  it('keeps focus on the clicked tab', async () => {
    const adapter = makeAdapter([])
    const el = mount({ category: 'beginner', title: 'Best' }, { adapter })
    await vi.waitFor(() => expect(tabButtons(el)).toHaveLength(4))

    const week = tabByLabel(el, 'Week')
    week.focus()
    week.click()
    await vi.waitFor(() => expect(adapter.listScores).toHaveBeenCalledTimes(2))
    expect(document.activeElement?.textContent).toBe('Week')
  })
})

describe('attribute changes after mount', () => {
  it('category change re-queries with the new category and keeps the selected tab', async () => {
    const adapter = makeAdapter([])
    const el = mount({ category: 'beginner', title: 'Best' }, { adapter })
    await vi.waitFor(() => expect(tabButtons(el)).toHaveLength(4))

    tabByLabel(el, 'Week').click()
    await vi.waitFor(() => expect(adapter.listScores).toHaveBeenCalledTimes(2))

    el.setAttribute('category', 'expert')
    await vi.waitFor(() => expect(adapter.listScores).toHaveBeenCalledTimes(3))
    const q = adapter.listScores.mock.calls[2][0]
    expect(q.category).toBe('expert')
    const weekMs = 7 * 24 * 60 * 60 * 1000
    expect(Math.abs(Date.now() - weekMs - q.since.getTime())).toBeLessThan(5000)
    await vi.waitFor(() =>
      expect(tabByLabel(el, 'Week').style.fontWeight).toBe('bold'))
  })

  it('title change updates the heading', async () => {
    const adapter = makeAdapter([])
    const el = mount({ category: 'beginner', title: 'Best' }, { adapter })
    await vi.waitFor(() => expect(el.querySelector('h3')).toBeTruthy())

    el.setAttribute('title', 'Best Times (Expert)')
    await vi.waitFor(() =>
      expect(el.querySelector('h3').textContent).toBe('Best Times (Expert)'))
  })

  it('duration change switches the window', async () => {
    const adapter = makeAdapter([])
    const el = mount({ category: 'beginner', title: 'Best' }, { adapter })
    await vi.waitFor(() => expect(adapter.listScores).toHaveBeenCalledTimes(1))

    el.setAttribute('duration', 'month')
    await vi.waitFor(() => expect(adapter.listScores).toHaveBeenCalledTimes(2))
    const q = adapter.listScores.mock.calls[1][0]
    const monthMs = 30 * 24 * 60 * 60 * 1000
    expect(Math.abs(Date.now() - monthMs - q.since.getTime())).toBeLessThan(5000)
    await vi.waitFor(() =>
      expect(tabByLabel(el, 'Month').style.fontWeight).toBe('bold'))
  })

  it('a stale query result never overwrites a newer one', async () => {
    const deferred = {}
    const adapter = makeAdapter([], {
      listScores: vi.fn(({ category }) => new Promise(r => { deferred[category] = r }))
    })
    const el = mount({ category: 'aaa', title: 'Best' }, { adapter })
    await vi.waitFor(() => expect(adapter.listScores).toHaveBeenCalledTimes(1))

    el.setAttribute('category', 'bbb')
    await vi.waitFor(() => expect(adapter.listScores).toHaveBeenCalledTimes(2))

    deferred.bbb([{ name: 'NewRow', score: 2 }])
    await vi.waitFor(() => expect(rowsText(el)).toContain('NewRow'))

    deferred.aaa([{ name: 'StaleRow', score: 1 }]) // stale response arrives late
    await new Promise(r => setTimeout(r, 20))
    expect(rowsText(el)).not.toContain('StaleRow')
    expect(rowsText(el)).toContain('NewRow')
  })
})

describe('empty and error states', () => {
  it('shows one of the empty-state messages when there are no rows', async () => {
    const adapter = makeAdapter([])
    const el = mount({ category: 'beginner', title: 'Best' }, { adapter })
    await vi.waitFor(() => {
      const messages = [...el.querySelectorAll('em')].map(em => em.textContent)
      expect(messages.some(m => DEFAULT_EMPTY_MESSAGES.includes(m))).toBe(true)
    })
  })

  it('turns a failing query into the error message', async () => {
    const adapter = makeAdapter([], {
      listScores: vi.fn(async () => { throw new Error('backend down') })
    })
    const el = mount({ category: 'beginner', title: 'Best' }, { adapter })
    await vi.waitFor(() =>
      expect(rowsText(el)).toContain('Leaderboard unavailable right now.'))
    expect(el.querySelector('h3')).toBeTruthy() // heading + tabs survive the failure
  })
})

describe('formatting and user-facing strings', () => {
  it('format=\'time\' renders scores with the pretty-time formatter', async () => {
    const adapter = makeAdapter([
      { name: 'Ada', score: 4200 },
      { name: 'Bo', score: 61300 }
    ])
    const el = mount({ category: 'b', title: 'T', format: 'time' }, { adapter })
    await vi.waitFor(() => {
      expect(rowsText(el)).toContain('04.2')
      expect(rowsText(el)).toContain('01:01.3')
    })
  })

  it('a per-element formatScore property wins over the format attribute', async () => {
    const adapter = makeAdapter([{ name: 'Ada', score: 4200 }])
    const el = mount(
      { category: 'b', title: 'T', format: 'time' },
      { adapter, formatScore: v => `${v}pts` }
    )
    await vi.waitFor(() => expect(rowsText(el)).toContain('4200pts'))
  })

  it('falls back to shared-config format from configureLeaderboard()', async () => {
    const adapter = makeAdapter([{ name: 'Ada', score: 4200 }])
    configureLeaderboard({ adapter, format: 'time' })
    const el = mount({ category: 'b', title: 'T' })
    await vi.waitFor(() => expect(rowsText(el)).toContain('04.2'))
  })

  it('honors per-element string overrides (loadingText, errorText, anonymousName)', async () => {
    let reject
    const adapter = makeAdapter([], {
      listScores: vi.fn(() => new Promise((_, rj) => { reject = rj }))
    })
    const el = mount({ category: 'b', title: 'T' }, {
      adapter,
      loadingText: 'Hold on…',
      errorText: 'Nope.',
      anonymousName: 'Mystery Player'
    })
    await vi.waitFor(() => expect(rowsText(el)).toContain('Hold on…'))
    reject(new Error('x'))
    await vi.waitFor(() => expect(rowsText(el)).toContain('Nope.'))
  })

  it('uses the anonymous name for rows without a name', async () => {
    const adapter = makeAdapter([{ score: 9 }])
    const el = mount({ category: 'b', title: 'T' }, { adapter, anonymousName: 'Mystery' })
    await vi.waitFor(() => expect(rowsText(el)).toContain('Mystery'))
  })

  it('honors shared-config labels, tooltips and emptyMessages', async () => {
    const adapter = makeAdapter([])
    configureLeaderboard({
      adapter,
      labels: { today: 'Heute' },
      tooltips: { today: 'Letzte 24 Stunden' },
      emptyMessages: ['Nichts hier.']
    })
    const el = mount({ category: 'b', title: 'T' })
    await vi.waitFor(() => {
      const tab = tabByLabel(el, 'Heute')
      expect(tab).toBeTruthy()
      expect(tab.getAttribute('title')).toBe('Letzte 24 Stunden')
      expect(rowsText(el)).toContain('Nichts hier.')
    })
  })
})

describe('submit()', () => {
  const entry = () => ({
    name: 'Zed',
    playerId: 'p1',
    score: 42,
    category: 'beginner',
    time_stamp: new Date('2026-07-03T12:00:00Z'),
    status: 'win',
    meta: { isMobile: false }
  })

  it('archives and writes a ranked entry with bucket keys', async () => {
    const adapter = makeAdapter([])
    const el = mount({ category: 'beginner', title: 'T' }, { adapter })
    await vi.waitFor(() => expect(adapter.listScores).toHaveBeenCalled())

    await el.submit(entry())

    expect(adapter.archive).toHaveBeenCalledWith({
      playerId: 'p1',
      score: 42,
      category: 'beginner',
      time_stamp: entry().time_stamp,
      meta: { isMobile: false }
    })
    expect(adapter.addScore).toHaveBeenCalledTimes(1)
    const [category, doc] = adapter.addScore.mock.calls[0]
    expect(category).toBe('beginner')
    expect(doc).toMatchObject({
      name: 'Zed',
      playerId: 'p1',
      score: 42,
      day: '2026-07-03',
      week: '2026-W27',
      month: '2026-07'
    })
  })

  it('skips the ranked write when the entry does not qualify', async () => {
    const adapter = makeAdapter([], {
      getConfig: vi.fn(async () => ({ passingStatus: 'win' }))
    })
    const el = mount({ category: 'beginner', title: 'T' }, { adapter })
    await vi.waitFor(() => expect(adapter.getConfig).toHaveBeenCalled())
    await new Promise(r => setTimeout(r, 0)) // let the writer store the config

    await el.submit({ ...entry(), status: 'lose' })
    expect(adapter.archive).toHaveBeenCalledTimes(1)
    expect(adapter.addScore).not.toHaveBeenCalled()
  })

  it('honors a per-element qualifies override', async () => {
    const adapter = makeAdapter([])
    const el = mount({ category: 'beginner', title: 'T' }, {
      adapter,
      qualifies: () => false
    })
    await vi.waitFor(() => expect(adapter.listScores).toHaveBeenCalled())

    await el.submit(entry())
    expect(adapter.addScore).not.toHaveBeenCalled()
  })
})
