import { getAppSettings } from "../utils/appSettings.js";
import { safeJsonParse } from "../utils/json.js";
import { z } from "zod";
export { safeJsonParse } from "../utils/json.js";

const ErrorEnvelopeSchema = z.object({
  message: z.union([z.string(), z.number(), z.boolean()]).optional(),
  details: z.union([z.string(), z.number(), z.boolean()]).optional(),
  error: z.union([z.string(), z.number(), z.boolean()]).optional(),
}).passthrough();

function toOptionalString(value) {
  if (value == null) return "";
  const text = String(value).trim();
  return text || "";
}

export async function readError(res) {
  const text = await res.text().catch(() => "");
  const parsed = safeJsonParse(text, ErrorEnvelopeSchema, null);
  const message = toOptionalString(parsed?.message);
  const details = toOptionalString(parsed?.details);
  if (message && details) return `${message}: ${details}`;
  const fallback = toOptionalString(parsed?.error);
  return details || message || fallback || text || `Request failed: ${res.status} ${res.statusText}`;
}

export async function toHttpError(res) {
  const message = await readError(res);
  const err = new Error(message);
  err.status = res.status;
  return err;
}

export async function parseResponse(res, fallback = null) {
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) return res.json().catch(() => ({}));
  if (contentType.includes("application/octet-stream")) return res.blob();
  if (contentType.includes("application/pdf")) return res.blob();
  if (fallback != null) return fallback;
  return res.text().catch(() => "");
}

export function getApiBaseUrl() {
  const runtime = getAppSettings()?.apiBaseUrl;
  const runtimeBase = String(runtime ?? "").trim();
  if (runtimeBase) {
    const normalized = runtimeBase.endsWith("/") ? runtimeBase.slice(0, -1) : runtimeBase;
    return normalizeBase(normalized);
  }
  const raw = (import.meta?.env?.VITE_API_BASE_URL ?? "").toString().trim();
  if (!raw) return "";
  const normalized = raw.endsWith("/") ? raw.slice(0, -1) : raw;
  return normalizeBase(normalized);
}

function normalizeBase(base) {
  const b = String(base ?? "").trim();
  if (!b) return "";
  if (b.startsWith("http://") || b.startsWith("https://")) return b;
  // Handle configs like "localhost:8080/api/v1" (no protocol).
  return `http://${b}`;
}

export function buildApiUrl(path) {
  const p = String(path || "");
  if (!p) return p;
  if (p.startsWith("http://") || p.startsWith("https://")) return p;

  const base = getApiBaseUrl();
  let normalizedPath = p.startsWith("/") ? p : `/${p}`;

  // If base already includes "/api/v1" (common), avoid accidental "/api/v1/api/v1".
  // Example:
  // - base = http://localhost:8080/api/v1
  // - path = /api/v1/auth/me  -> should become http://localhost:8080/api/v1/auth/me
  const baseStr = String(base || "");
  if (baseStr && baseStr.endsWith("/api/v1") && normalizedPath.startsWith("/api/v1/")) {
    normalizedPath = normalizedPath.slice("/api/v1".length);
  } else if (baseStr && baseStr.endsWith("/api/v1") && normalizedPath === "/api/v1") {
    normalizedPath = "";
  }

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
  const token =
    getCookieValue("XSRF-TOKEN") ||
    getCookieValue("CSRF-TOKEN") ||
    getCookieValue("csrfToken") ||
    "";
  if (!token) return base;
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

export async function ensureCsrfCookie({ signal, headers, forceRefresh = false } = {}) {
  if (!forceRefresh && hasCsrfCookie()) return true;
  const candidates = [
    "/api/v1/profile",
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
    } catch { void 0; }
    if (hasCsrfCookie()) return true;
  }

  return hasCsrfCookie();
}
