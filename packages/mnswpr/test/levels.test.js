import { describe, it, expect } from 'vitest'
import { levels } from '../levels.js'

describe('levels', () => {
  it('defines the four expected difficulty presets', () => {
    expect(Object.keys(levels)).toEqual([
      'beginner',
      'intermediate',
      'expert',
      'nightmare'
    ])
  })

  it('gives every level a well-formed, consistent shape', () => {
    for (const [key, level] of Object.entries(levels)) {
      expect(typeof level.rows).toBe('number')
      expect(typeof level.cols).toBe('number')
      expect(typeof level.mines).toBe('number')
      expect(typeof level.name).toBe('string')
      // the map key must match the level's own id, since lookups use both
      expect(level.id).toBe(key)
    }
  })

  it('never has more mines than there are cells', () => {
    for (const level of Object.values(levels)) {
      expect(level.mines).toBeLessThan(level.rows * level.cols)
      expect(level.mines).toBeGreaterThan(0)
    }
  })
})
