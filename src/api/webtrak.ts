/**
 * Webtrak API routing for Team List, profiles, projects, etc.
 *
 * **Local Java webtrak (default):** after Pulse login, calls go to `/api/v1/…`
 * on the same origin (Vite → `VITE_API_DEV_PROXY`, usually localhost:8080)
 * with session cookies + JWT. RBAC is enforced by the backend.
 *
 * **Third-party Webtrak:** when `WEBTRAK_API_KEY` or a remote `VITE_WEBTRAK_API_BASE`
 * is set, calls use `/__webtrak` and the proxy injects the service key.
 */

import { getAuthHeader } from "./auth";
import { buildApiUrl } from "./http";

const APP_KEY_RE = /\bwtrt_[A-Za-z0-9_-]+/;

function asBearer(token: string) {
  return /^bearer\s+/i.test(token) ? token : `Bearer ${token}`;
}

/** True when using remote Webtrak + API key instead of logged-in session. */
export function useWebtrakThirdPartyApi() {
  const apiKey = String(
    import.meta.env?.WEBTRAK_API_KEY ?? import.meta.env?.VITE_WEBTRAK_API_KEY ?? "",
  ).trim();
  if (apiKey) return true;

  const explicitBase = String(import.meta.env?.VITE_WEBTRAK_API_BASE ?? "").trim();
  if (!explicitBase) return false;

  try {
    const url = new URL(
      explicitBase.startsWith("http") ? explicitBase : `https://${explicitBase}`,
    );
    const host = url.hostname.toLowerCase();
    return host !== "localhost" && host !== "127.0.0.1";
  } catch {
    return true;
  }
}

export function getWebtrakApiBase() {
  if (useWebtrakThirdPartyApi()) {
    if (typeof window !== "undefined") return "/__webtrak";
    return String(import.meta.env?.VITE_WEBTRAK_API_BASE || "https://webtrak.webknot-dev.in")
      .trim()
      .replace(/\/$/, "");
  }
  return "";
}

function resolveThirdPartyAuthorization() {
  const auth = String(getAuthHeader?.() || "").trim();
  if (!auth) {
    if (typeof window === "undefined" || !import.meta?.env?.DEV) {
      const key = String(import.meta.env?.VITE_WEBTRAK_API_KEY ?? "").trim();
      return key ? asBearer(key) : null;
    }
    return null;
  }
  if (auth.startsWith("wtrt_") || APP_KEY_RE.test(auth)) {
    if (/^bearer\s+/i.test(auth)) return auth;
    if (auth.startsWith("wtrt_")) return asBearer(auth);
    const match = auth.match(APP_KEY_RE);
    return match ? asBearer(match[0]) : asBearer(auth);
  }
  if (!import.meta?.env?.DEV) {
    const key = String(import.meta.env?.VITE_WEBTRAK_API_KEY ?? "").trim();
    return key ? asBearer(key) : null;
  }
  return null;
}

export function getWebtrakAuthHeaders(extra: Record<string, string> = {}) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...extra,
  };

  if (!useWebtrakThirdPartyApi()) {
    const sessionAuth = String(getAuthHeader?.() || "").trim();
    if (sessionAuth) headers.Authorization = sessionAuth;
    return headers;
  }

  const authorization = resolveThirdPartyAuthorization();
  if (authorization) headers.Authorization = authorization;
  return headers;
}

/** Session mode sends cookies; third-party mode relies on injected API key. */
export function webtrakFetchCredentials(): RequestCredentials {
  return useWebtrakThirdPartyApi() ? "omit" : "include";
}

export function buildWebtrakUrl(path: string) {
  const p = String(path || "").startsWith("/") ? path : `/${path}`;
  if (!useWebtrakThirdPartyApi()) {
    return buildApiUrl(p);
  }
  return `${getWebtrakApiBase()}${p}`;
}

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
