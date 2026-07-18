import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['apps/**/test/**/*.test.js', 'scripts/test/**/*.test.js']
  }
})
