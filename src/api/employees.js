import { getAuthHeader } from "./auth.js";
import { buildApiUrl } from "./http.js";

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
  return text || `Request failed: ${res.status} ${res.statusText}`;
}

export async function fetchEmployees({ signal } = {}) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/employees/getall"), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function addEmployee(payload) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/employees/add"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));

  // Backend may return the created employee, or nothing.
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  return null;
}

export async function promoteEmployee(employeeId) {
  const safeId = encodeURIComponent(String(employeeId));
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl(`/employees/${safeId}/promote`), {
    method: "POST",
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw new Error(await readError(res));

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  return null;
}
