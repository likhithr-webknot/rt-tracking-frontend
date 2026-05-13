import { getAuthHeader } from "./auth.js";
import { buildApiUrl, ensureCsrfCookie, toHttpError, withCsrfHeaders } from "./http.js";

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
  const root = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  return root?.data && typeof root.data === "object" ? root.data : root;
}

function toWindowResponse(raw, fallback = {}) {
  const obj = unwrapCyclePayload(raw);
  const startAt =
    obj?.startAt ??
    obj?.start ??
    obj?.openAt ??
    obj?.openFrom ??
    obj?.opensAt ??
    obj?.windowStartAt ??
    obj?.startDate ??
    obj?.windowStart ??
    fallback.startAt ??
    null;
  const endAt =
    obj?.endAt ??
    obj?.end ??
    obj?.closeAt ??
    obj?.closeFrom ??
    obj?.closesAt ??
    obj?.windowEndAt ??
    obj?.endDate ??
    obj?.windowEnd ??
    fallback.endAt ??
    null;
  const status = String(obj?.status ?? fallback.status ?? "").trim().toUpperCase();
  const inferredIsOpen =
    status === "OPEN" ||
    status === "ACTIVE" ||
    status === "STARTED";

  return {
    ...obj,
    cycleKey: String(obj?.cycleKey || obj?.monthKey || fallback.cycleKey || monthCycleKey()),
    scope: String(obj?.scope || fallback.scope || "GLOBAL").toUpperCase(),
    startAt,
    endAt,
    manualClosed: Boolean(obj?.manualClosed ?? obj?.manuallyClosed ?? fallback.manualClosed ?? false),
    isOpen:
      typeof obj?.isOpen === "boolean"
        ? obj.isOpen
        : typeof obj?.open === "boolean"
          ? obj.open
          : typeof obj?.active === "boolean"
            ? obj.active
            : status
              ? inferredIsOpen
          : typeof fallback.isOpen === "boolean"
            ? fallback.isOpen
            : undefined,
  };
}

function extractWindowCollection(raw) {
  const root = unwrapCyclePayload(raw);
  if (Array.isArray(root)) return root;
  if (Array.isArray(root?.items)) return root.items;
  if (Array.isArray(root?.data)) return root.data;
  if (Array.isArray(root?.results)) return root.results;
  return [];
}

