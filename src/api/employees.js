import { getAuthHeader } from "./auth.js";
import { buildApiUrl, withCsrfHeaders } from "./http.js";

export function normalizeEmployees(data) {
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : [];

  return arr.map((e, i) => ({
    id: String(e.employeeId ?? e.id ?? e.empId ?? `EMP_${i}`),
    name: String(e.employeeName ?? e.name ?? e.fullName ?? "Unknown"),
    email: String(e.email ?? e.employeeEmail ?? e.mail ?? ""),
    role: String(e.empRole ?? e.role ?? e.userRole ?? "Employee"),
    designation: String(e.designation ?? e.title ?? e.jobTitle ?? e.empRole ?? ""),
    band: String(e.band ?? e.level ?? "B4"),
    submitted: Boolean(e.submitted ?? e.hasSubmitted ?? false),

    // Optional fields; may be augmented client-side.
    recognitions: Number(e.recognitions ?? e.recognitionCount ?? 0) || 0,
    certifications: Array.isArray(e.certifications) ? e.certifications : [],
  }));
}

async function readError(res) {
  const text = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(text);
    if (parsed?.message) return String(parsed.message);
    if (parsed?.error) return String(parsed.error);
  } catch {
    // ignore
  }
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

  // Backend may return the created employee, or nothing.
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  return null;
}

// POST /employees/add-with-manager
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

export function normalizeManagers(data) {
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : [];
  return arr.map((m, i) => ({
    id: String(m.employeeId ?? m.id ?? m.empId ?? `MGR_${i}`),
    name: String(m.employeeName ?? m.name ?? m.fullName ?? "Unknown"),
    email: String(m.email ?? m.employeeEmail ?? m.mail ?? ""),
    role: String(m.empRole ?? m.role ?? "Manager"),
    designation: String(m.designation ?? m.title ?? m.jobTitle ?? ""),
    band: String(m.band ?? m.level ?? ""),
  }));
}

// GET /employees/managers
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

// GET /employees/manager/{managerId}/reportees
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
