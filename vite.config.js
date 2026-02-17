import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/submission-window': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      '/employees': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      '/kpi-definitions': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      '/kpi-definition': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      '/auth': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      '/portal': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      '/certifications': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      '/monthly-submissions': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      '/employee-portal': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      '/ui': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
