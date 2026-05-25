// @ts-nocheck
import type { ApiOptions } from "../types/api-options";
import { normalizeSubmissionWindow, resolveSubmissionAccess } from "../utils/submissionWindow";
import { getAuthHeader } from "./auth";
import { buildApiUrl, ensureCsrfCookie, parseResponse, toHttpError, withCsrfHeaders } from "./http";
import { fetchSubmissionCycleByKey } from "./monthly-submissions";

function monthCycleKey(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function normalizeScope(role) {
  const r = String(role || "").trim().toUpperCase();
  if (r === "EMPLOYEE") return "EMPLOYEE";
  if (r === "MANAGER") return "MANAGER";
  return "GLOBAL";
}

function unwrapCyclePayload(payload) {
  if (!payload || typeof payload !== "object") return {};
  const root = payload;
  const nested = root?.data && typeof root.data === "object" ? root.data : null;
  if (nested?.data && typeof nested.data === "object" && !Array.isArray(nested.data)) {
    return nested.data;
  }
  return nested ?? root;
}

function toWindowResponse(raw, fallback = {}) {
  return normalizeSubmissionWindow(raw, fallback);
}

function extractWindowCollection(raw) {
  const root = unwrapCyclePayload(raw);
  if (Array.isArray(root)) return root;
  if (Array.isArray(root?.items)) return root.items;
  if (Array.isArray(root?.data)) return root.data;
  if (Array.isArray(root?.results)) return root.results;
  return [];
}

function buildSubmissionCycleBody({
  cycleKey,
  scope,
  startAt,
  endAt,
  manualClosed = false,
  targetEmpId = null,
  isOpen,
}) {
  const key = String(cycleKey || monthCycleKey()).trim();
  const normalizedScope = normalizeScope(scope);
  const resolvedStartAt = startAt || new Date().toISOString();
  const closed =
    typeof isOpen === "boolean" ? !isOpen : Boolean(manualClosed);

  const body = {
    cycleKey: key,
    scope: normalizedScope,
    windowStartAt: resolvedStartAt,
    windowEndAt: endAt ?? null,
    manualClosed: closed,
    updatedBy: "frontend",
  };

  const empId = String(targetEmpId ?? "").trim();
  if (empId) body.targetEmpId = empId;

  return body;
}

async function postUpsertSubmissionCycle(body, { signal } = {} as ApiOptions) {
  const auth = getAuthHeader();
  await ensureCsrfCookie({ signal });
  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });

  const endpoints = ["/api/v1/monthly-submissions/upsert"];

  let lastErr = null;
  for (const path of endpoints) {
    const res = await fetch(buildApiUrl(path), {
      method: "POST",
      signal,
      credentials: "include",
      headers,
      body: JSON.stringify(body),
    });
    if (res.ok) return parseResponse(res, {});
    const err = await toHttpError(res);
    if (res.status === 404 || res.status === 405) {
      lastErr = err;
      continue;
    }
    throw err;
  }
  throw lastErr || new Error("Submission window upsert endpoint not found.");
}