export async function fetchMonthlySubmissions({ cycleKey, scope, signal } = {}) {
  const auth = getAuthHeader();
  const qs = new URLSearchParams();
  const key = String(cycleKey ?? "").trim();
  if (key) qs.set("cycleKey", key);
  const normalizedScope = normalizeScope(scope);
  if (String(scope ?? "").trim()) qs.set("scope", normalizedScope);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  const endpoints = [`/api/v1/submission-cycles${suffix}`];

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

export async function fetchCurrentMonthlySubmission(scope, { signal } = {}) {
  const auth = getAuthHeader();
  const qs = new URLSearchParams();
  const normalizedScope = normalizeScope(scope);
  qs.set("cycleKey", monthCycleKey());
  if (String(scope ?? "").trim()) qs.set("scope", normalizedScope);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  const endpoints = [`/api/v1/submission-cycles/search${suffix}`];
  let lastRouteErr = null;

  for (const endpoint of endpoints) {
    const res = await fetch(buildApiUrl(endpoint), {
      signal,
      credentials: "include",
      headers: auth ? { Authorization: auth } : undefined,
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return toWindowResponse(data, { cycleKey: monthCycleKey(), scope: normalizedScope });
    }

    const err = await toHttpError(res);
    if (res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }

  const rows = await fetchMonthlySubmissions({
    cycleKey: monthCycleKey(),
    scope: normalizedScope,
    signal,
  }).catch(() => []);
  if (rows.length > 0) return toWindowResponse(rows[0], { cycleKey: monthCycleKey(), scope: normalizedScope });

  throw lastRouteErr || new Error("Current monthly submission endpoint not found.");
}

export async function upsertMonthlySubmissionWindow({
  cycleKey,
  scope,
  startAt,
  endAt,
  manualClosed = false,
  isOpen = undefined,
  signal,
} = {}) {
  const auth = getAuthHeader();
  const normalizedScope = normalizeScope(scope);
  const key = String(cycleKey || monthCycleKey()).trim();
  const existing = await fetchCurrentMonthlySubmission(normalizedScope, { signal }).catch(() => null);
  const existingId = existing?.id ?? existing?.submissionCycleId ?? null;
  const resolvedStartAt = startAt ?? existing?.startAt ?? new Date().toISOString();

  const payload = {
    ...(existingId != null ? { id: existingId } : {}),
    cycleKey: key,
    scope: normalizedScope,
    windowStartAt: resolvedStartAt,
    windowEndAt: endAt ?? existing?.endAt ?? null,
    manualClosed: Boolean(manualClosed),
    updatedBy: "frontend",
  };
  if (typeof isOpen === "boolean") payload.manualClosed = !isOpen;

  await ensureCsrfCookie({ signal });

  const endpoints = existingId != null
    ? [{ method: "PUT", path: `/api/v1/submission-cycles/${encodeURIComponent(String(existingId))}` }]
    : [{ method: "POST", path: "/api/v1/submission-cycles" }];
  let lastRouteErr = null;

  for (const endpoint of endpoints) {
    const res = await fetch(buildApiUrl(endpoint.path), {
      method: endpoint.method,
      signal,
      credentials: "include",
      headers: withCsrfHeaders({
        "Content-Type": "application/json",
        ...(auth ? { Authorization: auth } : {}),
      }),
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return toWindowResponse(data, payload);
    }

    const err = await toHttpError(res);
    if (res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }

  throw lastRouteErr || new Error("Monthly submission upsert endpoint not found.");
}

export async function fetchSubmissionWindowCurrent({ signal } = {}) {
  return fetchCurrentMonthlySubmission("GLOBAL", { signal });
}

/* ── role-specific window helpers ── */

export async function fetchRoleSubmissionWindow(role, { signal } = {}) {
  const scope = normalizeScope(role);
  try {
    return await fetchCurrentMonthlySubmission(scope, { signal });
  } catch (err) {
    if (err?.status === 404 || err?.status === 400) {
      return fetchSubmissionWindowCurrent({ signal });
    }
    throw err;
  }
}

export async function scheduleRoleSubmissionWindow(role, { startAt, endAt }, { signal } = {}) {
  return upsertMonthlySubmissionWindow({
    cycleKey: monthCycleKey(),
    scope: normalizeScope(role),
    startAt,
    endAt,
    manualClosed: false,
    isOpen: undefined,
    signal,
  });
}

export async function openRoleSubmissionWindowNow(role, { signal } = {}) {
  const now = new Date();
  const defaultEnd = new Date(now);
  defaultEnd.setDate(defaultEnd.getDate() + 1);
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

export async function closeRoleSubmissionWindowNow(role, { signal } = {}) {
  const now = new Date().toISOString();
  return upsertMonthlySubmissionWindow({
    cycleKey: monthCycleKey(),
    scope: normalizeScope(role),
    endAt: now,
    manualClosed: true,
    isOpen: false,
    signal,
  });
}

export async function scheduleSubmissionWindow({ startAt, endAt }, { signal } = {}) {
  return upsertMonthlySubmissionWindow({
    cycleKey: monthCycleKey(),
    scope: "GLOBAL",
    startAt,
    endAt,
    manualClosed: false,
    isOpen: undefined,
    signal,
  });
}

export async function openSubmissionWindowNow({ signal } = {}) {
  const now = new Date();
  const defaultEnd = new Date(now);
  defaultEnd.setDate(defaultEnd.getDate() + 1);
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

export async function closeSubmissionWindowNow({ signal } = {}) {
  return upsertMonthlySubmissionWindow({
    cycleKey: monthCycleKey(),
    scope: "GLOBAL",
    endAt: new Date().toISOString(),
    manualClosed: true,
    isOpen: false,
    signal,
  });
}

export async function openSubmissionWindowForEmployeeNow(employeeId, { signal } = {}) {
  const id = String(employeeId ?? "").trim();
  if (!id) throw new Error("employeeId is required.");

  const now = new Date();
  const defaultEnd = new Date(now);
  defaultEnd.setDate(defaultEnd.getDate() + 1);
  const response = await upsertMonthlySubmissionWindow({
    cycleKey: monthCycleKey(),
    scope: "EMPLOYEE",
    startAt: now.toISOString(),
    endAt: defaultEnd.toISOString(),
    manualClosed: false,
    isOpen: true,
    signal,
  });
  return { ...response, employeeId: id };
}

export async function closeSubmissionWindowForEmployeeNow(employeeId, { signal } = {}) {
  const id = String(employeeId ?? "").trim();
  if (!id) throw new Error("employeeId is required.");

  const response = await upsertMonthlySubmissionWindow({
    cycleKey: monthCycleKey(),
    scope: "EMPLOYEE",
    endAt: new Date().toISOString(),
    manualClosed: true,
    isOpen: false,
    signal,
  });
  return { ...response, employeeId: id };
}

export async function fetchEmployeeSubmissionWindowStatus(employeeId, { signal } = {}) {
  const id = String(employeeId ?? "").trim();
  if (!id) throw new Error("employeeId is required.");

  const response = await fetchCurrentMonthlySubmission("EMPLOYEE", { signal });
  return { ...response, employeeId: id };
}
