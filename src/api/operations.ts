import type { ApiOptions } from "../types/api-options";
import type { PromotionBandType } from "../utils/careerPromotion";
import { getAuthHeader } from "./auth";
import { buildApiUrl, ensureCsrfCookie, parseResponse, toHttpError, withCsrfHeaders } from "./http";
import {
  createUserRequest,
  deleteUserRequest,
  fetchUserRequestManagers,
  fetchUserRequests,
  fetchUserRequestsByCreateDate,
  fetchUserRequestsForDate,
  remindUserRequestApproval,
  updateUserRequest,
  updateUserRequestStatus,
} from "./user-requests";
import { fetchEmailName, updateEmployeeProfile } from "./user";
import { promoteEmployee as promoteEmployeePost } from "./employees";

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

function compactObject(input = {}) {
  const out = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (value == null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    out[key] = value;
  }
  return out;
}

export function asArray(data) {
  const root = data && typeof data === "object" ? data : {};
  const nested = root?.data && typeof root.data === "object" ? root.data : null;
  return (
    (Array.isArray(data) && data) ||
    (Array.isArray(root?.data) && root.data) ||
    (Array.isArray(root?.items) && root.items) ||
    (Array.isArray(root?.results) && root.results) ||
    (Array.isArray(root?.content) && root.content) ||
    (Array.isArray(root?.list) && root.list) ||
    (Array.isArray(nested?.items) && nested.items) ||
    (Array.isArray(nested?.results) && nested.results) ||
    (Array.isArray(nested?.content) && nested.content) ||
    []
  );
}

export async function apiJson(path, { method = "GET", payload, signal } = {} as ApiOptions) {
  const normalizedMethod = String(method || "GET").toUpperCase();
  const res = await fetch(buildApiUrl(path), {
    method: normalizedMethod,
    signal,
    credentials: "include",
    headers: normalizedMethod === "GET" ? authHeaders() : jsonHeaders(),
    ...(normalizedMethod !== "GET" ? { body: JSON.stringify(compactObject(payload)) } : {}),
  });
  if (!res.ok) throw await toHttpError(res, { method: normalizedMethod, path });
  return parseResponse(res, normalizedMethod === "DELETE" ? { success: true } : {});
}

export async function apiMultipart(path, fields = {}, files = {}, { method = "POST", signal } = {} as ApiOptions) {
  await ensureCsrfCookie({ signal });
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields || {})) {
    if (value == null || value === "") continue;
    formData.append(key, value as string | Blob);
  }
  for (const [key, file] of Object.entries(files || {})) {
    if (file instanceof File) formData.append(key, file);
  }
  const normalizedMethod = String(method || "POST").toUpperCase();
  const res = await fetch(buildApiUrl(path), {
    method: normalizedMethod,
    signal,
    credentials: "include",
    headers: authHeaders(),
    body: formData,
  });
  if (!res.ok) throw await toHttpError(res, { method: normalizedMethod, path });
  return parseResponse(res, { success: true });
}

