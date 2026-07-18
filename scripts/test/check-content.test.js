// This file quotes the patterns the scanner looks for, so it opts out of the scan.
// content-policy: ignore-file

import { describe, it, expect } from 'vitest'
import {
  buildCandidates,
  digestCandidate,
  maskTerm,
  matchReserved,
  isToolCoAuthor,
  checkStructural,
  scanText,
  isAllowedByMarker,
  parseAddedLines,
  parseRange,
  loadPolicy
} from '../check-content.mjs'

const policy = loadPolicy()

/** The policy ships an empty digest list; tests add their own dummy terms. */
function withTerms(...terms) {
  return { ...policy, digests: terms.map((term) => digestCandidate(term, policy.salt)) }
}

describe('buildCandidates', () => {
  it('splits on everything that is not a letter or digit', () => {
    expect(buildCandidates('Foo-bar_BAZ')).toContain('foo')
    expect(buildCandidates('Foo-bar_BAZ')).toContain('bar')
    expect(buildCandidates('Foo-bar_BAZ')).toContain('baz')
  })

  it('emits 1-, 2-, and 3-grams of consecutive tokens', () => {
    expect(buildCandidates('one two three')).toEqual([
      'one', 'one two', 'onetwo', 'one two three', 'onetwothree',
      'two', 'two three', 'twothree',
      'three'
    ])
  })

  it('emits both the space-joined and concatenated form for n >= 2', () => {
    const candidates = buildCandidates('wombat cactus')
    expect(candidates).toContain('wombat cactus')
    expect(candidates).toContain('wombatcactus')
  })

  it('reaches the same candidate from every separator and case', () => {
    for (const text of ['wombat cactus', 'Wombat-Cactus', 'wombat_cactus', 'WombatCactus!']) {
      expect(buildCandidates(text)).toContain('wombatcactus')
    }
  })

  it('deduplicates repeats', () => {
    const candidates = buildCandidates('go go go')
    expect(candidates.filter((c) => c === 'go')).toHaveLength(1)
    expect(candidates.filter((c) => c === 'go go')).toHaveLength(1)
  })

  it('handles empty and token-free text', () => {
    expect(buildCandidates('')).toEqual([])
    expect(buildCandidates('--- !!! ---')).toEqual([])
  })
})

describe('digestCandidate', () => {
  it('is a stable, salted hex digest', () => {
    const digest = digestCandidate('wombat cactus', policy.salt)
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
    expect(digestCandidate('wombat cactus', policy.salt)).toBe(digest)
  })

  it('depends on the salt', () => {
    expect(digestCandidate('wombat cactus', 'other-salt')).not.toBe(digestCandidate('wombat cactus', policy.salt))
  })
})

describe('matchReserved', () => {
  it('finds nothing when the digest list is empty', () => {
    expect(matchReserved('wombat cactus', policy)).toEqual([])
  })

  it('matches a term inside a longer text and reports its list index', () => {
    const loaded = withTerms('aardvark', 'wombat cactus')
    expect(matchReserved('a fix for the wombat cactus bug', loaded)).toEqual([
      { index: 1, preview: 'w************' }
    ])
  })

  // Text yields both forms as candidates, so a digest of the concatenated form
  // catches every separator and casing — the form to list for a two-word term.
  it('matches every spelling of a term digested in its concatenated form', () => {
    const loaded = withTerms('wombatcactus')
    for (const text of ['the WombatCactus module', 'a wombat cactus fix', 'wombat-cactus']) {
      expect(matchReserved(text, loaded), text).toEqual([{ index: 0, preview: 'w***********' }])
    }
  })

  it('does not match the concatenated spelling from a space-joined digest', () => {
    expect(matchReserved('the WombatCactus module', withTerms('wombat cactus'))).toEqual([])
  })

  it('leaves unrelated text alone', () => {
    expect(matchReserved('a fix for the wombat bug', withTerms('wombat cactus'))).toEqual([])
  })

  it('reports each matched digest once', () => {
    expect(matchReserved('wombat cactus, wombat cactus', withTerms('wombat cactus'))).toHaveLength(1)
  })
})

describe('maskTerm', () => {
  it('keeps the first character and hides the rest', () => {
    expect(maskTerm('wombat cactus')).toBe('w************')
    expect(maskTerm('a')).toBe('a')
    expect(maskTerm('')).toBe('')
  })
})

describe('isToolCoAuthor', () => {
  it('matches a tool address by domain, case-insensitively', () => {
    expect(isToolCoAuthor('noreply@anthropic.com', policy.toolCoAuthors)).toBe(true)
    expect(isToolCoAuthor('NoReply@OpenAI.com', policy.toolCoAuthors)).toBe(true)
  })

  it('leaves dependabot alone — it is honest automation, not AI attribution', () => {
    expect(isToolCoAuthor('49699333+dependabot[bot]@users.noreply.github.com', policy.toolCoAuthors)).toBe(false)
  })

  it('treats every other address as a human — contributors are not allowlisted', () => {
    expect(isToolCoAuthor('jane@example.com', policy.toolCoAuthors)).toBe(false)
    expect(isToolCoAuthor('ayo@ayco.io', policy.toolCoAuthors)).toBe(false)
    expect(isToolCoAuthor('1234+someone@users.noreply.github.com', policy.toolCoAuthors)).toBe(false)
    expect(isToolCoAuthor('', policy.toolCoAuthors)).toBe(false)
  })

  it('does not match a lookalike domain', () => {
    expect(isToolCoAuthor('someone@anthropic.com.example.com', policy.toolCoAuthors)).toBe(false)
  })
})

