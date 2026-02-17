import { getAuthHeader } from "./auth.js";
import { buildApiUrl } from "./http.js";

async function readError(res) {
  const text = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(text);
    if (parsed?.message) return String(parsed.message);
    if (parsed?.error) return String(parsed.error);
  } catch {
    // ignore
  }
  return text || `Request failed: ${res.status} ${res.statusText}`;
}

async function toHttpError(res) {
  const message = await readError(res);
  const err = new Error(message);
  err.status = res.status;
  return err;
}

export async function fetchPortalEmployee({ signal } = {}) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/portal/employee"), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}

export async function fetchPortalManager({ signal } = {}) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/portal/manager"), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}

export async function fetchPortalAdmin({ signal } = {}) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/portal/admin"), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}

