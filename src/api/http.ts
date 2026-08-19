import type { ApiOptions } from "../types/api-options";
import { getAppSettings } from "../utils/appSettings";
import { safeJsonParse } from "../utils/json";
import { z } from "zod";
export { safeJsonParse } from "../utils/json";

const ErrorEnvelopeSchema = z.object({
  message: z.union([z.string(), z.number(), z.boolean()]).optional(),
  details: z.union([z.string(), z.number(), z.boolean()]).optional(),
  error: z.union([z.string(), z.number(), z.boolean()]).optional(),
}).passthrough();

type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

function toOptionalString(value: unknown) {
  if (value == null) return "";
  const text = String(value).trim();
  return text || "";
}

export async function readError(res: Response) {
  const text = await res.text().catch(() => "");
  const parsed = safeJsonParse(text, ErrorEnvelopeSchema, null) as ErrorEnvelope | null;
  const message = toOptionalString(parsed?.message);
  const details = toOptionalString(parsed?.details);
  const status = res.status;

  // Vite dev proxy returns { message, details } with details like "GET /api/v1/... -> <api-host>: ..."
  if (
    status === 502 &&
    import.meta.env?.DEV &&
    details &&
    (/proxy request failed/i.test(details) || /->\s*http:\/\//i.test(details))
  ) {
    return details;
  }

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
    return `Request failed: ${status} ${res.statusText}`;
  }
  return best;
}

/**
 * Vite’s dev proxy returns long 502 lines like
 * "GET /api/v1/... -> <api-host>: Proxy request failed".
 * Use this for employee directory (and similar) UI so users see one clear line.
 */
export function friendlyProxyUnreachableMessage(message: unknown) {
  const m = String(message ?? "").trim();
  if (!m) return m;
  if (/proxy request failed/i.test(m)) {
    return "Could not reach the backend API from the dev proxy. Start the API server (for example on port 8080), or fix VITE_API_DEV_PROXY / Settings → API base URL.";
  }
  return m;
}

export async function toHttpError(res: Response, context: Record<string, unknown> = {}) {
  const message = await readError(res);
  const requestLabel = formatRequestLabel(context);
  const path = String(context.path || context.url || "").trim();
  const skipLabel =
    Boolean(requestLabel) &&
    Boolean(path) &&
    String(message).includes(path) &&
    /^(GET|POST|PUT|PATCH|DELETE)\s+\//i.test(String(message).trim());
  const text = skipLabel ? message : requestLabel ? `${requestLabel}: ${message}` : message;
  const err = new Error(text);
  err.status = res.status;
  if (context?.path) err.path = String(context.path);
  if (context?.method) err.method = String(context.method);
  return err;
}

function formatRequestLabel(context: Record<string, unknown> = {}) {
  const method = String(context.method || "").trim().toUpperCase();
  const path = String(context.path || context.url || "").trim();
  if (method && path) return `${method} ${path}`;
  return path || method;
}

function normalizeFallbackCandidate(candidate: unknown, defaults: Record<string, unknown> = {}): Record<string, unknown> {
  if (typeof candidate === "string") return { ...defaults, path: candidate };
  const obj = candidate && typeof candidate === "object" ? (candidate as Record<string, unknown>) : {};
  return { ...defaults, ...obj };
}

function formatAttempt(attempt: Record<string, unknown>) {
  const label = formatRequestLabel(attempt);
  const status = attempt.status ? `${attempt.status}` : "network";
  return `${label || "request"} -> ${status}`;
}

/** When one candidate failed, the message often already starts with "GET /path …"; skip redundant "Tried:". */
function shouldOmitTriedSuffix(message: unknown, attempts: unknown) {
  if (!Array.isArray(attempts) || attempts.length !== 1) return false;
  const a = attempts[0] as Record<string, unknown>;
  const label = formatRequestLabel(a).trim();
  const msg = String(message || "").trim();
  if (!label || !msg) return false;
  return msg.startsWith(label) || msg.startsWith(`${label}:`) || msg.startsWith(`${label} `);
}

export function toTrackedRequestError(message: unknown, attempts: unknown[] = [], cause: unknown = null) {
  const cleanAttempts = Array.isArray(attempts) ? attempts.filter(Boolean) : [];
  const suffix =
    cleanAttempts.length && !shouldOmitTriedSuffix(message, cleanAttempts)
      ? ` Tried: ${cleanAttempts.map(formatAttempt).join("; ")}`
      : "";
  const err = new Error(`${message}${suffix}`);
  err.attempts = cleanAttempts;
  if (cause) err.cause = cause;
  const last = cleanAttempts[cleanAttempts.length - 1] as Record<string, unknown> | undefined;
  if (last && typeof last.status === "number") err.status = last.status;
  return err;
}

