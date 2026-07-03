import { buckets } from '@cozy-games/utils/date-bucket/date-bucket.js'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The four time windows are ROLLING: each shows entries from the last `ms`
 * milliseconds (strictly nested — 24h ⊆ 7d ⊆ 30d ⊆ all), sorted by score.
 * `ms: null` is the all-time view (no time filter). `title` is the hover tooltip
 * that spells out the window.
 */
const DURATIONS = [
  { id: 'today', label: 'Today', ms: DAY_MS, title: 'Last 24 hours' },
  { id: 'week', label: 'Week', ms: 7 * DAY_MS, title: 'Last 7 days' },
  { id: 'month', label: 'Month', ms: 30 * DAY_MS, title: 'Last 30 days' },
  { id: 'all', label: 'All Time', ms: null, title: 'All time' }
]

/**
 * Default empty-state messages — challenging but friendly, and game-agnostic.
 * One is picked at random each render. Override per app via the `emptyMessages`
 * option (see below) so localization stays out of this package.
 */
const EMPTY_MESSAGES = [
  'Be the first to enter the leader board!',
  'No scores yet — claim the top spot!',
  'This board is wide open. Conquer it!',
  'No champions here yet. Will it be you?',
  'Blank slate — set the score to beat!',
  'Nobody\'s here yet. Be the first!',
  'The top spot is up for grabs. Take it!',
  'Empty board. Time to make your mark!'
]

/**
 * Generic, game- AND backend-agnostic leaderboard. Nothing here knows about
 * minesweeper or Firebase: the ranked value is a plain `score`, sorted in the
 * configured direction and displayed through an injected formatter, while all
 * storage I/O is delegated to an injected adapter (see adapters/). Games wire
 * their specifics through the constructor options.
 *
 * An adapter implements:
 *   - getConfig(): Promise<Object|undefined>
 *   - listScores({ category, field, value, order, limit }): Promise<Object[]>
 *   - addScore(category, entry): Promise<void>
 *   - archive(entry): Promise<void>   // optional personal history
 */
export class LeaderBoardService {

  /**
   * @param {Object} options
   * @param {Object} options.adapter - storage backend (e.g. FirebaseAdapter, SupabaseAdapter)
   * @param {'asc'|'desc'} [options.scoreOrder] - 'asc' = lower is better (e.g. time), 'desc' = higher is better
   * @param {(value: number) => string} [options.formatScore] - display formatter for a score
   * @param {(entry: Object) => boolean} [options.qualifies] - whether an entry is ranked; defaults to server passingStatus vs entry.status
   * @param {Object} [options.labels] - optional tab-label overrides keyed by duration id
   * @param {Object} [options.tooltips] - optional tab hover-text overrides keyed by duration id
   * @param {string[]} [options.emptyMessages] - empty-state messages (one picked at random); localize here
   * @param {string} [options.loadingText] - shown while a window loads
   * @param {string} [options.errorText] - shown when a window fails to load
   * @param {string} [options.anonymousName] - fallback display name for entries without one
   */
  constructor(options = {}) {
    this.adapter = options.adapter
    this.scoreOrder = options.scoreOrder === 'desc' ? 'desc' : 'asc'
    this.formatScore = options.formatScore || (value => String(value))
    this.qualifies = options.qualifies || (entry => this._defaultQualifies(entry))
    this.labels = options.labels || {}
    this.tooltips = options.tooltips || {}

    // User-facing strings — override to localize; the package ships English defaults.
    this.emptyMessages = (Array.isArray(options.emptyMessages) && options.emptyMessages.length)
      ? options.emptyMessages
      : EMPTY_MESSAGES
    this.loadingText = options.loadingText || 'Loading…'
    this.errorText = options.errorText || 'Leaderboard unavailable right now.'
    this.anonymousName = options.anonymousName || 'Anonymous'

    Promise.resolve(this.adapter.getConfig())
      .then(config => {
        this.configuration = config
      })
      .catch(() => {})
  }

  /**
   * Default ranking gate: if the server config names a `passingStatus`, only
   * entries whose `status` matches qualify; otherwise every entry qualifies.
   */
  _defaultQualifies(entry) {
    const passing = this.configuration && this.configuration.passingStatus
    if (!passing) return true
    return entry.status === passing
  }

  _label(duration) {
    return this.labels[duration.id] || duration.label
  }

  _tooltip(duration) {
    return this.tooltips[duration.id] || duration.title
  }

  _emptyMessage() {
    return this.emptyMessages[Math.floor(Math.random() * this.emptyMessages.length)]
  }

  /**
   * Backend-neutral query descriptor for a category and time window. `since` is
   * the rolling cutoff (entries with `time_stamp >= since`); `null` means
   * all-time (no time filter). The adapter turns this into a real query.
   */
  _descriptor(category, duration) {
    return {
      category,
      since: duration.ms ? new Date(Date.now() - duration.ms) : null,
      order: this.scoreOrder,
      limit: 10
    }
  }

