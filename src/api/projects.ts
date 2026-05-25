// @ts-nocheck
import type { ApiOptions } from "../types/api-options";
import { sanitizeEmployeeIdForApi } from "../utils/employeeId";
import { getAuthHeader } from "./auth";
import { buildApiUrl, ensureCsrfCookie, parseResponse, requestWithFallbacks, toHttpError, withCsrfHeaders } from "./http";

/* ── helpers ── */

function authHeaders(extra = {}) {
  const auth = getAuthHeader();
  return withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
    ...extra,
  });
}

/* ── normalizers ── */

/** Flatten `/api/v1/project-assigned-to-user` rows that nest a `project` object. */
function coalesceProjectRow(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.project && typeof raw.project === "object") {
    return { ...raw.project, ...raw };
  }
  return raw;
}

export function normalizeProject(raw) {
  const row = coalesceProjectRow(raw);
  if (!row || typeof row !== "object") return null;
  const code = String(row.code ?? row.projectCode ?? "").trim();
  const description = String(
    row.description ??
    row.projectDescription ??
    row.desc ??
    row.details ??
    row.summary ??
    ""
  ).trim();
  return {
    id: String(row.id ?? row.projectId ?? row._id ?? code ?? "").trim(),
    code,
    name: String(row.name ?? row.projectName ?? row.title ?? "").trim(),
    description,
    managerId: String(row.managerId ?? row.manager?.id ?? row.manager?.employeeId ?? "").trim(),
    managerEmployeeId: String(row.managerEmployeeId ?? row.managerEmployeeID ?? row.managerEmployeeId ?? "").trim(),
    managerName: String(row.managerName ?? row.manager?.name ?? row.manager?.employeeName ?? "").trim(),
    managerEmail: String(row.managerEmail ?? row.manager?.email ?? "").trim(),
    active: row.active !== false && row.status !== "INACTIVE",
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

export function normalizeProjects(data) {
  const root = data && typeof data === "object" ? data : {};
  const dataObj = root.data && typeof root.data === "object" && !Array.isArray(root.data) ? root.data : null;
  const arr =
    (Array.isArray(data) && data) ||
    (Array.isArray(root?.data) && root.data) ||
    (dataObj && Array.isArray(dataObj.content) && dataObj.content) ||
    (dataObj && Array.isArray(dataObj.projects) && dataObj.projects) ||
    (Array.isArray(root?.items) && root.items) ||
    (Array.isArray(root?.results) && root.results) ||
    (Array.isArray(root?.content) && root.content) ||
    (Array.isArray(root?.projects) && root.projects) ||
    (Array.isArray(root?.list) && root.list) ||
    [];
  return arr.map(normalizeProject).filter(Boolean).filter((p) => p.id);
}

/* ── admin endpoints ── */

export async function fetchProjects({ signal } = {} as ApiOptions) {
  const auth = getAuthHeader();
  /**
   * Backend (Webtrak) often returns 403 on GET /api/v1/projects for non-SUPER_ADMIN roles,
   * while GET /api/v1/project-assigned-to-user succeeds for the same session (see scripts/api-smoke-report.md).
   */
  return requestWithFallbacks(
    [
      "/api/v1/projects/all?page=0&size=500",
      "/api/v1/projects/all",
      "/api/v1/projects?page=0&size=500",
      "/api/v1/projects",
      "/api/v1/project-assigned-to-user",
    ],
    {
      signal,
      headers: auth ? { Authorization: auth } : undefined,
      credentials: "include",
      fallbackStatuses: [403, 404, 405],
      notFoundMessage:
        "Could not load projects. The server rejected the admin catalog (403). Trying your assigned projects also failed — check backend roles for GET /api/v1/projects vs /api/v1/project-assigned-to-user.",
    }
  );
}

export async function addProject({ code, name, description = "", managerEmployeeId, active = true }, { signal } = {} as ApiOptions) {
  const payload = {
    code: String(code || name || "").trim(),
    name: String(name || "").trim(),
    description: String(description || "").trim(),
    managerEmployeeId: String(managerEmployeeId || "").trim(),
    active: Boolean(active),
  };
  const body = JSON.stringify(payload);
  return requestWithFallbacks(
    [
      { method: "POST", path: "/api/v1/project" },
      { method: "POST", path: "/api/v1/projects" },
    ],
    {
      signal,
      headers: authHeaders(),
      body,
      fallbackStatuses: [404, 405],
      notFoundMessage: "Project create endpoint not found.",
    }
  );
}

export async function updateProject(id, { name, description, managerId, active }, { signal } = {} as ApiOptions) {
  void id;
  void name;
  void description;
  void managerId;
  void active;
  void signal;
  throw new Error("Webtrak backend does not expose a project update endpoint yet.");
}

export async function deleteProject(id, { signal } = {} as ApiOptions) {
  void id;
  void signal;
  throw new Error("Webtrak backend does not expose a project delete endpoint yet.");
}

/* ── employee endpoints ── */

export async function fetchMyProjects({ signal } = {} as ApiOptions) {
  const auth = getAuthHeader();
  return requestWithFallbacks(
    ["/api/v1/project-assigned-to-user", "/api/v1/manager-projects-with-roles", "/api/v1/manager-projects"],
    {
      signal,
      headers: auth ? { Authorization: auth } : undefined,
      fallbackStatuses: [404, 405],
      notFoundMessage: "My projects endpoint not found.",
    }
  );
}

export async function updateMyProjects(projectIds, { month, signal } = {} as ApiOptions) {
  const ids = Array.isArray(projectIds) ? projectIds.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
  const auth = getAuthHeader();
  await ensureCsrfCookie({ signal });
  const res = await fetch(buildApiUrl("/api/v1/employees/me/project-preferences"), {
    method: "PUT",
    signal,
    credentials: "include",
    headers: authHeaders(auth ? { Authorization: auth } : {}),
    body: JSON.stringify({
      month: month || undefined,
      projectIds: ids,
    }),
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, {});
}

export async function fetchMyProjectRatings({ signal } = {} as ApiOptions) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/projects/my/ratings"), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (res.status === 403 || res.status === 404) return [];
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}

export function normalizeProjectRatings(data) {
  const root = data && typeof data === "object" ? data : {};
  const arr =
    (Array.isArray(data) && data) ||
    (Array.isArray(root?.data) && root.data) ||
    (Array.isArray(root?.ratings) && root.ratings) ||
    (Array.isArray(root?.items) && root.items) ||
    [];
  return arr.map((r) => ({
    projectId: String(r?.projectId ?? ""),
    projectName: String(r?.projectName ?? r?.project?.name ?? ""),
    averageRating: Number(r?.averageRating ?? r?.avgRating ?? r?.average ?? 0) || 0,
    ratingsCount: Number(r?.ratingsCount ?? r?.count ?? 0) || 0,
  }));
}

/* ── manager endpoints ── */

/** PUT /projects/{projectId}/manager — reassign a project's manager (admin) */
export async function assignProjectManager(projectId, managerId, { signal } = {} as ApiOptions) {
  const safeId = encodeURIComponent(String(projectId));
  const res = await fetch(buildApiUrl(`/projects/${safeId}/manager`), {
    method: "PUT",
    signal,
    credentials: "include",
    headers: authHeaders(),
    body: JSON.stringify({ managerId: String(managerId || "").trim() }),
  });
  if (!res.ok) throw await toHttpError(res);
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json().catch(() => ({})) : res.text().catch(() => "");
}

/** POST /projects/{projectId}/ratings — manager submits a rating for an employee */
export async function submitProjectRating(projectId, { employeeId, rating, comments } = {}, { signal } = {} as ApiOptions) {
  const safeId = encodeURIComponent(String(projectId));
  const res = await fetch(buildApiUrl(`/projects/${safeId}/ratings`), {
    method: "POST",
    signal,
    credentials: "include",
    headers: authHeaders(),
    body: JSON.stringify({
      employeeId: sanitizeEmployeeIdForApi(employeeId),
      rating: Number(rating) || 0,
      comments: String(comments || "").trim(),
    }),
  });
  if (!res.ok) throw await toHttpError(res);
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json().catch(() => ({})) : res.text().catch(() => "");
}

/* ── employee-portal profile aliases ── */

/** GET /employee-portal/profile/projects/available — list projects available for selection */
export async function fetchAvailableProjects({ signal } = {} as ApiOptions) {
  const auth = getAuthHeader();
  return requestWithFallbacks(
    [
      "/api/v1/projects/all?page=0&size=500",
      "/api/v1/projects/all",
      "/api/v1/projects?page=0&size=500",
      "/api/v1/projects",
      "/api/v1/project-assigned-to-user",
    ],
    {
      signal,
      headers: auth ? { Authorization: auth } : undefined,
      credentials: "include",
      fallbackStatuses: [403, 404, 405],
      notFoundMessage: "Available projects endpoint not found.",
    }
  );
}

/** GET /employee-portal/profile/projects/selected — list employee's selected projects */
export async function fetchSelectedProjects({ month, signal } = {} as ApiOptions) {
  const auth = getAuthHeader();
  const qs = month ? `?month=${encodeURIComponent(String(month))}` : "";
  try {
    const res = await fetch(buildApiUrl(`/api/v1/employees/me/project-preferences${qs}`), {
      signal,
      credentials: "include",
      headers: auth ? { Authorization: auth } : undefined,
    });
    if (res.ok) return parseResponse(res, {});
    if (res.status !== 404 && res.status !== 405 && res.status !== 400) {
      throw await toHttpError(res);
    }
  } catch (err) {
    if (err?.status !== 400 && err?.status !== 404) throw err;
  }
  return requestWithFallbacks(["/api/v1/project-assigned-to-user"], {
    signal,
    headers: auth ? { Authorization: auth } : undefined,
    fallbackStatuses: [404, 405],
    notFoundMessage: "Selected projects endpoint not found.",
  });
}

/** PUT /employee-portal/profile/projects/update — update employee's project selections */
export async function updateSelectedProjects(projectIds, { month, signal } = {} as ApiOptions) {
  return updateMyProjects(projectIds, { month, signal });
}

/** GET /employee-portal/profile/projects/ratings — get ratings for employee's projects */
export async function fetchSelectedProjectRatings({ signal } = {} as ApiOptions) {
  // Prefer legacy stable endpoint; treat auth/availability failures as empty so UI does not break
  try {
    return await fetchMyProjectRatings({ signal });
  } catch (legacyErr) {
    if (legacyErr?.status === 403 || legacyErr?.status === 404) return [];
    const auth = getAuthHeader();
    try {
      const res = await fetch(buildApiUrl("/employee-portal/profile/projects/ratings"), {
        signal,
        credentials: "include",
        headers: auth ? { Authorization: auth } : undefined,
      });
      if (res.status === 403 || res.status === 404) return [];
      if (!res.ok) throw await toHttpError(res);
      return res.json().catch(() => ({}));
    } catch (profileErr) {
      if (profileErr?.status === 500) return [];
      throw profileErr;
    }
  }
}
