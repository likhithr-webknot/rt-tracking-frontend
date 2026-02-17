export function getApiBaseUrl() {
  // If set, calls go directly to backend (e.g. http://localhost:8080).
  // If empty, calls use same-origin paths (Vite dev proxy handles backend routing).
  const raw = (import.meta?.env?.VITE_API_BASE_URL ?? "").toString().trim();
  if (!raw) return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export function buildApiUrl(path) {
  const p = String(path || "");
  if (!p) return p;
  if (p.startsWith("http://") || p.startsWith("https://")) return p;

  const base = getApiBaseUrl();
  const normalizedPath = p.startsWith("/") ? p : `/${p}`;
  if (!base) return normalizedPath;
  return `${base}${normalizedPath}`;
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getCookieValue(name) {
  if (typeof document === "undefined") return "";
  const n = String(name || "");
  if (!n) return "";
  const re = new RegExp(`(?:^|; )${escapeRegExp(n)}=([^;]*)`);
  const m = re.exec(document.cookie || "");
  return m && m[1] ? decodeURIComponent(m[1]) : "";
}

export function withCsrfHeaders(headers) {
  const base = headers && typeof headers === "object" ? headers : {};

  // Common Spring Security pattern: cookie XSRF-TOKEN + header X-XSRF-TOKEN.
  // Also support CSRF-TOKEN cookie (some frameworks) + X-CSRF-TOKEN header.
  const token =
    getCookieValue("XSRF-TOKEN") ||
    getCookieValue("CSRF-TOKEN") ||
    getCookieValue("csrfToken") ||
    "";
  if (!token) return base;

  // Do not override if caller already set them.
  const next = { ...base };
  if (!next["X-XSRF-TOKEN"]) next["X-XSRF-TOKEN"] = token;
  if (!next["X-CSRF-TOKEN"]) next["X-CSRF-TOKEN"] = token;
  return next;
}

export function hasCsrfCookie() {
  return Boolean(
    getCookieValue("XSRF-TOKEN") ||
      getCookieValue("CSRF-TOKEN") ||
      getCookieValue("csrfToken")
  );
}

export async function ensureCsrfCookie({ signal, headers } = {}) {
  if (hasCsrfCookie()) return true;

  // Try a few safe GET endpoints that should set the CSRF cookie (Spring CookieCsrfTokenRepository).
  // Ignore all failures; we only care whether a cookie appears after any request.
  const candidates = [
    "/auth/me",
    "/portal/employee",
    "/portal/manager",
    "/portal/admin",
    "/submission-window/current",
  ];

  for (const path of candidates) {
    try {
      await fetch(buildApiUrl(path), {
        method: "GET",
        signal,
        credentials: "include",
        headers: headers && typeof headers === "object" ? headers : undefined,
      });
    } catch {
      // ignore
    }
    if (hasCsrfCookie()) return true;
  }

  return hasCsrfCookie();
}
