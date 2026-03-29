import { getAuthHeader } from "./auth.js";
import { buildApiUrl, toHttpError, withCsrfHeaders } from "./http.js";

export function normalizeEmployees(data) {
  const root = data && typeof data === "object" ? data : {};
  const nested = root?.data && typeof root.data === "object" ? root.data : null;
  const arr =
    (Array.isArray(data) && data) ||
    (Array.isArray(root?.data) && root.data) ||
    (Array.isArray(root?.employees) && root.employees) ||
    (Array.isArray(root?.reportees) && root.reportees) ||
    (Array.isArray(root?.items) && root.items) ||
    (Array.isArray(root?.results) && root.results) ||
    (Array.isArray(root?.content) && root.content) ||
    (Array.isArray(nested?.employees) && nested.employees) ||
    (Array.isArray(nested?.reportees) && nested.reportees) ||
    (Array.isArray(nested?.items) && nested.items) ||
    (Array.isArray(nested?.results) && nested.results) ||
    (Array.isArray(nested?.content) && nested.content) ||
    [];

  /** Derive a display name from an email address (e.g. "alice.johnson@x.com" → "Alice Johnson") */
  function nameFromEmail(email) {
    const raw = String(email ?? "").trim();
    if (!raw || !raw.includes("@")) return "";
    const local = raw.split("@")[0];
    return local
      .replace(/[._+\-]+/g, " ")
      .replace(/\d+/g, "")
      .trim()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }

  return arr.map((e, i) => {
    const toNumber = (v) => {
      const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
      return Number.isFinite(n) ? n : null;
    };

    const submissionAbility = toNumber(
      e.submissionAbility ??
      e.abilityScore ??
      e.avgScore ??
      e.averageScore ??
      e.performanceScore ??
      e.ability ??
      e.score
    );
    const abilityFromRatings = toNumber(
      e.abilityScoreFromRatings ?? e.abilityFromRatings ?? e.managerAbility ?? e.managerScore
    );

    const rawName = String(
      e.employeeName ?? e.employee_name ?? e.name ?? e.fullName ?? e.full_name ?? e.displayName ?? e.display_name ?? ""
    ).trim();

    return {
      id: String(e.employeeId ?? e.id ?? e.empId ?? `EMP_${i}`),
      name: rawName || nameFromEmail(e.email ?? e.employeeEmail ?? e.mail) || "Unknown",
      email: String(e.email ?? e.employeeEmail ?? e.mail ?? ""),
      role: String(e.empRole ?? e.role ?? e.userRole ?? "Employee"),
      designation: String(e.designation ?? e.title ?? e.jobTitle ?? e.empRole ?? ""),
      band: String(e.band ?? e.level ?? "B4"),
      stream: String(e.department ?? e.stream ?? e.context ?? ""),
      project: String(e.project ?? e.projectName ?? e.account ?? e.client ?? ""),
      managerId: String(e.managerId ?? e.reportingManagerId ?? e.managerEmpId ?? ""),
      createdAt: e.createdAt ? String(e.createdAt) : null,
      updatedAt: e.updatedAt ? String(e.updatedAt) : null,
      submitted: Boolean(e.submitted ?? e.hasSubmitted ?? false),
      recognitions: Number(e.recognitions ?? e.recognitionCount ?? 0) || 0,
      certifications: Array.isArray(e.certifications) ? e.certifications : [],
      submissionAbility,
      abilityScore: submissionAbility ?? abilityFromRatings,
      avgScore: submissionAbility ?? abilityFromRatings,
      abilityScoreFromRatings: abilityFromRatings,
      abilityFromRatings,
    };
  });
}

function extractUsersArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const root = raw;
  const nested = root?.data && typeof root.data === "object" ? root.data : null;
  const candidates = [
    root?.items,
    root?.users,
    root?.employees,
    root?.results,
    root?.content,
    root?.data,
    nested?.items,
    nested?.users,
    nested?.employees,
    nested?.results,
    nested?.content,
    nested?.data,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  return [];
}

