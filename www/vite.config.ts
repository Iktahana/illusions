import { resolve } from 'path'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer'

/** Known page routes that have a corresponding directory with index.html */
const PAGE_ROUTES = ['/downloads']

/** Rewrite clean URLs to their index.html (e.g. /downloads → /downloads/index.html) */
function mpaFallback(): Plugin {
  return {
    name: 'mpa-fallback',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const pathname = req.url?.split('?')[0]
        if (pathname && PAGE_ROUTES.includes(pathname)) {
          req.url = `${pathname}/index.html`
        }
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        const pathname = req.url?.split('?')[0]
        if (pathname && PAGE_ROUTES.includes(pathname)) {
          req.url = `${pathname}/index.html`
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  appType: 'mpa',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        downloads: resolve(__dirname, 'downloads/index.html'),
      },
    },
  },
  plugins: [
    mpaFallback(),
    ViteImageOptimizer({
      png: {
        quality: 80,
      },
      jpeg: {
        quality: 80,
      },
      jpg: {
        quality: 80,
      },
      webp: {
        lossless: false,
        quality: 80,
      },
      // Convert all images to WebP
      includePublic: true,
    }),
  ],
})
