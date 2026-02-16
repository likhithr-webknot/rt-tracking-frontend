import { buildApiUrl } from "./http.js";

// Keep auth only in memory (no localStorage key).
// With HttpOnly cookie auth, the access token is not available to JS; we store only non-sensitive session info.
const LEGACY_AUTH_STORAGE_KEY = "rt_tracking_auth_v1";
const SESSION_STORAGE_KEY = "rt_tracking_session_v1";
let memoryAuth = null;

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
    return {
      accessToken: null,
      tokenType: String(parsed.tokenType || "Bearer"),
      role: String(parsed.role || ""),
      portal: typeof parsed.portal === "string" ? parsed.portal : null,
      email: typeof parsed.email === "string" ? parsed.email : null,
      employeeId: typeof parsed.employeeId === "string" ? parsed.employeeId : null,
      employeeName: typeof parsed.employeeName === "string" ? parsed.employeeName : null,
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

export function getAuth() {
  if (!memoryAuth) memoryAuth = loadSessionFromStorage();
  return memoryAuth;
}

export function setAuth(auth) {
  cleanupLegacyAuthStorage();
  const obj = auth && typeof auth === "object" ? auth : {};
  const accessToken = obj.accessToken ? String(obj.accessToken) : null;
  const tokenType = obj.tokenType ? String(obj.tokenType) : "Bearer";
  const claims = accessToken ? decodeJwtPayload(accessToken) : null;
  memoryAuth = {
    accessToken,
    tokenType,
    role: String(obj.role || ""),
    portal: typeof obj.portal === "string" ? obj.portal : null,
    email: typeof obj.email === "string" ? obj.email : null,
    employeeId: typeof obj.employeeId === "string" ? obj.employeeId : null,
    employeeName: typeof obj.employeeName === "string" ? obj.employeeName : null,
    stream: typeof obj.stream === "string" ? obj.stream : null,
    band: typeof obj.band === "string" ? obj.band : null,
    managerId: typeof obj.managerId === "string" ? obj.managerId : null,
    claims,
  };

  // Persist only non-sensitive session info to survive refresh in the same tab.
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          tokenType: memoryAuth.tokenType,
          role: memoryAuth.role,
          portal: memoryAuth.portal,
          email: memoryAuth.email,
          employeeId: memoryAuth.employeeId,
          employeeName: memoryAuth.employeeName,
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json().catch(() => ({}));
  if (!data || typeof data !== "object") throw new Error("Login failed.");
  return data;
}

// GET /auth/me -> current employee profile (cookie or Authorization header)
export async function fetchMe({ signal } = {}) {
  const res = await fetch(buildApiUrl("/auth/me"), {
    signal,
    credentials: "include",
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json().catch(() => ({}));
}

// POST /auth/reset-password { token, newPassword } -> "Password reset successful"
export async function resetPassword({ token, newPassword }) {
  const res = await fetch(buildApiUrl("/auth/reset-password"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, newPassword }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  return res.text().catch(() => "");
}
