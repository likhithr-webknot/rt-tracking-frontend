import { z } from "zod";
import { buildApiUrl, getCookieValue, readError, safeJsonParse, withCsrfHeaders } from "./http.js";
const LEGACY_AUTH_STORAGE_KEY = "rt_tracking_auth_v1";
const SESSION_STORAGE_KEY = "rt_tracking_session_v1";
const MANUAL_LOGOUT_STORAGE_KEY = "rt_tracking_manual_logout_v1";
let memoryAuth = null;
const SessionStorageSchema = z.object({
  accessToken: z.string().nullable().optional(),
  tokenType: z.string().optional(),
  userId: z.string().nullable().optional(),
  role: z.string().optional(),
  portal: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  employeeId: z.string().nullable().optional(),
  employeeName: z.string().nullable().optional(),
  designation: z.string().nullable().optional(),
  stream: z.string().nullable().optional(),
  band: z.string().nullable().optional(),
  managerId: z.string().nullable().optional(),
}).passthrough();
const JwtPayloadSchema = z.object({}).passthrough();

function shouldPersistAccessToken() {
  const disable = String(import.meta?.env?.VITE_DISABLE_PERSIST_ACCESS_TOKEN ?? "").trim().toLowerCase();
  if (disable === "1" || disable === "true" || disable === "yes") return false;
  const legacy = String(import.meta?.env?.VITE_PERSIST_ACCESS_TOKEN ?? "").trim().toLowerCase();
  if (legacy === "0" || legacy === "false" || legacy === "no") return false;
  return true;
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

function normalizeRoleKey(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  return raw.startsWith("role_") ? raw.slice(5) : raw;
}

function canonicalRoleFromKey(key) {
  const k = normalizeRoleKey(key);
  if (!k) return "";
  if (k.includes("admin") || k === "hr") return "Admin";
  if (k.includes("manager")) return "Manager";
  if (k.includes("employee") || k.includes("user")) return "Employee";
  return "";
}

function bestRole(...values) {
  const keys = [];
  for (const value of values) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item == null) continue;
        if (typeof item === "string") {
          const key = normalizeRoleKey(item);
          if (key) keys.push(key);
        } else if (typeof item === "object") {
          const key = normalizeRoleKey(
            firstNonEmptyString(item.role, item.authority, item.name, item.value)
          );
          if (key) keys.push(key);
        }
      }
      continue;
    }
    const key = normalizeRoleKey(value);
    if (key) keys.push(key);
  }

  // Privilege precedence: Admin > Manager > Employee.
  if (keys.some((k) => k.includes("admin") || k === "hr")) return "Admin";
  if (keys.some((k) => k.includes("manager"))) return "Manager";
  if (keys.some((k) => k.includes("employee") || k.includes("user"))) return "Employee";

  const fallback = keys.find(Boolean) || "";
  return canonicalRoleFromKey(fallback) || "";
}

function firstRoleLikeString(collection) {
  if (!Array.isArray(collection)) return "";
  for (const item of collection) {
    if (item == null) continue;
    if (typeof item === "string") {
      const s = String(item).trim();
      if (s) return s;
      continue;
    }
    if (typeof item === "object") {
      const s = firstNonEmptyString(item.role, item.authority, item.name, item.value);
      if (s) return s;
    }
  }
  return "";
}

function extractRole(obj) {
  const source = obj && typeof obj === "object" ? obj : {};
  return bestRole(
    source.role,
    source.empRole,
    source.userRole,
    source.roleName,
    source.roleType,
    source.roles,
    source.authorities,
    source.grantedAuthorities,
    source.portal,
    firstRoleLikeString(source.roles),
    firstRoleLikeString(source.authorities),
    firstRoleLikeString(source.grantedAuthorities)
  );
}

function cleanupLegacyAuthStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
  } catch { void 0; }
}

cleanupLegacyAuthStorage();

function cleanupSessionStorage() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch { void 0; }
}

