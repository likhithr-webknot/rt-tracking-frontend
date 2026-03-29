import { getAuthHeader } from "./auth.js";
import { buildApiUrl, parseResponse, toHttpError, withCsrfHeaders } from "./http.js";

function trim(value) {
  return String(value ?? "").trim();
}

function joinWildcard(basePath, pathSuffix = "") {
  const base = trim(basePath).replace(/\*+$/g, "").replace(/\/+$/g, "");
  const suffix = trim(pathSuffix).replace(/^\/+/g, "");
  if (!suffix) return base;
  return `${base}/${suffix}`;
}

function jsonHeaders() {
  const auth = getAuthHeader();
  return withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });
}

function authHeaders() {
  const auth = getAuthHeader();
  return auth ? { Authorization: auth } : undefined;
}

async function requestJson(path, { method = "GET", payload, signal } = {}) {
  const options = {
    method,
    signal,
    credentials: "include",
    headers: method === "GET" ? authHeaders() : jsonHeaders(),
  };
  if (method !== "GET") options.body = JSON.stringify(payload && typeof payload === "object" ? payload : {});
  const res = await fetch(buildApiUrl(path), options);
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, {});
}

async function requestBinary(path, { signal } = {}) {
  const res = await fetch(buildApiUrl(path), {
    method: "GET",
    signal,
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, null);
}

// Global Portal (ADMIN)
export async function fetchPrivateKey(pathSuffix = "", { signal } = {}) {
  return requestJson(joinWildcard("/api/v1/privateKey/**", pathSuffix), { method: "GET", signal });
}

export async function createSecretCode(pathSuffix = "", payload = {}, { signal } = {}) {
  return requestJson(joinWildcard("/api/v1/secret-code/**", pathSuffix), { method: "POST", payload, signal });
}

export async function fetchSecretCode(pathSuffix = "", { signal } = {}) {
  return requestJson(joinWildcard("/api/v1/secret-code/**", pathSuffix), { method: "GET", signal });
}

export async function fetchNotifyTimelogs({ signal } = {}) {
  return requestJson("/api/v1/notify/timelogs/", { method: "GET", signal });
}

export async function createAdminProject(payload = {}, { signal } = {}) {
  return requestJson("/api/v1/projects", { method: "POST", payload, signal });
}

export async function createAllocationBatch(payload = {}, { signal } = {}) {
  return requestJson("/api/v1/allocation/batch", { method: "POST", payload, signal });
}

export async function createLeaveTransaction(payload = {}, { signal } = {}) {
  return requestJson("/api/v1/leaveTransaction", { method: "POST", payload, signal });
}

// Employee Portal (EMPLOYEE)
export async function fetchPortalNotifications(pathSuffix = "", { signal } = {}) {
  return requestJson(joinWildcard("/api/v1/notifications/**", pathSuffix), { method: "GET", signal });
}

export async function updatePortalNotifications(pathSuffix = "", payload = {}, { signal } = {}) {
  return requestJson(joinWildcard("/api/v1/notifications/**", pathSuffix), { method: "PUT", payload, signal });
}

export async function createTimelog(payload = {}, { signal } = {}) {
  return requestJson("/api/v1/timelog", { method: "POST", payload, signal });
}

export async function fetchTimelog(pathSuffix = "", { signal } = {}) {
  return requestJson(joinWildcard("/api/v1/timelog/get/**", pathSuffix), { method: "GET", signal });
}

export async function updateTimelogEntry(payload = {}, { signal } = {}) {
  return requestJson("/api/v1/timelog/entry", { method: "PUT", payload, signal });
}

export async function createUserRequest(payload = {}, { signal } = {}) {
  return requestJson("/api/v1/userRequest", { method: "POST", payload, signal });
}

export async function fetchUserRequest(pathSuffix = "", { signal } = {}) {
  return requestJson(joinWildcard("/api/v1/userRequest/get/**", pathSuffix), { method: "GET", signal });
}

export async function fetchUserRequestByCreateDate(pathSuffix = "", { signal } = {}) {
  return requestJson(joinWildcard("/api/v1/userRequest/createDate/**", pathSuffix), { method: "GET", signal });
}

export async function updateUserRequest(payload = {}, { signal } = {}) {
  return requestJson("/api/v1/userRequest", { method: "PUT", payload, signal });
}

export async function deleteUserRequest(payload = {}, { signal } = {}) {
  return requestJson("/api/v1/userRequest", { method: "DELETE", payload, signal });
}

export async function createAllocationExtensionRequest(payload = {}, { signal } = {}) {
  return requestJson("/api/v1/allocation-extension-request", { method: "POST", payload, signal });
}

export async function fetchAllocationExtensionRequest({ signal } = {}) {
  return requestJson("/api/v1/allocation-extension-request", { method: "GET", signal });
}

export async function updateAllocationExtensionRequestStatus(payload = {}, { signal } = {}) {
  return requestJson("/api/v1/allocation-extension-request/status", { method: "PUT", payload, signal });
}

// Manager Portal (MANAGER)
export async function updateTimelogStatus(payload = {}, { signal } = {}) {
  return requestJson("/api/v1/timelog/status", { method: "PUT", payload, signal });
}

export async function updateTimelogStatusBatch(payload = {}, { signal } = {}) {
  return requestJson("/api/v1/timelog/status/batch", { method: "PUT", payload, signal });
}

export async function fetchManagerReport(pathSuffix = "", { signal } = {}) {
  return requestJson(joinWildcard("/api/v1/report/manager/**", pathSuffix), { method: "GET", signal });
}

export async function fetchManagerAllocationExtensionStatus({ signal } = {}) {
  return requestJson("/api/v1/manager/allocation-extension-status", { method: "GET", signal });
}

export async function fetchManagerAllocationEndingSoon({ signal } = {}) {
  return requestJson("/api/v1/manager/allocation-ending-soon", { method: "GET", signal });
}

export async function exportTimelogs(pathSuffix = "", { signal } = {}) {
  return requestBinary(joinWildcard("/api/v1/export/timelogs/**", pathSuffix), { signal });
}

export async function updateUserRequestStatus(payload = {}, { signal } = {}) {
  return requestJson("/api/v1/userRequest/status", { method: "PUT", payload, signal });
}

export async function createAllocation(payload = {}, { signal } = {}) {
  return requestJson("/api/v1/allocation", { method: "POST", payload, signal });
}

export async function fetchUserRequestForDate(pathSuffix = "", { signal } = {}) {
  return requestJson(joinWildcard("/api/v1/userRequest/forDate/**", pathSuffix), { method: "GET", signal });
}
