import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1]

const overpassProxy = {
  '/api/overpass-primary': {
    target: 'https://overpass-api.de',
    changeOrigin: true,
    rewrite: () => '/api/interpreter'
  },
  '/api/overpass-fallback': {
    target: 'https://overpass.kumi.systems',
    changeOrigin: true,
    rewrite: () => '/api/interpreter'
  }
}

export default defineConfig({
  base: process.env.GITHUB_ACTIONS === 'true' && repositoryName ? `/${repositoryName}/` : '/',
  plugins: [react()],
  server: { proxy: overpassProxy },
  preview: { proxy: overpassProxy },
  resolve: {
    alias: {
      '@': resolve('src'),
      '@app': resolve('src/app'),
      '@runs': resolve('src/runs')
    }
  }
})