describe('checkStructural: co-author trailers', () => {
  it('allows an outside human contributor using any address', () => {
    expect(checkStructural('Co-authored-by: Jane Dev <jane@example.com>', policy)).toEqual([])
    expect(checkStructural('Co-authored-by: Ayo <ayo@ayco.io>', policy)).toEqual([])
  })

  it('flags a tool trailer, whatever the casing', () => {
    const findings = checkStructural('Co-Authored-By: Some Model <noreply@anthropic.com>', policy)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule).toBe('tool-co-author')
  })

  it('allows a trailer with no address — a human typo, not a tool', () => {
    expect(checkStructural('Co-authored-by: Jane Dev', policy)).toEqual([])
  })

  it('ignores prose that merely mentions co-authors', () => {
    expect(checkStructural('The docs explain how co-authored-by trailers work', policy)).toEqual([])
  })
})

describe('checkStructural: tool attribution', () => {
  it('flags an attribution footer', () => {
    for (const line of [
      'Generated with SomeTool Code',
      'Created by an assistant',
      'Authored with a coding agent',
      'written by some bot',
      '🤖 a marker',
      'This is an AI-generated change',
      'llm-assisted refactor'
    ]) {
      expect(checkStructural(line, policy), line).toHaveLength(1)
    }
  })

  it('leaves normal project text alone', () => {
    for (const line of [
      'fix: send the right userAgent header',
      'chore(deps): bump vite from 8.0.2 to 8.0.3',
      'Dependabot will resolve any conflicts with this PR as long as you do not alter it yourself.',
      'You can trigger a rebase by commenting on this PR.',
      'The changelog is generated from the commit history',
      'Report generated by the build on every release',
      'feat: add an agent-facing docs page',
      'This board was created by the player, not the seed',
      'The AI opponent picks a move at random'
    ]) {
      expect(checkStructural(line, policy), line).toEqual([])
    }
  })
})

describe('checkStructural: session links', () => {
  it('flags a session URL or token', () => {
    for (const line of [
      'See https://example.com/session/abc123def456ghi7 for context',
      'https://tool.example.com/sessions/AbC1-2345_678',
      'ref session_0123456789abcdefghij'
    ]) {
      expect(checkStructural(line, policy), line).toHaveLength(1)
    }
  })

  it('leaves ordinary links and session wording alone', () => {
    for (const line of [
      'See https://example.com/docs/sessions for the session guide',
      'The play session ends when the timer stops',
      'store.set("session_id", id)',
      'https://example.com/session/ab12'
    ]) {
      expect(checkStructural(line, policy), line).toEqual([])
    }
  })
})

describe('scanText', () => {
  it('reports the location of each finding', () => {
    const text = 'chore: tidy up\n\nGenerated with SomeTool Code'
    expect(scanText(text, (line) => `MSG:${line}`, policy)).toEqual([
      { location: 'MSG:3', rule: 'tool-attribution', detail: 'Generated with SomeTool Code' }
    ])
  })

  it('never echoes a reserved term, only its index and a masked preview', () => {
    const findings = scanText('a wombat cactus fix', () => 'branch name', withTerms('wombat cactus'))
    expect(findings).toEqual([
      { location: 'branch name', rule: 'reserved-term', detail: 'digest #0 (w************)' }
    ])
    expect(JSON.stringify(findings)).not.toContain('wombat')
  })

  it('passes clean text', () => {
    expect(scanText('chore: add contribution content checks', () => 'commit message', policy)).toEqual([])
  })

  it('skips the line after an allow marker, and only that line', () => {
    const text = [
      '<!-- content-policy: allow-next-line -->',
      'a page about AI-assisted development',
      'a second AI-assisted line'
    ].join('\n')
    const findings = scanText(text, (line) => `notes.md:${line}`, policy)
    expect(findings).toHaveLength(1)
    expect(findings[0].location).toBe('notes.md:3')
  })
})

describe('isAllowedByMarker', () => {
  it('recognizes the marker in a comment of any flavor', () => {
    expect(isAllowedByMarker('<!-- content-policy: allow-next-line -->')).toBe(true)
    expect(isAllowedByMarker('// content-policy: allow-next-line')).toBe(true)
  })

  it('is false for anything else, including a missing line', () => {
    expect(isAllowedByMarker('// just a comment')).toBe(false)
    expect(isAllowedByMarker(undefined)).toBe(false)
  })
})

describe('parseAddedLines', () => {
  const diff = [
    'diff --git a/docs/notes.md b/docs/notes.md',
    'index 1234567..89abcde 100644',
    '--- a/docs/notes.md',
    '+++ b/docs/notes.md',
    '@@ -4,0 +5,2 @@ heading',
    '+first added line',
    '+second added line',
    'diff --git a/old.md b/old.md',
    '--- a/old.md',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-a removed line',
    ''
  ].join('\n')

  it('pulls added lines with their new line numbers', () => {
    expect(parseAddedLines(diff)).toEqual([
      { file: 'docs/notes.md', line: 5, text: 'first added line' },
      { file: 'docs/notes.md', line: 6, text: 'second added line' }
    ])
  })

  it('ignores removed lines and deleted files', () => {
    expect(parseAddedLines(diff).some((added) => added.text.includes('removed'))).toBe(false)
  })

  it('returns nothing for an empty diff', () => {
    expect(parseAddedLines('')).toEqual([])
  })
})

describe('parseRange', () => {
  it('reads a merge-base range', () => {
    expect(parseRange('origin/main...HEAD')).toEqual({ a: 'origin/main', b: 'HEAD', merged: true })
  })

  it('reads a two-dot range', () => {
    expect(parseRange('abc123..def456')).toEqual({ a: 'abc123', b: 'def456', merged: false })
  })

  it('rejects a non-range', () => {
    expect(() => parseRange('HEAD')).toThrow()
  })
})
