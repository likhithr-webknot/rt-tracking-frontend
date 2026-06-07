// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion as Motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, BellDot, Menu } from "lucide-react";
import { ADMIN_NAV_GROUPS, ADMIN_TAB_COPY } from "../../config/portalNavigation";
import { isHrPortalUser } from "../../utils/hrRatingsFilter";
import { filterAdminNavGroups, isSuperAdminPortalUser } from "../../utils/portalAccess";
import RatingsHistoryWorkspace from "./RatingsHistoryWorkspace";
import WebknotDrive from "./WebknotDrive";
import AppShell from "../shared/AppShell";
import PortalSidebar from "../shared/PortalSidebar";
import AdminDashboard from "./AdminDashboard";
import AdminSubmissions from "./AdminSubmissions";
import AdminCertificationsBridge from "./AdminCertificationsBridge";
import AdminGoalsRegistry from "./AdminGoalsRegistry";
import EmployeeDirectory from "./EmployeeDirectory";
import SettingsPanel from "./SettingsPanel";
import CompanyValuesWorkspace from "./CompanyValuesWorkspace";
import BandStreamDirectory from "./BandStreamDirectory";
import DesignationsWorkspace from "./DesignationsWorkspace";
import ProjectsDirectory from "./ProjectsDirectory";
import PortalNotesWorkspace from "../shared/PortalNotesWorkspace";
import ReportsDashboard from "./ReportsDashboard";
import Toast from "../shared/Toast";
import NotFoundPage from "../shared/NotFoundPage";
import PortalUserMenu from "../shared/PortalUserMenu";
import UserProfilePage from "../shared/UserProfilePage";
import { fetchEmployees, normalizeEmployees } from "../../api/employees";
import {
  closeSubmissionWindowForEmployeeNow,
  fetchSubmissionWindowCurrent,
  openSubmissionWindowForEmployeeNow,
} from "../../api/submission-window";
import { computeSubmissionWindowOpen, toPortalWindowShape } from "../../utils/submissionWindow";
import { fetchPortalAdmin } from "../../api/portal";
import {
  fetchAdminNotifications,
  markAllAdminNotificationsRead,
  markAdminNotificationRead,
  resolveNotificationUserId,
  subscribeAdminNotificationsStream,
} from "../../api/notifications";
import { getAdminSettings } from "../../utils/appSettings";
import { playNotificationSound, unlockNotificationSound } from "../../utils/notificationSound";
const ADMIN_SIDEBAR_PREF_KEY = "rt_tracking_admin_sidebar_open_v1";
const ADMIN_NOTIFICATION_POLL_MS = 30_000;
const ADMIN_NOT_FOUND_TAB = "__404__";

function mergeAdminNotifications(existing, incoming) {
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

function resolveAdminTabFromPathname(pathname) {
  const segment = String(pathname || "")
    .replace(/^\/admin\/?/, "")
    .split("/")
    .filter(Boolean)[0];
  if (!segment) return "dashboard";
  if (segment === "account") return "account";
  if (segment === "cycles") return "settings";
  if (segment === "performance" || segment === "timelogs" || segment === "operations") return "dashboard";
  if (segment === "promotions") return "directory";
  if (segment === "extensions" || segment === "allocations") return "projects";
  return segment;
}

function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0')
  const yyyy = date.getFullYear()
  const mm = pad(date.getMonth() + 1)
  const dd = pad(date.getDate())
  const hh = pad(date.getHours())
  const mi = pad(date.getMinutes())
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}

function isPortalWindowOpenNow(portalWindow, now = new Date()) {
  if (!portalWindow || !portalWindow.start || !portalWindow.end) return false;
  const start = new Date(portalWindow.start);
  const end = new Date(portalWindow.end);
  return now >= start && now <= end;
}

