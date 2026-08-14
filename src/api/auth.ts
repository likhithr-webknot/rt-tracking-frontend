import { coerceDisplayString } from "../utils/coerceDisplayString";
import { z } from "zod";
import { buildApiUrl, getCookieValue, readError, safeJsonParse, withCsrfHeaders } from "./http";
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
  needsOnboarding: z.boolean().optional(),
  /** Absolute session start (ms since epoch). */
  issuedAt: z.number().nullable().optional(),
  /** Last user activity (ms since epoch). */
  lastActivityAt: z.number().nullable().optional(),
}).passthrough();

/** Absolute max session length (8 hours). */
export const SESSION_MAX_MS = 8 * 60 * 60 * 1000;
/** Logout after this much idle time (30 minutes). */
export const SESSION_INACTIVITY_MS = 30 * 60 * 1000;
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

/** Super Admin portal emails from VITE_ADMIN_EMAILS (comma-separated). Not used for QA seeding. */
function portalAdminEmailSet() {
  const s = new Set();
  const raw = String(import.meta?.env?.VITE_ADMIN_EMAILS ?? "").trim();
  if (raw) {
    for (const p of raw
      .split(/[,;\s]+/)
      .map((x) => String(x).trim().toLowerCase())
      .filter(Boolean)) {
      s.add(p);
    }
  }
  return s;
}

export function isPortalAdminEmail(email) {
  const e = String(email ?? "").trim().toLowerCase();
  if (!e) return false;
  return portalAdminEmailSet().has(e);
}

function isAdminAllowlistedEmail(email) {
  return isPortalAdminEmail(email);
}

/** Prefer explicit user fields; fall back to common JWT claim names. */
export function extractEmailFromSources(obj, claims) {
  const o = obj && typeof obj === "object" ? obj : {};
  const c = claims && typeof claims === "object" ? claims : {};
  const sub = typeof c.sub === "string" ? c.sub.trim() : "";
  const subEmail = sub.includes("@") ? sub : "";
  return firstNonEmptyString(
    o.email,
    o.employeeEmail,
    o.mail,
    o.userEmail,
    c.email,
    c.mail,
    subEmail,
    c.preferred_username,
    c.upn,
    c.unique_name
  );
}

function applyAdminEmailAllowlist(email, role) {
  if (!isAdminAllowlistedEmail(email)) return role;
  return "Admin";
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
  if (k.includes("finance") || k.includes("asset")) return "Admin";
  if (k.includes("manager")) return "Manager";
  if (k.includes("employee") || k.includes("user")) return "Employee";
  return "";
}

