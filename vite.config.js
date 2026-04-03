import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'lib/mnswpr.js'),
      name: 'mnswpr',
      fileName: 'mnswpr'
    }
  }
})
