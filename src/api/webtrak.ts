/**
 * Webtrak API routing for Team List, profiles, projects, etc.
 *
 * **Local Java webtrak (default):** after Pulse login, Team List calls
 * `/api/v1/user/onboard` on the same origin with session JWT.
 *
 * **Dev + remote roster:** when `VITE_EMPLOYEE_ROSTER_API_BASE` points at a remote
 * host, Vite proxies `/__webtrak` and injects `WEBTRAK_API_KEY`.
 */

import { getAuthHeader } from "./auth";
import { buildApiUrl } from "./http";

const APP_KEY_RE = /\bwtrt_[A-Za-z0-9_-]+/;

function asBearer(token: string) {
  return /^bearer\s+/i.test(token) ? token : `Bearer ${token}`;
}

/** True when using remote Webtrak + API key instead of logged-in session (dev only). */
export function useWebtrakThirdPartyApi() {
  if (import.meta.env.PROD) return false;

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

const DEFAULT_EMPLOYEE_ROSTER_BASE = "https://webtrak.webknot-dev.in";

function rosterBaseHost() {
  const raw = String(
    import.meta.env?.VITE_EMPLOYEE_ROSTER_API_BASE ??
      import.meta.env?.VITE_WEBTRAK_API_BASE ??
      "",
  ).trim();
  if (!raw) return "";
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Dev-only: Vite proxies `/__webtrak` when roster env points at a remote host.
 * Production always uses same-origin `/api/v1/user/onboard` with the login JWT.
 */
export function shouldUseRemoteEmployeeRosterProxy() {
  if (!import.meta.env.DEV) return false;
  const host = rosterBaseHost();
  if (!host) return false;
  return host !== "localhost" && host !== "127.0.0.1";
}

/** Remote Webtrak host used for HR employee roster (`GET /api/v1/user/onboard`). */
export function getEmployeeRosterApiBase() {
  const raw = String(
    import.meta.env?.VITE_EMPLOYEE_ROSTER_API_BASE ??
      import.meta.env?.VITE_WEBTRAK_API_BASE ??
      DEFAULT_EMPLOYEE_ROSTER_BASE,
  ).trim();
  if (!raw) return DEFAULT_EMPLOYEE_ROSTER_BASE;
  return raw.replace(/\/$/, "");
}

/** Team list uses the logged-in Webtrak session (`/api/v1/user/onboard`). */
export function buildEmployeeRosterUrl(path: string) {
  const p = String(path || "").startsWith("/") ? path : `/${path}`;
  if (import.meta.env.DEV && shouldUseRemoteEmployeeRosterProxy()) {
    return buildRemoteWebtrakUrl(p);
  }
  return buildApiUrl(p);
}

/** Bands, departments, promotion paths, and other legacy Webtrak HR APIs on webknot-dev.in. */
export function buildRemoteWebtrakUrl(path: string) {
  const p = String(path || "").startsWith("/") ? path : `/${path}`;
  if (typeof window !== "undefined") {
    return `/__webtrak${p}`;
  }
  return `${getEmployeeRosterApiBase()}${p}`;
}

export function getEmployeeRosterAuthHeaders(extra: Record<string, string> = {}) {
  if (!shouldUseRemoteEmployeeRosterProxy()) {
    return getWebtrakAuthHeaders(extra);
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...extra,
  };
  const key = String(
    import.meta.env?.VITE_WEBTRAK_API_KEY ?? import.meta.env?.WEBTRAK_API_KEY ?? "",
  ).trim();
  if (key) {
    headers.Authorization = asBearer(key);
  }
  return headers;
}

export function employeeRosterFetchCredentials(): RequestCredentials {
  if (!shouldUseRemoteEmployeeRosterProxy()) {
    return "include";
  }
  const key = String(
    import.meta.env?.VITE_WEBTRAK_API_KEY ?? import.meta.env?.WEBTRAK_API_KEY ?? "",
  ).trim();
  return key ? "omit" : "include";
}

export function buildWebtrakUrl(path: string) {
  const p = String(path || "").startsWith("/") ? path : `/${path}`;
  if (useWebtrakThirdPartyApi()) {
    return `${getWebtrakApiBase()}${p}`;
  }
  // Local Java webtrak (this repo) serves band-list, department-list, promotion-paths, etc.
  return buildApiUrl(p);
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
