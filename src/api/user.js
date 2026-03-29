import { getAuthHeader } from "./auth.js";
import { buildApiUrl, parseResponse, toHttpError, withCsrfHeaders } from "./http.js";

function authHeaders({ json = false } = {}) {
  const auth = getAuthHeader();
  if (json) {
    return withCsrfHeaders({
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    });
  }
  return auth ? { Authorization: auth } : undefined;
}

function toFormData(value) {
  if (value instanceof FormData) return value;
  const fd = new FormData();
  const obj = value && typeof value === "object" ? value : {};
  for (const [key, raw] of Object.entries(obj)) {
    if (raw == null) continue;
    if (Array.isArray(raw)) {
      for (const entry of raw) {
        if (entry == null) continue;
        fd.append(key, entry);
      }
      continue;
    }
    fd.append(key, raw);
  }
  return fd;
}

export async function fetchUserOnboard({ signal } = {}) {
  const res = await fetch(buildApiUrl("/api/v1/user/onboard"), {
    method: "GET",
    signal,
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, {});
}

export async function createUserOnboard(payload, { signal } = {}) {
  const res = await fetch(buildApiUrl("/api/v1/user/onboard"), {
    method: "POST",
    signal,
    credentials: "include",
    headers: authHeaders({ json: true }),
    body: JSON.stringify(payload && typeof payload === "object" ? payload : {}),
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, {});
}

export async function updateUserOnboardMultipart(payload, { signal } = {}) {
  const auth = getAuthHeader();
  const headers = withCsrfHeaders(auth ? { Authorization: auth } : undefined);
  const res = await fetch(buildApiUrl("/api/v1/user/onboard"), {
    method: "PUT",
    signal,
    credentials: "include",
    headers,
    body: toFormData(payload),
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, {});
}

export async function fetchUser({ email = null, empId = null, signal } = {}) {
  const qs = new URLSearchParams();
  if (email != null && String(email).trim()) qs.set("email", String(email).trim());
  if (empId != null && String(empId).trim()) qs.set("empId", String(empId).trim());
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(buildApiUrl(`/api/v1/user${suffix}`), {
    method: "GET",
    signal,
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, {});
}

export async function updateUser(payload, { signal } = {}) {
  const res = await fetch(buildApiUrl("/api/v1/user"), {
    method: "PUT",
    signal,
    credentials: "include",
    headers: authHeaders({ json: true }),
    body: JSON.stringify(payload && typeof payload === "object" ? payload : {}),
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, {});
}

export async function createUser(payload, { signal } = {}) {
  const res = await fetch(buildApiUrl("/api/v1/user"), {
    method: "POST",
    signal,
    credentials: "include",
    headers: authHeaders({ json: true }),
    body: JSON.stringify(payload && typeof payload === "object" ? payload : {}),
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, {});
}

export async function batchUsers(payload, { signal } = {}) {
  const res = await fetch(buildApiUrl("/api/v1/user/batch"), {
    method: "POST",
    signal,
    credentials: "include",
    headers: authHeaders({ json: true }),
    body: JSON.stringify(payload && typeof payload === "object" ? payload : {}),
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, {});
}

export async function fetchUserRole({ email = null, signal } = {}) {
  const qs = new URLSearchParams();
  if (email != null && String(email).trim()) qs.set("email", String(email).trim());
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(buildApiUrl(`/api/v1/user/role${suffix}`), {
    method: "GET",
    signal,
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, {});
}

export async function fetchEmailName({ signal } = {}) {
  const res = await fetch(buildApiUrl("/api/v1/user/get-email-name"), {
    method: "GET",
    signal,
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, {});
}

export async function assignRole(payload, { signal } = {}) {
  const res = await fetch(buildApiUrl("/api/v1/assign-role"), {
    method: "POST",
    signal,
    credentials: "include",
    headers: authHeaders({ json: true }),
    body: JSON.stringify(payload && typeof payload === "object" ? payload : {}),
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, {});
}

export async function fetchClientProjectStatus(payload = {}, { signal } = {}) {
  const methods = ["POST", "GET"];
  let lastRouteErr = null;
  for (const method of methods) {
    const res = await fetch(buildApiUrl("/api/v1/client-proj-status"), {
      method,
      signal,
      credentials: "include",
      headers: method === "POST" ? authHeaders({ json: true }) : authHeaders(),
      ...(method === "POST"
        ? {
            body: JSON.stringify(payload && typeof payload === "object" ? payload : {}),
          }
        : {}),
    });
    if (res.ok) return parseResponse(res, {});
    const err = await toHttpError(res);
    if (res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }
  throw lastRouteErr || new Error("Client project status endpoint not found.");
}

export async function updateLeave(empId, payload, { signal } = {}) {
  const safeEmpId = encodeURIComponent(String(empId ?? "").trim());
  if (!safeEmpId) throw new Error("empId is required.");
  const res = await fetch(buildApiUrl(`/api/v1/update-leave/${safeEmpId}`), {
    method: "PUT",
    signal,
    credentials: "include",
    headers: authHeaders({ json: true }),
    body: JSON.stringify(payload && typeof payload === "object" ? payload : {}),
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, {});
}

export async function fetchProfile({ signal } = {}) {
  const res = await fetch(buildApiUrl("/api/v1/profile"), {
    method: "GET",
    signal,
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, {});
}

export async function updateProfile(payload, { signal } = {}) {
  const isFormData = payload instanceof FormData;
  const auth = getAuthHeader();
  const headers = isFormData
    ? withCsrfHeaders(auth ? { Authorization: auth } : undefined)
    : authHeaders({ json: true });
  const res = await fetch(buildApiUrl("/api/v1/profile"), {
    method: "PUT",
    signal,
    credentials: "include",
    headers,
    body: isFormData
      ? payload
      : JSON.stringify(payload && typeof payload === "object" ? payload : {}),
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, {});
}

export async function fetchEmployeeProfile({ empId = null, signal } = {}) {
  const id = String(empId ?? "").trim();
  const path = id
    ? `/api/v1/employee-profile/${encodeURIComponent(id)}`
    : "/api/v1/employee-profile";
  const res = await fetch(buildApiUrl(path), {
    method: "GET",
    signal,
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, {});
}

export async function updateEmployeeProfile(empId, payload, { signal } = {}) {
  const safeEmpId = encodeURIComponent(String(empId ?? "").trim());
  if (!safeEmpId) throw new Error("empId is required.");
  const res = await fetch(buildApiUrl(`/api/v1/employee-profile/${safeEmpId}`), {
    method: "PUT",
    signal,
    credentials: "include",
    headers: authHeaders({ json: true }),
    body: JSON.stringify(payload && typeof payload === "object" ? payload : {}),
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, {});
}
