import { getAuthHeader } from "./auth.js";
import { buildApiUrl, toHttpError, withCsrfHeaders } from "./http.js";

function monthCycleKey(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function normalizeScope(role) {
  const r = String(role || "").trim().toUpperCase();
  if (r === "MANAGER") return "MANAGER";
  if (r === "EMPLOYEE") return "EMPLOYEE";
  return "GLOBAL";
}

function unwrapCyclePayload(payload) {
  if (!payload || typeof payload !== "object") return {};
  const root = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  return root?.data && typeof root.data === "object" ? root.data : root;
}

function toWindowResponse(raw, fallback = {}) {
  const obj = unwrapCyclePayload(raw);
  return {
    ...obj,
    cycleKey: String(obj?.cycleKey || fallback.cycleKey || monthCycleKey()),
    scope: String(obj?.scope || fallback.scope || "GLOBAL").toUpperCase(),
    startAt: obj?.startAt ?? obj?.start ?? obj?.openAt ?? fallback.startAt ?? null,
    endAt: obj?.endAt ?? obj?.end ?? obj?.closeAt ?? fallback.endAt ?? null,
    manualClosed: Boolean(obj?.manualClosed ?? obj?.manuallyClosed ?? fallback.manualClosed ?? false),
    isOpen:
      typeof obj?.isOpen === "boolean"
        ? obj.isOpen
        : typeof obj?.open === "boolean"
          ? obj.open
          : typeof fallback.isOpen === "boolean"
            ? fallback.isOpen
            : undefined,
  };
}

async function fetchSubmissionCycleByKey({ cycleKey, scope, signal } = {}) {
  const key = String(cycleKey || "").trim();
  if (!key) throw new Error("cycleKey is required.");
  const auth = getAuthHeader();
  const qs = new URLSearchParams();
  qs.set("cycleKey", key);
  if (scope) qs.set("scope", String(scope).trim().toUpperCase());
  const res = await fetch(buildApiUrl(`/api/v1/get-submission-cycle?${qs.toString()}`), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw await toHttpError(res);
  const data = await res.json().catch(() => ({}));
  return unwrapCyclePayload(data);
}

async function fetchSubmissionCycleList({ signal } = {}) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/api/v1/list-submission-cycles"), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  const raw = await res.json().catch(() => ({}));
  const root = unwrapCyclePayload(raw);
  return Array.isArray(root)
    ? root
    : Array.isArray(root?.items)
      ? root.items
      : Array.isArray(root?.data)
        ? root.data
        : Array.isArray(root?.results)
          ? root.results
          : [];
}

async function addSubmissionCycle(payload, { signal } = {}) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/api/v1/add-submission-cycle"), {
    method: "POST",
    signal,
    credentials: "include",
    headers: withCsrfHeaders({
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    }),
    body: JSON.stringify(payload ?? {}),
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}

async function updateSubmissionCycleById(id, payload, { signal } = {}) {
  const safeId = encodeURIComponent(String(id ?? "").trim());
  if (!safeId) throw new Error("Submission cycle id is required.");
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl(`/api/v1/update-submission-cycle/${safeId}`), {
    method: "PUT",
    signal,
    credentials: "include",
    headers: withCsrfHeaders({
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    }),
    body: JSON.stringify(payload ?? {}),
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}

async function upsertSubmissionCycleWindow({ scope, startAt, endAt, manualClosed = false, isOpen = undefined, signal } = {}) {
  const cycleKey = monthCycleKey();
  const normalizedScope = normalizeScope(scope);
  const existing = await fetchSubmissionCycleByKey({ cycleKey, scope: normalizedScope, signal });
  const fallbackStartAt = existing?.startAt ?? endAt ?? new Date().toISOString();
  const payload = {
    cycleKey,
    scope: normalizedScope,
    startAt: startAt ?? fallbackStartAt,
    endAt: endAt ?? existing?.endAt ?? null,
    manualClosed,
    ...(typeof isOpen === "boolean" ? { isOpen, open: isOpen, active: isOpen } : {}),
  };

  if (existing?.id != null) {
    const updated = await updateSubmissionCycleById(existing.id, payload, { signal });
    return toWindowResponse(updated, payload);
  }
  const added = await addSubmissionCycle(payload, { signal });
  return toWindowResponse(added, payload);
}

export async function fetchSubmissionWindowCurrent({ signal } = {}) {
  const cycleKey = monthCycleKey();
  const direct = await fetchSubmissionCycleByKey({ cycleKey, scope: "GLOBAL", signal });
  if (direct) return toWindowResponse(direct, { cycleKey, scope: "GLOBAL" });

  // Fallback: if get-by-key returns nothing, try list and pick matching GLOBAL cycle.
  const list = await fetchSubmissionCycleList({ signal }).catch(() => []);
  const fromList = list.find((row) => {
    const r = row && typeof row === "object" ? row : {};
    return String(r.cycleKey || "").trim() === cycleKey && String(r.scope || "GLOBAL").toUpperCase() === "GLOBAL";
  });
  return toWindowResponse(fromList || {}, { cycleKey, scope: "GLOBAL" });
}

/* ── role-specific window helpers ── */

export async function fetchRoleSubmissionWindow(role, { signal } = {}) {
  const scope = normalizeScope(role);
  const cycleKey = monthCycleKey();
  const data = await fetchSubmissionCycleByKey({ cycleKey, scope, signal });
  if (data) return toWindowResponse(data, { cycleKey, scope });
  // Fall back to GLOBAL if role-scoped cycle is absent.
  return fetchSubmissionWindowCurrent({ signal });
}

export async function scheduleRoleSubmissionWindow(role, { startAt, endAt }, { signal } = {}) {
  const scope = normalizeScope(role);
  return upsertSubmissionCycleWindow({
    scope,
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
  return upsertSubmissionCycleWindow({
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
  return upsertSubmissionCycleWindow({
    scope: normalizeScope(role),
    endAt: now,
    manualClosed: true,
    isOpen: false,
    signal,
  });
}

export async function scheduleSubmissionWindow({ startAt, endAt }, { signal } = {}) {
  return upsertSubmissionCycleWindow({
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
  return upsertSubmissionCycleWindow({
    scope: "GLOBAL",
    startAt: now.toISOString(),
    endAt: defaultEnd.toISOString(),
    manualClosed: false,
    isOpen: true,
    signal,
  });
}

export async function closeSubmissionWindowNow({ signal } = {}) {
  return upsertSubmissionCycleWindow({
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

  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/submission-window/employee/open-now"), {
    method: "POST",
    signal,
    credentials: "include",
    headers: withCsrfHeaders({
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    }),
    body: JSON.stringify({ employeeId: id }),
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json();
}

export async function closeSubmissionWindowForEmployeeNow(employeeId, { signal } = {}) {
  const id = String(employeeId ?? "").trim();
  if (!id) throw new Error("employeeId is required.");

  const auth = getAuthHeader();
  const safeId = encodeURIComponent(id);
  const res = await fetch(buildApiUrl(`/submission-window/employee/${safeId}/close-now`), {
    method: "POST",
    signal,
    credentials: "include",
    headers: withCsrfHeaders({
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    }),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json();
}

export async function fetchEmployeeSubmissionWindowStatus(employeeId, { signal } = {}) {
  const id = String(employeeId ?? "").trim();
  if (!id) throw new Error("employeeId is required.");

  const auth = getAuthHeader();
  const safeId = encodeURIComponent(id);
  const res = await fetch(buildApiUrl(`/submission-window/employee/${safeId}`), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json();
}
