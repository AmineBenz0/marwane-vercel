import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Preview deployments use staging data; production builds must never expose
  // the chart's mock scenarios. Builds outside Vercel default to production.
  define: {
    'import.meta.env.VITE_DEPLOYMENT_ENV': JSON.stringify(
      process.env.VERCEL_ENV || (command === 'serve' ? 'development' : 'production')
    ),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
}))

