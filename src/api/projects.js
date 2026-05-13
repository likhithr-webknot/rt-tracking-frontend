import { getAuthHeader } from "./auth.js";
import { buildApiUrl, parseResponse, requestWithFallbacks, toHttpError, withCsrfHeaders } from "./http.js";

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

export function normalizeProject(raw) {
  if (!raw || typeof raw !== "object") return null;
  const code = String(raw.code ?? raw.projectCode ?? "").trim();
  const description = String(
    raw.description ??
    raw.projectDescription ??
    raw.desc ??
    raw.details ??
    raw.summary ??
    ""
  ).trim();
  return {
    id: String(raw.id ?? raw.projectId ?? raw._id ?? code ?? "").trim(),
    code,
    name: String(raw.name ?? raw.projectName ?? raw.title ?? "").trim(),
    description,
    managerId: String(raw.managerId ?? raw.manager?.id ?? raw.manager?.employeeId ?? "").trim(),
    managerEmployeeId: String(raw.managerEmployeeId ?? raw.managerEmployeeID ?? raw.managerEmployeeId ?? "").trim(),
    managerName: String(raw.managerName ?? raw.manager?.name ?? raw.manager?.employeeName ?? "").trim(),
    managerEmail: String(raw.managerEmail ?? raw.manager?.email ?? "").trim(),
    active: raw.active !== false && raw.status !== "INACTIVE",
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
}

export function normalizeProjects(data) {
  const root = data && typeof data === "object" ? data : {};
  const arr =
    (Array.isArray(data) && data) ||
    (Array.isArray(root?.data) && root.data) ||
    (Array.isArray(root?.items) && root.items) ||
    (Array.isArray(root?.results) && root.results) ||
    (Array.isArray(root?.content) && root.content) ||
    (Array.isArray(root?.projects) && root.projects) ||
    (Array.isArray(root?.list) && root.list) ||
    [];
  return arr.map(normalizeProject).filter(Boolean).filter((p) => p.id);
}

/* ── admin endpoints ── */

export async function fetchProjects({ signal } = {}) {
  const auth = getAuthHeader();
  return requestWithFallbacks(["/api/v1/projects/all", "/api/v1/projects"], {
    signal,
    headers: auth ? { Authorization: auth } : undefined,
    fallbackStatuses: [403, 404, 405],
    notFoundMessage: "Projects list endpoint not found.",
  });
}

export async function addProject({ code, name, description = "", managerEmployeeId, active = true }, { signal } = {}) {
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

export async function updateProject(id, { name, description, managerId, active }, { signal } = {}) {
  void id;
  void name;
  void description;
  void managerId;
  void active;
  void signal;
  throw new Error("Webtrak backend does not expose a project update endpoint yet.");
}

export async function deleteProject(id, { signal } = {}) {
  void id;
  void signal;
  throw new Error("Webtrak backend does not expose a project delete endpoint yet.");
}

/* ── employee endpoints ── */

export async function fetchMyProjects({ signal } = {}) {
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

export async function updateMyProjects(projectIds, { signal } = {}) {
  void projectIds;
  void signal;
  throw new Error("Webtrak backend does not expose a self-service project selection endpoint yet.");
}

export async function fetchMyProjectRatings({ signal } = {}) {
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
export async function assignProjectManager(projectId, managerId, { signal } = {}) {
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
export async function submitProjectRating(projectId, { employeeId, rating, comments } = {}, { signal } = {}) {
  const safeId = encodeURIComponent(String(projectId));
  const res = await fetch(buildApiUrl(`/projects/${safeId}/ratings`), {
    method: "POST",
    signal,
    credentials: "include",
    headers: authHeaders(),
    body: JSON.stringify({
      employeeId: String(employeeId || "").trim(),
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
export async function fetchAvailableProjects({ signal } = {}) {
  const auth = getAuthHeader();
  return requestWithFallbacks(["/api/v1/projects/all", "/api/v1/projects"], {
    signal,
    headers: auth ? { Authorization: auth } : undefined,
    fallbackStatuses: [404, 405],
    notFoundMessage: "Available projects endpoint not found.",
  });
}

/** GET /employee-portal/profile/projects/selected — list employee's selected projects */
export async function fetchSelectedProjects({ signal } = {}) {
  const auth = getAuthHeader();
  return requestWithFallbacks(["/api/v1/project-assigned-to-user"], {
    signal,
    headers: auth ? { Authorization: auth } : undefined,
    fallbackStatuses: [404, 405],
    notFoundMessage: "Selected projects endpoint not found.",
  });
}

/** PUT /employee-portal/profile/projects/update — update employee's project selections */
export async function updateSelectedProjects(projectIds, { signal } = {}) {
  return updateMyProjects(projectIds, { signal });
}

/** GET /employee-portal/profile/projects/ratings — get ratings for employee's projects */
export async function fetchSelectedProjectRatings({ signal } = {}) {
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
