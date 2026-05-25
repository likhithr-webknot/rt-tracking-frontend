import type { ApiOptions } from "../types/api-options";
import { getAuthHeader } from "./auth";
import { buildApiUrl, ensureCsrfCookie, parseResponse, toHttpError, withCsrfHeaders } from "./http";

function authHeaders(extra = {}) {
  const auth = getAuthHeader();
  return withCsrfHeaders({
    ...(auth ? { Authorization: auth } : {}),
    ...extra,
  });
}

function jsonHeaders() {
  return authHeaders({ "Content-Type": "application/json" });
}

function compact(value = {}) {
  const out = {};
  for (const [key, raw] of Object.entries(value || {})) {
    if (raw == null) continue;
    if (typeof raw === "string" && !raw.trim()) continue;
    if (Array.isArray(raw) && raw.length === 0) continue;
    out[key] = raw;
  }
  return out;
}

async function requestJson(path, { method = "GET", payload, signal } = {} as ApiOptions) {
  const normalizedMethod = String(method || "GET").toUpperCase();
  const res = await fetch(buildApiUrl(path), {
    method: normalizedMethod,
    signal,
    credentials: "include",
    headers: normalizedMethod === "GET" ? authHeaders() : jsonHeaders(),
    ...(normalizedMethod !== "GET" ? { body: JSON.stringify(compact(payload)) } : {}),
  });
  if (!res.ok) throw await toHttpError(res, { method: normalizedMethod, path });
  return parseResponse(res, {});
}

