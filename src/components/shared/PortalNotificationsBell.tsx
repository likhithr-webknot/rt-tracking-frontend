// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellDot, CheckCheck } from "lucide-react";
import {
  fetchEmployeeNotifications,
  fetchManagerNotifications,
  markAllEmployeeNotificationsRead,
  markAllManagerNotificationsRead,
  markEmployeeNotificationRead,
  markManagerNotificationRead,
  normalizeEmployeeNotificationPage,
  normalizeManagerNotificationPage,
  resolveNotificationUserId,
  subscribeEmployeeNotificationsStream,
  subscribeManagerNotificationsStream,
} from "../../api/notifications";
import { getEmployeeSettings } from "../../utils/appSettings";
import { playNotificationSound, unlockNotificationSound } from "../../utils/notificationSound";

const DEFAULT_POLL_MS = 30_000;
const PAGE_SIZE = 25;

function formatNotificationTimestamp(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "Now";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "Now";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function mergeNotifications(existing, incoming) {
  const next = [];
  const seen = new Set();
  const pushUnique = (row) => {
    if (!row || typeof row !== "object") return;
    const key = String(row.id ?? `${row.type}:${row.createdAt}:${row.message ?? row.title ?? ""}`);
    if (seen.has(key)) return;
    seen.add(key);
    next.push(row);
  };
  for (const row of Array.isArray(existing) ? existing : []) pushUnique(row);
  for (const row of Array.isArray(incoming) ? incoming : []) pushUnique(row);
  return next.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

const PORTAL_CONFIG = {
  employee: {
    fetch: fetchEmployeeNotifications,
    normalizePage: normalizeEmployeeNotificationPage,
    markRead: markEmployeeNotificationRead,
    markAllRead: markAllEmployeeNotificationsRead,
    subscribe: subscribeEmployeeNotificationsStream,
    panelKicker: "Employee alerts",
    emptyMessage: "No notifications yet.",
    itemKicker: "Update",
  },
  manager: {
    fetch: fetchManagerNotifications,
    normalizePage: normalizeManagerNotificationPage,
    markRead: markManagerNotificationRead,
    markAllRead: markAllManagerNotificationsRead,
    subscribe: subscribeManagerNotificationsStream,
    panelKicker: "Manager alerts",
    emptyMessage: "No manager alerts yet.",
    itemKicker: "Employee submission",
  },
};

export default function PortalNotificationsBell({
  portal = "employee",
  userId = "",
  onLogout,
  onToast,
  pollIntervalMs,
  enableSound,
  ariaLabel,
}) {
  const config = PORTAL_CONFIG[portal] || PORTAL_CONFIG.employee;
  const resolvedUserId = useMemo(() => String(userId ?? "").trim(), [userId]);
  const pollMs = pollIntervalMs ?? DEFAULT_POLL_MS;
  const soundEnabled =
    typeof enableSound === "boolean"
      ? enableSound
      : Boolean(getEmployeeSettings()?.enableSoundAlerts ?? true);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const panelRef = useRef(null);
  const loadedRef = useRef(false);

  const unreadCount = useMemo(
    () => items.reduce((count, item) => (item?.read ? count : count + 1), 0),
    [items]
  );

  const reload = useCallback(
    async ({ signal, cursor = null, append = false, silent = false } = {}) => {
      if (!resolvedUserId) {
        setItems([]);
        setNextCursor(null);
        setError("");
        loadedRef.current = false;
        return;
      }
      if (!silent || !loadedRef.current) setLoading(true);
      setError("");
      try {
        const data = await config.fetch({ userId: resolvedUserId, signal });
        const page = config.normalizePage(data);
        setItems((prev) => {
          if (!append) return page.items;
          return mergeNotifications(prev, page.items);
        });
        setNextCursor(page.nextCursor);
        loadedRef.current = true;
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (err?.status === 401) {
          onLogout?.();
          return;
        }
        setError(err?.message || "Failed to load notifications.");
      } finally {
        setLoading(false);
      }
    },
    [config, onLogout, resolvedUserId]
  );

  const pushIncoming = useCallback(
    (incoming) => {
      if (!incoming) return;
      setItems((prev) => mergeNotifications(prev, [incoming]).slice(0, PAGE_SIZE * 3));
      if (soundEnabled) playNotificationSound({ enabled: true }).catch(() => {});
      onToast?.({
        title: incoming.title || "New notification",
        message: incoming.message || "",
        tone: "info",
      });
    },
    [onToast, soundEnabled]
  );

  const markRead = useCallback(
    async (notificationId) => {
      const id = String(notificationId ?? "").trim();
      if (!id) return;
      try {
        await config.markRead(id);
        setItems((prev) => prev.map((item) => (String(item.id) === id ? { ...item, read: true } : item)));
      } catch (err) {
        if (err?.status === 401) {
          onLogout?.();
          return;
        }
        onToast?.({
          title: "Unable to mark read",
          message: err?.message || "Please try again.",
          tone: "error",
        });
      }
    },
    [config, onLogout, onToast]
  );

  const markAllRead = useCallback(async () => {
    try {
      await config.markAllRead({ notifications: items });
      setItems((prev) => prev.map((item) => ({ ...item, read: true })));
    } catch (err) {
      if (err?.status === 401) {
        onLogout?.();
        return;
      }
      onToast?.({
        title: "Unable to mark all read",
        message: err?.message || "Please try again.",
        tone: "error",
      });
    }
  }, [config, items, onLogout, onToast]);

  useEffect(() => {
    if (!resolvedUserId) return;
    const controller = new AbortController();
    reload({ signal: controller.signal }).catch(() => {});

    const timer = window.setInterval(() => {
      reload({ silent: true }).catch(() => {});
    }, pollMs);

    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [pollMs, reload, resolvedUserId]);

  useEffect(() => {
    if (!resolvedUserId) return;
    const unsubscribe = config.subscribe({
      userId: resolvedUserId,
      onNotification: pushIncoming,
      onError: () => {
        reload({ silent: true }).catch(() => {});
      },
    });
    return () => unsubscribe?.();
  }, [config, pushIncoming, reload, resolvedUserId]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event) => {
      const target = event?.target;
      if (!panelRef.current || !target) return;
      if (!panelRef.current.contains(target)) setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div className="relative pointer-events-auto" ref={panelRef}>
      <button
        type="button"
        onClick={() => {
          unlockNotificationSound();
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen) reload({ silent: true }).catch(() => {});
        }}
        className={[
          "relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-[rgb(var(--border))]",
          "bg-[rgb(var(--surface))] text-[rgb(var(--text))]",
          "transition-all duration-200 hover:bg-[rgb(var(--surface-2))]",
        ].join(" ")}
        aria-label={ariaLabel || "Notifications"}
        title={ariaLabel || "Notifications"}
      >
        {unreadCount > 0 ? <BellDot size={16} /> : <Bell size={16} />}
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-red-600 px-1 py-0.5 text-center text-[9px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-3 w-[min(92vw,420px)] rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-lg">
          <div className="flex items-center justify-between border-b border-[rgb(var(--border))] px-4 py-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                {config.panelKicker}
              </div>
              <div className="mt-1 text-sm font-medium text-[rgb(var(--text))]">
                {unreadCount} unread
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => reload().catch(() => {})}
                className="rounded-md border border-[rgb(var(--border))] px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => markAllRead().catch(() => {})}
                className="inline-flex items-center gap-1 rounded-md border border-[rgb(var(--border))] px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
              >
                <CheckCheck size={13} />
                Mark all
              </button>
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto p-3">
            {error ? (
              <div className="mb-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-[rgb(var(--text))]">
                {error}
              </div>
            ) : null}
            {!error && loading && items.length === 0 ? (
              <div className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-3 text-xs text-[rgb(var(--muted))]">
                Loading notifications…
              </div>
            ) : null}
            {!error && !loading && items.length === 0 ? (
              <div className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-3 text-xs text-[rgb(var(--muted))]">
                {config.emptyMessage}
              </div>
            ) : null}
            <div className="space-y-2">
              {items.map((item) => (
                <button
                  key={String(item.id)}
                  type="button"
                  onClick={() => markRead(item.id)}
                  className={[
                    "w-full rounded-md border px-3 py-2.5 text-left transition",
                    item.read
                      ? "border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] opacity-90"
                      : "border-blue-500/35 bg-blue-500/10",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                        {config.itemKicker}
                      </div>
                      <div className="mt-1 text-sm font-bold text-[rgb(var(--text))] break-words">
                        {item.title}
                      </div>
                      {item.message ? (
                        <div className="mt-1 text-xs text-[rgb(var(--muted))] break-words">{item.message}</div>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--muted))]">
                      {formatNotificationTimestamp(item.createdAt)}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {nextCursor ? (
              <button
                type="button"
                onClick={() => reload({ cursor: nextCursor, append: true }).catch(() => {})}
                className="mt-3 w-full rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-2 text-xs font-bold uppercase tracking-wider text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
              >
                Load more
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { resolveNotificationUserId };
