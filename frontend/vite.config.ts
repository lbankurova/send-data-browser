import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom', 'scheduler'],
          'vendor-query': ['@tanstack/react-query', '@tanstack/react-table'],
          'vendor-charts': ['echarts/core', 'echarts/charts', 'echarts/components', 'echarts/renderers', 'zrender'],
          'vendor-ui': ['radix-ui', 'lucide-react', 'class-variance-authority', 'clsx', 'tailwind-merge'],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8000',
    },
    fs: {
      allow: ['..'],
    },
  },
})
