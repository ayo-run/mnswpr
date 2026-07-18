// @ts-check

// Checks commits, branch names, and contributed text against the repo's content
// policy: no automated-tool attribution, no session links, and a
// maintainer-managed reserved-terms list (shipped as salted digests in
// .repo-policy.json).
//
// Zero dependencies (node: builtins only), so CI can run it without installing.
// Usage: node scripts/check-content.mjs --staged --branch "$(git branch --show-current)"
//
// Escape hatches, for text that carries a pattern legitimately: `content-policy:
// ignore-file` in a file's first lines skips the whole file (this one and its
// test, which quote the patterns); `content-policy: allow-next-line` skips the
// line after it.
// content-policy: ignore-file

import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = resolve(import.meta.dirname, '..')

/** Opt-out marker, honored in the first lines of a scanned file. */
const IGNORE_MARKER = 'content-policy: ignore-file'

/** Opt-out marker for the single line that follows it. */
const ALLOW_MARKER = 'content-policy: allow-next-line'

/**
 * @typedef {object} Policy
 * @property {number} version
 * @property {string} salt - HMAC key for the digest list.
 * @property {string[]} digests - Reserved-term digests, maintainer-managed.
 * @property {string[]} toolCoAuthors - Non-human co-author addresses to reject;
 *   a leading `*` matches a suffix. Every other address is a human, and passes.
 */

/**
 * @typedef {object} Finding
 * @property {string} location - `file:line`, `commit message <sha>`, or `branch name`.
 * @property {string} rule
 * @property {string} detail
 */

/**
 * Read the repo's content policy.
 * @param {string} [file]
 * @returns {Policy}
 */
export function loadPolicy(file = resolve(root, '.repo-policy.json')) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

/**
 * Every 1-, 2-, and 3-gram of the text's alphanumeric tokens. Multi-token grams
 * are emitted both space-joined and concatenated, so `foo-bar` and `FooBar` both
 * reach the same candidate.
 * @param {string} text
 * @returns {string[]} deduplicated candidates
 */
export function buildCandidates(text) {
  const tokens = String(text).toLowerCase().match(/[a-z0-9]+/g) || []
  const candidates = new Set()
  for (let i = 0; i < tokens.length; i++) {
    for (let n = 1; n <= 3 && i + n <= tokens.length; n++) {
      const gram = tokens.slice(i, i + n)
      if (n === 1) candidates.add(gram[0])
      else {
        candidates.add(gram.join(' '))
        candidates.add(gram.join(''))
      }
    }
  }
  return [...candidates]
}

/**
 * @param {string} candidate
 * @param {string} salt
 * @returns {string} hex digest
 */
export function digestCandidate(candidate, salt) {
  return createHmac('sha256', salt).update(candidate).digest('hex')
}

/**
 * First character plus asterisks — enough to act on a finding without echoing
 * the term into a log.
 * @param {string} term
 * @returns {string}
 */
export function maskTerm(term) {
  const text = String(term)
  return text.slice(0, 1) + '*'.repeat(Math.max(text.length - 1, 0))
}

/**
 * Match a text's candidates against the policy's digest list.
 * @param {string} text
 * @param {Policy} policy
 * @returns {{ index: number, preview: string }[]} one entry per matched digest
 */
export function matchReserved(text, policy) {
  const digests = policy.digests || []
  if (digests.length === 0) return []
  const matches = []
  const seen = new Set()
  for (const candidate of buildCandidates(text)) {
    const index = digests.indexOf(digestCandidate(candidate, policy.salt))
    if (index === -1 || seen.has(index)) continue
    seen.add(index)
    matches.push({ index, preview: maskTerm(candidate) })
  }
  return matches
}

/** Single-line patterns, matched against text, paths, and branch names. */
const STRUCTURAL_RULES = [
  {
    rule: 'tool-attribution',
    pattern: /(generated|created|written|authored)\s+(with|by)\b.{0,40}\b(code|agent|assistant|bot|ai|llm)\b/i
  },
  { rule: 'tool-attribution', pattern: /🤖/u },
  { rule: 'tool-attribution', pattern: /\b(ai|llm)[-\s](generated|assisted|authored|written)\b/i },
  { rule: 'session-link', pattern: /https?:\/\/\S+\/sessions?\/[0-9a-zA-Z_-]{8,}/i },
  { rule: 'session-link', pattern: /\bsession[_-][0-9a-zA-Z]{16,}\b/i }
]

const CO_AUTHOR_PATTERN = /^\s*co-authored-by:\s*(.+)$/i
const EMAIL_PATTERN = /<([^>]+)>/

/**
 * Is this co-author address a tool rather than a person? Humans are the default:
 * only addresses matching the policy's tool list are rejected.
 * @param {string} email
 * @param {string[]} [tools] - Exact emails, or `*@domain` suffix patterns.
 * @returns {boolean}
 */
