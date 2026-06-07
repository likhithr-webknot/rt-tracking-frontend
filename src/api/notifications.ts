// @ts-nocheck
import type { ApiOptions } from "../types/api-options";
import { getAuthHeader } from "./auth";
import { buildApiUrl, ensureCsrfCookie, safeJsonParse, toHttpError, withCsrfHeaders } from "./http";

export const ADMIN_NOTIFICATION_TYPES = Object.freeze({
  MANAGER_EMPLOYEE_PAIR_SUBMITTED: "MANAGER_EMPLOYEE_PAIR_SUBMITTED",
  MONTHLY_MANAGER_REVIEW_SUBMITTED: "MONTHLY_MANAGER_REVIEW_SUBMITTED",
  MONTHLY_SELF_REVIEW_SUBMITTED: "MONTHLY_SELF_REVIEW_SUBMITTED",
  FORGOT_PASSWORD_REQUESTED: "FORGOT_PASSWORD_REQUESTED",
  PROJECT_STAKEHOLDER_ALERT: "PROJECT_STAKEHOLDER_ALERT",
  EMPLOYEE_PROJECT_SUBMITTED: "EMPLOYEE_PROJECT_SUBMITTED",
});

export const MANAGER_NOTIFICATION_TYPES = Object.freeze({
  EMPLOYEE_SUBMITTED_FOR_REVIEW: "EMPLOYEE_SUBMITTED_FOR_REVIEW",
  PROJECT_STAKEHOLDER_ALERT: "PROJECT_STAKEHOLDER_ALERT",
  EMPLOYEE_PROJECT_SUBMITTED: "EMPLOYEE_PROJECT_SUBMITTED",
});

/** Backend {@code NotificationType} values employees receive in their inbox. */
export const EMPLOYEE_NOTIFICATION_TYPES = Object.freeze({
  MONTHLY_MANAGER_REVIEW_SUBMITTED: "MONTHLY_MANAGER_REVIEW_SUBMITTED",
  MONTHLY_SELF_REVIEW_SUBMITTED: "MONTHLY_SELF_REVIEW_SUBMITTED",
  LEAVE_REQUEST: "LEAVE_REQUEST",
  LEAVE_APPROVED: "LEAVE_APPROVED",
  LEAVE_REJECTED: "LEAVE_REJECTED",
  WFH_REQUEST: "WFH_REQUEST",
  WFH_APPROVED: "WFH_APPROVED",
  WFH_REJECTED: "WFH_REJECTED",
  COMP_OFF_REQUEST: "COMP_OFF_REQUEST",
  COMP_OFF_APPROVED: "COMP_OFF_APPROVED",
  COMP_OFF_REJECTED: "COMP_OFF_REJECTED",
  PROJECT_ASSIGNMENT: "PROJECT_ASSIGNMENT",
  ANNOUNCEMENT: "ANNOUNCEMENT",
  ALLOCATION_EXTENSION_REQUEST: "ALLOCATION_EXTENSION_REQUEST",
  ALLOCATION_EXTENSION_APPROVED: "ALLOCATION_EXTENSION_APPROVED",
  ALLOCATION_EXTENSION_REJECTED: "ALLOCATION_EXTENSION_REJECTED",
  INTERNSHIP_ABOUT_TO_COMPLETE: "INTERNSHIP_ABOUT_TO_COMPLETE",
});

