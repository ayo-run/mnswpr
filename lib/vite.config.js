import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: './dist',
    lib: {
      entry: resolve(import.meta.dirname, './mnswpr.js'),
      name: 'mnswpr',
      fileName: 'mnswpr'
    }
  }
})
