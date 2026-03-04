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
      '/bands': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      '/streams': {
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
        // Avoid proxying SPA page-load requests that collide with this API prefix
        bypass(req) {
          if (req.headers.accept && req.headers.accept.includes('text/html')) {
            return req.url;
          }
        },
      },
      '/monthly-submissions': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      '/notifications': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      '/admin': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      '/employee-portal': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      '/webknot-values': {
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