const ADMIN_ALLOWED_NOTIFICATION_TYPES = new Set(Object.values(ADMIN_NOTIFICATION_TYPES));
const MANAGER_ALLOWED_NOTIFICATION_TYPES = new Set([
  ...Object.values(MANAGER_NOTIFICATION_TYPES),
  "EMPLOYEE_SUBMITTED",
  "EMPLOYEE_MONTHLY_SUBMITTED",
  "EMPLOYEE_SUBMITTED_TO_MANAGER",
  "EMPLOYEE_SUBMISSION_FINALIZED",
  "PROJECT_SUBMIT_ALERT",
  "PM_PROJECT_ALERT",
  "AM_PROJECT_ALERT",
]);
const EMPLOYEE_ALLOWED_NOTIFICATION_TYPES = new Set([
  ...Object.values(EMPLOYEE_NOTIFICATION_TYPES),
  "MANAGER_REVIEW_SUBMITTED",
  "SUBMISSION_RETURNED",
  "RESUBMISSION_REQUESTED",
  "EMPLOYEE_GENERIC",
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toTrimmedString(value) {
  if (value == null) return "";
  return String(value).trim();
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const text = toTrimmedString(value).toLowerCase();
  if (!text) return false;
  return text === "true" || text === "1" || text === "yes";
}

function toIsoDate(value) {
  const text = toTrimmedString(value);
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function unwrapRoot(data) {
  if (!isPlainObject(data)) return {};
  if (isPlainObject(data.data)) return data.data;
  return data;
}

function normalizeCursor(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "bigint") return String(value);
  const text = toTrimmedString(value);
  return text || null;
}

function normalizeType(value, allowedTypes) {
  const type = toTrimmedString(value).toUpperCase();
  return allowedTypes.has(type) ? type : "";
}

function buildAdminTitle(type) {
  if (type === ADMIN_NOTIFICATION_TYPES.MANAGER_EMPLOYEE_PAIR_SUBMITTED) {
    return "Manager + Employee submissions completed";
  }
  if (type === ADMIN_NOTIFICATION_TYPES.MONTHLY_MANAGER_REVIEW_SUBMITTED) {
    return "Manager review ready for approval";
  }
  if (type === ADMIN_NOTIFICATION_TYPES.MONTHLY_SELF_REVIEW_SUBMITTED) {
    return "Submission returned for resubmission";
  }
  if (type === ADMIN_NOTIFICATION_TYPES.FORGOT_PASSWORD_REQUESTED) {
    return "Forgot password request";
  }
  return "Admin notification";
}

function buildAdminMessage(type, payload, obj) {
  const direct = toTrimmedString(obj?.message);
  if (direct && (
    type === ADMIN_NOTIFICATION_TYPES.MONTHLY_MANAGER_REVIEW_SUBMITTED ||
    type === ADMIN_NOTIFICATION_TYPES.MONTHLY_SELF_REVIEW_SUBMITTED
  )) {
    return direct;
  }
  if (!isPlainObject(payload)) payload = {};

  if (type === ADMIN_NOTIFICATION_TYPES.FORGOT_PASSWORD_REQUESTED || type === "FORGOT_PASSWORD") {
    const email = toTrimmedString(payload.email) || "An employee";
    const requestId = toTrimmedString(payload.requestId) || toTrimmedString(payload.resetRequestId);
    const code =
      toTrimmedString(payload.verificationCode) ||
      toTrimmedString(payload.otp) ||
      toTrimmedString(payload.adminCode) ||
      toTrimmedString(payload.code);

    const parts = [];
    parts.push(requestId ? `${email} requested password reset (${requestId}).` : `${email} requested password reset.`);
    if (code) parts.push(`Code: ${code}`);
    return parts.join(" ");
  }

  if (type === ADMIN_NOTIFICATION_TYPES.MANAGER_EMPLOYEE_PAIR_SUBMITTED) {
    const employeeName =
      toTrimmedString(payload.employeeName) || toTrimmedString(payload.employeeId) || "Employee";
    const managerName =
      toTrimmedString(payload.managerName) || toTrimmedString(payload.managerId) || "Manager";
    const month = toTrimmedString(payload.month) || toTrimmedString(payload.monthKey);
    return month
      ? `${employeeName} and ${managerName} completed submissions for ${month}.`
      : `${employeeName} and ${managerName} completed submissions.`;
  }

  if (type === ADMIN_NOTIFICATION_TYPES.MONTHLY_MANAGER_REVIEW_SUBMITTED) {
    const employeeName =
      toTrimmedString(payload.employeeName) || toTrimmedString(payload.userName) || "An employee";
    const month = toTrimmedString(payload.month) || toTrimmedString(payload.monthKey);
    return month
      ? `Manager review submitted for ${employeeName} (${month}). Open Admin Submissions to approve.`
      : `Manager review submitted for ${employeeName}. Open Admin Submissions to approve.`;
  }

  return direct || "";
}

function buildManagerTitle(type) {
  if (MANAGER_ALLOWED_NOTIFICATION_TYPES.has(type)) {
    return "Employee submission received";
  }
  return "Manager notification";
}

function buildManagerMessage(type, payload) {
  if (!isPlainObject(payload)) return "";
  if (!MANAGER_ALLOWED_NOTIFICATION_TYPES.has(type)) return "";

  const employee =
    toTrimmedString(payload.employeeName) || toTrimmedString(payload.employeeId) || "An employee";
  const month = toTrimmedString(payload.month) || toTrimmedString(payload.monthKey);
  return month
    ? `${employee} submitted monthly review for ${month}.`
    : `${employee} submitted monthly review.`;
}

function buildEmployeeTitle(type) {
  if (type === EMPLOYEE_NOTIFICATION_TYPES.MONTHLY_MANAGER_REVIEW_SUBMITTED) {
    return "Manager review submitted";
  }
  if (type === EMPLOYEE_NOTIFICATION_TYPES.ANNOUNCEMENT) {
    return "Announcement";
  }
  if (String(type || "").includes("APPROVED")) return "Request approved";
  if (String(type || "").includes("REJECTED")) return "Request declined";
  if (String(type || "").includes("REQUEST")) return "Request update";
  if (type === EMPLOYEE_NOTIFICATION_TYPES.PROJECT_ASSIGNMENT) return "Project assignment";
  return "Notification";
}

function buildEmployeeMessage(type, payload, obj) {
  const direct = toTrimmedString(obj?.message);
  if (direct) return direct;
  if (!isPlainObject(payload)) return "";

  if (type === EMPLOYEE_NOTIFICATION_TYPES.MONTHLY_MANAGER_REVIEW_SUBMITTED) {
    const manager = toTrimmedString(payload.managerName) || "Your manager";
    const month = toTrimmedString(payload.month) || toTrimmedString(payload.monthKey);
    return month
      ? `${manager} submitted their review for ${month}.`
      : `${manager} submitted their review.`;
  }

  const sender = toTrimmedString(payload.senderName) || toTrimmedString(obj?.senderName);
  if (sender && direct === "") {
    return sender;
  }
  return "";
}

function normalizeInboxNotification(raw, allowedTypes, buildTitle, buildMessage, genericType) {
  const obj = isPlainObject(raw) ? raw : {};
  const id = toTrimmedString(obj.id) || toTrimmedString(obj.notificationId);
  const title = toTrimmedString(obj.title);
  const message = toTrimmedString(obj.message);
  if (!id && !title && !message) return null;

  const type =
    normalizeType(obj.type ?? obj.eventType ?? obj.notificationType ?? obj.kind, allowedTypes) ||
    genericType;

  const payload =
    (isPlainObject(obj.payload) && obj.payload) ||
    (isPlainObject(obj.data) && obj.data) ||
    {};

  const createdAt =
    toIsoDate(obj.createdAt ?? obj.occurredAt ?? obj.timestamp ?? obj.emittedAt) ||
    new Date().toISOString();

  return {
    id: id || `${type}:${createdAt}`,
    type,
    title: title || buildTitle(type),
    message: message || buildMessage(type, payload, obj),
    createdAt,
    read: toBoolean(obj.read ?? obj.isRead ?? obj.acknowledged ?? obj.seen),
    payload,
    raw: obj,
  };
}

function normalizeNotification(raw, allowedTypes, buildTitle, buildMessage) {
  const obj = isPlainObject(raw) ? raw : {};
  const type = normalizeType(obj.type ?? obj.eventType ?? obj.notificationType ?? obj.kind, allowedTypes);
  if (!type) return null;

  const id =
    toTrimmedString(obj.id) ||
    toTrimmedString(obj.notificationId) ||
    toTrimmedString(obj.eventId) ||
    toTrimmedString(obj.uuid);

  const payload =
    (isPlainObject(obj.payload) && obj.payload) ||
    (isPlainObject(obj.data) && obj.data) ||
    (isPlainObject(obj.body) && obj.body) ||
    {};

  const title = toTrimmedString(obj.title) || toTrimmedString(payload.title) || buildTitle(type);
  const message =
    toTrimmedString(obj.message) ||
    toTrimmedString(obj.text) ||
    toTrimmedString(payload.message) ||
    buildMessage(type, payload);

  const createdAt =
    toIsoDate(obj.createdAt ?? obj.occurredAt ?? obj.timestamp ?? obj.emittedAt ?? payload.createdAt) ||
    new Date().toISOString();

  const read = toBoolean(obj.read ?? obj.isRead ?? obj.acknowledged ?? obj.seen);

  return {
    id: id || `${type}:${createdAt}`,
    type,
    title,
    message,
    createdAt,
    read,
    payload,
    raw: obj,
  };
}

function normalizePage(data, normalizeItem) {
  const root = unwrapRoot(data);
  const items =
    Array.isArray(root.items)
      ? root.items
      : Array.isArray(root.notifications)
        ? root.notifications
        : Array.isArray(root.results)
          ? root.results
          : Array.isArray(root.data)
            ? root.data
            : Array.isArray(data)
              ? data
              : [];

  const normalized = items
    .map((item) => normalizeItem(item))
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const nextCursor = normalizeCursor(
    root.nextCursor ??
      root.next ??
      root.nextToken ??
      root.nextPageToken ??
      root.page?.nextCursor ??
      null
  );

  const unreadCountRaw = root.unreadCount;
  const unreadCount =
    typeof unreadCountRaw === "number"
      ? unreadCountRaw
      : typeof unreadCountRaw === "string"
        ? Number.parseInt(unreadCountRaw, 10)
        : normalized.filter((n) => !n.read).length;

  return {
    items: normalized,
    nextCursor,
    unreadCount: Number.isFinite(unreadCount) ? unreadCount : normalized.filter((n) => !n.read).length,
    raw: root,
  };
}

async function fetchNotifications(pathOrPaths, types, { limit = 25, cursor = null, unreadOnly = false, signal } = {} as ApiOptions) {
  const auth = getAuthHeader();
  const qs = new URLSearchParams();
  if (Array.isArray(types) && types.length) qs.set("types", types.join(","));
  if (limit != null) qs.set("limit", String(limit));
  if (cursor) qs.set("cursor", String(cursor));
  if (unreadOnly) qs.set("unreadOnly", "true");
  const paths = Array.isArray(pathOrPaths) ? pathOrPaths : [pathOrPaths];
  let lastRouteErr = null;

  for (const path of paths) {
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    const res = await fetch(buildApiUrl(`${path}${suffix}`), {
      method: "GET",
      signal,
      credentials: "include",
      headers: auth ? { Authorization: auth } : undefined,
    });

    if (res.ok) return res.json().catch(() => ({}));

    const err = await toHttpError(res);
    if (res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }

  throw lastRouteErr || new Error("Notifications endpoint not found.");
}

async function callMarkReadEndpoint(pathOrPaths, { signal } = {} as ApiOptions) {
  const auth = getAuthHeader();
  const paths = Array.isArray(pathOrPaths) ? pathOrPaths : [pathOrPaths];
  const methods = ["PUT", "POST"];
  let lastRouteErr = null;

  for (const path of paths) {
    for (const method of methods) {
      const res = await fetch(buildApiUrl(path), {
        method,
        signal,
        credentials: "include",
        headers: auth ? { Authorization: auth } : undefined,
      });

      if (res.ok) return res.json().catch(() => ({}));
      const err = await toHttpError(res);
      if (res.status === 404 || res.status === 405) {
        lastRouteErr = err;
        continue;
      }
      throw err;
    }
  }

  throw lastRouteErr || new Error("Notifications update endpoint not found.");
}

function parseSsePayloadWithNormalizer(text, normalizer) {
  const rawText = toTrimmedString(text);
  if (!rawText) return [];

  const parsed = safeJsonParse(rawText, undefined, null);
  if (Array.isArray(parsed)) {
    return parsed.map((item) => normalizer(item)).filter(Boolean);
  }
  if (isPlainObject(parsed)) {
    if (Array.isArray(parsed.items)) {
      return parsed.items.map((item) => normalizer(item)).filter(Boolean);
    }
    const maybeDirect = normalizer(parsed);
    if (maybeDirect) return [maybeDirect];

    const maybeWrapped = normalizer(parsed.notification ?? parsed.payload ?? parsed.data);
    if (maybeWrapped) return [maybeWrapped];
  }

  return [];
}

function subscribeNotificationsStream({
  path,
  types,
  normalizer,
  customEventNames = [],
  onNotification,
  onError,
}) {
  if (typeof window === "undefined" || typeof window.EventSource === "undefined") {
    return () => {};
  }

  const qs = new URLSearchParams();
  if (Array.isArray(types) && types.length) qs.set("types", types.join(","));
  const suffix = qs.toString();
  const source = new window.EventSource(buildApiUrl(suffix ? `${path}?${suffix}` : path), {
    withCredentials: true,
  });

  const handleIncoming = (event) => {
    const list = parseSsePayloadWithNormalizer(event?.data, normalizer);
    for (const item of list) {
      try {
        onNotification?.(item);
      } catch {
        void 0;
      }
    }
  };

  source.onmessage = handleIncoming;
  source.addEventListener("notification", handleIncoming);
  for (const eventName of customEventNames) {
    if (!toTrimmedString(eventName)) continue;
    source.addEventListener(eventName, handleIncoming);
  }

  source.onerror = (event) => {
    try {
      onError?.(event);
    } catch {
      void 0;
    }
  };

  return () => {
    try {
      source.close();
    } catch {
      void 0;
    }
  };
}

export function isSupportedAdminNotificationType(value) {
  return Boolean(normalizeType(value, ADMIN_ALLOWED_NOTIFICATION_TYPES));
}

export function isSupportedManagerNotificationType(value) {
  return Boolean(normalizeType(value, MANAGER_ALLOWED_NOTIFICATION_TYPES));
}

export function normalizeAdminNotification(raw) {
  const first = normalizeNotification(
    raw,
    ADMIN_ALLOWED_NOTIFICATION_TYPES,
    buildAdminTitle,
    (type, payload) => buildAdminMessage(type, payload, raw)
  );
  if (first) return first;

  const obj = isPlainObject(raw) ? raw : {};
  const type = toTrimmedString(obj.type ?? obj.eventType ?? obj.notificationType ?? obj.kind) || "ADMIN_GENERIC";
  const allowed = new Set([type, ...ADMIN_ALLOWED_NOTIFICATION_TYPES]);
  const fallback = normalizeNotification(
    { ...obj, type },
    allowed,
    buildAdminTitle,
    (t, payload) => buildAdminMessage(t, payload, obj)
  );
  if (fallback) return fallback;

  return normalizeInboxNotification(
    raw,
    allowed,
    buildAdminTitle,
    (t, payload, inboxObj) => buildAdminMessage(t, payload, inboxObj) || toTrimmedString(inboxObj?.message),
    "ADMIN_GENERIC"
  );
}

export function normalizeManagerNotification(raw) {
  const first = normalizeNotification(raw, MANAGER_ALLOWED_NOTIFICATION_TYPES, buildManagerTitle, buildManagerMessage);
  if (first) return first;

  return normalizeInboxNotification(
    raw,
    MANAGER_ALLOWED_NOTIFICATION_TYPES,
    buildManagerTitle,
    (type, payload) => buildManagerMessage(type, payload),
    "MANAGER_GENERIC"
  );
}

export function normalizeEmployeeNotification(raw) {
  const first = normalizeNotification(
    raw,
    EMPLOYEE_ALLOWED_NOTIFICATION_TYPES,
    buildEmployeeTitle,
    (type, payload) => buildEmployeeMessage(type, payload, raw)
  );
  if (first) return first;

  return normalizeInboxNotification(
    raw,
    EMPLOYEE_ALLOWED_NOTIFICATION_TYPES,
    buildEmployeeTitle,
    (type, payload, obj) => buildEmployeeMessage(type, payload, obj),
    "EMPLOYEE_GENERIC"
  );
}

export function normalizeAdminNotificationPage(data) {
  return normalizePage(data, normalizeAdminNotification);
}

export function normalizeManagerNotificationPage(data) {
  return normalizePage(data, normalizeManagerNotification);
}

export function normalizeEmployeeNotificationPage(data) {
  return normalizePage(data, normalizeEmployeeNotification);
}

function toUserId(value) {
  const text = toTrimmedString(value);
  return text || "";
}

function isNumericToken(value) {
  return /^\d+$/.test(toTrimmedString(value));
}

function userIdCandidates(value) {
  const raw = toUserId(value);
  if (!raw) return [];
  const out = [];
  const seen = new Set();
  const push = (v) => {
    const text = toTrimmedString(v);
    if (!text || seen.has(text)) return;
    seen.add(text);
    out.push(text);
  };
  push(raw);
  if (isNumericToken(raw)) push(raw);
  const numeric = out.filter((v) => isNumericToken(v));
  const nonNumeric = out.filter((v) => !isNumericToken(v));
  return [...numeric, ...nonNumeric];
}

async function fetchNotificationsByUserId(userId, { signal } = {} as ApiOptions) {
  const candidates = userIdCandidates(userId);
  if (!candidates.length) return [];
  const auth = getAuthHeader();
  let lastRouteErr = null;
  for (const candidate of candidates) {
    const safeUserId = encodeURIComponent(candidate);
    const numericCandidate = isNumericToken(candidate);
    const paths = numericCandidate
      ? [
          `/api/v1/notifications/${safeUserId}`,
          `/api/v1/notifications/user/${safeUserId}`,
          `/api/v1/notifications?userId=${safeUserId}`,
          `/api/v1/notifications?employeeId=${safeUserId}`,
          `/notifications/${safeUserId}`,
          `/notifications/user/${safeUserId}`,
          `/notifications?userId=${safeUserId}`,
          `/notifications?employeeId=${safeUserId}`,
        ]
      : [
          `/api/v1/notifications?employeeId=${safeUserId}`,
          `/api/v1/notifications?employeeCode=${safeUserId}`,
          `/api/v1/notifications?userId=${safeUserId}`,
          `/notifications?employeeId=${safeUserId}`,
          `/notifications?employeeCode=${safeUserId}`,
          `/notifications?userId=${safeUserId}`,
        ];
    for (const path of paths) {
      const res = await fetch(buildApiUrl(path), {
        method: "GET",
        signal,
        credentials: "include",
        headers: auth ? { Authorization: auth } : undefined,
      });
      if (res.ok) return res.json().catch(() => []);
      const err = await toHttpError(res);
      if (res.status === 400 || res.status === 404 || res.status === 405) {
        lastRouteErr = err;
        continue;
      }
      throw err;
    }
  }
  if (lastRouteErr?.status === 400 || lastRouteErr?.status === 404 || lastRouteErr?.status === 405) {
    return [];
  }
  if (lastRouteErr) throw lastRouteErr;
  return [];
}

async function markNotificationReadById(notificationId, { signal } = {} as ApiOptions) {
  const id = toTrimmedString(notificationId);
  if (!id) throw new Error("notificationId is required.");
  const auth = getAuthHeader();
  const safeId = encodeURIComponent(id);
  const paths = [
    `/api/v1/notifications/${safeId}/read`,
    `/api/v1/notifications/read/${safeId}`,
    `/api/v1/notifications/${safeId}`,
    `/notifications/${safeId}/read`,
    `/notifications/read/${safeId}`,
    `/notifications/${safeId}`,
  ];
  const methods = ["PUT", "POST", "PATCH"];
  let lastRouteErr = null;
  for (const path of paths) {
    for (const method of methods) {
      let res = await fetch(buildApiUrl(path), {
        method,
        signal,
        credentials: "include",
        headers: withCsrfHeaders(auth ? { Authorization: auth } : undefined),
      });
      if (res.status === 403) {
        await ensureCsrfCookie({
          signal,
          headers: auth ? { Authorization: auth } : undefined,
          forceRefresh: true,
        }).catch(() => {});
        res = await fetch(buildApiUrl(path), {
          method,
          signal,
          credentials: "include",
          headers: withCsrfHeaders(auth ? { Authorization: auth } : undefined),
        });
      }
      if (res.ok) return true;
      const err = await toHttpError(res);
      if (res.status === 400 || res.status === 404 || res.status === 405) {
        lastRouteErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastRouteErr || new Error("Notifications read endpoint not found.");
}

export async function fetchAdminNotifications({ userId, signal } = {} as ApiOptions) {
  const resolvedId = resolveNotificationUserId(userId);
  const raw = await fetchNotificationsByUserId(resolvedId, { signal });
  return normalizeAdminNotificationPage(Array.isArray(raw) ? { items: raw } : raw);
}

export async function fetchManagerNotifications({ userId, signal } = {} as ApiOptions) {
  return fetchNotificationsByUserId(userId, { signal });
}

export async function fetchEmployeeNotifications({ userId, signal } = {} as ApiOptions) {
  return fetchNotificationsByUserId(userId, { signal });
}

export async function markAdminNotificationRead(notificationId, { signal } = {} as ApiOptions) {
  return markNotificationReadById(notificationId, { signal });
}

export async function markManagerNotificationRead(notificationId, { signal } = {} as ApiOptions) {
  return markNotificationReadById(notificationId, { signal });
}

export async function markEmployeeNotificationRead(notificationId, { signal } = {} as ApiOptions) {
  return markNotificationReadById(notificationId, { signal });
}

async function markAllByIterating(notifications, { signal } = {} as ApiOptions) {
  const list = Array.isArray(notifications) ? notifications : [];
  const unreadIds = list
    .filter((item) => item && item.read !== true)
    .map((item) => toTrimmedString(item.id))
    .filter(Boolean);
  for (const id of unreadIds) {
    await markNotificationReadById(id, { signal });
  }
  return true;
}

export async function markAllAdminNotificationsRead({ notifications = [], signal } = {} as ApiOptions) {
  return markAllByIterating(notifications, { signal });
}

export async function markAllManagerNotificationsRead({ notifications = [], signal } = {} as ApiOptions) {
  return markAllByIterating(notifications, { signal });
}

export async function markAllEmployeeNotificationsRead({ notifications = [], signal } = {} as ApiOptions) {
  return markAllByIterating(notifications, { signal });
}

export function subscribeAdminNotificationsStream({ userId, onNotification, onError } = {} as ApiOptions) {
  const candidates = userIdCandidates(userId);
  const streamId = candidates.find((x) => isNumericToken(x)) || "";
  if (!streamId) return () => {};
  return subscribeNotificationsStream({
    path: `/api/v1/notifications/subscribe/${encodeURIComponent(streamId)}`,
    types: null,
    normalizer: normalizeAdminNotification,
    customEventNames: ["admin-notification", "notification"],
    onNotification,
    onError,
  });
}

export function subscribeManagerNotificationsStream({ userId, onNotification, onError } = {} as ApiOptions) {
  const candidates = userIdCandidates(userId);
  const streamId = candidates.find((x) => isNumericToken(x)) || "";
  if (!streamId) return () => {};
  return subscribeNotificationsStream({
    path: `/api/v1/notifications/subscribe/${encodeURIComponent(streamId)}`,
    // Allow all types to pass through so admins can notify managers about rejections, etc.
    types: null,
    normalizer: normalizeManagerNotification,
    customEventNames: ["manager-notification", "notification"],
    onNotification,
    onError,
  });
}

export function subscribeEmployeeNotificationsStream({ userId, onNotification, onError } = {} as ApiOptions) {
  const candidates = userIdCandidates(userId);
  const streamId = candidates.find((x) => isNumericToken(x)) || "";
  if (!streamId) return () => {};
  return subscribeNotificationsStream({
    path: `/api/v1/notifications/subscribe/${encodeURIComponent(streamId)}`,
    types: null,
    normalizer: normalizeEmployeeNotification,
    customEventNames: ["employee-notification", "notification"],
    onNotification,
    onError,
  });
}

/** Prefer numeric backend user id for inbox + SSE routes. */
export function resolveNotificationUserId(...candidates) {
  const numeric = [];
  const other = [];
  for (const candidate of candidates) {
    const text = toTrimmedString(candidate);
    if (!text) continue;
    if (isNumericToken(text)) numeric.push(text);
    else other.push(text);
  }
  return numeric[0] || other[0] || "";
}