async function requestMultipart(path, payload, file, { method = "POST", signal } = {} as ApiOptions) {
  await ensureCsrfCookie({ signal });
  const form = new FormData();
  form.append("request", JSON.stringify(compact(payload)));
  if (file instanceof File) form.append("file", file);

  const normalizedMethod = String(method || "POST").toUpperCase();
  const res = await fetch(buildApiUrl(path), {
    method: normalizedMethod,
    signal,
    credentials: "include",
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) throw await toHttpError(res, { method: normalizedMethod, path });
  return parseResponse(res, {});
}

async function requestJsonFirst(paths, opts = {}) {
  let lastErr = null;
  for (const path of paths) {
    try {
      return await requestJson(path, opts);
    } catch (e) {
      if (e?.status === 404 || e?.status === 405) {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error("JSON request failed for all route candidates.");
}

async function requestMultipartFirst(paths, payload, file, opts = {}) {
  let lastErr = null;
  for (const path of paths) {
    try {
      return await requestMultipart(path, payload, file, opts);
    } catch (e) {
      if (e?.status === 404 || e?.status === 405) {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error("Multipart request failed for all route candidates.");
}

export function createUserRequest(payload, { file = null, signal } = {} as ApiOptions) {
  return requestMultipartFirst(["/api/v1/user-requests", "/api/v1/userRequest"], payload, file, {
    method: "POST",
    signal,
  });
}

export function updateUserRequest(payload, { file = null, signal } = {} as ApiOptions) {
  return requestMultipartFirst(["/api/v1/user-requests", "/api/v1/userRequest"], payload, file, {
    method: "PUT",
    signal,
  });
}

export function deleteUserRequest(userRequestId, { signal } = {} as ApiOptions) {
  return requestJsonFirst(["/api/v1/user-requests", "/api/v1/userRequest"], {
    method: "DELETE",
    signal,
    payload: { userRequestId },
  });
}

export function updateUserRequestStatus(payload, { signal } = {} as ApiOptions) {
  return requestJsonFirst(["/api/v1/user-requests/status", "/api/v1/userRequest/status"], {
    method: "PUT",
    signal,
    payload,
  });
}

export function remindUserRequestApproval(userRequestId, { signal } = {} as ApiOptions) {
  const safeId = encodeURIComponent(String(userRequestId ?? "").trim());
  if (!safeId) throw new Error("userRequestId is required.");
  return requestJsonFirst(
    [
      `/api/v1/user-requests/remind-approval?userRequestId=${safeId}`,
      `/api/v1/userRequest/remind-approval?userRequestId=${safeId}`,
    ],
    {
      method: "POST",
      signal,
      payload: {},
    }
  );
}

export function fetchUserRequests({
  empEmails = "",
  fromDate,
  toDate,
  requestType = "LEAVE",
  page = 0,
  size = 10,
  signal,
} = {} as ApiOptions) {
  const safeFrom = encodeURIComponent(String(fromDate || ""));
  const safeTo = encodeURIComponent(String(toDate || ""));
  const safeType = encodeURIComponent(String(requestType || "LEAVE"));
  const qs = new URLSearchParams();
  qs.set("page", String(page));
  qs.set("size", String(size));
  const prefix = String(empEmails || "").trim()
    ? `${encodeURIComponent(String(empEmails).trim())}/`
    : "";
  const pathKebab = `/api/v1/user-requests/get/${prefix}${safeFrom}/${safeTo}/${safeType}?${qs.toString()}`;
  const pathCamel = `/api/v1/userRequest/get/${prefix}${safeFrom}/${safeTo}/${safeType}?${qs.toString()}`;
  return requestJsonFirst([pathKebab, pathCamel], { signal });
}

export function fetchUserRequestsForDate({ date, requestType = "LEAVE", page = 0, size = 10, signal } = {} as ApiOptions) {
  const qs = new URLSearchParams();
  qs.set("page", String(page));
  qs.set("size", String(size));
  const d = encodeURIComponent(String(date || ""));
  const t = encodeURIComponent(String(requestType || "LEAVE"));
  const suffix = `?${qs.toString()}`;
  return requestJsonFirst(
    [`/api/v1/user-requests/for-date/${d}/${t}${suffix}`, `/api/v1/userRequest/forDate/${d}/${t}${suffix}`],
    { signal }
  );
}

export function fetchUserRequestsByCreateDate({ date, requestType = "LEAVE", page = 0, size = 10, signal } = {} as ApiOptions) {
  const qs = new URLSearchParams();
  qs.set("page", String(page));
  qs.set("size", String(size));
  const d = encodeURIComponent(String(date || ""));
  const t = encodeURIComponent(String(requestType || "LEAVE"));
  const suffix = `?${qs.toString()}`;
  return requestJsonFirst(
    [
      `/api/v1/user-requests/by-create-date/${d}/${t}${suffix}`,
      `/api/v1/userRequest/createDate/${d}/${t}${suffix}`,
    ],
    { signal }
  );
}

export function fetchUserRequestManagers({ signal } = {} as ApiOptions) {
  return requestJsonFirst(["/api/v1/user-requests/managers", "/api/v1/userRequest/managers"], { signal });
}

export function fetchManagersForUser(email, { signal } = {} as ApiOptions) {
  const safeEmail = encodeURIComponent(String(email || "").trim());
  if (!safeEmail) throw new Error("email is required.");
  return requestJson(`/api/v1/user/${safeEmail}/managers`, { signal });
}

export function normalizeUserRequestRows(raw) {
  const root = raw && typeof raw === "object" ? raw : {};
  const data = root?.data && typeof root.data === "object" ? root.data : root;
  const rows =
    (Array.isArray(data?.userRequests) && data.userRequests) ||
    (Array.isArray(data?.items) && data.items) ||
    (Array.isArray(data?.content) && data.content) ||
    (Array.isArray(data?.data) && data.data) ||
    (Array.isArray(raw) && raw) ||
    [];
  return rows.map((row) => {
    const obj = row && typeof row === "object" ? row : {};
    return {
      id: obj.id ?? obj.userRequestId ?? obj.requestId ?? null,
      employeeEmail: String(obj.employeeEmail ?? obj.userEmail ?? obj.email ?? obj.user?.email ?? "").trim(),
      employeeName: String(obj.employeeName ?? obj.userName ?? obj.user?.name ?? "").trim(),
      requestType: String(obj.requestType ?? obj.userRequestType ?? "").trim(),
      status: String(obj.status ?? obj.userRequestStatus ?? "").trim(),
      requestFromDate: String(obj.requestFromDate ?? obj.fromDate ?? obj.leaveFromDate ?? "").trim(),
      requestToDate: String(obj.requestToDate ?? obj.toDate ?? obj.leaveToDate ?? "").trim(),
      comments: String(obj.comments ?? obj.message ?? "").trim(),
      referenceFileUrl: String(obj.referenceFileUrl ?? obj.fileUrl ?? "").trim(),
      raw: obj,
    };
  });
}

export function normalizeUserRequestPage(raw) {
  const root = raw && typeof raw === "object" ? raw : {};
  const data = root?.data && typeof root.data === "object" ? root.data : root;
  return {
    items: normalizeUserRequestRows(raw),
    total: Number(data?.totalElement ?? data?.totalElements ?? data?.total ?? 0) || 0,
    totalPage: Number(data?.totalPage ?? data?.totalPages ?? 0) || 0,
    currentPage: Number(data?.currentPage ?? data?.page ?? 0) || 0,
    pageSize: Number(data?.pageSize ?? data?.size ?? 10) || 10,
    leaves: data?.leaves ?? null,
  };
}