function loadSessionFromStorage() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = safeJsonParse(raw, SessionStorageSchema, null);
    if (!parsed || typeof parsed !== "object") return null;
    const accessToken =
      shouldPersistAccessToken() && typeof parsed.accessToken === "string"
        ? String(parsed.accessToken || "").trim() || null
        : null;
    return {
      accessToken,
      tokenType: String(parsed.tokenType || "Bearer"),
      userId: typeof parsed.userId === "string" ? parsed.userId : null,
      id: typeof parsed.userId === "string" ? parsed.userId : null,
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
    const payload = safeJsonParse(json, JwtPayloadSchema, null);
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

export function getAuth() {
  if (!memoryAuth) memoryAuth = loadSessionFromStorage();
  return memoryAuth;
}

export function setAuth(auth) {
  cleanupLegacyAuthStorage();
  const prev = memoryAuth || loadSessionFromStorage() || {};
  const root = auth && typeof auth === "object" ? auth : {};
  const obj =
    root?.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? root.data
      : root;

  // Backend payloads often include accessToken: null or "". Using ?? would keep "" and wipe a good JWT.
  const incomingTokenRaw = firstNonEmptyString(
    obj.accessToken,
    obj.access_token,
    obj.token,
    obj.jwt
  );
  const hasIncomingToken = Boolean(incomingTokenRaw);

  const previewClaims = incomingTokenRaw ? decodeJwtPayload(incomingTokenRaw) : null;
  const extractedRole = firstNonEmptyString(extractRole(obj), extractRole(previewClaims || {}));
  const incomingRole = extractedRole;
  const incomingEmail = firstNonEmptyString(obj.email, obj.employeeEmail, obj.mail);
  const incomingEmployeeId = firstNonEmptyString(obj.employeeId, obj.empId, obj.id);
  const incomingUserId = firstNonEmptyString(obj.userId, obj.id);
  const incomingEmployeeName = firstNonEmptyString(obj.employeeName, obj.name, obj.fullName);

  const identityChanged = Boolean(
    (incomingRole && prev?.role && incomingRole !== String(prev.role)) ||
    (incomingEmail && prev?.email && incomingEmail.toLowerCase() !== String(prev.email).toLowerCase()) ||
    (incomingEmployeeId && prev?.employeeId && incomingEmployeeId !== String(prev.employeeId)) ||
    (incomingUserId && prev?.userId && incomingUserId !== String(prev.userId)) ||
    (incomingEmployeeName && prev?.employeeName && incomingEmployeeName !== String(prev.employeeName))
  );

  const accessTokenRaw = hasIncomingToken
    ? incomingTokenRaw
    : identityChanged
      ? ""
      : (prev?.accessToken ? String(prev.accessToken).trim() : "");
  const accessToken = accessTokenRaw ? accessTokenRaw : null;

  const tokenType = firstNonEmptyString(obj.tokenType, obj.token_type, prev?.tokenType, "Bearer");
  let claims = accessToken ? decodeJwtPayload(accessToken) : null;
  if (!claims && obj?.claims && typeof obj.claims === "object") {
    claims = obj.claims;
  }

  const role = firstNonEmptyString(
    extractedRole,
    bestRole(prev?.role, prev?.portal, prev?.claims?.role, prev?.claims?.roles, prev?.claims?.authorities),
    prev?.role
  );
  const portal = firstNullableString(obj.portal, prev?.portal);
  const userId = firstNullableString(obj.userId, obj.id, prev?.userId);
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
    userId,
    id: userId,
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
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          ...(shouldPersistAccessToken() && memoryAuth.accessToken
            ? { accessToken: memoryAuth.accessToken }
            : {}),
          tokenType: memoryAuth.tokenType,
          userId: memoryAuth.userId,
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
    } catch { void 0; }
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
  } catch { void 0; }
}

export function clearManualLogoutMark() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(MANUAL_LOGOUT_STORAGE_KEY);
  } catch { void 0; }
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
  const rawEnvToken = String(import.meta?.env?.VITE_RAW_AUTHORIZATION_TOKEN ?? "").trim();

  // If a raw Authorization token is provided via env, use it.
  // This sends: `Authorization: <token>` (no Bearer prefix).
  if (rawEnvToken) return rawEnvToken;

  const cookieToken =
    firstNonEmptyString(
      getCookieValue("accessToken"),
      getCookieValue("access_token"),
      getCookieValue("jwt"),
      getCookieValue("token")
    ) || "";
  const token = auth?.accessToken || cookieToken;
  if (!token) return null;

  const type = String(auth?.tokenType ?? "Bearer").trim();

  // Support sending raw token (no scheme), e.g. tokenType="".
  if (!type || type.toLowerCase() === "raw" || type.toLowerCase() === "none") return String(auth.accessToken);

  return `${type} ${token}`;
}

/** OAuth redirects may put tokens in query or hash (#access_token=…). */
export function getOAuthTokenFromWindow() {
  if (typeof window === "undefined") return "";
  const search = new URLSearchParams(String(window.location.search || ""));
  const hash = new URLSearchParams(
    window.location.hash && window.location.hash.length > 1 ? window.location.hash.slice(1) : ""
  );
  const keys = ["token", "accessToken", "access_token", "jwt", "id_token"];
  for (const params of [search, hash]) {
    for (const key of keys) {
      const s = firstNonEmptyString(params.get(key));
      if (s) return s;
    }
  }
  return "";
}

function normalizeMePayload(raw) {
  if (!raw || typeof raw !== "object") return {};
  let inner = raw?.data != null && typeof raw.data === "object" && !Array.isArray(raw.data) ? raw.data : raw;
  if (inner?.user && typeof inner.user === "object" && !Array.isArray(inner.user)) {
    inner = { ...inner.user, ...inner };
  }
  return inner;
}

