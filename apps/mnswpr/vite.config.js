import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Multi-page build: the game (index.html) and the frozen Legends page.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        legends: resolve(import.meta.dirname, 'legends.html')
      }
    }
  }
})