export async function fetchEmployees({ limit = null, cursor = null, signal } = {}) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/api/v1/"), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  const raw = await res.json().catch(() => ({}));
  const allUsers = extractUsersArray(raw);

  const fallbackLimit = 10;
  const parsedLimit = limit != null ? Number.parseInt(String(limit), 10) : fallbackLimit;
  const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : fallbackLimit;
  const parsedOffset = cursor != null ? Number.parseInt(String(cursor), 10) : 0;
  const safeOffset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;

  const items = allUsers.slice(safeOffset, safeOffset + safeLimit);
  const nextCursor = safeOffset + safeLimit < allUsers.length ? String(safeOffset + safeLimit) : null;
  return {
    items,
    nextCursor,
    total: allUsers.length,
    managerCount: allUsers.filter((u) => String(u?.empRole ?? u?.role ?? "").toLowerCase() === "manager").length,
    adminCount: allUsers.filter((u) => String(u?.empRole ?? u?.role ?? "").toLowerCase() === "admin").length,
    employeeCount: allUsers.filter((u) => String(u?.empRole ?? u?.role ?? "").toLowerCase() === "employee").length,
    bandCount: new Set(
      allUsers.map((u) => String(u?.band ?? u?.level ?? "").trim()).filter(Boolean)
    ).size,
  };
}

export async function addEmployee(payload) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/employees/add"), {
    method: "POST",
    credentials: "include",
    headers: withCsrfHeaders({
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await toHttpError(res);
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  return null;
}
export async function addEmployeeWithManager(payload) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/employees/add-with-manager"), {
    method: "POST",
    credentials: "include",
    headers: withCsrfHeaders({
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await toHttpError(res);

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  return null;
}
export async function updateEmployee(employeeId, payload, { signal } = {}) {
  const safeId = encodeURIComponent(String(employeeId));
  const auth = getAuthHeader();
  const body = JSON.stringify(payload && typeof payload === "object" ? payload : {});

  const endpoints = [
    `/employees/${safeId}/edit`,
    `/employees/edit/${safeId}`,
    `/employees/update/${safeId}`,
  ];

  let lastRouteErr = null;
  for (const endpoint of endpoints) {
    const res = await fetch(buildApiUrl(endpoint), {
      method: "PUT",
      signal,
      credentials: "include",
      headers: withCsrfHeaders({
        "Content-Type": "application/json",
        ...(auth ? { Authorization: auth } : {}),
      }),
      body,
    });

    if (res.ok) {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) return res.json();
      return null;
    }

    const err = await toHttpError(res);
    if (res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }

  throw lastRouteErr || new Error("Employee edit endpoint not found.");
}
export async function deleteEmployee(employeeId, { signal } = {}) {
  const safeId = encodeURIComponent(String(employeeId));
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl(`/employees/delete/${safeId}`), {
    method: "DELETE",
    signal,
    credentials: "include",
    headers: withCsrfHeaders(auth ? { Authorization: auth } : {}),
  });
  if (!res.ok) throw await toHttpError(res);

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  return null;
}

export function normalizeManagers(data) {
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : [];
  return arr.map((m, i) => {
    const rawMgrName = String(
      m.employeeName ?? m.employee_name ?? m.name ?? m.fullName ?? m.full_name ?? m.displayName ?? m.display_name ?? ""
    ).trim();
    const employeeId = String(m.employeeId ?? m.id ?? m.empId ?? `MGR_${i}`);
    return {
      id: employeeId,
      employeeId,
      name: rawMgrName || "Unknown",
      email: String(m.email ?? m.employeeEmail ?? m.mail ?? ""),
      role: String(m.empRole ?? m.role ?? "Manager"),
      designation: String(m.designation ?? m.title ?? m.jobTitle ?? ""),
      band: String(m.band ?? m.level ?? ""),
    };
  });
}
export async function fetchManagers({ signal } = {}) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/employees/managers"), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json();
}
export async function fetchManagerReportees(managerId, { signal } = {}) {
  const safeId = encodeURIComponent(String(managerId));
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl(`/employees/manager/${safeId}/reportees`), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json();
}

export async function promoteEmployee(employeeId) {
  const safeId = encodeURIComponent(String(employeeId));
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl(`/employees/${safeId}/promote`), {
    method: "POST",
    credentials: "include",
    headers: withCsrfHeaders(auth ? { Authorization: auth } : {}),
  });
  if (!res.ok) throw await toHttpError(res);

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  return null;
}
