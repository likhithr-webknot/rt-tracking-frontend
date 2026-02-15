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