export async function apiDownload(path, { signal } = {} as ApiOptions) {
  const res = await fetch(buildApiUrl(path), {
    method: "GET",
    signal,
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) throw await toHttpError(res, { method: "GET", path });
  return parseResponse(res, null);
}

export async function fetchServerHealth(options: ApiOptions = {}) {
  const res = await fetch(buildApiUrl("/actuator/health"), {
    signal: options.signal,
    credentials: "include",
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({ status: "DOWN" }));
}

export async function fetchServerInfo(options: ApiOptions = {}) {
  const res = await fetch(buildApiUrl("/actuator/info"), {
    signal: options.signal,
    credentials: "include",
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}

export const operations = {
  auth: {
    googleSignin: () => apiJson("/api/v1/google-signin"),
    oauthBypass: (email, opts = {} as ApiOptions) => apiJson(`/oauth/bypass/${encodeURIComponent(String(email || ""))}`, opts),
    logout: (opts = {} as ApiOptions) => apiJson("/api/v1/auth/logout", { method: "POST", ...opts }),
  },
  users: {
    list: (opts = {} as ApiOptions) => apiJson("/api/v1/users", opts),
    onboard: (payload, opts = {} as ApiOptions) => apiJson("/api/v1/users", { method: "POST", payload, ...opts }),
    getByEmail: (email, opts = {} as ApiOptions) => apiJson(`/api/v1/user?email=${encodeURIComponent(String(email || ""))}`, opts),
    getByEmpId: (empId, opts = {} as ApiOptions) => apiJson(`/api/v1/user?empId=${encodeURIComponent(String(empId || ""))}`, opts),
    updateProfile: (payload, opts = {} as ApiOptions) => apiJson("/api/v1/profile", { method: "PUT", payload, ...opts }),
    updateEmployeeProfile: (empId, payload, opts = {} as ApiOptions) => updateEmployeeProfile(empId, payload, opts),
    role: (opts = {} as ApiOptions) => apiJson("/api/v1/user/role", opts),
    assignRole: (payload, opts = {} as ApiOptions) => apiJson("/api/v1/assign-role", { method: "POST", payload, ...opts }),
    emailName: (opts = {} as ApiOptions) => fetchEmailName(opts),
    clientProjectStatus: (opts = {} as ApiOptions) => apiJson("/api/v1/client-proj-status", opts),
    updateLeave: (empId, payload, opts = {} as ApiOptions) =>
      apiJson(`/api/v1/update-leave/${encodeURIComponent(String(empId || ""))}`, { method: "PUT", payload, ...opts }),
    managersForUser: (email, opts = {} as ApiOptions) => apiJson(`/api/v1/user/${encodeURIComponent(String(email || ""))}/managers`, opts),
    batch: (file, fields, opts = {} as ApiOptions) => apiMultipart("/api/v1/user/batch", fields, { file }, opts),
    /** POST `/api/v1/user/promote` — advances one step on tech or non-tech ladder (Webtrak). */
    promote: (empId, bandType: PromotionBandType = "BOTH", opts = {} as ApiOptions) =>
      promoteEmployeePost(empId, bandType, opts),
  },
  projects: {
    list: (opts = {} as ApiOptions) => apiJson("/api/v1/projects", opts),
    listAll: (opts = {} as ApiOptions) => apiJson("/api/v1/projects/all", opts),
    get: (projectCode, opts = {} as ApiOptions) => apiJson(`/api/v1/project?projectCode=${encodeURIComponent(String(projectCode || ""))}`, opts),
    create: (payload, opts = {} as ApiOptions) => apiJson("/api/v1/project", { method: "POST", payload, ...opts }),
    bulkCreate: (payload, opts = {} as ApiOptions) => apiJson("/api/v1/projects", { method: "POST", payload, ...opts }),
    managerProjects: (opts = {} as ApiOptions) => apiJson("/api/v1/manager-projects", opts),
    managerProjectsWithRoles: (opts = {} as ApiOptions) => apiJson("/api/v1/manager-projects-with-roles", opts),
    assignedToUser: (opts = {} as ApiOptions) => apiJson("/api/v1/project-assigned-to-user", opts),
    endingSoon: (opts = {} as ApiOptions) => apiJson("/api/v1/manager/allocation-ending-soon", opts),
  },
  allocations: {
    create: (payload, opts = {} as ApiOptions) => apiJson("/api/v1/allocation", { method: "POST", payload, ...opts }),
    list: (opts = {} as ApiOptions) => apiJson("/api/v1/allocation", opts),
    user: (opts = {} as ApiOptions) => apiJson("/api/v1/allocation/user", opts),
    forecasting: ({ days = 30, projectCode = "", search = "", page = 0, size = 10 } = {}, opts = {} as ApiOptions) => {
      const qs = new URLSearchParams();
      qs.set("days", String(days || 30));
      if (projectCode) qs.set("projectCode", String(projectCode));
      if (search) qs.set("search", String(search));
      qs.set("page", String(page));
      qs.set("size", String(size));
      return apiJson(`/api/v1/allocation/forecasting?${qs.toString()}`, opts);
    },
    update: (allocationId, payload, opts = {} as ApiOptions) =>
      apiJson(`/api/v1/allocation/update?allocationId=${encodeURIComponent(String(allocationId || ""))}`, { method: "POST", payload, ...opts }),
    batch: (file, fields, opts = {} as ApiOptions) => apiMultipart("/api/v1/allocation/batch", fields, { file }, opts),
    employees: (opts = {} as ApiOptions) => apiJson("/api/v1/allocation/employees", opts),
    roles: (opts = {} as ApiOptions) => apiJson("/api/v1/allocation/roles", opts),
  },
  timelogs: {
    create: (payload, opts = {} as ApiOptions) => apiJson("/api/v1/timelogs", { method: "POST", payload, ...opts }),
    getByEmployeeDate: (empEmail, date, opts = {} as ApiOptions) =>
      apiJson(`/api/v1/timelogs/${encodeURIComponent(String(empEmail || ""))}/${encodeURIComponent(String(date || ""))}`, opts),
    projectRange: (startDate, endDate, opts = {} as ApiOptions) =>
      apiJson(`/api/v1/timelogs/project/${encodeURIComponent(String(startDate || ""))}/${encodeURIComponent(String(endDate || ""))}`, opts),
    projectCodeRange: (projectCode, startDate, endDate, opts = {} as ApiOptions) =>
      apiJson(`/api/v1/timelogs/project/${encodeURIComponent(String(projectCode || ""))}/${encodeURIComponent(String(startDate || ""))}/${encodeURIComponent(String(endDate || ""))}`, opts),
    updateStatus: (payload, opts = {} as ApiOptions) => apiJson("/api/v1/timelogs/status", { method: "PUT", payload, ...opts }),
    updateStatusBatch: (payload, opts = {} as ApiOptions) => apiJson("/api/v1/timelogs/status/batch", { method: "PUT", payload, ...opts }),
    updateEntry: (payload, opts = {} as ApiOptions) => apiJson("/api/v1/timelogs/entry", { method: "PUT", payload, ...opts }),
    delete: (id, opts = {} as ApiOptions) => apiJson(`/api/v1/timelogs/${encodeURIComponent(String(id || ""))}`, { method: "DELETE", ...opts }),
  },
  leave: {
    createTransaction: (payload, opts = {} as ApiOptions) => apiJson("/api/v1/leaveTransaction", { method: "POST", payload, ...opts }),
    summary: (opts = {} as ApiOptions) => apiJson("/api/v1/leave-summary", opts),
  },
  requests: {
    create: (payload, file, opts = {} as ApiOptions) => createUserRequest(payload, { file, ...opts }),
    range: (fromDate, toDate, requestType, opts = {} as ApiOptions) => fetchUserRequests({ fromDate, toDate, requestType, ...opts }),
    employeeRange: (empEmails, fromDate, toDate, requestType, opts = {} as ApiOptions) =>
      fetchUserRequests({ empEmails, fromDate, toDate, requestType, ...opts }),
    forDate: (date, requestType, opts = {} as ApiOptions) => fetchUserRequestsForDate({ date, requestType, ...opts }),
    byCreateDate: (date, requestType, opts = {} as ApiOptions) => fetchUserRequestsByCreateDate({ date, requestType, ...opts }),
    status: (payload, opts = {} as ApiOptions) => updateUserRequestStatus(payload, opts),
    update: (fields, file, opts = {} as ApiOptions) => updateUserRequest(fields, { file, ...opts }),
    delete: (payload, opts = {} as ApiOptions) => deleteUserRequest(payload?.userRequestId ?? payload?.id ?? payload, opts),
    remindApproval: (payload, opts = {} as ApiOptions) => remindUserRequestApproval(payload?.userRequestId ?? payload?.id ?? payload, opts),
    managers: (opts = {} as ApiOptions) => fetchUserRequestManagers(opts),
  },
  reports: {
    managerTimelogs: (projectCode, date, opts = {} as ApiOptions) =>
      apiJson(`/api/v1/report/manager/timelogs/${encodeURIComponent(String(projectCode || ""))}/${encodeURIComponent(String(date || ""))}`, opts),
    managerProjects: (email, opts = {} as ApiOptions) => apiJson(`/api/v1/report/manager/${encodeURIComponent(String(email || ""))}/projects`, opts),
    exportEmployeeTimelogs: (projectCode, empEmail, startDate, endDate, opts = {} as ApiOptions) =>
      apiDownload(`/api/v1/export/timelogs/${encodeURIComponent(String(projectCode || ""))}/${encodeURIComponent(String(empEmail || ""))}/${encodeURIComponent(String(startDate || ""))}/${encodeURIComponent(String(endDate || ""))}`, opts),
    exportAllTimelogs: (startDate, endDate, opts = {} as ApiOptions) =>
      apiDownload(`/api/v1/export/timelogs/${encodeURIComponent(String(startDate || ""))}/${encodeURIComponent(String(endDate || ""))}`, opts),
    exportProjectTimelogs: (projectCode, startDate, endDate, opts = {} as ApiOptions) =>
      apiDownload(`/api/v1/export/timelogs/${encodeURIComponent(String(projectCode || ""))}/${encodeURIComponent(String(startDate || ""))}/${encodeURIComponent(String(endDate || ""))}`, opts),
  },
  imports: {
    leaveExcel: (file, fields, opts = {} as ApiOptions) => apiMultipart("/api/v1/upload", fields, { file }, opts),
    allocationExcel: (file, fields, opts = {} as ApiOptions) => apiMultipart("/api/v1/upload-allocation", fields, { file }, opts),
    userData: (file, fields, opts = {} as ApiOptions) => apiMultipart("/api/v1/upload/user-data", fields, { file }, opts),
  },
  notifications: {
    subscribe: (userId, opts = {} as ApiOptions) => apiJson(`/api/v1/notifications/${encodeURIComponent(String(userId || ""))}/subscribe`, opts),
    list: (userId, opts = {} as ApiOptions) => apiJson(`/api/v1/notifications/${encodeURIComponent(String(userId || ""))}`, opts),
    read: (id, opts = {} as ApiOptions) => apiJson(`/api/v1/notifications/${encodeURIComponent(String(id || ""))}/read`, { method: "PUT", ...opts }),
    announcement: (payload, opts = {} as ApiOptions) => apiJson("/api/v1/notifications/announcement", { method: "POST", payload, ...opts }),
    clearRead: (opts = {} as ApiOptions) => apiJson("/api/v1/notifications/read", { method: "DELETE", ...opts }),
  },
  cron: {
    reminder: (opts = {} as ApiOptions) => apiJson("/api/v1/reminder", opts),
    autoApprove: (opts = {} as ApiOptions) => apiJson("/api/v1/auto-approve", opts),
    deallocate: (opts = {} as ApiOptions) => apiJson("/api/v1/deallocate", opts),
    monthlyLeave: (opts = {} as ApiOptions) => apiJson("/api/v1/run-monthly-leave-cron", opts),
    notifyTimelogs: (opts = {} as ApiOptions) => apiJson("/api/v1/notify/timelogs/", opts),
  },
  reference: {
    departments: (opts = {} as ApiOptions) => apiJson("/api/v1/department-list", opts),
    streams: (opts = {} as ApiOptions) => apiJson("/api/v1/department-list", opts),
    designations: ({ bandId = "", department = "" } = {}, opts = {} as ApiOptions) =>
      apiJson(`/designations?bandId=${encodeURIComponent(String(bandId))}&department=${encodeURIComponent(String(department))}`, opts),
    bandList: (opts = {} as ApiOptions) => apiJson("/api/v1/band-list", opts),
    settings: (opts = {} as ApiOptions) => apiJson("/api/v1/settings", opts),
    settingByKey: (key, opts = {} as ApiOptions) =>
      apiJson(`/api/v1/settings/${encodeURIComponent(String(key || ""))}`, opts),
  },
};
