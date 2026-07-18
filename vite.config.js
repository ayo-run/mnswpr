import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const root = resolve(import.meta.dirname, 'src')

// App source lives in src/; env files and the build output stay at the repo root.
export default defineConfig({
  root,
  // .env* files sit at the repo root next to package.json, not in src/.
  envDir: import.meta.dirname,
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    // Multi-page build: the game (index.html) and the frozen Legends page.
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        legends: resolve(root, 'legends.html')
      }
    }
  }
})
