// @ts-nocheck
import type { ApiOptions } from "../types/api-options";
import { getAuth, getAuthHeader } from "./auth";
import {
  buildEmployeeRosterUrl,
  buildEmployeeWebtrakUrl,
  employeeRosterFetchCredentials,
  employeeWebtrakFetchCredentials,
  getEmployeeRosterAuthHeaders,
  getEmployeeWebtrakAuthHeaders,
  shouldUseRemoteEmployeeWebtrak,
} from "./webtrak";
import { buildApiUrl, ensureCsrfCookie, parseResponse, requestWithFallbacks, toHttpError, withCsrfHeaders } from "./http";
import { normalizeWebtrakEmployeeProfile } from "./webtrakEmployeeProfile";

function authHeaders({ json = false } = {} as ApiOptions) {
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

export async function fetchUserOnboard({ signal } = {} as ApiOptions) {
  const res = await fetch(buildEmployeeRosterUrl("/api/v1/user/onboard?page=0&size=500"), {
    method: "GET",
    signal,
    credentials: employeeRosterFetchCredentials(),
    headers: getEmployeeRosterAuthHeaders(),
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, {});
}

export async function createUserOnboard(payload, { signal } = {} as ApiOptions) {
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

export async function updateUserOnboardMultipart(payload, { signal } = {} as ApiOptions) {
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

export async function fetchUser({ email = null, empId = null, signal } = {} as ApiOptions) {
  const qs = new URLSearchParams();
  if (email != null && String(email).trim()) qs.set("email", String(email).trim());
  if (empId != null && String(empId).trim()) qs.set("empId", String(empId).trim());
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const paths = suffix
    ? [`/api/v1/user${suffix}`, `/api/v1/users${suffix}`]
    : ["/api/v1/user"];
  return requestWithFallbacks(paths, {
    signal,
    headers: authHeaders(),
    fallbackStatuses: [404, 405],
    notFoundMessage: "User lookup endpoint not found.",
  });
}

export async function updateUser(payload, { signal } = {} as ApiOptions) {
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

export async function createUser(payload, { signal } = {} as ApiOptions) {
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

export async function batchUsers(payload, { signal } = {} as ApiOptions) {
  const body = JSON.stringify(payload && typeof payload === "object" ? payload : {});
  return requestWithFallbacks(
    [
      { method: "POST", path: "/api/v1/user/batch" },
      { method: "POST", path: "/api/v1/users/batch" },
      { method: "POST", path: "/api/v1/employees/batch" },
    ],
    {
      signal,
      headers: authHeaders({ json: true }),
      body,
      fallbackStatuses: [404, 405],
      notFoundMessage: "User batch endpoint not found.",
    }
  );
}

export async function fetchUserRole({ email = null, signal } = {} as ApiOptions) {
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

export async function switchMyRole(role, { signal } = {} as ApiOptions) {
  const requested = String(role ?? "").trim().toUpperCase();
  if (!["ADMIN", "MANAGER", "EMPLOYEE"].includes(requested)) {
    throw new Error("Role must be ADMIN, MANAGER, or EMPLOYEE.");
  }
  await ensureCsrfCookie({ signal });
  const qs = new URLSearchParams();
  qs.set("role", requested);
  const res = await fetch(buildApiUrl(`/api/v1/user/switch-role?${qs.toString()}`), {
    method: "POST",
    signal,
    credentials: "include",
    headers: authHeaders({ json: true }),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, {});
}

export async function fetchEmailName({ signal } = {} as ApiOptions) {
  return requestWithFallbacks(["/api/v1/user/get-email-name", "/api/v1/users/email-name"], {
    signal,
    headers: authHeaders(),
    fallbackStatuses: [404, 405],
    notFoundMessage: "Email-name directory endpoint not found.",
  });
}

export async function assignRole(payload, { signal } = {} as ApiOptions) {
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

export async function fetchClientProjectStatus(payload = {}, { signal } = {} as ApiOptions) {
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

export async function updateLeave(empId, payload, { signal } = {} as ApiOptions) {
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

function employeeWebtrakEmailQuery(email = null) {
  if (!shouldUseRemoteEmployeeWebtrak()) return "";
  const safeEmail = String(email ?? getAuth()?.email ?? "").trim().toLowerCase();
  if (!safeEmail || !safeEmail.includes("@")) return "";
  return `?userEmail=${encodeURIComponent(safeEmail)}`;
}

export async function fetchProfile({ signal, email = null } = {} as ApiOptions & { email?: string | null }) {
  const remoteQuery = employeeWebtrakEmailQuery(email);
  const remotePath = `/api/v1/profile${remoteQuery}`;

  if (shouldUseRemoteEmployeeWebtrak()) {
    const res = await fetch(buildEmployeeWebtrakUrl(remotePath), {
      method: "GET",
      signal,
      credentials: employeeWebtrakFetchCredentials(),
      headers: getEmployeeWebtrakAuthHeaders(),
    });
    if (res.ok) return parseResponse(res, {});
    if (res.status !== 404 && res.status !== 405) {
      throw await toHttpError(res, { method: "GET", path: remotePath });
    }
  }

  const res = await fetch(buildApiUrl("/api/v1/profile"), {
    method: "GET",
    signal,
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, {});
}

/** Webtrak-shaped profile from GET /api/v1/profile (read-only display). */
export async function fetchNormalizedProfile({ signal } = {} as ApiOptions) {
  const raw = await fetchProfile({ signal });
  return normalizeWebtrakEmployeeProfile(raw);
}

export async function updateProfileWithPhoto(
  { body = {}, photoBlob = null, fileName = "avatar.jpg" } = {},
  { signal } = {} as ApiOptions,
) {
  const fd = new FormData();
  fd.append("body", JSON.stringify(body && typeof body === "object" ? body : {}));
  if (photoBlob) {
    fd.append("profilePic", photoBlob, fileName);
  }
  return updateProfile(fd, { signal });
}

export async function updateProfile(payload, { signal } = {} as ApiOptions) {
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

export async function fetchEmployeeProfile({ empId = null, signal } = {} as ApiOptions) {
  const id = String(empId ?? "").trim();
  const headers = authHeaders();
  if (!id) {
    return requestWithFallbacks(["/api/v1/employee-profile", "/api/v1/employees?page=0&size=50"], {
      signal,
      headers,
      fallbackStatuses: [404, 405],
      notFoundMessage: "Employee profile list endpoint not found.",
    });
  }
  const safe = encodeURIComponent(id);
  return requestWithFallbacks([`/api/v1/employee-profile/${safe}`, `/api/v1/employees/${safe}`], {
    signal,
    headers,
    fallbackStatuses: [404, 405],
    notFoundMessage: "Employee profile endpoint not found.",
  });
}

export async function updateEmployeeProfile(empId, payload, { signal } = {} as ApiOptions) {
  const safeEmpId = encodeURIComponent(String(empId ?? "").trim());
  if (!safeEmpId) throw new Error("empId is required.");
  const body = JSON.stringify(payload && typeof payload === "object" ? payload : {});
  return requestWithFallbacks(
    [
      { method: "PUT", path: `/api/v1/employees/${safeEmpId}` },
      { method: "PUT", path: `/api/v1/employee-profile/${safeEmpId}` },
    ],
    {
      signal,
      headers: authHeaders({ json: true }),
      body,
      fallbackStatuses: [404, 405],
      notFoundMessage: "Employee profile update endpoint not found.",
    }
  );
}
