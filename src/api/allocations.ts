// @ts-nocheck
import { getAuth, getAuthHeader, canAccessHrAdminApi } from "./auth";
import { buildApiUrl, ensureCsrfCookie, parseResponse, requestWithFallbacks, toHttpError, withCsrfHeaders } from "./http";
import {
  buildEmployeeWebtrakUrl,
  employeeWebtrakFetchCredentials,
  getEmployeeWebtrakAuthHeaders,
  shouldUseRemoteEmployeeWebtrak,
} from "./webtrak";

function extractAllocationsArray(data) {
  const root = data && typeof data === "object" ? data : {};
  const nested = root?.data && typeof root.data === "object" ? root.data : null;
  return (
    (Array.isArray(data) && data) ||
    (Array.isArray(root?.data) && root.data) ||
    (Array.isArray(root?.content) && root.content) ||
    (Array.isArray(root?.items) && root.items) ||
    (Array.isArray(root?.results) && root.results) ||
    (Array.isArray(root?.list) && root.list) ||
    (Array.isArray(root?.allocations) && root.allocations) ||
    (Array.isArray(nested?.content) && nested.content) ||
    (Array.isArray(nested?.items) && nested.items) ||
    (Array.isArray(nested?.data) && nested.data) ||
    []
  );
}

export function normalizeAllocations(data) {
  const list = extractAllocationsArray(data);
  return list
    .map((raw, i) => {
      if (!raw || typeof raw !== "object") return null;
      const id = String(raw.id ?? raw.allocationId ?? `alloc_${i}`).trim();
      const employeeId = String(
        raw.employeeId ?? raw.empId ?? raw.userId ?? raw.employee?.id ?? raw.employee?.employeeId ?? ""
      ).trim();
      const employeeName = String(
        raw.employeeName ?? raw.employee?.name ?? raw.employee?.employeeName ?? raw.userName ?? ""
      ).trim();
      const projectName = String(
        raw.projectName ?? raw.project?.name ?? raw.project?.projectName ?? raw.projectCode ?? ""
      ).trim();
      const projectId = String(raw.projectId ?? raw.project?.id ?? raw.project?.projectId ?? "").trim();
      const allocationType = String(raw.allocationType ?? raw.type ?? raw.role ?? "—").trim();
      const pct = Number(raw.percentage ?? raw.utilization ?? raw.percent ?? raw.allocationPercent ?? 0);
      const percentage = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
      return {
        id,
        employeeId,
        employeeName: employeeName || employeeId || "—",
        projectName: projectName || projectId || "—",
        projectId,
        allocationType,
        percentage,
      };
    })
    .filter(Boolean);
}

export async function fetchAllocations(options = {}) {
  const { signal } = options;
  if (!canAccessHrAdminApi()) {
    return [];
  }
  const auth = getAuthHeader();
  const headers = auth ? { Authorization: auth } : undefined;

  return requestWithFallbacks(
    [
      "/api/v1/allocation?page=0&size=500",
      "/api/v1/allocations?page=0&size=500",
    ],
    {
      signal,
      headers,
      fallbackStatuses: [404, 405],
      notFoundMessage: "Allocation list endpoint not found.",
    }
  );
}

/**
 * GET /api/v1/allocation/employee?userEmail=…&scope=current_and_future
 */
export async function fetchEmployeeAllocations(
  { userEmail, scope = "current_and_future" } = {},
  { signal } = {},
) {
  const email = String(userEmail ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("A valid employee email is required to load allocations.");
  }
  const params = new URLSearchParams();
  params.set("userEmail", email);
  if (scope) params.set("scope", String(scope));

  const res = await fetch(
    buildEmployeeWebtrakUrl(`/api/v1/allocation/employee?${params.toString()}`),
    {
      method: "GET",
      signal,
      credentials: employeeWebtrakFetchCredentials(),
      headers: getEmployeeWebtrakAuthHeaders(),
    },
  );
  if (!res.ok) {
    throw await toHttpError(res, {
      method: "GET",
      path: "/api/v1/allocation/employee",
    });
  }
  return parseResponse(res, {});
}

