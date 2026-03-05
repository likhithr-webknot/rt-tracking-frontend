import { getAuthHeader } from "./auth.js";
import { buildApiUrl, withCsrfHeaders } from "./http.js";

/* ── helpers ── */

async function readError(res) {
  const text = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(text);
    if (parsed?.message) return String(parsed.message);
    if (parsed?.error) return String(parsed.error);
  } catch { void 0; }
  return text || `Request failed: ${res.status} ${res.statusText}`;
}

async function toHttpError(res) {
  const message = await readError(res);
  const err = new Error(message);
  err.status = res.status;
  return err;
}

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
  return {
    id: String(raw.id ?? raw.projectId ?? raw._id ?? "").trim(),
    name: String(raw.name ?? raw.projectName ?? raw.title ?? "").trim(),
    description: String(raw.description ?? "").trim(),
    managerId: String(raw.managerId ?? raw.manager?.id ?? raw.manager?.employeeId ?? "").trim(),
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
  /* try /projects/list first, fall back to /projects */
  let res = await fetch(buildApiUrl("/projects/list"), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (res.status === 404 || res.status === 403) {
    res = await fetch(buildApiUrl("/projects"), {
      signal,
      credentials: "include",
      headers: auth ? { Authorization: auth } : undefined,
    });
  }
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}

export async function addProject({ id, name, description = "", managerId }, { signal } = {}) {
  const payload = {
    name: String(name || "").trim(),
    description: String(description || "").trim(),
    managerId: String(managerId || "").trim(),
  };
  if (id) payload.id = String(id).trim();
  const res = await fetch(buildApiUrl("/projects/add"), {
    method: "POST",
    signal,
    credentials: "include",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await toHttpError(res);
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json().catch(() => ({})) : res.text().catch(() => "");
}

export async function updateProject(id, { name, description, managerId, active }, { signal } = {}) {
  const safeId = encodeURIComponent(String(id));
  const payload = {};
  if (name != null) payload.name = String(name).trim();
  if (description != null) payload.description = String(description).trim();
  if (managerId != null) payload.managerId = String(managerId).trim();
  if (active != null) payload.active = Boolean(active);

  const res = await fetch(buildApiUrl(`/projects/update/${safeId}`), {
    method: "PUT",
    signal,
    credentials: "include",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await toHttpError(res);
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json().catch(() => ({})) : res.text().catch(() => "");
}

export async function deleteProject(id, { signal } = {}) {
  const safeId = encodeURIComponent(String(id));
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl(`/projects/delete/${safeId}`), {
    method: "DELETE",
    signal,
    credentials: "include",
    headers: withCsrfHeaders(auth ? { Authorization: auth } : {}),
  });
  if (!res.ok) throw await toHttpError(res);
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json().catch(() => ({})) : res.text().catch(() => "");
}

/* ── employee endpoints ── */

export async function fetchMyProjects({ signal } = {}) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/projects/my"), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}

export async function updateMyProjects(projectIds, { signal } = {}) {
  const res = await fetch(buildApiUrl("/projects/my"), {
    method: "PUT",
    signal,
    credentials: "include",
    headers: authHeaders(),
    body: JSON.stringify({ projectIds: Array.isArray(projectIds) ? projectIds.map(String) : [] }),
  });
  if (!res.ok) throw await toHttpError(res);
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json().catch(() => ({})) : res.text().catch(() => "");
}

export async function fetchMyProjectRatings({ signal } = {}) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/projects/my/ratings"), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
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
  const res = await fetch(buildApiUrl("/employee-portal/profile/projects/available"), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}

/** GET /employee-portal/profile/projects/selected — list employee's selected projects */
export async function fetchSelectedProjects({ signal } = {}) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/employee-portal/profile/projects/selected"), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}

/** PUT /employee-portal/profile/projects/update — update employee's project selections */
export async function updateSelectedProjects(projectIds, { signal } = {}) {
  const res = await fetch(buildApiUrl("/employee-portal/profile/projects/update"), {
    method: "PUT",
    signal,
    credentials: "include",
    headers: authHeaders(),
    body: JSON.stringify({ projectIds: Array.isArray(projectIds) ? projectIds.map(String) : [] }),
  });
  if (!res.ok) throw await toHttpError(res);
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json().catch(() => ({})) : res.text().catch(() => "");
}

/** GET /employee-portal/profile/projects/ratings — get ratings for employee's projects */
export async function fetchSelectedProjectRatings({ signal } = {}) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/employee-portal/profile/projects/ratings"), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}
