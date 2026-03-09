import { getAuthHeader } from "./auth.js";
import { buildApiUrl, withCsrfHeaders } from "./http.js";

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
      stream: String(e.stream ?? e.context ?? ""),
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

export async function fetchEmployees({ limit = null, cursor = null, signal } = {}) {
  const auth = getAuthHeader();
  const qs = new URLSearchParams();
  if (limit != null) qs.set("limit", String(limit));
  if (cursor) qs.set("cursor", String(cursor));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(buildApiUrl(`/employees/getall${suffix}`), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json();
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
