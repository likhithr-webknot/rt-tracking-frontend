import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Rewrite the Origin header so Spring Boot's CORS filter sees the
 * backend's own origin instead of Vite's dev-server origin.
 * (changeOrigin only rewrites Host, not Origin.)
 */
function rewriteOrigin(proxy, apiTarget) {
  proxy.on('proxyReq', (proxyReq) => {
    if (proxyReq.getHeader('origin')) {
      proxyReq.setHeader('origin', apiTarget)
    }
  })
}

function configureProxy(proxy, apiTarget) {
  rewriteOrigin(proxy, apiTarget)
  proxy.on('error', (err, req, res) => {
    const method = req?.method || 'GET'
    const url = req?.url || ''
    const message = err?.message || 'Proxy request failed'
    console.error(`[vite proxy] ${method} ${url} -> ${apiTarget}: ${message}`)
    if (!res || res.headersSent) return
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      message: 'Frontend dev proxy could not reach the backend API.',
      details: `${method} ${url} -> ${apiTarget}: ${message}`,
    }))
  })
}

/** Bypass function for routes that collide with SPA page paths */
function spaBypass(req) {
  if (req.headers.accept && req.headers.accept.includes('text/html')) {
    return req.url
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const API_TARGET = env.VITE_API_DEV_PROXY || 'http://localhost:8080'

  /** Base proxy options shared by every route */
  const base = {
    target: API_TARGET,
    changeOrigin: true,
    secure: false,
    configure: (proxy) => configureProxy(proxy, API_TARGET),
  }

  return {
    plugins: [react(), tailwindcss()],

    /* ── Development server ─────────────────────────── */
    server: {
      port: 3000,
      proxy: {
        /* Spring OAuth2 — keep sign-in on :3000 so redirects can return here with ?token= */
        '/oauth2':              { ...base },
        '/login/oauth2':        { ...base },
        '/api':                 { ...base },
        '/submission-window':   { ...base },
        '/employees':           { ...base },
        '/kpi-definitions':     { ...base },
        '/kpi-definition':      { ...base },
        '/bands':               { ...base },
        '/streams':             { ...base },
        '/auth':                { ...base, bypass: spaBypass },
        '/portal':              { ...base },
        '/certifications':      { ...base, bypass: spaBypass },
        '/monthly-submissions': { ...base },
        '/notifications':       { ...base },
        '/admin':               { ...base },
        '/employee-portal':     { ...base },
        '/webknot-values':      { ...base },
        '/webknot-value':       { ...base },
        '/ui':                  { ...base },
        '/projects':            { ...base, bypass: spaBypass },
        '/ai-agents':           { ...base },
      },
    },

    /* ── Production build ───────────────────────────── */
    build: {
      target: 'es2020',
      sourcemap: false,
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react-dom')) return 'vendor-react';
            if (id.includes('node_modules/react'))     return 'vendor-react';
            if (id.includes('node_modules/recharts') || id.includes('node_modules/d3'))  return 'vendor-charts';
            if (id.includes('node_modules/framer-motion')) return 'vendor-motion';
            if (id.includes('node_modules/lucide-react'))  return 'vendor-icons';
          },
        },
      },
      chunkSizeWarningLimit: 600,
    },
  }
})
