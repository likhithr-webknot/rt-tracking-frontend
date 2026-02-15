const AUTH_STORAGE_KEY = "rt_tracking_auth_v1";

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
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.accessToken) return null;
    const claims = decodeJwtPayload(parsed.accessToken);
    return {
      accessToken: String(parsed.accessToken),
      tokenType: String(parsed.tokenType || "Bearer"),
      role: String(parsed.role || ""),
      portal: typeof parsed.portal === "string" ? parsed.portal : null,
      claims,
    };
  } catch {
    return null;
  }
}

export function setAuth(auth) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
  } catch {
    // ignore storage errors
  }
}

export function clearAuth() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getAuthHeader() {
  const auth = getAuth();
  if (!auth?.accessToken) return null;
  const type = auth.tokenType || "Bearer";
  return `${type} ${auth.accessToken}`;
}

// Default assumption: POST /auth/login { email, password } -> { accessToken, tokenType, role, portal }
// If your backend uses a different path/shape, update this single function.
export async function login({ email, password }) {
  const res = await fetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json().catch(() => ({}));
  if (!data?.accessToken) throw new Error("Login failed: missing accessToken.");
  return data;
}