export async function requestWithFallbacks(candidates: unknown, options: Record<string, unknown> = {}) {
  const {
    method = "GET",
    body,
    signal,
    headers,
    credentials = "include",
    fallbackStatuses: fallbackStatusesRaw = [400, 403, 404, 405],
    notFoundMessage = "API endpoint not found.",
    parseFallback = {},
  } = options;
  const fallbackStatuses = fallbackStatusesRaw as number[];
  const attempts = [];
  const list = Array.isArray(candidates) ? candidates : [candidates];

  for (const rawCandidate of list) {
    const candidate = normalizeFallbackCandidate(rawCandidate, { method }) as Record<string, unknown>;
    const requestMethod = String(candidate.method || method || "GET").toUpperCase();
    const path = String(candidate.path || "").trim();
    if (!path) continue;
    const requestHeaders =
      candidate.headers && typeof candidate.headers === "object"
        ? (candidate.headers as HeadersInit)
        : (headers as HeadersInit | undefined);
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
        signal: signal as AbortSignal | undefined,
        credentials: credentials as RequestCredentials,
        headers: requestHeaders,
        ...(requestBody !== undefined ? { body: requestBody as BodyInit } : {}),
      });
    } catch (err: unknown) {
      if (err && typeof err === "object" && "name" in err && (err as { name?: string }).name === "AbortError") throw err;
      attempts.push({
        method: requestMethod,
        path,
        message: err instanceof Error ? err.message : "Network request failed.",
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

export async function parseResponse(res: Response, fallback?: unknown) {
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) return res.json().catch(() => ({}));
  if (contentType.includes("application/octet-stream")) return res.blob();
  if (contentType.includes("application/pdf")) return res.blob();
  if (fallback != null) return fallback;
  return res.text().catch(() => "");
}

function isLocalhostApiBase(base: string) {
  const normalized = String(base ?? "").trim();
  if (!normalized) return false;
  try {
    const url = new URL(normalized.startsWith("http") ? normalized : `http://${normalized}`);
    const host = url.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

function isProductionBrowserHost() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return host !== "localhost" && host !== "127.0.0.1";
}

export function getApiBaseUrl() {
  const runtime = getAppSettings()?.apiBaseUrl;
  const runtimeBase = String(runtime ?? "").trim();
  if (runtimeBase) {
    const normalized = runtimeBase.endsWith("/") ? runtimeBase.slice(0, -1) : runtimeBase;
    const base = normalizeBase(normalized);
    if (isProductionBrowserHost() && isLocalhostApiBase(base)) {
      // Ignore stale local dev Settings values on deployed hosts.
    } else if (import.meta.env.DEV && base) {
      const proxy = String(import.meta.env?.VITE_API_DEV_PROXY ?? "http://localhost:8080").trim();
      try {
        if (new URL(base).origin === new URL(proxy).origin) return "";
      } catch {
        void 0;
      }
      return base;
    } else if (base) {
      return base;
    }
  }

  const rawEnv = (import.meta?.env?.VITE_API_BASE_URL ?? "").toString().trim();
  if (rawEnv) {
    const normalized = rawEnv.endsWith("/") ? rawEnv.slice(0, -1) : rawEnv;
    return normalizeBase(normalized);
  }

  return "";
}

function normalizeBase(base) {
  const b = String(base ?? "").trim();
  if (!b) return "";
  if (b.startsWith("http://") || b.startsWith("https://")) return b;
  // Handle configs like "host:port/api/v1" (no protocol).
  return `http://${b}`;
}

export function buildApiUrl(path) {
  const p = String(path || "");
  if (!p) return p;
  if (p.startsWith("http://") || p.startsWith("https://")) return p;

  let normalizedPath = p.startsWith("/") ? p : `/${p}`;
  // Vite same-origin Webtrak proxy — never prefix with Pulse API base / Settings apiBaseUrl.
  if (normalizedPath === "/__webtrak" || normalizedPath.startsWith("/__webtrak/")) {
    return normalizedPath;
  }

  const base = getApiBaseUrl();

  // If base already includes "/api/v1" (common), avoid accidental "/api/v1/api/v1".
  // Example:
  // - base = https://rtportal.webknot-dev.in/api/v1
  // - path = /api/v1/auth/me  -> should become https://rtportal.webknot-dev.in/api/v1/auth/me
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

export async function ensureCsrfCookie({
  signal,
  headers,
  forceRefresh = false,
}: ApiOptions & { forceRefresh?: boolean } = {} as ApiOptions) {
  if (!forceRefresh && hasCsrfCookie()) return true;
  const candidates = [
    "/api/v1/profile",
    "/api/v1/submission-cycles",
    "/api/v1/users?page=0&size=1",
    "/api/v1/department-list",
    "/api/v1/settings",
  ];

  for (const path of candidates) {
    try {
      await fetch(buildApiUrl(path), {
        method: "GET",
        signal,
        credentials: "include",
        headers: headers && typeof headers === "object" ? (headers as HeadersInit) : undefined,
      });
    } catch { void 0; }
    if (hasCsrfCookie()) return true;
  }

  return hasCsrfCookie();
}