function explicitRoleFromObject(source) {
  const obj = source && typeof source === "object" ? source : {};
  const direct = firstNonEmptyString(
    obj.activeRole,
    obj.currentRole,
    obj.selectedRole,
    obj.role,
    obj.empRole,
    obj.userRole,
    obj.roleName,
    obj.roleType,
  );
  return canonicalRoleFromKey(direct) || "";
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
  if (keys.some((k) => k.includes("finance") || k.includes("asset"))) return "Admin";
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
  const explicit = explicitRoleFromObject(source);
  if (explicit) return explicit;
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

type StoredSession = z.infer<typeof SessionStorageSchema>;

function loadSessionFromStorage() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = safeJsonParse(raw, SessionStorageSchema, null) as StoredSession | null;
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
      needsOnboarding: parsed.needsOnboarding === true,
      issuedAt: typeof parsed.issuedAt === "number" ? parsed.issuedAt : null,
      lastActivityAt: typeof parsed.lastActivityAt === "number" ? parsed.lastActivityAt : null,
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
    const payload = safeJsonParse(json, JwtPayloadSchema, null) as Record<string, unknown> | null;
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

export function getAuth() {
  if (!memoryAuth) memoryAuth = loadSessionFromStorage();
  return memoryAuth;
}

/** Why the session should end now, or null if still valid. */
export function getSessionExpiryReason(now = Date.now()) {
  const auth = getAuth();
  if (!auth) return "missing";
  const signedIn = Boolean(auth.email || auth.accessToken);
  if (!signedIn) return "missing";

  const issuedAt = typeof auth.issuedAt === "number" ? auth.issuedAt : null;
  const lastActivityAt =
    typeof auth.lastActivityAt === "number"
      ? auth.lastActivityAt
      : issuedAt;

  if (issuedAt != null && now - issuedAt >= SESSION_MAX_MS) {
    return "max_duration";
  }
  if (lastActivityAt != null && now - lastActivityAt >= SESSION_INACTIVITY_MS) {
    return "inactivity";
  }
  // Legacy sessions without timers: start the clock now (do not log out immediately).
  if (issuedAt == null || lastActivityAt == null) {
    touchSessionActivity({ ensureIssuedAt: true });
  }
  return null;
}

export function isSessionExpired(now = Date.now()) {
  const reason = getSessionExpiryReason(now);
  return reason === "max_duration" || reason === "inactivity";
}

/**
 * Update lastActivityAt (and issuedAt on first touch). Persists to sessionStorage.
 * No-op when signed out.
 */
export function touchSessionActivity({ ensureIssuedAt = false } = {}) {
  const auth = getAuth();
  if (!auth) return null;
  const signedIn = Boolean(auth.email || auth.accessToken);
  if (!signedIn) return null;

  const now = Date.now();
  const issuedAt =
    typeof auth.issuedAt === "number" && auth.issuedAt > 0
      ? auth.issuedAt
      : ensureIssuedAt || auth.issuedAt == null
        ? now
        : auth.issuedAt;

  memoryAuth = {
    ...auth,
    issuedAt,
    lastActivityAt: now,
  };
  persistSessionFields(memoryAuth);
  return memoryAuth;
}

function persistSessionFields(session) {
  if (typeof window === "undefined" || !session) return;
  try {
    window.sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        ...(shouldPersistAccessToken() && session.accessToken
          ? { accessToken: session.accessToken }
          : {}),
        tokenType: session.tokenType,
        userId: session.userId,
        role: session.role,
        portal: session.portal,
        email: session.email,
        employeeId: session.employeeId,
        employeeName: session.employeeName,
        designation: session.designation,
        stream: session.stream,
        band: session.band,
        managerId: session.managerId,
        needsOnboarding: session.needsOnboarding,
        issuedAt: session.issuedAt ?? null,
        lastActivityAt: session.lastActivityAt ?? null,
      })
    );
  } catch { void 0; }
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
  const extractedRole = firstNonEmptyString(
    explicitRoleFromObject(obj),
    explicitRoleFromObject(previewClaims || {}),
    extractRole(obj),
    extractRole(previewClaims || {})
  );
  const incomingRole = extractedRole;
  const incomingEmail = extractEmailFromSources(obj, previewClaims);
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
    : prev?.accessToken
      ? String(prev.accessToken).trim()
      : "";
  const accessToken = accessTokenRaw ? accessTokenRaw : null;

  const tokenType = firstNonEmptyString(obj.tokenType, obj.token_type, prev?.tokenType, "Bearer");
  let claims = accessToken ? decodeJwtPayload(accessToken) : null;
  if (!claims && obj?.claims && typeof obj.claims === "object") {
    claims = obj.claims;
  }

  const email = firstNullableString(
    extractEmailFromSources(obj, claims),
    obj.email,
    obj.employeeEmail,
    obj.mail,
    prev?.email
  );

  let role = firstNonEmptyString(
    explicitRoleFromObject(obj),
    explicitRoleFromObject(claims || {}),
    extractedRole,
    bestRole(prev?.role, prev?.portal, prev?.claims?.role, prev?.claims?.roles, prev?.claims?.authorities),
    prev?.role
  );
  role = applyAdminEmailAllowlist(email, role);
  const portal = firstNullableString(obj.portal, prev?.portal);
  const userId = firstNullableString(obj.userId, obj.id, prev?.userId);
  const employeeId = firstNullableString(obj.employeeId, obj.empId, obj.id, prev?.employeeId);
  const employeeName = firstNullableString(
    obj.employeeName,
    obj.name,
    obj.fullName,
    prev?.employeeName
  );
  const picture = firstNullableString(
    obj.picture,
    obj.profilePic,
    obj.profilePhoto,
    obj.avatarUrl,
    obj.avatar,
    claims?.picture,
    prev?.picture,
    prev?.profilePic,
  );
  const profilePic = firstNullableString(
    obj.profilePic,
    obj.profilePhoto,
    obj.picture,
    prev?.profilePic,
    prev?.picture,
    picture,
  );
  const designation = firstNullableString(
    coerceDisplayString(obj.designation),
    coerceDisplayString(obj.title),
    coerceDisplayString(obj.jobTitle),
    coerceDisplayString(prev?.designation),
  );
  const stream = firstNullableString(
    coerceDisplayString(obj.stream),
    coerceDisplayString(obj.context),
    coerceDisplayString(obj.department),
    coerceDisplayString(prev?.stream),
  );
  const band = firstNullableString(
    coerceDisplayString(obj.band),
    coerceDisplayString(obj.level),
    coerceDisplayString(prev?.band),
  );
  const managerId = firstNullableString(obj.managerId, prev?.managerId);
  const needsOnboarding =
    obj.needsOnboarding === true
      ? true
      : obj.needsOnboarding === false
        ? false
        : prev?.needsOnboarding === true;

  const empRole = firstNonEmptyString(
    obj.role,
    obj.empRole,
    obj.portalRole,
    claims?.role,
    prev?.empRole,
  );

  const now = Date.now();
  const resetTimers = identityChanged || hasIncomingToken || !prev?.issuedAt;
  const issuedAt = resetTimers
    ? (typeof obj.issuedAt === "number" ? obj.issuedAt : now)
    : (typeof prev.issuedAt === "number" ? prev.issuedAt : now);
  const lastActivityAt = resetTimers
    ? now
    : (typeof prev.lastActivityAt === "number" ? prev.lastActivityAt : now);

  memoryAuth = {
    accessToken,
    tokenType,
    userId,
    id: userId,
    role,
    empRole: empRole || role,
    portalRole: firstNonEmptyString(obj.portalRole, empRole, prev?.portalRole),
    portal,
    email,
    employeeId,
    employeeName,
    picture,
    profilePic,
    avatarUrl: firstNullableString(obj.avatarUrl, prev?.avatarUrl, picture),
    designation,
    stream,
    band,
    managerId,
    needsOnboarding,
    claims,
    issuedAt,
    lastActivityAt,
  };
  persistSessionFields(memoryAuth);

  notifyAuthChanged();
}

