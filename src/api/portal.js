import { getAuthHeader } from "./auth.js";
import { buildApiUrl, toHttpError } from "./http.js";

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

export async function updatePortalEmployee(payload, { signal } = {}) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/portal/employee"), {
    method: "PUT",
    signal,
    credentials: "include",
    headers: {
      ...(auth ? { Authorization: auth } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload && typeof payload === "object" ? payload : {}),
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
