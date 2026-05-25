// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion as Motion } from "framer-motion";
import {
  LayoutDashboard, Users,
  ClipboardCheck, Sparkles, Target, Award, Layers3,
  Bell, BellDot, FileBarChart2,
  Briefcase, ArrowUpCircle, StickyNote, Cloud, Clock
} from "lucide-react";
import WebknotDrive from "./WebknotDrive";
import AllocationExtensionSlaDashboard from "./AllocationExtensionSlaDashboard";
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
import ProjectsDirectory from "./ProjectsDirectory";
import PortalNotesWorkspace from "../shared/PortalNotesWorkspace";
import ReportsDashboard from "./ReportsDashboard";
import PromotionsAudit from "./PromotionsAudit";
import Toast from "../shared/Toast";
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
} from "../../api/notifications";
const ADMIN_SIDEBAR_PREF_KEY = "rt_tracking_admin_sidebar_open_v1";
const ADMIN_NOTIFICATION_POLL_MS = 30_000;

const ADMIN_NAV_ITEMS = [
  { id: "dashboard", icon: <LayoutDashboard size={18} />, label: "Dashboard" },
  { id: "submissions", icon: <ClipboardCheck size={18} />, label: "Submissions" },
  { id: "directory", icon: <Users size={18} />, label: "Employees" },
  { id: "promotions", icon: <ArrowUpCircle size={18} />, label: "Promotions" },
  { id: "projects", icon: <Briefcase size={18} />, label: "Projects" },
  { id: "extensions", icon: <Clock size={18} />, label: "Extensions" },
  { id: "reports", icon: <FileBarChart2 size={18} />, label: "Reports" },
  { id: "kpi", icon: <Target size={18} />, label: "KPI Goals" },
  { id: "band-streams", icon: <Layers3 size={18} />, label: "Bands & Departments" },
  { id: "certifications", icon: <Award size={18} />, label: "Certifications" },
  { id: "values", icon: <Sparkles size={18} />, label: "Webknot Values" },
  { id: "notes", icon: <StickyNote size={18} />, label: "Notes" },
  { id: "drive", icon: <Cloud size={18} />, label: "Webknot Drive" },
];

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
    "promotions",
    "projects",
    "extensions",
    "reports",
    "kpi",
    "band-streams",
    "certifications",
    "values",
    "notes",
    "drive",
    "settings",
    "account",
  ]), []);

  const getTabFromPath = useCallback(() => {
    const raw = window.location.pathname.replace(/^\/admin\//, "").split("/")[0];
    if (raw === "cycles") return "settings";
    if (raw === "account") return "account";
    if (VALID_TABS.has(raw)) return raw;
    if (raw === "allocations") return "projects";
    if (raw === "extensions") return "extensions";
    if (["timelogs", "operations"].includes(raw)) return "dashboard";
    return "dashboard";
  }, [VALID_TABS]);

  const [activeTab, setActiveTabRaw] = useState(() => getTabFromPath());

  const setActiveTab = useCallback((tab) => {
    setActiveTabRaw(tab);
    const path = tab === "dashboard" ? "/admin" : `/admin/${tab}`;
    if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
  }, []);

  useEffect(() => {
    const onPathChange = () => setActiveTabRaw(getTabFromPath());
    window.addEventListener("popstate", onPathChange);
    return () => {
      window.removeEventListener("popstate", onPathChange);
    };
  }, [getTabFromPath]);

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

  const reloadNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    try {
      const email = String(auth?.email || "").trim();
      if (!email) return;
      const data = await fetchAdminNotifications({ userId: email });
      setNotifications(Array.isArray(data) ? data : data?.data?.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setNotificationsLoading(false);
    }
  }, [auth?.email]);

  useEffect(() => {
    if (notificationsOpen) reloadNotifications();
  }, [notificationsOpen, reloadNotifications]);

  const unreadNotificationsCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

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
          portalTag="Admin Console"
          navItems={ADMIN_NAV_ITEMS}
          showThemeToggle
          onSettingsClick={() => setActiveTab("settings")}
          settingsActive={activeTab === "settings"}
        />
      }
      topbar={
        <>
          <div className="relative" ref={notificationsPanelRef}>
            <button
              type="button"
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--muted))] transition-colors hover:text-[rgb(var(--text))]"
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
                  className="absolute right-0 mt-2 w-80 overflow-hidden rounded-[var(--radius-lg)] border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-lg"
                >
                  <header className="flex items-center justify-between border-b border-[rgb(var(--border))] px-4 py-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">
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
                      <div className="p-6 text-center text-xs text-[rgb(var(--muted))]">No notifications</div>
                    ) : null}
                  </div>
                </Motion.div>
              ) : null}
            </AnimatePresence>
          </div>
          <PortalUserMenu
            auth={auth}
            roleLabel="Admin"
            onProfile={() => setActiveTab("account")}
            onLogout={onLogout}
          />
        </>
      }
    >
          {activeTab === "dashboard" && (
            <AdminDashboard
              employees={employees}
              employeesLoading={employeesLoading}
              portalWindow={portalWindow}
            />
          )}

          {activeTab === "submissions" && (
            <AdminSubmissions onLogout={onLogout} employees={employees} />
          )}

          {activeTab === "directory" && (
            <EmployeeDirectory
              employees={employees}
              employeesLoading={employeesLoading}
              employeesError={employeesError}
              reloadEmployees={reloadEmployees}
              setEmployees={setEmployees}
              globalWindowOpen={globalWindowOpen}
              onSetEmployeeSubmissionWindow={handleEmployeeSubmissionWindow}
            />
          )}

          {activeTab === "promotions" && (
             <PromotionsAudit
               employees={employees}
               loading={employeesLoading}
               reloadEmployees={reloadEmployees}
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
          {activeTab === "extensions" && <AllocationExtensionSlaDashboard />}
          {activeTab === "reports" && <ReportsDashboard />}
          {activeTab === "band-streams" && <BandStreamDirectory />}
          {activeTab === "certifications" && <AdminCertificationsBridge />}
          {activeTab === "notes" && (
            <PortalNotesWorkspace
              portal="admin"
              auth={auth}
              title="Admin notes"
              subtitle="Private to your account — not visible to other admins, managers, or employees."
            />
          )}
          {activeTab === "drive" && <WebknotDrive auth={auth} portalLabel="your admin account" />}
          {activeTab === "settings" && <SettingsPanel />}

          {activeTab === "account" && (
            <UserProfilePage auth={auth} roleLabel="Admin" onBack={() => setActiveTab("dashboard")} />
          )}
    </AppShell>


      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
