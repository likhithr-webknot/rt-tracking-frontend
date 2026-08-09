// @ts-nocheck

/** Normalize API / store shapes into a single window model. */
export function normalizeSubmissionWindow(raw, fallback = {}) {
  const obj = unwrapCyclePayload(raw);
  const fb = fallback && typeof fallback === "object" ? fallback : {};

  const startAt = pickDate(
    obj?.windowStartAt,
    obj?.startAt,
    obj?.start,
    obj?.openAt,
    obj?.opensAt,
    fb.startAt,
    fb.start,
  );
  const endAt = pickDate(
    obj?.windowEndAt,
    obj?.endAt,
    obj?.end,
    obj?.closeAt,
    obj?.closesAt,
    fb.endAt,
    fb.end,
  );

  const manualClosed = Boolean(
    obj?.manualClosed ?? obj?.manuallyClosed ?? obj?.closed ?? fb.manualClosed ?? false,
  );

  let isOpen =
    typeof obj?.isOpen === "boolean"
      ? obj.isOpen
      : typeof obj?.open === "boolean"
        ? obj.open
        : typeof obj?.active === "boolean"
          ? obj.active
          : undefined;

  if (isOpen === undefined) {
    isOpen = computeSubmissionWindowOpen({ startAt, endAt, manualClosed });
  }

  return {
    id: obj?.id ?? obj?.submissionCycleId ?? fb.id ?? null,
    cycleKey: String(obj?.cycleKey ?? obj?.monthKey ?? fb.cycleKey ?? "").trim() || null,
    scope: String(obj?.scope ?? fb.scope ?? "GLOBAL").trim().toUpperCase() || "GLOBAL",
    targetEmpId: String(obj?.targetEmpId ?? obj?.target_emp_id ?? fb.targetEmpId ?? "").trim() || null,
    startAt,
    endAt,
    manualClosed,
    isOpen,
    /** Legacy aliases used by Admin dashboard / directory. */
    start: startAt,
    end: endAt,
  };
}

/**
 * Employees/managers can submit when the global window OR their portal window is open.
 */
export function resolveSubmissionAccess(globalWindow, roleWindow, at = new Date()) {
  const globalOpen = computeSubmissionWindowOpen(globalWindow, at);
  const roleOpen = computeSubmissionWindowOpen(roleWindow, at);
  const effectiveRoleOpen = globalOpen || roleOpen;
  return {
    globalWindow: globalWindow || null,
    roleWindow: roleWindow || null,
    globalOpen,
    roleOpen,
    effectiveRoleOpen,
    canEnterValues: effectiveRoleOpen,
    displayWindow: globalOpen ? globalWindow : roleWindow || globalWindow || null,
    allPortalsOpen: globalOpen,
  };
}

/** Admin settings display: when global is open, employee/manager portals are open for everyone. */
export function resolveSettingsWindowDisplay(globalOpen, roleOpen) {
  const effective = Boolean(globalOpen || roleOpen);
  return {
    globalOpen: Boolean(globalOpen),
    roleOpen: Boolean(roleOpen),
    effectiveOpen: effective,
    openForEveryone: Boolean(globalOpen),
  };
}

export function computeSubmissionWindowOpen(window, at = new Date()) {
  const w = window && typeof window === "object" ? window : {};
  if (w.manualClosed) return false;
  if (typeof w.isOpen === "boolean") return w.isOpen;

  const startRaw = w.startAt ?? w.start;
  const endRaw = w.endAt ?? w.end;
  const start = startRaw ? new Date(startRaw) : null;
  if (!start || Number.isNaN(start.getTime())) return false;
  const now = at instanceof Date ? at : new Date(at);
  if (now < start) return false;

  const endStr = String(endRaw ?? "").trim();
  if (!endStr) return true;
  const end = new Date(endStr);
  if (Number.isNaN(end.getTime())) return true;
  return now <= end;
}

/** Shape for AdminControlCenter + AdminDashboard (`start` / `end` ISO strings). */
export function toPortalWindowShape(raw) {
  const n = normalizeSubmissionWindow(raw);
  return {
    start: n.startAt || "",
    end: n.endAt || "",
    startAt: n.startAt,
    endAt: n.endAt,
    manualClosed: n.manualClosed,
    isOpen: n.isOpen,
    cycleKey: n.cycleKey,
    scope: n.scope,
  };
}

export function toLocalInputValue(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

/** Parse Settings panel datetime-local fields into API window state. */
export function parseSettingsWindowFields(data) {
  const n = normalizeSubmissionWindow(data);
  const startAt = n.startAt;
  const endAt = n.endAt;
  return {
    start: startAt ? toLocalInputValue(startAt) : "",
    end: endAt ? toLocalInputValue(endAt) : "",
    isOpen: n.isOpen,
    manualClosed: n.manualClosed,
    cycleKey: n.cycleKey,
  };
}

function unwrapCyclePayload(payload) {
  if (!payload || typeof payload !== "object") return {};
  const root = payload;
  if (root?.data && typeof root.data === "object" && !Array.isArray(root.data)) {
    const inner = root.data;
    if (inner?.data && typeof inner.data === "object" && !Array.isArray(inner.data)) {
      return inner.data;
    }
    return inner;
  }
  return root;
}

function pickDate(...values) {
  for (const v of values) {
    if (v == null || v === "") continue;
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}