  /**
   * Render the leaderboard for a category with a duration tab bar. When
   * `duration` is omitted the last-selected tab is reused (so switching game
   * category keeps the player on the same window), defaulting to "today".
   * Returns the wrapper element; tab clicks re-query in place.
   * @param {String} category
   * @param {String} title
   * @param {String} [duration]
   * @returns {Promise<HTMLDivElement>}
   */
  async render(category, title, duration) {
    this.category = category
    this.title = title
    if (duration) this.duration = duration
    if (!this.duration) this.duration = 'today'
    duration = this.duration

    const wrapper = document.createElement('div')
    wrapper.style.maxWidth = '270px'
    wrapper.style.margin = '0 auto'

    const heading = document.createElement('h3')
    heading.innerText = title
    heading.style.borderBottom = '1px solid #c0c0c0'
    heading.style.paddingBottom = '10px'
    wrapper.append(heading)

    const tabBar = document.createElement('div')
    tabBar.style.display = 'flex'
    tabBar.style.justifyContent = 'center'
    tabBar.style.gap = '8px'
    tabBar.style.marginBottom = '10px'
    wrapper.append(tabBar)

    const listWrapper = document.createElement('div')
    wrapper.append(listWrapper)

    const tabs = {}
    const activate = (id) => {
      this.duration = id
      Object.entries(tabs).forEach(([tabId, el]) => this._styleTab(el, tabId === id))
      this._loadList(listWrapper, category, DURATIONS.find(d => d.id === id))
    }

    DURATIONS.forEach(d => {
      const tab = document.createElement('button')
      tab.innerText = this._label(d)
      tab.type = 'button'
      tab.setAttribute('title', this._tooltip(d))
      this._styleTab(tab, d.id === duration)
      tab.onclick = () => activate(d.id)
      tabs[d.id] = tab
      tabBar.append(tab)
    })

    // Return the wrapper (heading + tabs) right away and fill the list
    // asynchronously, so a slow or failing query never blocks the UI.
    this._loadList(listWrapper, category, DURATIONS.find(d => d.id === duration))

    return wrapper
  }

  _styleTab(tab, active) {
    tab.style.background = 'none'
    tab.style.border = 'none'
    tab.style.cursor = 'pointer'
    tab.style.padding = '2px 4px'
    tab.style.fontSize = '0.85em'
    tab.style.color = active ? '#ffffff' : '#999999'
    tab.style.fontWeight = active ? 'bold' : 'normal'
    tab.style.borderBottom = active ? '2px solid orange' : '2px solid transparent'
  }

  /**
   * Load a window's entries into the list area, showing a loading placeholder
   * and turning any failure (e.g. the backend being unreachable) into a
   * message instead of an unhandled rejection. Guards against races when the
   * player switches tabs quickly by tagging the in-flight request.
   */
  async _loadList(listWrapper, category, duration) {
    const token = (this._loadToken || 0) + 1
    this._loadToken = token

    listWrapper.innerHTML = ''
    const loading = document.createElement('em')
    loading.innerText = this.loadingText
    listWrapper.append(loading)

    try {
      const rows = await this.adapter.listScores(this._descriptor(category, duration))
      if (this._loadToken !== token) return
      this._renderList(listWrapper, rows)
    } catch {
      if (this._loadToken !== token) return
      listWrapper.innerHTML = ''
      const message = document.createElement('em')
      message.innerText = this.errorText
      listWrapper.append(message)
    }
  }

  _renderList(listWrapper, rows) {
    listWrapper.innerHTML = ''

    if (!rows || !rows.length) {
      const message = document.createElement('em')
      message.innerText = this._emptyMessage()
      listWrapper.append(message)
      return
    }

    const list = document.createElement('div')
    list.style.listStyle = 'none'
    list.style.textAlign = 'left'

    let i = 1
    rows.forEach(data => {
      const item = document.createElement('div')
      item.style.display = 'flex'

      const indexElement = document.createElement('div')
      indexElement.innerText = `#${i++}`

      const nameElement = document.createElement('div')
      const name = data.name || this.anonymousName
      nameElement.innerHTML = name
      nameElement.setAttribute('title', name)
      nameElement.style.textOverflow = 'ellipsis'
      nameElement.style.whiteSpace = 'nowrap'
      nameElement.style.overflow = 'hidden'
      nameElement.style.padding = '0 5px'
      nameElement.style.fontWeight = 'bold'
      nameElement.style.fontStyle = 'italic'
      nameElement.style.flex = '1'

      const scoreElement = document.createElement('div')
      scoreElement.innerText = this.formatScore(data.score)

      item.append(indexElement, nameElement, scoreElement)
      list.append(item)
    })

    listWrapper.append(list)
  }

  /**
   * Submit a completed game. Always archives it (personal history); if it
   * qualifies, also writes a ranked entry with denormalized bucket keys. Both
   * writes go through the adapter, so the storage backend is pluggable. The
   * caller owns display-name/nickname UX.
   * @param {Object} entry - { name, playerId, score, category, time_stamp, status?, meta? }
   */
  async submit(entry) {
    if (this.adapter.archive) {
      await this.adapter.archive({
        playerId: entry.playerId,
        score: entry.score,
        category: entry.category,
        time_stamp: entry.time_stamp,
        meta: entry.meta
      })
    }

    if (!this.qualifies(entry)) return

    const stamp = entry.time_stamp instanceof Date ? entry.time_stamp : new Date(entry.time_stamp)
    const bucket = buckets(stamp)
    const scoreDoc = {
      name: entry.name || 'Anonymous',
      playerId: entry.playerId,
      score: entry.score,
      category: entry.category,
      time_stamp: entry.time_stamp,
      day: bucket.day,
      week: bucket.week,
      month: bucket.month
    }
    if (entry.meta) scoreDoc.meta = entry.meta

    await this.adapter.addScore(entry.category, scoreDoc)
  }
}
