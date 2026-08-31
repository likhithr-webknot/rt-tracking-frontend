// @ts-nocheck
import type { ApiOptions } from "../types/api-options";
import { sanitizeEmployeeIdForApi } from "../utils/employeeId";
import { saveProjectsCache } from "../utils/projectsCache";
import { getAuthHeader } from "./auth";
import { buildApiUrl, buildSameOriginApiUrl, ensureCsrfCookie, parseResponse, requestWithFallbacks, toHttpError, withCsrfHeaders } from "./http";

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
  const code = String(
    row.code ?? row.projectCode ?? row.project_code ?? "",
  ).trim();
  const description = String(
    row.description ??
    row.projectDescription ??
    row.desc ??
    row.details ??
    row.summary ??
    ""
  ).trim();
  const pm = String(row.pm ?? row.projectManager ?? row.managerName ?? row.manager?.name ?? "").trim();
  const am = String(
    row.am ??
      row.accountManager ??
      row.accountManagerName ??
      row.account_manager_name ??
      row.accountManagerEmail ??
      row.account_manager_email ??
      "",
  ).trim();
  const startDateRaw = row.startDate ?? row.start_date ?? null;
  const endDateRaw = row.endDate ?? row.end_date ?? null;
  return {
    id: String(row.id ?? row.projectId ?? row._id ?? code ?? "").trim(),
    code,
    name: String(row.name ?? row.projectName ?? row.project_name ?? row.title ?? "").trim(),
    description,
    pm,
    am,
    managerId: String(row.managerId ?? row.manager?.id ?? row.manager?.employeeId ?? "").trim(),
    managerEmployeeId: String(row.managerEmployeeId ?? row.managerEmployeeID ?? row.managerEmployeeId ?? "").trim(),
    managerName: pm || String(row.managerName ?? row.manager?.name ?? row.manager?.employeeName ?? am ?? "").trim(),
    managerEmail: String(row.managerEmail ?? row.manager?.email ?? "").trim(),
    startDate: startDateRaw ? String(startDateRaw).slice(0, 10) : null,
    endDate: endDateRaw ? String(endDateRaw).slice(0, 10) : null,
    active:
      row.isActive !== false &&
      row.is_active !== false &&
      row.active !== false &&
      row.status !== "INACTIVE",
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
    (dataObj && Array.isArray(dataObj.items) && dataObj.items) ||
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

/**
 * Projects catalog from this Java webtrak backend: GET /api/v1/projects/all.
 * On success, refresh local cache/catalog. The UI may still show cache if the request fails.
 */
export async function fetchProjects({ signal, includeInactive = false } = {} as ApiOptions & { includeInactive?: boolean }) {
  void includeInactive;
  const auth = getAuthHeader();
  const res = await fetch(buildSameOriginApiUrl("/api/v1/projects/all"), {
    signal,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(auth ? { Authorization: auth } : {}),
    },
  });
  if (!res.ok) {
    throw await toHttpError(res, { method: "GET", path: "/api/v1/projects/all" });
  }

  const raw = await parseResponse(res, {});
  const items = normalizeProjects(raw);
  const root = raw && typeof raw === "object" ? raw : {};
  const data = root?.data && typeof root.data === "object" && !Array.isArray(root.data) ? root.data : root;
  const total =
    typeof data?.total === "number"
      ? data.total
      : typeof root?.total === "number"
        ? root.total
        : items.length;
  const rawItems = Array.isArray(data?.projects)
    ? data.projects
    : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(root?.items)
        ? root.items
        : items;

  saveProjectsCache({
    fetchedAt: new Date().toISOString(),
    items: rawItems,
    total,
  });

  return raw;
}

export async function addProject({ code, name, description = "", managerEmployeeId, active = true }, { signal } = {} as ApiOptions) {
  const projectCode = String(code || name || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
  const payload = {
    projectCode: projectCode || String(name || "").trim().toUpperCase(),
    projectName: String(name || "").trim(),
    projectType: "IN_HOUSE",
    code: projectCode || String(name || "").trim(),
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

export async function updateProject(id, { name, active }, { signal } = {} as ApiOptions) {
  const safeId = encodeURIComponent(String(id ?? "").trim());
  if (!safeId) throw new Error("Project id is required.");
  const payload = {};
  if (name != null && String(name).trim()) payload.projectName = String(name).trim();
  if (active != null) payload.isActive = Boolean(active);
  const res = await fetch(buildApiUrl(`/api/v1/project/${safeId}`), {
    method: "PUT",
    signal,
    credentials: "include",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (res.status === 404 || res.status === 405) {
    const alt = await fetch(buildApiUrl(`/api/v1/projects/${safeId}`), {
      method: "PUT",
      signal,
      credentials: "include",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    if (!alt.ok) throw await toHttpError(alt);
    return parseResponse(alt, {});
  }
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, {});
}

export async function deleteProject(id, { hardDelete = false, signal } = {} as ApiOptions & { hardDelete?: boolean }) {
  const safeId = encodeURIComponent(String(id ?? "").trim());
  if (!safeId) throw new Error("Project id is required.");
  const qs = hardDelete ? "?hardDelete=true" : "";
  const res = await fetch(buildApiUrl(`/api/v1/project/${safeId}${qs}`), {
    method: "DELETE",
    signal,
    credentials: "include",
    headers: authHeaders(),
  });
  if (res.status === 404 || res.status === 405) {
    const alt = await fetch(buildApiUrl(`/api/v1/projects/${safeId}${qs}`), {
      method: "DELETE",
      signal,
      credentials: "include",
      headers: authHeaders(),
    });
    if (!alt.ok) throw await toHttpError(alt);
    return parseResponse(alt, {});
  }
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, {});
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

/** GET /api/v1/projects/all — canonical Webtrak project catalog. */
export async function fetchAvailableProjects({ signal } = {} as ApiOptions) {
  return fetchProjects({ signal });
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
