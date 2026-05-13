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
  const genericMessageValues = new Set([
    "no message available",
    "no message",
    "n/a",
    "unknown error",
    "error",
  ]);
  const messageIsGeneric = genericMessageValues.has(message.toLowerCase());

  if (message && details) return `${message}: ${details}`;
  const fallback = toOptionalString(parsed?.error);
  const best = details || message || fallback || text;
  if (!best || messageIsGeneric) {
    return `Request failed: ${res.status} ${res.statusText}`;
  }
  return best;
}

export async function toHttpError(res, context = {}) {
  const message = await readError(res);
  const requestLabel = formatRequestLabel(context);
  const err = new Error(requestLabel ? `${requestLabel}: ${message}` : message);
  err.status = res.status;
  if (context?.path) err.path = context.path;
  if (context?.method) err.method = context.method;
  return err;
}

function formatRequestLabel(context = {}) {
  const method = String(context.method || "").trim().toUpperCase();
  const path = String(context.path || context.url || "").trim();
  if (method && path) return `${method} ${path}`;
  return path || method;
}

function normalizeFallbackCandidate(candidate, defaults = {}) {
  if (typeof candidate === "string") return { ...defaults, path: candidate };
  const obj = candidate && typeof candidate === "object" ? candidate : {};
  return { ...defaults, ...obj };
}

function formatAttempt(attempt) {
  const label = formatRequestLabel(attempt);
  const status = attempt.status ? `${attempt.status}` : "network";
  const message = String(attempt.message || "").trim();
  return `${label || "request"} -> ${status}${message ? ` (${message})` : ""}`;
}

export function toTrackedRequestError(message, attempts = [], cause = null) {
  const cleanAttempts = Array.isArray(attempts) ? attempts.filter(Boolean) : [];
  const suffix = cleanAttempts.length
    ? ` Tried: ${cleanAttempts.map(formatAttempt).join("; ")}`
    : "";
  const err = new Error(`${message}${suffix}`);
  err.attempts = cleanAttempts;
  if (cause) err.cause = cause;
  const last = cleanAttempts[cleanAttempts.length - 1];
  if (last?.status) err.status = last.status;
  return err;
}

export async function requestWithFallbacks(candidates, options = {}) {
  const {
    method = "GET",
    body,
    signal,
    headers,
    credentials = "include",
    fallbackStatuses = [400, 403, 404, 405],
    notFoundMessage = "API endpoint not found.",
    parseFallback = {},
  } = options;
  const attempts = [];
  const list = Array.isArray(candidates) ? candidates : [candidates];

  for (const rawCandidate of list) {
    const candidate = normalizeFallbackCandidate(rawCandidate, { method });
    const requestMethod = String(candidate.method || method || "GET").toUpperCase();
    const path = String(candidate.path || "").trim();
    if (!path) continue;
    const requestHeaders =
      candidate.headers && typeof candidate.headers === "object"
        ? candidate.headers
        : headers;
    const requestBody =
      candidate.body !== undefined
        ? candidate.body
        : body !== undefined
          ? body
          : undefined;

    let res;
    try {
      res = await fetch(buildApiUrl(path), {
        method: requestMethod,
        signal,
        credentials,
        headers: requestHeaders,
        ...(requestBody !== undefined ? { body: requestBody } : {}),
      });
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      attempts.push({
        method: requestMethod,
        path,
        message: err?.message || "Network request failed.",
      });
      continue;
    }

    if (res.ok) return parseResponse(res, candidate.parseFallback ?? parseFallback);

    const err = await toHttpError(res, { method: requestMethod, path });
    attempts.push({
      method: requestMethod,
      path,
      status: res.status,
      message: err?.message || res.statusText,
    });

    if (!fallbackStatuses.includes(res.status)) {
      throw toTrackedRequestError(err.message || "Request failed.", attempts, err);
    }
  }

  throw toTrackedRequestError(notFoundMessage, attempts);
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
    "/api/v1/submission-cycles",
    "/api/v1/users?page=0&size=1",
    "/api/v1/departments",
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
