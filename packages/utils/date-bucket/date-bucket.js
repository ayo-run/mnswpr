/**
 * Time-bucket keys for leaderboards, computed in UTC so every player shares the
 * same boundaries worldwide. Each key is a plain string denormalized onto a
 * score document, letting a "Today / Week / Month" query be a cheap equality
 * filter instead of a range scan.
 */

const pad = n => (n < 10 ? `0${n}` : `${n}`)

/**
 * Calendar-day key, e.g. `2026-07-03`.
 * @param {Date} date
 * @returns {String}
 */
export const dayKey = date => {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/**
 * Calendar-month key, e.g. `2026-07`.
 * @param {Date} date
 * @returns {String}
 */
export const monthKey = date => {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`
}

/**
 * ISO-8601 week key, e.g. `2026-W27`. Weeks start Monday and the week-numbering
 * year can differ from the calendar year around January 1st, so we derive the
 * year from the week's Thursday.
 * @param {Date} date
 * @returns {String}
 */
export const weekKey = date => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${pad(week)}`
}

/**
 * All three bucket keys for a moment in time.
 * @param {Date} date
 * @returns {{ day: String, week: String, month: String }}
 */
export const buckets = date => {
  return {
    day: dayKey(date),
    week: weekKey(date),
    month: monthKey(date)
  }
}
