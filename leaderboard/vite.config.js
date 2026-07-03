import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, './leader-board.js'),
      name: 'leaderboard',
      fileName: 'leader-board'
    },
    rollupOptions: {
      external: [/^firebase/]
    }
  }
})