export function normalizeAllocationDetailRow(raw, index = 0) {
  const r = raw && typeof raw === "object" ? raw : {};
  const pct = Number(
    r.allocated_percent ?? r.allocatedPercent ?? r.percentage ?? r.percent ?? 0,
  );
  const hours = Number(r.allocated_hours ?? r.allocatedHours ?? r.hours ?? 0);
  return {
    id: String(r.id ?? r.allocation_id ?? r.allocationId ?? `alloc_${index}`).trim(),
    projectCode: String(r.project_code ?? r.projectCode ?? "").trim(),
    projectName: String(
      r.project_name ?? r.projectName ?? r.project?.name ?? r.project_code ?? r.projectCode ?? "—",
    ).trim(),
    role: String(r.role ?? "—").trim(),
    allocatedPercent: Number.isFinite(pct) ? pct : 0,
    allocatedHours: Number.isFinite(hours) ? hours : 0,
    startDate: String(r.start_date ?? r.startDate ?? "").trim(),
    endDate: String(r.end_date ?? r.endDate ?? "").trim(),
    isActive: Boolean(r.is_active ?? r.isActive ?? r.active),
    allocationType: String(r.allocation_type ?? r.allocationType ?? "").trim(),
    billingStatus: String(r.billing_status ?? r.billingStatus ?? "").trim(),
    workLocationType: String(r.work_location_type ?? r.workLocationType ?? "").trim(),
  };
}

/** GET /api/v1/allocation/user/detail — current projects + history for signed-in user. */
export function normalizeUserAllocationDetail(raw) {
  const root = raw && typeof raw === "object" ? raw : {};
  const data = root.data && typeof root.data === "object" ? root.data : root;
  const mapRows = (list) =>
    (Array.isArray(list) ? list : [])
      .map((row, i) => normalizeAllocationDetailRow(row, i))
      .filter((row) => row.projectName || row.projectCode);

  const currentProjects = mapRows(data.current_projects ?? data.currentProjects);
  const history = mapRows(data.history ?? data.past_allocations ?? data.pastAllocations);

  return {
    employeeEmail: String(data.employee_email ?? data.employeeEmail ?? "").trim(),
    employeeName: String(data.employee_name ?? data.employeeName ?? "").trim(),
    currentProjects,
    history,
    all: [...currentProjects, ...history],
  };
}

/** Pulse legacy GET /api/v1/allocation/user — active allocations only. */
export function normalizeUserAllocationFromLegacyList(raw) {
  const root = raw && typeof raw === "object" ? raw : {};
  const data = root.data ?? root;
  const list = Array.isArray(data) ? data : [];
  const currentProjects = list.map((row, i) => {
    const r = row && typeof row === "object" ? row : {};
    const hours = Number(r.allocatedHours ?? r.allocated_hours ?? 0);
    const pct = hours > 0 ? Math.min(100, Math.round((hours / 8) * 100)) : 0;
    return normalizeAllocationDetailRow(
      {
        id: r.id ?? `legacy_${i}`,
        project_name: r.projectName ?? r.project_name,
        role: r.role ?? "—",
        allocated_hours: hours,
        allocated_percent: pct,
        is_active: true,
      },
      i,
    );
  });

  return {
    employeeEmail: "",
    employeeName: "",
    currentProjects,
    history: [],
    all: currentProjects,
  };
}