function defaultPortalWindow() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), 28, 23, 59, 59);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export default function AdminControlCenter({ onLogout, auth }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const stored = window.localStorage.getItem(ADMIN_SIDEBAR_PREF_KEY);
      if (stored === "0") return false;
      if (stored === "1") return true;
    } catch { void 0; }
    return window.innerWidth >= 1024;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(ADMIN_SIDEBAR_PREF_KEY, isSidebarOpen ? "1" : "0");
    } catch { void 0; }
  }, [isSidebarOpen]);

  useEffect(() => {
    function onKeyDown(e) {
      const key = String(e.key || "").toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === "b") {
        e.preventDefault();
        setIsSidebarOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const VALID_TABS = useMemo(() => new Set([
    "dashboard",
    "submissions",
    "directory",
    "ratings-history",
    "projects",
    "reports",
    "kpi",
    "band-streams",
    "designations",
    "certifications",
    "values",
    "notes",
    "drive",
    "settings",
    "account",
  ]), []);

  const resolvedTab = useMemo(
    () => resolveAdminTabFromPathname(location.pathname),
    [location.pathname],
  );

  const isHrUser = useMemo(() => isHrPortalUser(auth), [auth]);
  const isSuperAdmin = useMemo(() => isSuperAdminPortalUser(auth), [auth]);

  const activeTab = useMemo(() => {
    if (!VALID_TABS.has(resolvedTab)) return ADMIN_NOT_FOUND_TAB;
    if (resolvedTab === "ratings-history" && !isSuperAdmin) return "dashboard";
    return resolvedTab;
  }, [VALID_TABS, resolvedTab, isSuperAdmin]);

  const setActiveTab = useCallback(
    (tab) => {
      const path = tab === "dashboard" ? "/admin" : `/admin/${tab}`;
      if (location.pathname !== path) navigate(path);
    },
    [navigate, location.pathname],
  );

  useEffect(() => {
    if (!VALID_TABS.has(resolvedTab)) return;
    if (resolvedTab === "ratings-history" && !isSuperAdmin) {
      navigate("/admin", { replace: true });
    }
  }, [VALID_TABS, resolvedTab, isSuperAdmin, navigate]);

  const [toast, setToast] = useState(null);
  const showToast = useCallback((t) => setToast(next => ({ ...next, ...t })), []);

  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeesError, setEmployeesError] = useState("");

  const reloadEmployees = useCallback(async () => {
    setEmployeesLoading(true);
    try {
      const page = await fetchEmployees({ limit: 1000, cursor: 0 });
      setEmployees(normalizeEmployees(page));
    } catch (err) {
      setEmployeesError(err.message);
    } finally {
      setEmployeesLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadEmployees();
  }, [reloadEmployees]);

  const [portalWindow, setPortalWindow] = useState(() => defaultPortalWindow());
  const [portalWindowLoading, setPortalWindowLoading] = useState(false);
  const [portalWindowError, setPortalWindowError] = useState("");

  const reloadPortalWindow = useCallback(async () => {
    setPortalWindowLoading(true);
    setPortalWindowError("");
    try {
      const data = await fetchSubmissionWindowCurrent();
      if (data) setPortalWindow(toPortalWindowShape(data));
    } catch (err) {
      setPortalWindowError(err?.message || "Failed to load submission window.");
    } finally {
      setPortalWindowLoading(false);
    }
  }, []);

  const globalWindowOpen = useMemo(
    () => computeSubmissionWindowOpen(portalWindow),
    [portalWindow],
  );

  const handleEmployeeSubmissionWindow = useCallback(
    async (employeeId, action) => {
      const id = String(employeeId ?? "").trim();
      if (!id) return;
      if (action === "open") await openSubmissionWindowForEmployeeNow(id);
      else await closeSubmissionWindowForEmployeeNow(id);
      await reloadPortalWindow();
    },
    [reloadPortalWindow],
  );

  useEffect(() => {
    reloadPortalWindow();
  }, [reloadPortalWindow]);

  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsPanelRef = useRef(null);
  const notificationsLoadedRef = useRef(false);
  const notifiedEventKeysRef = useRef(new Set());
  const knownNotificationIdsRef = useRef(new Set());

  const notificationUserId = useMemo(
    () => resolveNotificationUserId(auth?.userId, auth?.id, auth?.sub),
    [auth?.id, auth?.sub, auth?.userId],
  );

  const pushIncomingNotification = useCallback(
    (incoming) => {
      if (!incoming) return;
      const eventKey = String(
        incoming?.id ?? `${incoming?.type}:${incoming?.createdAt}:${incoming?.message ?? incoming?.title ?? ""}`,
      );
      setNotifications((prev) => mergeAdminNotifications(prev, [incoming]).slice(0, 75));
      if (notifiedEventKeysRef.current.has(eventKey)) return;
      notifiedEventKeysRef.current.add(eventKey);
      if (notifiedEventKeysRef.current.size > 500) {
        notifiedEventKeysRef.current = new Set(Array.from(notifiedEventKeysRef.current).slice(-250));
      }
      if (Boolean(getAdminSettings()?.enableSoundAlerts ?? true)) {
        playNotificationSound({ enabled: true }).catch(() => {});
      }
      showToast({
        title: incoming.title || "New notification",
        message: incoming.message || "",
        tone: "info",
      });
    },
    [showToast],
  );

  const reloadNotifications = useCallback(async ({ silent = false } = {}) => {
    if (!notificationUserId) {
      setNotifications([]);
      notificationsLoadedRef.current = false;
      knownNotificationIdsRef.current = new Set();
      return;
    }
    if (!silent || !notificationsLoadedRef.current) setNotificationsLoading(true);
    try {
      const page = await fetchAdminNotifications({ userId: notificationUserId });
      const items = Array.isArray(page?.items) ? page.items : [];
      if (silent && notificationsLoadedRef.current) {
        for (const item of items) {
          const id = String(item?.id ?? "");
          if (!id || knownNotificationIdsRef.current.has(id) || item?.read) continue;
          pushIncomingNotification(item);
        }
      }
      knownNotificationIdsRef.current = new Set(
        items.map((item) => String(item?.id ?? "")).filter(Boolean),
      );
      setNotifications(items);
      notificationsLoadedRef.current = true;
    } catch (err) {
      console.error(err);
    } finally {
      setNotificationsLoading(false);
    }
  }, [notificationUserId, pushIncomingNotification]);

  useEffect(() => {
    if (!notificationUserId) return undefined;
    const controller = new AbortController();
    reloadNotifications().catch(() => {});
    const timer = window.setInterval(() => {
      reloadNotifications({ silent: true }).catch(() => {});
    }, getAdminSettings()?.notificationPollIntervalMs ?? ADMIN_NOTIFICATION_POLL_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [notificationUserId, reloadNotifications]);

  useEffect(() => {
    if (!notificationUserId) return undefined;
    const unsubscribe = subscribeAdminNotificationsStream({
      userId: notificationUserId,
      onNotification: pushIncomingNotification,
      onError: () => {
        reloadNotifications({ silent: true }).catch(() => {});
      },
    });
    return () => unsubscribe?.();
  }, [notificationUserId, pushIncomingNotification, reloadNotifications]);

  const unreadNotificationsCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);
  const roleLabel = isHrUser ? "HR" : isSuperAdmin ? "Super Admin" : "Admin";
  const adminNavGroups = useMemo(
    () => filterAdminNavGroups(ADMIN_NAV_GROUPS, { isHrUser, isSuperAdmin }),
    [isHrUser, isSuperAdmin],
  );

  return (
    <>
    <AppShell
      isSidebarOpen={isSidebarOpen}
      setIsSidebarOpen={setIsSidebarOpen}
      sidebar={
        <PortalSidebar
          isOpen={isSidebarOpen}
          setIsOpen={setIsSidebarOpen}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          portalTag="For HR & leadership"
          navGroups={adminNavGroups}
          showThemeToggle
          onSettingsClick={() => setActiveTab("settings")}
          settingsActive={activeTab === "settings"}
        />
      }
      topbar={
        <>
          <button
            type="button"
            className="pulse-icon-btn mr-auto md:hidden"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <div className="relative" ref={notificationsPanelRef}>
            <button
              type="button"
              onClick={() => {
                unlockNotificationSound();
                const nextOpen = !notificationsOpen;
                setNotificationsOpen(nextOpen);
                if (nextOpen) reloadNotifications({ silent: true }).catch(() => {});
              }}
              className="pulse-icon-btn"
            >
              {unreadNotificationsCount > 0 ? (
                <BellDot size={18} className="text-[rgb(var(--danger))]" />
              ) : (
                <Bell size={18} />
              )}
            </button>
            <AnimatePresence>
              {notificationsOpen ? (
                <Motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute right-0 mt-2 w-80 overflow-hidden rounded-[1rem] border border-[rgb(var(--border))]/70 bg-[rgb(var(--surface))]/95 shadow-xl backdrop-blur-xl"
                >
                  <header className="flex items-center justify-between border-b border-[rgb(var(--border))] px-4 py-3">
                    <h3 className="text-sm font-semibold text-[rgb(var(--text))]">
                      Notifications
                    </h3>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await markAllAdminNotificationsRead({ notifications });
                          reloadNotifications();
                        } catch (err) {
                          console.error(err);
                        }
                      }}
                      className="text-xs font-semibold text-[rgb(var(--primary))] hover:underline"
                    >
                      Mark all read
                    </button>
                  </header>
                  <div className="max-h-[280px] space-y-1 overflow-y-auto p-2 custom-scrollbar">
                    {notificationsLoading && notifications.length === 0 ? (
                      <div className="p-6 text-center text-sm text-[rgb(var(--muted))]">Loading notifications…</div>
                    ) : null}
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        role="button"
                        tabIndex={0}
                        onClick={async () => {
                          if (n.read) return;
                          try {
                            await markAdminNotificationRead(n.id);
                            reloadNotifications();
                          } catch (err) {
                            console.error(err);
                          }
                        }}
                        className={[
                          "rounded-[var(--radius-md)] p-3 transition-colors",
                          n.read
                            ? "opacity-60"
                            : "cursor-pointer hover:bg-[rgb(var(--surface-2))]",
                        ].join(" ")}
                      >
                        <div className="text-xs font-semibold text-[rgb(var(--text))]">{n.title}</div>
                        <div className="mt-0.5 line-clamp-2 text-[11px] text-[rgb(var(--muted))]">{n.message}</div>
                      </div>
                    ))}
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-sm text-[rgb(var(--muted))]">You&apos;re all caught up.</div>
                    ) : null}
                  </div>
                </Motion.div>
              ) : null}
            </AnimatePresence>
          </div>
          <PortalUserMenu
            auth={auth}
            roleLabel={roleLabel}
            onProfile={() => setActiveTab("account")}
            onLogout={onLogout}
          />
        </>
      }
    >
          <div className="w-full min-w-0">
            {isHrUser ? (
              <div className="mb-6 pulse-callout pulse-callout--info">
                HR workspace: same tools as Super Admin, except you cannot edit Super Admin accounts. Complete your
                leadership self-review (band KPIs, Webknot values, super admin reviewer) in the{" "}
                <a href="/manager/self-review" className="text-[rgb(var(--primary))] hover:underline">
                  leadership self-review portal
                </a>
                .
              </div>
            ) : null}

            {activeTab === ADMIN_NOT_FOUND_TAB ? (
              <NotFoundPage
                attemptedPath={location.pathname}
                onGoHome={() => navigate("/admin")}
              />
            ) : (
            <AnimatePresence mode="wait">
              <Motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
          {activeTab === "dashboard" && (
            <AdminDashboard
              employees={employees}
              employeesLoading={employeesLoading}
              portalWindow={portalWindow}
            />
          )}

          {activeTab === "submissions" && (
            <AdminSubmissions onLogout={onLogout} employees={employees} auth={auth} />
          )}

          {activeTab === "ratings-history" && isSuperAdmin ? (
            <RatingsHistoryWorkspace employees={employees} employeesLoading={employeesLoading} />
          ) : null}

          {activeTab === "directory" && (
            <EmployeeDirectory
              auth={auth}
              employees={employees}
              employeesLoading={employeesLoading}
              employeesError={employeesError}
              reloadEmployees={reloadEmployees}
              setEmployees={setEmployees}
              globalWindowOpen={globalWindowOpen}
              onSetEmployeeSubmissionWindow={handleEmployeeSubmissionWindow}
            />
          )}

          {activeTab === "kpi" && <AdminGoalsRegistry />}

          {activeTab === "values" && <CompanyValuesWorkspace />}

          {activeTab === "projects" && (
            <ProjectsDirectory
              employees={employees}
              employeesLoading={employeesLoading}
            />
          )}
          {activeTab === "reports" && <ReportsDashboard />}
          {activeTab === "band-streams" && <BandStreamDirectory />}
          {activeTab === "designations" && <DesignationsWorkspace />}
          {activeTab === "certifications" && <AdminCertificationsBridge />}
          {activeTab === "notes" && (
            <PortalNotesWorkspace
              portal="admin"
              auth={auth}
              title={ADMIN_TAB_COPY.notes.title}
              subtitle={ADMIN_TAB_COPY.notes.subtitle}
            />
          )}
          {activeTab === "drive" && <WebknotDrive auth={auth} portalLabel="your admin account" />}
          {activeTab === "settings" ? (
            <SettingsPanel
              employees={employees}
              employeesLoading={employeesLoading}
              isSuperAdmin={isSuperAdmin}
            />
          ) : null}

          {activeTab === "account" && (
            <UserProfilePage auth={auth} roleLabel={roleLabel} onBack={() => setActiveTab("dashboard")} />
          )}
              </Motion.div>
            </AnimatePresence>
            )}
          </div>
    </AppShell>


      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