export async function fetchMonthlySubmissions({ cycleKey, scope, signal } = {} as ApiOptions) {
  const auth = getAuthHeader();
  const qs = new URLSearchParams();
  const key = String(cycleKey ?? "").trim();
  if (key) qs.set("cycleKey", key);
  if (String(scope ?? "").trim()) qs.set("scope", normalizeScope(scope));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  const endpoints = [
    `/api/v1/monthly-submissions${suffix}`,
    `/api/v1/submission-cycles${suffix}`,
  ];

  let lastRouteErr = null;
  for (const endpoint of endpoints) {
    const res = await fetch(buildApiUrl(endpoint), {
      signal,
      credentials: "include",
      headers: auth ? { Authorization: auth } : undefined,
    });
    if (res.ok) {
      const raw = await res.json().catch(() => ({}));
      return extractWindowCollection(raw).map((item) => toWindowResponse(item));
    }

    const err = await toHttpError(res);
    if (res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }

  throw lastRouteErr || new Error("Monthly submission list endpoint not found.");
}

export async function fetchCurrentMonthlySubmission(
  scope,
  { signal, employeeId = null, cycleKey = null } = {} as ApiOptions & {
    employeeId?: string | null;
    cycleKey?: string | null;
  },
) {
  const auth = getAuthHeader();
  const normalizedScope = normalizeScope(scope);
  const key = String(cycleKey ?? "").trim() || monthCycleKey();
  const qs = new URLSearchParams();
  qs.set("scope", normalizedScope);
  const empId = String(employeeId ?? "").trim();
  if (empId) qs.set("employeeId", empId);

  const currentSuffix = `?${qs.toString()}`;
  const searchQs = new URLSearchParams();
  searchQs.set("cycleKey", key);
  searchQs.set("scope", normalizedScope);
  if (empId) searchQs.set("employeeId", empId);

  const endpoints = [
    `/api/v1/monthly-submissions/current${currentSuffix}`,
    `/api/v1/get-submission-cycle?${searchQs.toString()}`,
    `/api/v1/monthly-submissions?cycleKey=${encodeURIComponent(key)}&scope=${encodeURIComponent(normalizedScope)}`,
  ];

  let lastRouteErr = null;

  for (const endpoint of endpoints) {
    const res = await fetch(buildApiUrl(endpoint), {
      signal,
      credentials: "include",
      headers: auth ? { Authorization: auth } : undefined,
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const unwrapped = unwrapCyclePayload(data);
      if (unwrapped && typeof unwrapped === "object" && Object.keys(unwrapped).length) {
        return toWindowResponse(data, { cycleKey: key, scope: normalizedScope });
      }
      const rows = extractWindowCollection(data);
      if (rows.length > 0) {
        return toWindowResponse(rows[0], { cycleKey: key, scope: normalizedScope });
      }
      return toWindowResponse(data, { cycleKey: key, scope: normalizedScope });
    }

    const err = await toHttpError(res);
    if (res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }

  try {
    const byKey = await fetchSubmissionCycleByKey({
      cycleKey: key,
      scope: normalizedScope,
      signal,
    });
    return toWindowResponse(byKey, { cycleKey: key, scope: normalizedScope });
  } catch {
    /* try list fallback */
  }

  const rows = await fetchMonthlySubmissions({
    cycleKey: key,
    scope: normalizedScope,
    signal,
  }).catch(() => []);
  if (rows.length > 0) {
    return toWindowResponse(rows[0], { cycleKey: key, scope: normalizedScope });
  }

  throw lastRouteErr || new Error("Current monthly submission endpoint not found.");
}

export async function upsertMonthlySubmissionWindow({
  cycleKey,
  scope,
  startAt,
  endAt,
  manualClosed = false,
  isOpen = undefined,
  targetEmpId = null,
  signal,
} = {} as ApiOptions & { targetEmpId?: string | null }) {
  const body = buildSubmissionCycleBody({
    cycleKey,
    scope,
    startAt,
    endAt,
    manualClosed,
    isOpen,
    targetEmpId,
  });
  const data = await postUpsertSubmissionCycle(body, { signal });
  return toWindowResponse(data, body);
}

export async function fetchSubmissionWindowCurrent({ signal } = {} as ApiOptions) {
  return fetchCurrentMonthlySubmission("GLOBAL", { signal });
}

export async function fetchRoleSubmissionWindow(
  role,
  { signal, employeeId = null, cycleKey = null } = {} as ApiOptions & {
    employeeId?: string | null;
    cycleKey?: string | null;
  },
) {
  return fetchCurrentMonthlySubmission(normalizeScope(role), { signal, employeeId, cycleKey });
}

/** Global + role windows: either open allows entering submission values. */
export async function fetchSubmissionAccessForRole(
  role,
  { signal, employeeId = null, cycleKey = null } = {} as ApiOptions & {
    employeeId?: string | null;
    cycleKey?: string | null;
  },
) {
  const opts = { signal, employeeId, cycleKey };
  const [globalWindow, roleWindow] = await Promise.all([
    fetchCurrentMonthlySubmission("GLOBAL", opts).catch(() => null),
    fetchCurrentMonthlySubmission(normalizeScope(role), opts).catch(() => null),
  ]);
  return resolveSubmissionAccess(globalWindow, roleWindow);
}

export async function scheduleRoleSubmissionWindow(
  role,
  { startAt, endAt },
  { signal } = {} as ApiOptions,
) {
  return upsertMonthlySubmissionWindow({
    cycleKey: monthCycleKey(),
    scope: normalizeScope(role),
    startAt,
    endAt,
    manualClosed: false,
    isOpen: true,
    signal,
  });
}

export async function openRoleSubmissionWindowNow(role, { signal } = {} as ApiOptions) {
  const now = new Date();
  const defaultEnd = new Date(now);
  defaultEnd.setDate(defaultEnd.getDate() + 7);
  return upsertMonthlySubmissionWindow({
    cycleKey: monthCycleKey(),
    scope: normalizeScope(role),
    startAt: now.toISOString(),
    endAt: defaultEnd.toISOString(),
    manualClosed: false,
    isOpen: true,
    signal,
  });
}

export async function closeRoleSubmissionWindowNow(role, { signal } = {} as ApiOptions) {
  const now = new Date();
  return upsertMonthlySubmissionWindow({
    cycleKey: monthCycleKey(),
    scope: normalizeScope(role),
    startAt: now.toISOString(),
    endAt: now.toISOString(),
    manualClosed: true,
    isOpen: false,
    signal,
  });
}

export async function scheduleSubmissionWindow({ startAt, endAt }, { signal } = {} as ApiOptions) {
  return upsertMonthlySubmissionWindow({
    cycleKey: monthCycleKey(),
    scope: "GLOBAL",
    startAt,
    endAt,
    manualClosed: false,
    isOpen: true,
    signal,
  });
}

export async function openSubmissionWindowNow({ signal } = {} as ApiOptions) {
  const now = new Date();
  const defaultEnd = new Date(now);
  defaultEnd.setDate(defaultEnd.getDate() + 7);
  return upsertMonthlySubmissionWindow({
    cycleKey: monthCycleKey(),
    scope: "GLOBAL",
    startAt: now.toISOString(),
    endAt: defaultEnd.toISOString(),
    manualClosed: false,
    isOpen: true,
    signal,
  });
}

export async function closeSubmissionWindowNow({ signal } = {} as ApiOptions) {
  const now = new Date();
  return upsertMonthlySubmissionWindow({
    cycleKey: monthCycleKey(),
    scope: "GLOBAL",
    startAt: now.toISOString(),
    endAt: now.toISOString(),
    manualClosed: true,
    isOpen: false,
    signal,
  });
}

export async function openSubmissionWindowForEmployeeNow(employeeId, { signal } = {} as ApiOptions) {
  const id = String(employeeId ?? "").trim();
  if (!id) throw new Error("employeeId is required.");

  const now = new Date();
  const defaultEnd = new Date(now);
  defaultEnd.setDate(defaultEnd.getDate() + 7);
  const response = await upsertMonthlySubmissionWindow({
    cycleKey: monthCycleKey(),
    scope: "EMPLOYEE",
    targetEmpId: id,
    startAt: now.toISOString(),
    endAt: defaultEnd.toISOString(),
    manualClosed: false,
    isOpen: true,
    signal,
  });
  return { ...response, employeeId: id };
}

export async function closeSubmissionWindowForEmployeeNow(employeeId, { signal } = {} as ApiOptions) {
  const id = String(employeeId ?? "").trim();
  if (!id) throw new Error("employeeId is required.");

  const now = new Date();
  const response = await upsertMonthlySubmissionWindow({
    cycleKey: monthCycleKey(),
    scope: "EMPLOYEE",
    targetEmpId: id,
    startAt: now.toISOString(),
    endAt: now.toISOString(),
    manualClosed: true,
    isOpen: false,
    signal,
  });
  return { ...response, employeeId: id };
}

export async function fetchEmployeeSubmissionWindowStatus(employeeId, { signal } = {} as ApiOptions) {
  const id = String(employeeId ?? "").trim();
  if (!id) throw new Error("employeeId is required.");

  try {
    const response = await fetchCurrentMonthlySubmission("EMPLOYEE", { signal, employeeId: id });
    return { ...response, employeeId: id };
  } catch (err) {
    if (err?.status === 404) {
      const response = await fetchCurrentMonthlySubmission("EMPLOYEE", { signal });
      return { ...response, employeeId: id };
    }
    throw err;
  }
}