export function isToolCoAuthor(email, tools = []) {
  const value = String(email).trim().toLowerCase()
  if (!value) return false
  return tools.some((entry) => {
    const pattern = String(entry).trim().toLowerCase()
    return pattern.startsWith('*') ? value.endsWith(pattern.slice(1)) : value === pattern
  })
}

/**
 * @param {string} line
 * @returns {string} the line, trimmed and capped for reporting
 */
function preview(line) {
  const text = line.trim()
  return text.length > 120 ? `${text.slice(0, 120)}…` : text
}

/**
 * Structural checks for one line. The line is quoted back: these patterns are
 * vendor-neutral and public, unlike the reserved-terms list.
 * @param {string} line
 * @param {Policy} policy
 * @returns {{ rule: string, detail: string }[]}
 */
export function checkStructural(line, policy) {
  const findings = []
  const reported = new Set()
  for (const { rule, pattern } of STRUCTURAL_RULES) {
    if (reported.has(rule) || !pattern.test(line)) continue
    reported.add(rule)
    findings.push({ rule, detail: preview(line) })
  }
  const trailer = CO_AUTHOR_PATTERN.exec(line)
  if (trailer) {
    const email = (EMAIL_PATTERN.exec(trailer[1]) || [])[1] || ''
    if (isToolCoAuthor(email, policy.toolCoAuthors)) {
      findings.push({ rule: 'tool-co-author', detail: preview(line) })
    }
  }
  return findings
}

/**
 * @param {string | undefined} line - The line before the one being scanned.
 * @returns {boolean}
 */
export function isAllowedByMarker(line) {
  return typeof line === 'string' && line.includes(ALLOW_MARKER)
}

/**
 * Run every check over a text, line by line.
 * @param {string} text
 * @param {(lineNo: number) => string} locate - Builds a finding's location.
 * @param {Policy} policy
 * @returns {Finding[]}
 */
export function scanText(text, locate, policy) {
  const findings = []
  const lines = String(text).split('\n')
  lines.forEach((line, index) => {
    if (isAllowedByMarker(lines[index - 1])) return
    const location = locate(index + 1)
    for (const finding of checkStructural(line, policy)) findings.push({ location, ...finding })
    for (const match of matchReserved(line, policy)) {
      findings.push({ location, rule: 'reserved-term', detail: `digest #${match.index} (${match.preview})` })
    }
  })
  return findings
}

/**
 * A changed path gets the same checks as text. A reserved-term hit reports the
 * path's position rather than the path, so a flagged name never lands in a log.
 * @param {string} path
 * @param {number} index - Position in the scanned path list.
 * @param {Policy} policy
 * @returns {Finding[]}
 */
export function checkPath(path, index, policy) {
  const findings = checkStructural(path, policy).map((finding) => ({ location: `path ${path}`, ...finding }))
  for (const match of matchReserved(path, policy)) {
    findings.push({ location: `path #${index + 1}`, rule: 'reserved-term', detail: `digest #${match.index} (${match.preview})` })
  }
  return findings
}

/**
 * Added lines and their line numbers in the new file, from a unified diff.
 * @param {string} diff
 * @returns {{ file: string, line: number, text: string }[]}
 */
export function parseAddedLines(diff) {
  const added = []
  let file = null
  let lineNo = 0
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      const path = line.slice(4).trim()
      file = path === '/dev/null' ? null : path.replace(/^b\//, '')
      continue
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (hunk) {
      lineNo = Number(hunk[1])
      continue
    }
    if (!file || line.startsWith('---')) continue
    if (line.startsWith('+')) added.push({ file, line: lineNo++, text: line.slice(1) })
    else if (line.startsWith(' ')) lineNo++
  }
  return added
}

/**
 * Split `a...b` or `a..b`.
 * @param {string} spec
 * @returns {{ a: string, b: string, merged: boolean }}
 */
export function parseRange(spec) {
  const merged = spec.includes('...')
  const [a, b] = spec.split(merged ? '...' : '..')
  if (!a || !b) throw new Error(`not a commit range: ${spec}`)
  return { a, b, merged }
}

/**
 * @param {string[]} args
 * @returns {string}
 */
function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
}

/**
 * @param {string} content
 * @returns {boolean}
 */
function hasIgnoreMarker(content) {
  return content.split('\n', 20).some((line) => line.includes(IGNORE_MARKER))
}

/**
 * A file's lines at a revision, so a diffed line can be read in context.
 * @param {string} rev - Empty for the index.
 * @param {string} path
 * @returns {string[] | null} null when the file opts out of the scan
 */
function readLinesAt(rev, path) {
  try {
    const content = git(['show', `${rev}:${path}`])
    return hasIgnoreMarker(content) ? null : content.split('\n')
  }
  catch {
    return []
  }
}

/**
 * @param {string} nameOnly - Output of `git diff --name-only`.
 * @param {Policy} policy
 * @returns {Finding[]}
 */
function checkPaths(nameOnly, policy) {
  return nameOnly.split('\n').filter(Boolean).flatMap((path, index) => checkPath(path, index, policy))
}