/** Tell App listeners to sync React state from getAuth(). */
export function notifyAuthChanged() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("rt-auth-changed", { detail: memoryAuth }));
  } catch {
    void 0;
  }
}

const OAUTH_URL_PARAM_KEYS = ["token", "accessToken", "access_token", "jwt", "id_token"];

/** Remove OAuth tokens from the address bar so App bootstrap does not re-process them. */
export function stripOAuthParamsFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  let changed = false;
  for (const key of OAUTH_URL_PARAM_KEYS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (url.hash.length > 1) {
    const hash = new URLSearchParams(url.hash.slice(1));
    for (const key of OAUTH_URL_PARAM_KEYS) {
      if (hash.has(key)) hash.delete(key);
    }
    const rest = hash.toString();
    const nextHash = rest ? `#${rest}` : "";
    if (nextHash !== url.hash) {
      url.hash = nextHash;
      changed = true;
    }
  }
  if (!changed) return;
  const search = url.searchParams.toString();
  const next = url.pathname + (search ? `?${search}` : "") + url.hash;
  window.history.replaceState({}, "", next);
}

/** Read token from query/hash once, then strip from URL to avoid login loops on "/". */
export function consumeOAuthTokenFromUrl() {
  const token = getOAuthTokenFromWindow();
  if (token) stripOAuthParamsFromUrl();
  return token;
}

export function clearAuth() {
  memoryAuth = null;
  cleanupLegacyAuthStorage();
  cleanupSessionStorage();
  notifyAuthChanged();
}

