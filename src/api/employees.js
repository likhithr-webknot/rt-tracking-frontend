import { getAuthHeader } from "./auth.js";
import { buildApiUrl, parseResponse, requestWithFallbacks, toHttpError, withCsrfHeaders } from "./http.js";

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
      .replace(/[._+-]+/g, " ")
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
      status: String(e.status ?? e.userStatus ?? "").trim(),
      submitted: Boolean(e.submitted ?? e.hasSubmitted ?? false),
      recognitions: Number(e.recognitions ?? e.recognitionCount ?? 0) || 0,
      certifications: Array.isArray(e.certifications) ? e.certifications : [],
      submissionAbility,
      abilityScore: submissionAbility ?? abilityFromRatings,
      avgScore: submissionAbility ?? abilityFromRatings,
      abilityScoreFromRatings: abilityFromRatings,
      abilityFromRatings,
    };
  }).filter((e) => !["inactive", "deleted", "disabled"].includes(String(e.status || "").toLowerCase()));
}

function extractUsersArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const root = raw;
  const nested = root?.data && typeof root.data === "object" ? root.data : null;
  const candidates = [
    root?.items,
    root?.managers,
    root?.managerList,
    root?.users,
    root?.employees,
    root?.results,
    root?.content,
    root?.data,
    nested?.items,
    nested?.managers,
    nested?.managerList,
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
  const fallbackLimit = 10;
  const parsedLimit = limit != null ? Number.parseInt(String(limit), 10) : fallbackLimit;
  const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : fallbackLimit;
  const parsedOffset = cursor != null ? Number.parseInt(String(cursor), 10) : 0;
  const safeOffset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
  const page = Math.floor(safeOffset / safeLimit);
  const endpoints = [
    `/api/v1/employees`,
    `/api/v1/users?page=${encodeURIComponent(String(page))}&size=${encodeURIComponent(String(safeLimit))}`,
    `/api/v1/employee-profile?page=${encodeURIComponent(String(page))}&size=${encodeURIComponent(String(safeLimit))}`,
  ];
  const raw = await requestWithFallbacks(endpoints, {
    signal,
    headers: auth ? { Authorization: auth } : undefined,
    fallbackStatuses: [400, 403, 404, 405],
    notFoundMessage: "Employees list endpoint not found.",
  });
  const allUsers = extractUsersArray(raw);

  const root = raw && typeof raw === "object" ? raw : {};
  const data = root?.data && typeof root.data === "object" ? root.data : root;
  const total =
    Number(data?.totalElements ?? data?.total ?? data?.count ?? allUsers.length) || allUsers.length;
  const items = allUsers.length > safeLimit ? allUsers.slice(0, safeLimit) : allUsers;
  const nextCursor = safeOffset + items.length < total ? String(safeOffset + items.length) : null;
  return {
    items,
    nextCursor,
    total,
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
  const endpoints = ["/api/v1/employees", "/api/v1/users"];
  for (const path of endpoints) {
    const res = await fetch(buildApiUrl(path), {
      method: "POST",
      credentials: "include",
      headers: withCsrfHeaders({
        "Content-Type": "application/json",
        ...(auth ? { Authorization: auth } : {}),
      }),
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) return res.json();
      return null;
    }
    if (![404, 405].includes(res.status)) throw await toHttpError(res);
  }
  throw new Error("Employee create endpoint not found.");
}
export async function addEmployeeWithManager(payload) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/api/v1/users"), {
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
    `/api/v1/employees/${safeId}`,
    `/api/v1/employee-profile/${safeId}`,
    `/employees/${safeId}/edit`,
    `/employees/edit/${safeId}`,
    `/employees/update/${safeId}`,
  ];

  return requestWithFallbacks(
    endpoints.map((path) => ({ method: "PUT", path })),
    {
      signal,
      headers: withCsrfHeaders({
        "Content-Type": "application/json",
        ...(auth ? { Authorization: auth } : {}),
      }),
      body,
      fallbackStatuses: [404, 405],
      notFoundMessage: "Employee edit endpoint not found.",
      parseFallback: null,
    }
  );
}
export async function deleteEmployee(employeeId, { signal } = {}) {
  const safeId = encodeURIComponent(String(employeeId ?? "").trim());
  const auth = getAuthHeader();
  if (!safeId) throw new Error("employee id is required.");
  const endpoints = [
    `/api/v1/employees/${safeId}`,
    `/api/v1/employees/${safeId}?hardDelete=true`,
  ];
  let lastErr = null;
  for (const path of endpoints) {
    const res = await fetch(buildApiUrl(path), {
      method: "DELETE",
      signal,
      credentials: "include",
      headers: withCsrfHeaders(auth ? { Authorization: auth } : undefined),
    });
    if (res.ok) return parseResponse(res, true);
    const err = await toHttpError(res);
    if ([404, 405].includes(res.status)) {
      lastErr = err;
      continue;
    }
    throw err;
  }
  throw lastErr || new Error("Employee delete endpoint not found.");
}

