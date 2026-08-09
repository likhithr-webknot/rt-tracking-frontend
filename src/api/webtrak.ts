/**
 * Third-party Webtrak API helpers (Team List / roles / employee profile / Apps).
 * Browser calls always go through `/__webtrak` (same-origin).
 * Auth: prefer wtrt_ app keys; otherwise leave Authorization empty so the Vite
 * proxy injects WEBTRAK_API_KEY. Never send Pulse session JWTs to Webtrak.
 */

import { getAuthHeader } from "./auth";

export function getWebtrakApiBase() {
  if (typeof window !== "undefined") return "/__webtrak";
  return String(import.meta?.env?.VITE_WEBTRAK_API_BASE || "https://webtrak.webknot-dev.in")
    .trim()
    .replace(/\/$/, "");
}

const APP_KEY_RE = /\bwtrt_[A-Za-z0-9_-]+/;

function resolveWebtrakAuthorization() {
  const auth = String(getAuthHeader?.() || "").trim();
  const asBearer = (token: string) =>
    /^bearer\s+/i.test(token) ? token : `Bearer ${token}`;
  if (!auth) {
    if (typeof window === "undefined" || !import.meta?.env?.DEV) {
      const key = String(import.meta?.env?.VITE_WEBTRAK_API_KEY ?? "").trim();
      return key ? asBearer(key) : null;
    }
    return null;
  }
  // Only forward Webtrak app keys (`wtrt_…`). Pulse Bearer JWTs are rejected by Webtrak.
  if (auth.startsWith("wtrt_") || APP_KEY_RE.test(auth)) {
    if (/^bearer\s+/i.test(auth)) return auth;
    if (auth.startsWith("wtrt_")) return asBearer(auth);
    const match = auth.match(APP_KEY_RE);
    return match ? asBearer(match[0]) : asBearer(auth);
  }
  // Dev: omit so proxy injects WEBTRAK_API_KEY.
  // Prod without proxy: fall back to VITE_WEBTRAK_API_KEY.
  if (!import.meta?.env?.DEV) {
    const key = String(import.meta?.env?.VITE_WEBTRAK_API_KEY ?? "").trim();
    return key ? asBearer(key) : null;
  }
  return null;
}

export function getWebtrakAuthHeaders(extra: Record<string, string> = {}) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...extra,
  };
  const authorization = resolveWebtrakAuthorization();
  if (authorization) headers.Authorization = authorization;
  return headers;
}

export function buildWebtrakUrl(path: string) {
  const p = String(path || "").startsWith("/") ? path : `/${path}`;
  return `${getWebtrakApiBase()}${p}`;
}

/**
 * Resolve onboard/profile photo values (`local://uploads/…`, relative paths, or absolute URLs)
 * to a browser-fetchable Webtrak URL via `/__webtrak`.
 */
export function resolveWebtrakProfilePhotoUrl(raw: unknown) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value) || value.startsWith("data:") || value.startsWith("blob:")) {
    return value;
  }
  let filename = value
    .replace(/^local:\/\/uploads\//i, "")
    .replace(/^uploads\/(?:profile_photos\/)?/i, "")
    .replace(/^\/+/, "");
  filename = filename.split("/").pop() || "";
  if (!filename || filename.includes("..")) return "";
  return buildWebtrakUrl(`/api/v1/profile/photo/${encodeURIComponent(filename)}`);
}

/** Map Pulse portal labels to Webtrak ROLE_* tokens for set-portal-role. */
export function toWebtrakPortalRoleToken(role: unknown) {
  const label = String(role ?? "")
    .trim()
    .toLowerCase()
    .replace(/^role[_-]/, "");
  if (!label) return "ROLE_EMPLOYEE";
  if (label === "hr" || label.includes("human resource")) return "ROLE_HR";
  if (label === "finance" || label.includes("finance")) return "ROLE_FINANCE";
  if (label === "admin" || label === "super admin" || label === "superadmin") return "ROLE_ADMIN";
  if (label === "manager" || label.includes("manager")) return "ROLE_MANAGER";
  if (label === "am" || label.includes("account manager")) return "ROLE_AM";
  if (label === "dm" || label.includes("delivery manager")) return "ROLE_DM";
  return "ROLE_EMPLOYEE";
}