/**
 * @param {string} diff
 * @param {string} rev - Revision to read ignore markers from; empty for the index.
 * @param {Policy} policy
 * @returns {Finding[]}
 */
function checkAddedLines(diff, rev, policy) {
  const findings = []
  const blobs = new Map()
  for (const { file, line, text } of parseAddedLines(diff)) {
    if (!blobs.has(file)) blobs.set(file, readLinesAt(rev, file))
    const lines = blobs.get(file)
    if (lines === null || isAllowedByMarker(lines[line - 2])) continue
    findings.push(...scanText(text, () => `${file}:${line}`, policy))
  }
  return findings
}

/**
 * @param {Policy} policy
 * @returns {Finding[]}
 */
function checkStaged(policy) {
  const diff = git(['diff', '--cached', '--unified=0', '--diff-filter=ACM'])
  return [
    ...checkAddedLines(diff, '', policy),
    ...checkPaths(git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']), policy)
  ]
}

/**
 * @param {string} spec
 * @param {Policy} policy
 * @returns {Finding[]}
 */
function checkRange(spec, policy) {
  const { a, b, merged } = parseRange(spec)
  const findings = []
  for (const sha of git(['rev-list', `${a}..${b}`]).split('\n').filter(Boolean)) {
    const message = git(['show', '-s', '--format=%B', sha])
    findings.push(...scanText(message, () => `commit message ${sha.slice(0, 8)}`, policy))
  }
  const diffSpec = merged ? `${a}...${b}` : `${a}..${b}`
  findings.push(...checkAddedLines(git(['diff', '--unified=0', diffSpec]), b, policy))
  findings.push(...checkPaths(git(['diff', '--name-only', diffSpec]), policy))
  return findings
}

/**
 * Strip the comments git adds to a commit-message file.
 * @param {string} file
 * @returns {string}
 */
function readMessage(file) {
  const text = readFileSync(file, 'utf8')
  const scissors = text.indexOf('\n# ------------------------ >8 ------------------------')
  const body = scissors === -1 ? text : text.slice(0, scissors)
  return body.split('\n').filter((line) => !line.startsWith('#')).join('\n')
}

/**
 * @param {string} file
 * @returns {string | null} null when the file is binary or unreadable
 */
function readTracked(file) {
  try {
    const content = readFileSync(resolve(root, file))
    return content.includes(0) ? null : content.toString('utf8')
  }
  catch {
    return null
  }
}

/**
 * @param {Policy} policy
 * @returns {Finding[]}
 */
function checkAll(policy) {
  const findings = []
  git(['ls-files']).split('\n').filter(Boolean).forEach((file, index) => {
    findings.push(...checkPath(file, index, policy))
    const content = readTracked(file)
    if (content === null || hasIgnoreMarker(content)) return
    findings.push(...scanText(content, (line) => `${file}:${line}`, policy))
  })
  return findings
}

const USAGE = `Usage: node scripts/check-content.mjs <mode>...

  --staged            staged added lines and file paths
  --message <file>    a commit-message file
  --range <a>...<b>   commit messages, added lines, and paths in a range
  --text <file>       arbitrary text (a PR title and body)
  --branch <name>     a branch name
  --all               every tracked file (maintainer sweep)`

/**
 * @param {Finding[]} findings
 */
function report(findings) {
  for (const { location, rule, detail } of findings) console.error(`${location}  ${rule}: ${detail}`)
  if (findings.length) {
    console.error(`\n${findings.length} content policy finding(s) — see CONTRIBUTING.md ("Commit & PR hygiene").`)
  }
}

/**
 * @param {string[]} argv
 * @returns {number} exit code
 */
export function main(argv) {
  const policy = loadPolicy()
  const findings = []
  if (argv.length === 0) {
    console.error(USAGE)
    return 2
  }
  for (let i = 0; i < argv.length; i++) {
    const mode = argv[i]
    if (mode === '--staged') findings.push(...checkStaged(policy))
    else if (mode === '--all') findings.push(...checkAll(policy))
    else if (mode === '--message') findings.push(...scanText(readMessage(argv[++i]), () => 'commit message', policy))
    else if (mode === '--text') {
      const file = argv[++i]
      findings.push(...scanText(readFileSync(file, 'utf8'), (line) => `${file}:${line}`, policy))
    }
    else if (mode === '--range') findings.push(...checkRange(argv[++i], policy))
    else if (mode === '--branch') findings.push(...checkBranchArg(argv[++i], policy))
    else {
      console.error(`unknown mode: ${mode}\n\n${USAGE}`)
      return 2
    }
  }
  report(findings)
  return findings.length ? 1 : 0
}

/**
 * A detached HEAD has no branch name — nothing to check.
 * @param {string} name
 * @param {Policy} policy
 * @returns {Finding[]}
 */
function checkBranchArg(name, policy) {
  return name && name.trim() ? scanText(name.trim(), () => 'branch name', policy) : []
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)))