/** Session established by password/OAuth login (survives stale bootstrap). */
export function hasRecoverableSession() {
  const session = getAuth();
  const email = String(session?.email ?? "").trim();
  if (!email) return false;
  return Boolean(session?.accessToken || getAuthHeader());
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

async function fetchRoleHint({ signal, headers, email } = {} as ApiOptions) {
  const safeEmail = String(email ?? "").trim().toLowerCase();
  const candidates = safeEmail
    ? [`/api/v1/user/role?email=${encodeURIComponent(safeEmail)}`]
    : ["/api/v1/user/role"];

  for (const path of candidates) {
    const res = await fetch(buildApiUrl(path), {
      method: "GET",
      signal,
      credentials: "include",
      headers: headers as HeadersInit | undefined,
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
      if (safeEmail) return "";
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
const ME_PATH_CANDIDATES = ["/api/v1/auth/me", "/api/v1/profile", "/auth/me", "/api/auth/me"];

function isLocalDevFrontendHost() {
  if (typeof window === "undefined") return import.meta.env.DEV;
  const host = window.location.hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}

/** Spring OAuth sets HttpOnly cookies on :8080; SPA needs code exchange + JWT in storage. */
export function shouldUseFrontendGoogleOAuth() {
  const clientId = String(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "").trim();
  if (clientId) return true;
  return isLocalDevFrontendHost();
}

export function getFrontendOAuthRedirectUri() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/auth/callback`;
  }

  const configured = String(import.meta.env.VITE_FRONTEND_URL ?? "").trim().replace(/\/+$/, "");
  if (configured) {
    return `${configured}/auth/callback`;
  }

  return "";
}

export function buildFrontendGoogleOAuthUrl() {
  const clientId = String(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "").trim();
  if (!clientId) return "";
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getFrontendOAuthRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    prompt: "consent",
    access_type: "offline",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function getGoogleSignInUrl() {
  if (shouldUseFrontendGoogleOAuth()) {
    const spaUrl = buildFrontendGoogleOAuthUrl();
    if (spaUrl) return spaUrl;
  }
  return buildApiUrl(GOOGLE_SIGNIN_PATH);
}

/** Navigate to Google OAuth using the current page origin for redirect_uri. */
export function startGoogleSignIn() {
  const url = getGoogleSignInUrl();
  if (!url) {
    throw new Error("Google sign-in is not configured.");
  }
  window.location.assign(url);
}

function mapGoogleAuthError(message: unknown) {
  const msg = String(message ?? "").trim();
  const lower = msg.toLowerCase();
  if (lower.includes("not registered") || lower.includes("unregistered")) {
    const err = new Error(msg || "User not registered.");
    err.code = "unregistered_user";
    return err;
  }
  if (lower.includes("invalid_domain") || lower.includes("webknot")) {
    const err = new Error(msg);
    err.code = "invalid_domain";
    return err;
  }
  return new Error(msg || "Google sign-in failed.");
}

export async function exchangeGoogleAuthCode(code, redirectUri, { signal } = {} as ApiOptions) {
  const res = await fetch(buildApiUrl("/api/v1/auth/google/exchange"), {
    method: "POST",
    signal,
    credentials: "include",
    headers: withCsrfHeaders({
      Accept: "application/json",
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      code: String(code ?? "").trim(),
      redirect_uri: String(redirectUri ?? "").trim(),
    }),
  });
  const payload = await safeJsonParse(res);
  if (!res.ok) {
    const err = mapGoogleAuthError(payload?.message ?? payload?.error ?? (await readError(res)));
    err.status = res.status;
    throw err;
  }
  return payload?.data != null && typeof payload.data === "object" ? payload.data : payload;
}

export async function completeGoogleAuthCode(code, { signal } = {} as ApiOptions) {
  clearManualLogoutMark();
  const redirectUri = getFrontendOAuthRedirectUri();
  const data = await exchangeGoogleAuthCode(code, redirectUri, { signal });

  const token =
    String(data?.accessToken ?? data?.access_token ?? data?.token ?? "").trim() ||
    getCookieValue("accessToken") ||
    getCookieValue("access_token") ||
    "";

  const emailNorm = String(data?.email ?? "").trim().toLowerCase();
  const loginPayload = data && typeof data === "object" ? data : {};

  setAuth({
    ...loginPayload,
    email: emailNorm,
    accessToken: token || null,
    tokenType: "Bearer",
    employeeName: String(loginPayload.name ?? loginPayload.employeeName ?? "").trim() || undefined,
    role:
      explicitRoleFromObject(loginPayload) ||
      extractRole(loginPayload) ||
      bestRole(loginPayload.roles) ||
      undefined,
    roles: loginPayload.roles,
  });

  try {
    const me = await fetchMe({ signal });
    if (me) setAuth(me);
  } catch {
    void 0;
  }

  notifyAuthChanged();
  return getAuth();
}

export function getOAuthBypassUrl(email) {
  const safeEmail = encodeURIComponent(String(email ?? "").trim());
  if (!safeEmail) return "";
  return buildApiUrl(`${OAUTH_BYPASS_PATH_PREFIX}/${safeEmail}`);
}

/** Dev-only: (re)create QA users with password WebknotQA#Test1 */
export async function seedDevQaUsers({ signal } = {} as ApiOptions) {
  if (!import.meta?.env?.DEV || String(import.meta.env?.VITE_ENABLE_DEV_QA ?? "") !== "true") {
    throw new Error("QA seeding is disabled in this build.");
  }
  const res = await fetch(buildApiUrl("/api/v1/dev/seed-qa-users"), {
    method: "POST",
    signal,
    credentials: "include",
    headers: withCsrfHeaders({ Accept: "application/json" }),
  });
  const payload = await safeJsonParse(res);
  if (!res.ok) {
    const err = new Error(
      String(payload?.message ?? (await readError(res)) ?? "Could not seed QA users"),
    );
    err.status = res.status;
    throw err;
  }
  return payload?.data != null ? { ...payload, data: payload.data } : payload;
}

/** @deprecated Password login removed — use Google sign-in only. */
export async function completePasswordLogin(email, password, { signal } = {} as ApiOptions) {
  void email;
  void password;
  void signal;
  throw new Error("Password login is disabled. Use Continue with Google.");
}

export async function oauthBypass(email, { signal } = {} as ApiOptions) {
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

export async function logout({ signal } = {} as ApiOptions) {
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

export async function fetchMe({ signal } = {} as ApiOptions) {
  const auth = getAuthHeader();
  const headers = auth ? { Authorization: auth } : undefined;
  let lastNon404Error = null;
  let any404 = false;
  let saw401 = false;

  for (const path of ME_PATH_CANDIDATES) {
    const res = await fetch(buildApiUrl(path), {
      signal,
      credentials: "include",
      headers,
    });
    if (res.status === 401 || res.status === 403) {
      saw401 = true;
      continue;
    }
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
    const roleFromProfile = extractRole(normalized);
    const claimsFromHeader = (() => {
      const header = getAuthHeader();
      if (!header) return null;
      const h = String(header).trim();
      const bearer = /^Bearer\s+(.+)$/i.exec(h);
      const token = bearer ? bearer[1].trim() : h;
      return token ? decodeJwtPayload(token) : null;
    })();
    const roleHintEmail = extractEmailFromSources(normalized, claimsFromHeader || normalized?.claims || {});
    const roleHint = await fetchRoleHint({ signal, headers, email: roleHintEmail }).catch(() => "");
    let roleFromJwt = "";
    if (claimsFromHeader && typeof claimsFromHeader === "object") {
      roleFromJwt = extractRole(claimsFromHeader);
    }
    // Merge profile, JWT, and /user/role so a wrong hint cannot downgrade ADMIN from the token.
    let mergedRole = firstNonEmptyString(
      bestRole(roleFromJwt, roleFromProfile, roleHint, normalized?.role),
      roleHint,
      roleFromProfile,
      normalized?.role
    );
    const mergedEmail = extractEmailFromSources(normalized, claimsFromHeader || normalized?.claims || {});
    mergedRole = applyAdminEmailAllowlist(mergedEmail, mergedRole);
    const picture = firstNonEmptyString(
      normalized?.picture,
      normalized?.profilePic,
      normalized?.profilePhoto,
      normalized?.avatarUrl,
      claimsFromHeader?.picture,
    );
    const base = {
      ...normalized,
      ...(mergedEmail ? { email: mergedEmail } : {}),
      ...(picture ? { picture, profilePic: picture } : {}),
    };
    if (!mergedRole) return mergedEmail || picture ? base : normalized;
    return {
      ...base,
      role: mergedRole,
    };
  }

  if (lastNon404Error) throw lastNon404Error;
  if (saw401) return null;
  if (any404) {
    throw new Error(
      `Profile endpoint not found (tried ${ME_PATH_CANDIDATES.join(", ")}). Check API base URL and backend routes.`
    );
  }
  return null;
}