export async function fetchUserAllocationDetail({ signal } = {}) {
  const auth = getAuthHeader();
  const email = String(getAuth()?.email ?? "").trim().toLowerCase();
  const emailQuery =
    email && email.includes("@") ? `?userEmail=${encodeURIComponent(email)}` : "";

  if (shouldUseRemoteEmployeeWebtrak()) {
    const remotePaths = [
      `/api/v1/allocation/user/detail${emailQuery}`,
      email
        ? `/api/v1/allocation/employee?userEmail=${encodeURIComponent(email)}&scope=all`
        : "/api/v1/allocation/employee?scope=all",
      "/api/v1/allocation/user",
    ];
    let lastStatus = null;
    for (const path of remotePaths) {
      const res = await fetch(buildEmployeeWebtrakUrl(path), {
        method: "GET",
        signal,
        credentials: employeeWebtrakFetchCredentials(),
        headers: getEmployeeWebtrakAuthHeaders(),
      });
      if (res.ok) {
        const raw = await parseResponse(res, {});
        const root = raw && typeof raw === "object" ? raw : {};
        const data = root.data ?? root;
        if (Array.isArray(data)) {
          return normalizeUserAllocationFromLegacyList(raw);
        }
        if (data?.allocations && !data?.current_projects && !data?.currentProjects) {
          return normalizeUserAllocationDetail({
            data: {
              employee_email: data.employee_email ?? data.employeeEmail ?? email,
              employee_name: data.employee_name ?? data.employeeName ?? "",
              current_projects: data.allocations,
              history: [],
            },
          });
        }
        return normalizeUserAllocationDetail(raw);
      }
      lastStatus = res.status;
      if (![404, 405].includes(res.status)) {
        throw await toHttpError(res, { method: "GET", path });
      }
    }
    if (lastStatus && ![404, 405].includes(lastStatus)) {
      throw new Error("Could not load allocations from Webtrak.");
    }
  }

  const headers = {
    Accept: "application/json",
    ...(auth ? { Authorization: auth } : {}),
  };

  const raw = await requestWithFallbacks(
    ["/api/v1/allocation/user/detail", "/api/v1/allocation/user"],
    {
      signal,
      headers,
      fallbackStatuses: [404, 405],
      notFoundMessage: "Allocation detail endpoint not found.",
    },
  );

  const root = raw && typeof raw === "object" ? raw : {};
  const data = root.data ?? root;
  if (Array.isArray(data)) {
    return normalizeUserAllocationFromLegacyList(raw);
  }
  return normalizeUserAllocationDetail(raw);
}

export function parseEmployeeAllocationsPayload(raw) {
  const root = raw && typeof raw === "object" ? raw : {};
  const data = root.data && typeof root.data === "object" ? root.data : root;
  const allocations = Array.isArray(data.allocations)
    ? data.allocations
    : extractAllocationsArray(data);
  return {
    employeeEmail: String(data.employee_email ?? data.employeeEmail ?? "").trim(),
    employeeName: String(data.employee_name ?? data.employeeName ?? "").trim(),
    empId: String(data.emp_id ?? data.empId ?? "").trim(),
    userId: data.user_id ?? data.userId ?? null,
    totalAllocatedPercent: Number(
      data.total_allocated_percent ?? data.totalAllocatedPercent ?? 0,
    ),
    allocations: allocations.map((row, i) => {
      const r = row && typeof row === "object" ? row : {};
      return {
        id: String(r.id ?? r.allocation_id ?? r.allocationId ?? `alloc_${i}`).trim(),
        projectName: String(
          r.project_name ?? r.projectName ?? r.project?.name ?? r.project_code ?? r.projectCode ?? "—",
        ).trim(),
        projectCode: String(r.project_code ?? r.projectCode ?? "").trim(),
        role: String(r.role ?? r.allocation_type ?? r.allocationType ?? "—").trim(),
        percent: Number(
          r.allocated_percent ??
            r.allocatedPercent ??
            r.percentage ??
            r.percent ??
            r.utilization ??
            0,
        ),
        startDate: String(r.start_date ?? r.startDate ?? "").trim(),
        endDate: String(r.end_date ?? r.endDate ?? "").trim(),
        status: String(r.status ?? r.allocation_status ?? "").trim(),
      };
    }),
  };
}

export async function addAllocation(payload, options = {}) {
  const { signal } = options;
  const auth = getAuthHeader();
  await ensureCsrfCookie({ signal, headers: auth ? { Authorization: auth } : undefined }).catch(() => {});
  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });
  const body = JSON.stringify({
    employeeId: payload.employeeId != null ? String(payload.employeeId).trim() : "",
    projectId: payload.projectId != null ? String(payload.projectId).trim() : "",
    allocationType: String(payload.allocationType || "FULLTIME").trim(),
    startDate: String(payload.startDate || "").trim(),
    percentage: Number(payload.percentage) || 0,
  });

  const paths = ["/api/v1/allocation", "/api/v1/allocations", "/api/v1/allocation/create"];
  let lastErr = null;
  for (const path of paths) {
    const res = await fetch(buildApiUrl(path), {
      method: "POST",
      signal,
      credentials: "include",
      headers,
      body,
    });
    if (res.ok) return res.json().catch(() => ({}));
    const err = await toHttpError(res);
    if ([404, 405].includes(res.status)) {
      lastErr = err;
      continue;
    }
    throw err;
  }
  throw lastErr || new Error("Could not create allocation.");
}
