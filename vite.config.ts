import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Rewrite the Origin header so Spring Boot's CORS filter sees the
 * backend's own origin instead of Vite's dev-server origin.
 * (changeOrigin only rewrites Host, not Origin.)
 */
function rewriteOrigin(proxy: { on: (ev: string, fn: (...args: unknown[]) => void) => void }, apiTarget: string) {
  proxy.on("proxyReq", (...args: unknown[]) => {
    const proxyReq = args[0] as { getHeader: (n: string) => unknown; setHeader: (n: string, v: string) => void };
    if (proxyReq.getHeader("origin")) {
      proxyReq.setHeader("origin", apiTarget);
    }
  });
}

function configureProxy(
  proxy: { on: (ev: string, fn: (...args: unknown[]) => void) => void },
  apiTarget: string
) {
  rewriteOrigin(proxy, apiTarget);
  proxy.on("error", (...args: unknown[]) => {
    const err = args[0];
    const req = args[1] as { method?: string; url?: string };
    const res = args[2] as {
      headersSent?: boolean;
      writeHead?: (c: number, h: Record<string, string>) => void;
      end?: (b: string) => void;
    };
    const method = req?.method || "GET";
    const url = req?.url || "";
    const message = err instanceof Error ? err.message : "Proxy request failed";
    console.error(`[vite proxy] ${method} ${url} -> ${apiTarget}: ${message}`);
    if (!res || res.headersSent) return;
    res.writeHead?.(502, { "Content-Type": "application/json" });
    res.end?.(
      JSON.stringify({
        message: "Frontend dev proxy could not reach the backend API.",
        details: `${method} ${url} -> ${apiTarget}: ${message}`,
      })
    );
  });
}

function spaBypass(req: { headers?: { accept?: string }; url?: string }) {
  if (req.headers?.accept?.includes("text/html")) {
    return req.url;
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const API_TARGET = env.VITE_API_DEV_PROXY || "http://localhost:8080";

  const base = {
    target: API_TARGET,
    changeOrigin: true,
    secure: false,
    timeout: 120_000,
    proxyTimeout: 120_000,
    configure: (proxy: { on: (ev: string, fn: (...args: unknown[]) => void) => void }) => configureProxy(proxy, API_TARGET),
  };

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 3000,
      proxy: {
        // Spring Security oauth2 callbacks have to round-trip to the backend.
        "/oauth2": { ...base },
        "/login/oauth2": { ...base },
        "/oauth": { ...base },
        // Catch-all for the canonical REST namespace.
        "/api": { ...base },
        // Backend bare-path namespaces (no /api/v1/ prefix) preserved so older
        // hand-rolled fetches keep working. Each must NOT collide with a SPA
        // route below.
        "/submission-window": { ...base },
        "/employees": { ...base },
        "/designations": { ...base },
        "/bands": { ...base },
        "/kpi-definitions": { ...base },
        "/kpi-definition": { ...base },
        "/kpi-directions": { ...base },
        "/kpi-direction": { ...base },
        "/streams": { ...base },
        "/portal": { ...base },
        "/monthly-submissions": { ...base },
        "/notifications": { ...base },
        "/employee-portal": { ...base },
        "/webknot-values": { ...base },
        "/webknot-value": { ...base },
        "/ui": { ...base },
        // Mixed namespaces: backend serves API here AND the SPA owns
        // some routes under the same prefix. spaBypass keeps text/html
        // requests on the dev server (so React Router renders) while
        // letting JSON / fetch traffic through to the backend.
        "/auth": { ...base, bypass: spaBypass },
        "/certifications": { ...base, bypass: spaBypass },
        "/projects": { ...base, bypass: spaBypass },
        // SPA-only routes (`/admin/*`, `/employee/*`, `/manager/*`) are
        // intentionally NOT in the proxy table. Vite's default SPA fallback
        // serves index.html for them; React Router handles the rest. Adding
        // them here proxied every browser navigation to Spring Boot, which
        // 404s because the backend has no `/admin` etc. endpoints — its API
        // lives under `/api/v1/...`.
      },
    },
    build: {
      target: "es2020",
      sourcemap: false,
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes("node_modules/react-dom")) return "vendor-react";
            if (id.includes("node_modules/react")) return "vendor-react";
            if (id.includes("node_modules/recharts") || id.includes("node_modules/d3")) return "vendor-charts";
            if (id.includes("node_modules/framer-motion")) return "vendor-motion";
            if (id.includes("node_modules/lucide-react")) return "vendor-icons";
            if (id.includes("node_modules/@tanstack")) return "vendor-query";
          },
        },
      },
      chunkSizeWarningLimit: 600,
    },
  };
});
