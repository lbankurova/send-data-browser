import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', '../docs/knowledge/**/*.test.ts'],
    exclude: ['../docs/knowledge/audit-results/**/*.test.ts'],
  },
})
