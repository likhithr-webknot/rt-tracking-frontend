import { buildApiUrl, withCsrfHeaders } from "./http.js";

// Keep auth only in memory (no localStorage key).
// With HttpOnly cookie auth, the access token is not available to JS; we store only non-sensitive session info.
const LEGACY_AUTH_STORAGE_KEY = "rt_tracking_auth_v1";
const SESSION_STORAGE_KEY = "rt_tracking_session_v1";
const MANUAL_LOGOUT_STORAGE_KEY = "rt_tracking_manual_logout_v1";
let memoryAuth = null;

function shouldPersistAccessToken() {
  const flag = String(import.meta?.env?.VITE_PERSIST_ACCESS_TOKEN ?? "").trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  // Dev default: persist in sessionStorage so refresh doesn't break token-based auth.
  if (import.meta?.env?.DEV) return true;
  return false;
}

function firstNonEmptyString(...values) {
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

function firstNullableString(...values) {
  const s = firstNonEmptyString(...values);
  return s ? s : null;
}

function cleanupLegacyAuthStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
  } catch {
    // ignore
  }
}

cleanupLegacyAuthStorage();

function cleanupSessionStorage() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function loadSessionFromStorage() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const accessToken =
      shouldPersistAccessToken() && typeof parsed.accessToken === "string"
        ? String(parsed.accessToken || "").trim() || null
        : null;
    return {
      accessToken,
      tokenType: String(parsed.tokenType || "Bearer"),
      role: String(parsed.role || ""),
      portal: typeof parsed.portal === "string" ? parsed.portal : null,
      email: typeof parsed.email === "string" ? parsed.email : null,
      employeeId: typeof parsed.employeeId === "string" ? parsed.employeeId : null,
      employeeName: typeof parsed.employeeName === "string" ? parsed.employeeName : null,
      designation: typeof parsed.designation === "string" ? parsed.designation : null,
      stream: typeof parsed.stream === "string" ? parsed.stream : null,
      band: typeof parsed.band === "string" ? parsed.band : null,
      managerId: typeof parsed.managerId === "string" ? parsed.managerId : null,
      claims: null,
    };
  } catch {
    return null;
  }
}

memoryAuth = loadSessionFromStorage();

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function base64UrlDecode(input) {
  const normalized = String(input).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
}

export function decodeJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const json = base64UrlDecode(parts[1]);
    const payload = JSON.parse(json);
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

async function readError(res) {
  const text = await res.text().catch(() => "");
  const parsed = safeJsonParse(text);
  return (
    parsed?.message ||
    parsed?.error ||
    text ||
    `Request failed: ${res.status} ${res.statusText}`
  );
}

async function toHttpError(res) {
  const message = await readError(res);
  const err = new Error(message);
  err.status = res.status;
  return err;
}

export function getAuth() {
  if (!memoryAuth) memoryAuth = loadSessionFromStorage();
  return memoryAuth;
}

export function setAuth(auth) {
  cleanupLegacyAuthStorage();
  const prev = memoryAuth || loadSessionFromStorage() || {};
  const root = auth && typeof auth === "object" ? auth : {};
  // Some backends wrap the payload as { data: ... }.
  const obj =
    root?.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? root.data
      : root;

  const accessTokenRaw =
    obj.accessToken != null || obj.access_token != null || obj.token != null || obj.jwt != null
      ? String(obj.accessToken ?? obj.access_token ?? obj.token ?? obj.jwt).trim()
      : prev?.accessToken
        ? String(prev.accessToken).trim()
        : "";
  const accessToken = accessTokenRaw ? accessTokenRaw : null;

  const tokenType = firstNonEmptyString(obj.tokenType, obj.token_type, prev?.tokenType, "Bearer");
  const claims = accessToken ? decodeJwtPayload(accessToken) : null;

  const role = firstNonEmptyString(obj.role, obj.empRole, obj.userRole, prev?.role);
  const portal = firstNullableString(obj.portal, prev?.portal);
  const email = firstNullableString(obj.email, obj.employeeEmail, obj.mail, prev?.email);
  const employeeId = firstNullableString(obj.employeeId, obj.empId, obj.id, prev?.employeeId);
  const employeeName = firstNullableString(
    obj.employeeName,
    obj.name,
    obj.fullName,
    prev?.employeeName
  );
  const designation = firstNullableString(
    obj.designation,
    obj.title,
    obj.jobTitle,
    prev?.designation
  );
  const stream = firstNullableString(obj.stream, obj.context, prev?.stream);
  const band = firstNullableString(obj.band, obj.level, prev?.band);
  const managerId = firstNullableString(obj.managerId, prev?.managerId);

  memoryAuth = {
    accessToken,
    tokenType,
    role,
    portal,
    email,
    employeeId,
    employeeName,
    designation,
    stream,
    band,
    managerId,
    claims,
  };

  // Persist only non-sensitive session info to survive refresh in the same tab.
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          ...(shouldPersistAccessToken() && memoryAuth.accessToken
            ? { accessToken: memoryAuth.accessToken }
            : {}),
          tokenType: memoryAuth.tokenType,
          role: memoryAuth.role,
          portal: memoryAuth.portal,
          email: memoryAuth.email,
          employeeId: memoryAuth.employeeId,
          employeeName: memoryAuth.employeeName,
          designation: memoryAuth.designation,
          stream: memoryAuth.stream,
          band: memoryAuth.band,
          managerId: memoryAuth.managerId,
        })
      );
    } catch {
      // ignore storage errors
    }
  }
}

export function clearAuth() {
  memoryAuth = null;
  cleanupLegacyAuthStorage();
  cleanupSessionStorage();
}

export function markManualLogout() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MANUAL_LOGOUT_STORAGE_KEY, "1");
  } catch {
    // ignore
  }
}

export function clearManualLogoutMark() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(MANUAL_LOGOUT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function hasManualLogoutMark() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MANUAL_LOGOUT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function getAuthHeader() {
  const auth = getAuth();
  if (!auth?.accessToken) return null;
  const type = auth.tokenType || "Bearer";
  return `${type} ${auth.accessToken}`;
}

// Default assumption: POST /auth/login { email, password } sets HttpOnly cookie and returns { tokenType, role, portal }.
// If your backend also returns accessToken, we accept it, but we do not persist it.
export async function login({ email, password }) {
  const res = await fetch(buildApiUrl("/auth/login"), {
    method: "POST",
    credentials: "include",
    headers: withCsrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw await toHttpError(res);
  const data = await res.json().catch(() => ({}));
  if (!data || typeof data !== "object") throw new Error("Login failed.");
  return data;
}

// GET /auth/me -> current employee profile (cookie or Authorization header)
export async function fetchMe({ signal } = {}) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/auth/me"), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(await readError(res));
  return res.json().catch(() => ({}));
}

// POST /auth/forgot-password { email } -> { message, resetToken, expiresAt }
export async function forgotPassword({ email }) {
  const res = await fetch(buildApiUrl("/auth/forgot-password"), {
    method: "POST",
    credentials: "include",
    headers: withCsrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}

// POST /auth/reset-password { token, newPassword } -> "Password reset successful"
export async function resetPassword({ token, newPassword }) {
  const res = await fetch(buildApiUrl("/auth/reset-password"), {
    method: "POST",
    credentials: "include",
    headers: withCsrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ token, newPassword }),
  });
  if (!res.ok) throw await toHttpError(res);
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  return res.text().catch(() => "");
}
