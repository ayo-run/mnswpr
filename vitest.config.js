import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['packages/**/test/**/*.test.js', 'apps/**/test/**/*.test.js', 'scripts/test/**/*.test.js']
  }
})
