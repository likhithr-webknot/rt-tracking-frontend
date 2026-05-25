// @ts-nocheck
import { getAuthHeader } from "./auth";
import { buildApiUrl, ensureCsrfCookie, requestWithFallbacks, toHttpError, withCsrfHeaders } from "./http";

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
  const auth = getAuthHeader();
  const headers = auth ? { Authorization: auth } : undefined;

  return requestWithFallbacks(
    [
      "/api/v1/allocation/list",
      "/api/v1/allocation/list?page=0&size=500",
      "/api/v1/allocation?page=0&size=500",
      "/api/v1/allocations?page=0&size=500",
      "/api/v1/allocation/user",
    ],
    {
      signal,
      headers,
      fallbackStatuses: [400, 403, 404, 405],
      notFoundMessage: "Allocation list endpoint not found.",
    }
  );
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
