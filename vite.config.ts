import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1]

export default defineConfig({
  base: process.env.GITHUB_ACTIONS === 'true' && repositoryName ? `/${repositoryName}/` : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve('src'),
      '@app': resolve('src/app'),
      '@runs': resolve('src/runs')
    }
  }
})
