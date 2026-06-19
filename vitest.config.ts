import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve('src'),
      '@app': resolve('src/app'),
      '@runs': resolve('src/runs')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