function extractRoleHintFromPayload(raw) {
  if (raw == null) return "";
  if (typeof raw === "string") return String(raw).trim();
  if (Array.isArray(raw)) return firstRoleLikeString(raw);
  if (typeof raw !== "object") return "";

  const root = raw;
  const nestedData =
    root?.data && typeof root.data === "object" && !Array.isArray(root.data) ? root.data : null;
  const nestedUser =
    root?.user && typeof root.user === "object" && !Array.isArray(root.user) ? root.user : null;

  return firstNonEmptyString(
    extractRole(root),
    nestedData ? extractRole(nestedData) : "",
    nestedUser ? extractRole(nestedUser) : "",
    root?.role,
    root?.empRole,
    root?.userRole,
    nestedData?.role,
    nestedUser?.role
  );
}

async function fetchRoleHint({ signal, headers, email } = {}) {
  const safeEmail = String(email ?? "").trim();
  const candidates = safeEmail
    ? [`/api/v1/user/role?email=${encodeURIComponent(safeEmail)}`, "/api/v1/user/role"]
    : ["/api/v1/user/role"];

  for (const path of candidates) {
    const res = await fetch(buildApiUrl(path), {
      method: "GET",
      signal,
      credentials: "include",
      headers,
    });
    if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 405) {
      continue;
    }
    if (!res.ok) continue;

      const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      const payload = await res.json().catch(() => ({}));
      const hint = extractRoleHintFromPayload(payload);
      if (hint) return hint;
      continue;
    }
    const text = (await res.text().catch(() => "")).trim();
    if (text) return text;
  }
  return "";
}

const GOOGLE_SIGNIN_PATH = "/api/v1/google-signin";
const OAUTH_BYPASS_PATH_PREFIX = "/oauth/bypass";
const LOGOUT_PATH_CANDIDATES = ["/api/v1/auth/logout", "/auth/logout", "/logout"];
const ME_PATH_CANDIDATES = ["/api/v1/profile", "/auth/me", "/api/v1/auth/me", "/api/auth/me"];

export function getGoogleSignInUrl() {
  return buildApiUrl(GOOGLE_SIGNIN_PATH);
}

export function getOAuthBypassUrl(email) {
  const safeEmail = encodeURIComponent(String(email ?? "").trim());
  if (!safeEmail) return "";
  return buildApiUrl(`${OAUTH_BYPASS_PATH_PREFIX}/${safeEmail}`);
}

export async function oauthBypass(email, { signal } = {}) {
  const safeEmail = encodeURIComponent(String(email ?? "").trim());
  if (!safeEmail) throw new Error("email is required for oauth bypass.");
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl(`${OAUTH_BYPASS_PATH_PREFIX}/${safeEmail}`), {
    method: "GET",
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw new Error(await readError(res));
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json().catch(() => ({}));
  return res.text().catch(() => "");
}

export async function logout({ signal } = {}) {
  const auth = getAuthHeader();
  const headers = withCsrfHeaders(auth ? { Authorization: auth } : undefined);
  let lastErr = null;

  for (const path of LOGOUT_PATH_CANDIDATES) {
    const res = await fetch(buildApiUrl(path), {
      method: "POST",
      signal,
      credentials: "include",
      headers,
    });
    if (res.ok || res.status === 401) return true;
    if (res.status === 404 || res.status === 405) continue;
    lastErr = new Error(await readError(res));
    lastErr.status = res.status;
    break;
  }

  if (lastErr) throw lastErr;
  return false;
}

export async function fetchMe({ signal } = {}) {
  const auth = getAuthHeader();
  const headers = auth ? { Authorization: auth } : undefined;
  let lastNon404Error = null;
  let any404 = false;

  for (const path of ME_PATH_CANDIDATES) {
    const res = await fetch(buildApiUrl(path), {
      signal,
      credentials: "include",
      headers,
    });
    if (res.status === 401) return null;
    if (res.status === 404 || res.status === 405) {
      any404 = true;
      continue;
    }
    if (!res.ok) {
      lastNon404Error = new Error(await readError(res));
      continue;
    }
    const raw = await res.json().catch(() => ({}));
    const normalized = normalizeMePayload(raw);
    // Always prefer dedicated role endpoint when available.
    const roleHintEmail =
      normalized?.email ??
      normalized?.employeeEmail ??
      normalized?.mail ??
      normalized?.claims?.sub ??
      "";
    const roleHint = await fetchRoleHint({ signal, headers, email: roleHintEmail }).catch(() => "");
    if (!roleHint) return normalized;
    return { ...normalized, role: roleHint };
  }

  if (lastNon404Error) throw lastNon404Error;
  if (any404) {
    throw new Error(
      `Profile endpoint not found (tried ${ME_PATH_CANDIDATES.join(", ")}). Check API base URL and backend routes.`
    );
  }
  return null;
}
