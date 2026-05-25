// @ts-nocheck
import type { ApiOptions } from "../types/api-options";
import { getAuthHeader } from "./auth";
import { buildApiUrl, parseResponse, toHttpError, withCsrfHeaders } from "./http";
import {
  createUserRequest as createUserRequestMultipart,
  deleteUserRequest as deleteUserRequestApi,
  updateUserRequest as updateUserRequestMultipart,
  updateUserRequestStatus as updateUserRequestStatusApi,
} from "./user-requests";

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

async function requestJson(path, { method = "GET", payload, signal } = {} as ApiOptions) {
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

async function requestBinary(path, { signal } = {} as ApiOptions) {
  const res = await fetch(buildApiUrl(path), {
    method: "GET",
    signal,
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, null);
}

async function requestJsonFirst(paths, { method = "GET", payload, signal } = {} as ApiOptions) {
  let lastErr = null;
  for (const path of paths) {
    try {
      return await requestJson(path, { method, payload, signal });
    } catch (e) {
      if (e?.status === 404 || e?.status === 405) {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error("Request failed for all route candidates.");
}

// Global Portal (ADMIN)
export async function fetchPrivateKey(pathSuffix = "", { signal } = {} as ApiOptions) {
  return requestJson(joinWildcard("/api/v1/privateKey/**", pathSuffix), { method: "GET", signal });
}

export async function createSecretCode(pathSuffix = "", payload = {}, { signal } = {} as ApiOptions) {
  return requestJson(joinWildcard("/api/v1/secret-code/**", pathSuffix), { method: "POST", payload, signal });
}

export async function fetchSecretCode(pathSuffix = "", { signal } = {} as ApiOptions) {
  return requestJson(joinWildcard("/api/v1/secret-code/**", pathSuffix), { method: "GET", signal });
}

export async function fetchNotifyTimelogs({ signal } = {} as ApiOptions) {
  return requestJson("/api/v1/notify/timelogs/", { method: "GET", signal });
}

export async function createAdminProject(payload = {}, { signal } = {} as ApiOptions) {
  return requestJson("/api/v1/projects", { method: "POST", payload, signal });
}

export async function createAllocationBatch(payload = {}, { signal } = {} as ApiOptions) {
  return requestJson("/api/v1/allocation/batch", { method: "POST", payload, signal });
}

export async function createLeaveTransaction(payload = {}, { signal } = {} as ApiOptions) {
  return requestJson("/api/v1/leaveTransaction", { method: "POST", payload, signal });
}

// Employee Portal (EMPLOYEE)
export async function fetchPortalNotifications(pathSuffix = "", { signal } = {} as ApiOptions) {
  return requestJson(joinWildcard("/api/v1/notifications/**", pathSuffix), { method: "GET", signal });
}

export async function updatePortalNotifications(pathSuffix = "", payload = {}, { signal } = {} as ApiOptions) {
  return requestJson(joinWildcard("/api/v1/notifications/**", pathSuffix), { method: "PUT", payload, signal });
}

export async function createTimelog(payload = {}, { signal } = {} as ApiOptions) {
  return requestJsonFirst(["/api/v1/timelogs", "/api/v1/timelog"], { method: "POST", payload, signal });
}

export async function fetchTimelog(pathSuffix = "", { signal } = {} as ApiOptions) {
  const trimmed = trim(pathSuffix).replace(/^\/+/g, "");
  if (trimmed) {
    return requestJsonFirst([`/api/v1/timelogs/${trimmed}`, `/api/v1/timelog/get/${trimmed}`], {
      method: "GET",
      signal,
    });
  }
  return requestJson(joinWildcard("/api/v1/timelog/get/**", pathSuffix), { method: "GET", signal });
}

export async function updateTimelogEntry(payload = {}, { signal } = {} as ApiOptions) {
  return requestJsonFirst(["/api/v1/timelogs/entry", "/api/v1/timelog/entry"], { method: "PUT", payload, signal });
}

export async function createUserRequest(payload = {}, { signal } = {} as ApiOptions) {
  const { file = null, ...requestPayload } = payload && typeof payload === "object" ? payload : {};
  return createUserRequestMultipart(requestPayload, { file, signal });
}

export async function fetchUserRequest(pathSuffix = "", { signal } = {} as ApiOptions) {
  return requestJsonFirst(
    [joinWildcard("/api/v1/user-requests/get/**", pathSuffix), joinWildcard("/api/v1/userRequest/get/**", pathSuffix)],
    { method: "GET", signal }
  );
}

export async function fetchUserRequestByCreateDate(pathSuffix = "", { signal } = {} as ApiOptions) {
  return requestJsonFirst(
    [
      joinWildcard("/api/v1/user-requests/by-create-date/**", pathSuffix),
      joinWildcard("/api/v1/userRequest/createDate/**", pathSuffix),
    ],
    { method: "GET", signal }
  );
}

export async function updateUserRequest(payload = {}, { signal } = {} as ApiOptions) {
  const { file = null, ...requestPayload } = payload && typeof payload === "object" ? payload : {};
  return updateUserRequestMultipart(requestPayload, { file, signal });
}

export async function deleteUserRequest(payload = {}, { signal } = {} as ApiOptions) {
  return deleteUserRequestApi(payload?.userRequestId ?? payload?.id ?? payload, { signal });
}

export async function createAllocationExtensionRequest(payload = {}, { signal } = {} as ApiOptions) {
  return requestJson("/api/v1/allocation-extension-request", { method: "POST", payload, signal });
}

export async function fetchAllocationExtensionRequest({ signal } = {} as ApiOptions) {
  return requestJson("/api/v1/allocation-extension-request", { method: "GET", signal });
}

export async function updateAllocationExtensionRequestStatus(payload = {}, { signal } = {} as ApiOptions) {
  return requestJson("/api/v1/allocation-extension-request/status", { method: "PUT", payload, signal });
}

// Manager Portal (MANAGER)
export async function updateTimelogStatus(payload = {}, { signal } = {} as ApiOptions) {
  return requestJsonFirst(["/api/v1/timelogs/status", "/api/v1/timelog/status"], { method: "PUT", payload, signal });
}

export async function updateTimelogStatusBatch(payload = {}, { signal } = {} as ApiOptions) {
  return requestJsonFirst(["/api/v1/timelogs/status/batch", "/api/v1/timelog/status/batch"], {
    method: "PUT",
    payload,
    signal,
  });
}

export async function fetchManagerReport(pathSuffix = "", { signal } = {} as ApiOptions) {
  return requestJson(joinWildcard("/api/v1/report/manager/**", pathSuffix), { method: "GET", signal });
}

export async function fetchManagerAllocationExtensionStatus({ signal } = {} as ApiOptions) {
  return requestJson("/api/v1/manager/allocation-extension-status", { method: "GET", signal });
}

export async function fetchManagerAllocationEndingSoon({ signal } = {} as ApiOptions) {
  return requestJson("/api/v1/manager/allocation-ending-soon", { method: "GET", signal });
}

export async function exportTimelogs(pathSuffix = "", { signal } = {} as ApiOptions) {
  return requestBinary(joinWildcard("/api/v1/export/timelogs/**", pathSuffix), { signal });
}

export async function updateUserRequestStatus(payload = {}, { signal } = {} as ApiOptions) {
  return updateUserRequestStatusApi(payload, { signal });
}

export async function createAllocation(payload = {}, { signal } = {} as ApiOptions) {
  return requestJson("/api/v1/allocation", { method: "POST", payload, signal });
}

export async function fetchUserRequestForDate(pathSuffix = "", { signal } = {} as ApiOptions) {
  return requestJsonFirst(
    [joinWildcard("/api/v1/user-requests/for-date/**", pathSuffix), joinWildcard("/api/v1/userRequest/forDate/**", pathSuffix)],
    { method: "GET", signal }
  );
}