export function normalizeManagers(data) {
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : [];
  const toRoleKey = (value) => String(value ?? "").trim().toLowerCase().replace(/^role_/, "");
  return arr.map((m, i) => {
    const rawMgrName = String(
      m.employeeName ?? m.employee_name ?? m.name ?? m.fullName ?? m.full_name ?? m.displayName ?? m.display_name ?? ""
    ).trim();
    const employeeId = String(m.employeeId ?? m.id ?? m.empId ?? `MGR_${i}`);
    const roleKey = toRoleKey(m.empRole ?? m.role ?? m.userRole ?? "manager");
    const role = roleKey === "admin" ? "Admin" : roleKey === "employee" ? "Employee" : "Manager";
    return {
      id: employeeId,
      employeeId,
      name: rawMgrName || "Unknown",
      email: String(m.email ?? m.employeeEmail ?? m.mail ?? ""),
      role,
      designation: String(m.designation ?? m.title ?? m.jobTitle ?? ""),
      band: String(m.band ?? m.level ?? ""),
    };
  });
}
export async function fetchManagers({ signal } = {}) {
  const auth = getAuthHeader();
  const endpoints = [
    "/employees/managers/registered",
    "/api/v1/employees/managers/registered",
    "/employees/managers",
    "/api/v1/employees/managers",
    "/api/v1/manager/list",
    "/api/v1/manager",
    "/api/v1/",
  ];

  const toRoleKey = (value) => String(value ?? "").trim().toLowerCase().replace(/^role_/, "");
  for (const endpoint of endpoints) {
    const raw = await requestWithFallbacks([endpoint], {
      signal,
      headers: auth ? { Authorization: auth } : undefined,
      fallbackStatuses: [400, 403, 404, 405],
      notFoundMessage: "Managers endpoint not found.",
    }).catch((err) => {
      if (err?.name === "AbortError" || err?.status === 401) throw err;
      return null;
    });
    if (!raw) continue;
    const rows = extractUsersArray(raw);
    if (!Array.isArray(rows)) return [];

    // Manager endpoints are expected to already be manager-only.
    const endpointLooksManagerSpecific = endpoint.includes("managers") || endpoint.includes("/manager");
    if (endpointLooksManagerSpecific) return rows;

    const managerOnly = rows.filter((row) => {
      const roleKey = toRoleKey(row?.empRole ?? row?.role ?? row?.userRole ?? "");
      return roleKey === "manager";
    });
    if (managerOnly.length > 0) return managerOnly;
  }
  return [];
}
export async function fetchManagerReportees(managerId, { signal } = {}) {
  void managerId;
  const auth = getAuthHeader();
  const path = "/api/v1/manager-projects-with-roles";
  const res = await fetch(buildApiUrl(path), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res, { method: "GET", path });
  return parseResponse(res, {});
}

export async function promoteEmployee(employeeId) {
  void employeeId;
  throw new Error("Webtrak backend does not expose an employee promotion endpoint yet.");
}
