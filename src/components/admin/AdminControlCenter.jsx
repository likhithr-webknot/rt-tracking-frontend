import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion as Motion } from "framer-motion";
import {
  LayoutDashboard, Users, Settings, LogOut, ChevronLeft, ChevronRight,
  ClipboardCheck, Search, Plus, Trash2, Edit3, Sparkles, Target, Award, Bot, X, Layers3,
  Bell, BellDot, CheckCheck, FileUp, Calendar, RefreshCw, KeyRound, Lock, FileBarChart2, ChevronDown
} from "lucide-react";

import AdminDashboard from "./AdminDashboard.jsx";
import AdminSubmissions from "./AdminSubmissions.jsx";
import AIAgentsConfig from "./AIAgentsConfig.jsx";
import Certifications from "./Certifications.jsx";
import EmployeeDirectory from "./EmployeeDirectory.jsx";
import KPIRegistry from "./KPIRegistry.jsx";
import SettingsPanel from "./SettingsPanel.jsx";
import WebknotValueDirectory from "./WebknotValueDirectory.jsx";
import BandStreamDirectory from "./BandStreamDirectory.jsx";
import CsvImportPanel from "./CsvImportPanel.jsx";
import ConfirmDialog from "../shared/ConfirmDialog.jsx";
import Toast from "../shared/Toast.jsx";
import ThemeToggle from "../shared/ThemeToggle.jsx";
import { fetchEmployees, normalizeEmployees } from "../../api/employees.js";
import {
  addKpiDefinition,
  deleteKpiDefinition,
  fetchKpiDefinitions,
  normalizeKpiDefinition,
  normalizeKpiDefinitions,
  updateKpiDefinition
} from "../../api/kpi-definitions.js";
import {
  closeSubmissionWindowForEmployeeNow,
  fetchEmployeeSubmissionWindowStatus,
  fetchSubmissionWindowCurrent,
  openSubmissionWindowForEmployeeNow,
} from "../../api/submission-window.js";
import {
  addCertification,
  deleteCertification,
  fetchCertifications,
  normalizeCertifications,
  updateCertification
} from "../../api/certifications.js";
import { fetchPortalAdmin } from "../../api/portal.js";
import { normalizeCursorPage } from "../../api/employee-portal.js";
import {
  fetchValues,
  addValue,
  updateValue,
  deleteValue as deleteValueApi,
  normalizeWebknotValuesList,
} from "../../api/webknotValueApi.js";
import { fetchEmployeePortalWebknotValues, normalizeWebknotValues } from "../../api/employee-portal.js";
import { fetchBands, fetchStreams, normalizeDirectoryPage } from "../../api/band-stream-directory.js";
import {
  fetchAdminAllSubmissions,
  formatYearMonth,
  normalizeMonthlySubmission,
} from "../../api/monthly-submissions.js";
import { getCycleForMonth, normalizeYearMonth } from "../../utils/reviewCycles.js";
import {
  fetchAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  normalizeAdminNotificationPage,
  subscribeAdminNotificationsStream,
} from "../../api/notifications.js";

const DIRECTORY_PAGE_SIZE = 10;
const KPI_PAGE_SIZE_OPTIONS = [10, 20, 50];
const KPI_FIRST_CURSOR = null;
const KPI_BULK_PAGE_SIZE = 250;
const ADMIN_NOTIFICATION_PAGE_SIZE = 25;
const ADMIN_NOTIFICATION_POLL_MS = 30_000;
const ADMIN_SIDEBAR_PREF_KEY = "rt_tracking_admin_sidebar_open_v1";
const Sidebar = ({ isOpen, setIsOpen, activeTab, setActiveTab, onLogout, account }) => {
  const isAdmin = String(account?.role || "").trim().toLowerCase() === "admin";
  const navItems = [
    { id: "dashboard", icon: <LayoutDashboard size={20} />, label: "Overview" },
    { id: "submissions", icon: <ClipboardCheck size={20} />, label: "Monthly Submissions" },
    { id: "directory", icon: <Users size={20} />, label: "Employee Directory" },
    { id: "kpi", icon: <Target size={20} />, label: "KPI Directory" },
    { id: "band-streams", icon: <Layers3 size={20} />, label: "Bands & Streams" },
    { id: "certifications", icon: <Award size={20} />, label: "Certifications" },
    { id: "values", icon: <Sparkles size={20} />, label: "Webknot Values" },
    { id: "csv-import", icon: <FileUp size={20} />, label: "CSV Import" },
    ...(isAdmin ? [{ id: "agents", icon: <Bot size={20} />, label: "AI Agents" }] : []),
    { id: "settings", icon: <Settings size={20} />, label: "Settings" },
  ];

  return (
    <aside className={`rt-sidebar fixed left-0 top-0 h-full transition-all duration-300 z-50 md:translate-x-0 flex flex-col ${isOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0 md:w-[72px]'}`}>
      <div className="px-5 py-5 flex items-center justify-between">
        {isOpen && (
          <div className="flex items-center gap-2.5">
            <img
              src="/unnamed.webp"
              alt="Webknot Technologies logo"
              className="h-8 w-8 rounded-md object-cover bg-white"
            />
            <span className="font-semibold tracking-tight text-[rgb(var(--sidebar-text))] text-sm">Webknot</span>
          </div>
        )}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-1.5 hover:bg-[rgb(var(--sidebar-hover))] rounded-md text-[rgb(var(--sidebar-muted))] transition-colors"
          aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {isOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>

      <nav className="mt-2 px-3 space-y-0.5 flex-1 overflow-y-auto pb-4">
        {navItems.map((item) => {
          const isActive = activeTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={[
                'rt-sidebar-nav-item',
                isOpen ? '' : 'justify-center px-0',
                isActive ? 'rt-sidebar-nav-item--active' : '',
              ].join(' ')}
              title={!isOpen ? item.label : undefined}
            >
              <span className="w-5 grid place-items-center shrink-0">
                {item.icon}
              </span>
              {isOpen && (
                <span className="truncate">
                  {item.label}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto w-full px-3 pb-4 space-y-2 border-t border-[rgb(var(--sidebar-border))] pt-3">
        <div
          className={[
            "rounded-md bg-[rgb(var(--sidebar-hover))] p-2.5",
            isOpen ? "" : "hidden",
          ].join(" ")}
        >
          <div className="font-medium text-sm text-[rgb(var(--sidebar-text))] truncate">
            {account?.name || account?.email || "Unknown"}
          </div>
          <div className="mt-0.5 text-[11px] font-medium text-[rgb(var(--sidebar-muted))] truncate">
            {account?.role || "Employee"}
          </div>
          <div className="mt-0.5 text-xs text-[rgb(var(--sidebar-muted))] truncate">
            {account?.subtitle || "—"}
          </div>
        </div>

        {!isOpen ? (
          <div className="grid place-items-center text-[rgb(var(--sidebar-muted))]">
            <div
              className="h-10 w-10 rounded-md bg-[rgb(var(--sidebar-hover))] grid place-items-center"
              title={[
                account?.name || account?.email || "Unknown",
                account?.role || "Employee",
                account?.subtitle || "",
                account?.role || "Employee",
              ].filter(Boolean).join(" • ")}
            >
              <Users size={18} />
            </div>
          </div>
        ) : null}

        {isOpen ? (
          <ThemeToggle />
        ) : (
          <div className="grid place-items-center">
            <ThemeToggle compact />
          </div>
        )}

        <button
          onClick={onLogout}
          className={[
            'w-full rounded-md transition-all font-bold group',
            isOpen ? 'flex items-center justify-start gap-4 p-3' : 'flex items-center justify-center p-3',
            'hover:bg-red-500/10',
          ].join(' ')}
          title={!isOpen ? "Logout" : undefined}
        >
          <span className="w-6 grid place-items-center shrink-0">
            <LogOut size={20} className="group-hover:translate-x-1 transition-transform" />
          </span>
          {isOpen && <span className="text-sm">Logout</span>}
        </button>
      </div>
    </aside>
  );
};
function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0')
  const yyyy = date.getFullYear()
  const mm = pad(date.getMonth() + 1)
  const dd = pad(date.getDate())
  const hh = pad(date.getHours())
  const min = pad(date.getMinutes())
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

function parseLocalInputValue(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isPortalWindowOpenNow(portalWindow, now = new Date()) {
  if (portalWindow?.manualClosed) return false;
  const start = parseLocalInputValue(portalWindow?.start);
  if (!start) return false;

  const endRaw = String(portalWindow?.end ?? "").trim();
  const end = endRaw ? parseLocalInputValue(endRaw) : null;
  if (endRaw && !end) return false;

  if (now < start) return false;
  if (!end) return true;
  return now <= end;
}

function downloadTextFile({ filename, text, mime = "text/plain" }) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const EMPLOYEE_EXTRAS_STORAGE_KEY = "rt_tracking_employee_extras_v1";
const CERTIFICATION_CATALOG_STORAGE_KEY = "rt_tracking_certification_catalog_v1";

function defaultPortalWindow() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(18, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setHours(18, 0, 0, 0);
  return {
    start: toLocalInputValue(start),
    end: toLocalInputValue(end),
    meta: { lastAction: "default", updatedAt: Date.now() },
  };
}

function portalWindowFromServer(data) {
  const obj = data && typeof data === "object" ? data : {};
  const startAt = obj.startAt ? new Date(obj.startAt) : null;
  const endAt = obj.endAt ? new Date(obj.endAt) : null;
  return {
    start: startAt && !Number.isNaN(startAt.getTime()) ? toLocalInputValue(startAt) : "",
    end: endAt && !Number.isNaN(endAt.getTime()) ? toLocalInputValue(endAt) : "",
    manualClosed: Boolean(obj.manualClosed),
    cycleKey: typeof obj.cycleKey === "string" ? obj.cycleKey : null,
    meta: { lastAction: "server", updatedAt: Date.now() },
  };
}

function loadEmployeeExtras() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(EMPLOYEE_EXTRAS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveEmployeeExtras(next) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EMPLOYEE_EXTRAS_STORAGE_KEY, JSON.stringify(next));
  } catch { void 0; }
}

function loadCertificationCatalogFromStorage() {
  if (typeof window === "undefined") return { items: [], hasStored: false };
  try {
    const raw = window.localStorage.getItem(CERTIFICATION_CATALOG_STORAGE_KEY);
    if (raw == null) return { items: [], hasStored: false };
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : [];
    return { items: normalizeCertificationCatalog(items), hasStored: true };
  } catch {
    return { items: [], hasStored: false };
  }
}

function saveCertificationCatalogToStorage(items) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CERTIFICATION_CATALOG_STORAGE_KEY,
      JSON.stringify(normalizeCertificationCatalog(items))
    );
  } catch { void 0; }
}

function hashFNV1a32(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function makeCertificationId(name) {
  const key = String(name ?? "").trim().toLowerCase();
  const h = hashFNV1a32(key).toString(36);
  return `CERT_${h}`;
}

function extractCertificationCatalogName(raw) {
  if (typeof raw === "string") return raw.trim();
  if (!raw || typeof raw !== "object") return "";

  const direct = String(raw.name ?? raw.certificationName ?? raw.title ?? "").trim();
  if (direct) return direct;

  if (raw.certification && typeof raw.certification === "object") {
    const nested = String(
      raw.certification.name ?? raw.certification.certificationName ?? raw.certification.title ?? ""
    ).trim();
    if (nested) return nested;
  }

  if (typeof raw.certification === "string") {
    const nestedText = raw.certification.trim();
    if (nestedText) return nestedText;
  }

  return "";
}

function normalizeCertificationCatalog(items) {
  const list = Array.isArray(items) ? items : [];
  const out = [];
  const seenByName = new Set();
  const seenById = new Set();

  for (const raw of list) {
    const name = extractCertificationCatalogName(raw);
    if (!name) continue;
    const nameKey = name.toLowerCase();
    if (seenByName.has(nameKey)) continue;
    seenByName.add(nameKey);

    const idRaw = String(raw?.id ?? "").trim();
    const id = idRaw || makeCertificationId(name);
    if (seenById.has(id)) continue;
    seenById.add(id);

    const listed = raw && typeof raw === "object" ? Boolean(raw.listed ?? true) : true;
    const createdAt =
      raw && typeof raw === "object" && Number.isFinite(raw.createdAt)
        ? raw.createdAt
        : Date.now();

    out.push({ id, name, listed, createdAt });
  }

  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

function applyEmployeeExtras(employees, extras) {
  return employees.map((e) => {
    const x = extras?.[e.id];
    if (!x || typeof x !== "object") return e;

    const recognitions =
      typeof x.recognitions === "number" && Number.isFinite(x.recognitions)
        ? x.recognitions
        : e.recognitions ?? 0;
    const certifications = Array.isArray(x.certifications) ? x.certifications : e.certifications ?? [];
    const submissionWindowForceOpen = Boolean(x.submissionWindowForceOpen);
    const submissionWindowForceClosed = Boolean(x.submissionWindowForceClosed);

    return { ...e, recognitions, certifications, submissionWindowForceOpen, submissionWindowForceClosed };
  });
}

function getCanonicalValueId(v) {
  const id = String(
    v?.id ??
    v?.valueId ??
    v?.webknotValueId ??
    v?.raw?.id ??
    v?.raw?.valueId ??
    v?.raw?.webknotValueId ??
    ""
  ).trim();
  return id || null;
}

function buildLastMonths(count = 6) {
  const n = Number.isFinite(count) ? Math.max(1, count) : 6;
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = formatYearMonth(d);
    const label = new Intl.DateTimeFormat(undefined, { month: "short" }).format(d);
    out.push({ key, label });
  }
  return out;
}

function computeSubmissionAbilityScore(submission) {
  const data = submission && typeof submission === "object" ? submission : null;
  if (!data) return null;

  const source = data?.raw && typeof data.raw === "object" ? data.raw : data;
  const payload = source?.payload && typeof source.payload === "object" ? source.payload : source;
  const submissionType = String(data?.submissionType ?? payload?.submissionType ?? source?.submissionType ?? "").trim().toUpperCase();
  const managerEval =
    (data?.managerEvaluation && typeof data.managerEvaluation === "object" ? data.managerEvaluation : null) ??
    (payload?.managerEvaluation && typeof payload.managerEvaluation === "object" ? payload.managerEvaluation : null) ??
    (source?.managerEvaluation && typeof source.managerEvaluation === "object" ? source.managerEvaluation : null);
  const isSelfReview = submissionType === "MANAGER_SELF_REVIEW";

  const toNumbers = (obj) => {
    if (!obj || typeof obj !== "object") return [];
    if (Array.isArray(obj)) {
      return obj
        .map((item) => {
          const v = item?.rating ?? item?.valueRating ?? item?.score ?? item?.value;
          const parsed = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
          return Number.isFinite(parsed) ? parsed : null;
        })
        .filter((v) => typeof v === "number" && v >= 1 && v <= 5);
    }
    return Object.values(obj)
      .map((v) => (typeof v === "number" ? v : Number.parseFloat(String(v ?? ""))))
      .filter((v) => Number.isFinite(v) && v >= 1 && v <= 5);
  };

  /* Priority: manager evaluation → employee self-ratings → null */
  const hasManager = managerEval && (
    (managerEval.kpiRatings && Object.keys(managerEval.kpiRatings).length) ||
    (managerEval.webknotValueRatings && Object.keys(managerEval.webknotValueRatings).length) ||
    (managerEval.webknotValues && Object.keys(managerEval.webknotValues).length)
  );

  let kpis, values;
  if (!isSelfReview && hasManager) {
    /* Use manager ratings when available */
    kpis = managerEval?.kpiRatings ?? null;
    values = managerEval?.webknotValueRatings ?? managerEval?.webknotValues ?? null;
  } else {
    /* Fall back to employee self-ratings (or self-review) */
    kpis = data?.kpiRatings && typeof data.kpiRatings === "object"
      ? data.kpiRatings
      : payload?.kpiRatings;
    values = data?.webknotValueRatings && typeof data.webknotValueRatings === "object"
      ? data.webknotValueRatings
      : (data?.webknotValues && typeof data.webknotValues === "object"
        ? data.webknotValues
        : payload?.webknotValueRatings ?? payload?.webknotValues);
  }

  const numbers = [...toNumbers(kpis), ...toNumbers(values)];
  if (!numbers.length) return null;
  const avg = numbers.reduce((sum, v) => sum + v, 0) / numbers.length;
  return Math.round(avg * 10) / 10;
}

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

  (Array.isArray(incoming) ? incoming : []).forEach(pushUnique);
  (Array.isArray(existing) ? existing : []).forEach(pushUnique);
  return next.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
  /* ── Path-based routing: sync activeTab ↔ URL path ── */
  const VALID_TABS = useMemo(() => new Set([
    "dashboard", "submissions", "directory", "kpi", "band-streams",
    "certifications", "values", "csv-import", "agents", "settings",
  ]), []);

  const getTabFromPath = useCallback(() => {
    const raw = window.location.pathname.replace(/^\//, "").split("/")[0];
    return VALID_TABS.has(raw) ? raw : "dashboard";
  }, [VALID_TABS]);

  const [activeTab, setActiveTabRaw] = useState(() => getTabFromPath());

  const setActiveTab = useCallback((tab) => {
    setActiveTabRaw(tab);
    const path = tab === "dashboard" ? "/" : `/${tab}`;
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
  const isAdmin = String(auth?.role || auth?.claims?.role || "").trim().toLowerCase() === "admin";
  const currentCycleLabel = useMemo(() => {
    const c = getCycleForMonth(new Date());
    return c?.label || "—";
  }, []);
  const [showKPIModal, setShowKPIModal] = useState(false);
  const [kpiModalMode, setKpiModalMode] = useState("add"); // "add" | "edit"
  const [searchQuery, setSearchQuery] = useState("");
  const [kpis, setKpis] = useState([]);
  const [allKpis, setAllKpis] = useState([]);
  const [allKpisLoading, setAllKpisLoading] = useState(false);
  const [allKpisError, setAllKpisError] = useState("");
  const [kpisLoading, setKpisLoading] = useState(false);
  const [kpisError, setKpisError] = useState("");
  const [, setKpisCursor] = useState(KPI_FIRST_CURSOR);
  const [kpisNextCursor, setKpisNextCursor] = useState(null);
  const [kpisCursorStack, setKpisCursorStack] = useState([]);
  const [kpiPageSize, setKpiPageSize] = useState(DIRECTORY_PAGE_SIZE);
  const kpisCursorRef = useRef(KPI_FIRST_CURSOR);
  const [kpiDraft, setKpiDraft] = useState({ title: "", stream: "", band: "", weight: "" });
  const [editingKpiId, setEditingKpiId] = useState(null);
  const [kpiSaving, setKpiSaving] = useState(false);
  const [pendingDeleteKpi, setPendingDeleteKpi] = useState(null);
  const [directoryBands, setDirectoryBands] = useState([]);
  const [directoryStreams, setDirectoryStreams] = useState([]);
  const [valuesSearchQuery, setValuesSearchQuery] = useState("");
  const [values, setValues] = useState([]);
  const [valuesLoading, setValuesLoading] = useState(false);
  const [valuesError, setValuesError] = useState("");
  const [, setValuesCursor] = useState(null);
  const [valuesNextCursor, setValuesNextCursor] = useState(null);
  const [valuesCursorStack, setValuesCursorStack] = useState([]);
  const valuesCursorRef = useRef(null);
  const [showValueModal, setShowValueModal] = useState(false);
  const [valueModalMode, setValueModalMode] = useState("add"); // "add" | "edit"
  const [editingValueId, setEditingValueId] = useState(null);
  const [valueDraft, setValueDraft] = useState({ title: "", pillar: "" });
  const [valueSaving, setValueSaving] = useState(false);
  const [pendingDeleteValue, setPendingDeleteValue] = useState(null);
  const [certificationCatalog, setCertificationCatalog] = useState(() => {
    const { items } = loadCertificationCatalogFromStorage();
    return Array.isArray(items) ? items : [];
  });
  const [certificationsLoading, setCertificationsLoading] = useState(false);
  const [certificationsError, setCertificationsError] = useState("");
  const [, setCertificationsCursor] = useState(null);
  const [certificationsNextCursor, setCertificationsNextCursor] = useState(null);
  const [certificationsCursorStack, setCertificationsCursorStack] = useState([]);
  const certificationsCursorRef = useRef(null);

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [notificationsNextCursor, setNotificationsNextCursor] = useState(null);
  const notificationsPanelRef = useRef(null);
  const notificationsLoadedRef = useRef(false);
  const notifiedEventKeysRef = useRef(new Set());

  const [toast, setToast] = useState(null); // { title: string, message?: string }
  const toastTimerRef = useRef(null);

  const showToast = useCallback((nextToast) => {
    setToast(nextToast);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => { if (notificationsError) showToast({ title: "Notifications Error", message: notificationsError, tone: "error" }); }, [notificationsError, showToast]);
  useEffect(() => { if (certificationsError) showToast({ title: "Certifications Error", message: certificationsError, tone: "error" }); }, [certificationsError, showToast]);
  useEffect(() => { if (valuesError) showToast({ title: "Values Error", message: valuesError, tone: "error" }); }, [valuesError, showToast]);
  useEffect(() => { if (kpisError) showToast({ title: "KPIs Error", message: kpisError, tone: "error" }); }, [kpisError, showToast]);
  useEffect(() => { if (allKpisError) showToast({ title: "All KPIs Error", message: allKpisError, tone: "error" }); }, [allKpisError, showToast]);

  const unreadNotificationsCount = useMemo(
    () => notifications.reduce((count, item) => (item?.read ? count : count + 1), 0),
    [notifications]
  );

  const reloadNotifications = useCallback(async ({
    signal,
    cursor = null,
    append = false,
    silent = false,
    types = null,
  } = {}) => {
    if (!silent || !notificationsLoadedRef.current) {
      setNotificationsLoading(true);
    }
    setNotificationsError("");
    try {
      const data = await fetchAdminNotifications({
        limit: ADMIN_NOTIFICATION_PAGE_SIZE,
        cursor,
        unreadOnly: false,
        signal,
        types,
      });
      const page = normalizeAdminNotificationPage(data);
      setNotifications((prev) => {
        const prevById = new Map(prev.map((n) => [String(n.id), n]));
        const merged = append ? mergeNotifications(prev, page.items) : page.items;
        return merged.map((item) => {
          const previous = prevById.get(String(item.id));
          return previous?.read ? { ...item, read: true } : item;
        });
      });
      setNotificationsNextCursor(page.nextCursor);
      notificationsLoadedRef.current = true;
      return page;
    } catch (err) {
      if (err?.name === "AbortError") return null;
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
        return null;
      }
      setNotificationsError(err?.message || "Failed to load notifications.");
      return null;
    } finally {
      setNotificationsLoading(false);
    }
  }, [onLogout, showToast]);

  const pushIncomingNotification = useCallback((incoming) => {
    if (!incoming) return;
    const eventKey = String(incoming?.id ?? `${incoming?.type}:${incoming?.createdAt}:${incoming?.message ?? incoming?.title ?? ""}`);
    setNotifications((prev) => mergeNotifications(prev, [incoming]).slice(0, ADMIN_NOTIFICATION_PAGE_SIZE * 3));
    if (notifiedEventKeysRef.current.has(eventKey)) return;
    notifiedEventKeysRef.current.add(eventKey);
    if (notifiedEventKeysRef.current.size > 500) {
      notifiedEventKeysRef.current = new Set(Array.from(notifiedEventKeysRef.current).slice(-250));
    }
    showToast({
      title: incoming.title || "Admin notification",
      message: incoming.message || "",
    });
  }, [showToast]);

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

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      try {
        await fetchPortalAdmin({ signal: controller.signal });
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!mounted) return;
        if (err?.status === 401) onLogout?.();
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [onLogout]);

  useEffect(() => {
    const controller = new AbortController();
    reloadNotifications({ signal: controller.signal }).catch(() => {});

    const timer = window.setInterval(() => {
      reloadNotifications({ silent: true }).catch(() => {});
    }, ADMIN_NOTIFICATION_POLL_MS);

    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [reloadNotifications]);

  useEffect(() => {
    const unsubscribe = subscribeAdminNotificationsStream({
      onNotification: (item) => {
        pushIncomingNotification(item);
      },
      onError: () => {
        reloadNotifications({ silent: true }).catch(() => {});
      },
    });
    return () => unsubscribe?.();
  }, [pushIncomingNotification, reloadNotifications]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const onPointerDown = (event) => {
      const target = event?.target;
      if (!notificationsPanelRef.current || !target) return;
      if (!notificationsPanelRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [notificationsOpen]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    async function loadDirectory(fetcher) {
      const rows = [];
      let cursor = null;
      for (let i = 0; i < 20; i += 1) {
        const data = await fetcher({ limit: 100, cursor, signal: controller.signal });
        const page = normalizeDirectoryPage(data);
        rows.push(...page.items);
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }
      return rows;
    }
    (async () => {
      try {
        const [bands, streams] = await Promise.all([
          loadDirectory(fetchBands),
          loadDirectory(fetchStreams),
        ]);
        if (!mounted) return;
        setDirectoryBands(bands);
        setDirectoryStreams(streams);
      } catch {
        if (!mounted) return;
        setDirectoryBands([]);
        setDirectoryStreams([]);
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  const reloadCertifications = useCallback(async ({ signal, cursor, pageAction = "stay" } = {}) => {
    const resolvedCursor = cursor === undefined ? (certificationsCursorRef.current ?? null) : (cursor ?? null);
    const previousCursor = certificationsCursorRef.current ?? null;
    setCertificationsError("");
    setCertificationsLoading(true);
    try {
      const data = await fetchCertifications({
        activeOnly: false,
        limit: DIRECTORY_PAGE_SIZE,
        cursor: resolvedCursor,
        signal,
      });
      const page = normalizeCursorPage(data);
      setCertificationCatalog(normalizeCertifications(page.items));
      setCertificationsNextCursor(page.nextCursor);
      setCertificationsCursor(resolvedCursor);
      certificationsCursorRef.current = resolvedCursor;
      setCertificationsCursorStack((prev) => {
        if (pageAction === "next") return [...prev, previousCursor];
        if (pageAction === "prev") return prev.slice(0, -1);
        if (pageAction === "reset") return [];
        return prev;
      });
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
        return;
      }
      setCertificationsError(err?.message || "Failed to load certifications.");
      throw err;
    } finally {
      setCertificationsLoading(false);
    }
  }, [onLogout, showToast]);

  useEffect(() => {
    const controller = new AbortController();
    reloadCertifications({ signal: controller.signal, cursor: null, pageAction: "reset" }).catch(() => {});
    return () => controller.abort();
  }, [reloadCertifications]);

  function openKpiModal() {
    const defaultBand = kpiBandOptions[0] || "";
    const defaultStream = kpiStreamOptions[0] || "";
    setKpiModalMode("add");
    setEditingKpiId(null);
    setKpiDraft({ title: "", stream: defaultStream, band: defaultBand, weight: "" });
    setShowKPIModal(true);
  }

  function openEditKpiModal(kpi) {
    if (!kpi) return;
    setKpiModalMode("edit");
    setEditingKpiId(kpi.id);
    setKpiDraft({
      title: String(kpi.title ?? ""),
      stream: String(kpi.stream ?? ""),
      band: String(kpi.band ?? ""),
      weight: String(kpi.weight ?? ""),
    });
    setShowKPIModal(true);
  }

  function closeKpiModal() {
    if (kpiSaving) return;
    setShowKPIModal(false);
  }

  function requestDeleteKpi(kpi) {
    if (!kpi) return;
    setPendingDeleteKpi(kpi);
  }

  function openValueModal() {
    setValueModalMode("add");
    setEditingValueId(null);
    setValueDraft({ title: "", pillar: "" });
    setShowValueModal(true);
  }

  function openEditValueModal(v) {
    if (!v) return;
    const canonicalId = getCanonicalValueId(v);
    if (!canonicalId) {
      showToast({ title: "Edit unavailable", message: "This value has no editable id." });
      return;
    }
    setValueModalMode("edit");
    setEditingValueId(canonicalId);
    setValueDraft({
      title: String(v.title ?? ""),
      pillar: String(v.pillar ?? ""),
    });
    setShowValueModal(true);
  }

  function closeValueModal() {
    if (valueSaving) return;
    setShowValueModal(false);
  }

  async function submitValue(e) {
    e.preventDefault();
    const payload = {
      title: valueDraft.title.trim(),
      pillar: valueDraft.pillar.trim(),
    };

    if (!payload.title || !payload.pillar) {
      showToast({ title: "Missing fields", message: "Fill value and evaluation criteria." });
      return;
    }

    setValueSaving(true);
    try {
      let res;
      if (valueModalMode === "edit") {
        if (!String(editingValueId ?? "").trim()) {
          throw new Error("Missing value id for edit.");
        }
        res = await updateValue(String(editingValueId), payload);
      } else {
        res = await addValue(payload);
      }

      const normalized = res && typeof res === "object" ? res : payload;
      const rawId =
        valueModalMode === "edit"
          ? (editingValueId ?? normalized?.id ?? normalized?.valueId)
          : (normalized?.id ?? normalized?.valueId);
      const id = String(rawId ?? editingValueId ?? payload.title ?? Date.now()).trim();
      const next = {
        id,
        title: normalized?.title ?? payload.title,
        pillar: normalized?.pillar ?? payload.pillar,
      };

      setValues((prev) => {
        const idx = prev.findIndex((x) => String(x.id) === String(id));
        if (idx === -1) return [next, ...prev];
        return prev.map((x) => (String(x.id) === String(id) ? next : x));
      });
      
      showToast({ title: valueModalMode === "edit" ? "Value updated" : "Value added", message: next.title });
      setShowValueModal(false);
      
      await reloadValues().catch(() => {});
    } catch (err) {
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
        return;
      }
      showToast({
        title: valueModalMode === "edit" ? "Update failed" : "Add failed",
        message: err?.message || "Please try again.",
      });
    } finally {
      setValueSaving(false);
    }
  }

  const kpiBandOptions = useMemo(() => {
    const kpiUniverse = allKpis.length ? allKpis : kpis;
    const fromDirectory = directoryBands
      .filter((row) => Boolean(row?.active))
      .map((row) => String(row?.code || "").trim())
      .filter(Boolean);
    const fromKpis = kpiUniverse.map((k) => String(k?.band || "").trim()).filter(Boolean);
    const fallback = ["B1", "B2", "B3", "B4", "B5", "B5H", "B5L", "B6H", "B6L", "B7H", "B7L", "B8"];
    return Array.from(new Set([...fromDirectory, ...fromKpis, ...fallback]));
  }, [allKpis, directoryBands, kpis]);

  const kpiStreamOptions = useMemo(() => {
    const kpiUniverse = allKpis.length ? allKpis : kpis;
    const fromDirectory = directoryStreams
      .filter((row) => Boolean(row?.active))
      .map((row) => String(row?.code || "").trim())
      .filter(Boolean);
    const fromKpis = kpiUniverse.map((k) => String(k?.stream || "").trim()).filter(Boolean);
    const fallback = ["Development", "QA", "Devops", "DATA", "UI_UX"];
    return Array.from(new Set([...fromDirectory, ...fromKpis, ...fallback]));
  }, [allKpis, directoryStreams, kpis]);

  function deleteValue(v) {
    if (!v) return;
    setPendingDeleteValue(v);
  }

  async function confirmDeleteValue() {
    const v = pendingDeleteValue;
    if (!v) return;
    setPendingDeleteValue(null);
    try {
      await deleteValueApi(String(v.id));
      setValues((prev) => prev.filter((x) => String(x.id) !== String(v.id)));
      showToast({ title: "Value deleted", message: v.title });
      await reloadValues().catch(() => {});
    } catch (err) {
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
        return;
      }
      showToast({ title: "Delete failed", message: err?.message || "Please try again." });
    }
  }

  async function confirmDeleteKpi() {
    const kpi = pendingDeleteKpi;
    if (!kpi) return;
    setPendingDeleteKpi(null);
    try {
      await deleteKpiDefinition(String(kpi.id));
      setKpis((prev) => prev.filter((x) => String(x.id) !== String(kpi.id)));
      setAllKpis((prev) => prev.filter((x) => String(x.id) !== String(kpi.id)));
      showToast({ title: "KPI deleted", message: kpi.title });
      await reloadKpis().catch(() => {});
      await reloadAllKpis().catch(() => {});
    } catch (err) {
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
        return;
      }
      showToast({ title: "Delete KPI failed", message: err?.message || "Please try again." });
    }
  }

  async function submitKpi(e) {
    e.preventDefault();
    const payload = {
      id: editingKpiId,
      title: kpiDraft.title.trim(),
      stream: kpiDraft.stream.trim(),
      band: kpiDraft.band.trim(),
      weight: kpiDraft.weight.trim(),
    };

    if (!payload.title || !payload.stream || !payload.band || !payload.weight) {
      showToast({ title: "Missing fields", message: "Fill title, stream, band, and weight." });
      return;
    }

    const toPercent = (value) => {
      const text = String(value ?? "").trim();
      if (!text) return 0;
      const numericText = text.endsWith("%") ? text.slice(0, -1).trim() : text;
      const parsed = Number.parseFloat(numericText);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const nextBand = payload.band;
    const nextStream = payload.stream;
    const nextWeight = toPercent(payload.weight);
    const kpiUniverse = allKpis.length ? allKpis : kpis;
    const existingSum = kpiUniverse
      .filter((k) => String(k?.band ?? "").trim() === nextBand)
      .filter((k) => String(k?.stream ?? "").trim() === nextStream)
      .filter((k) => String(k?.id) !== String(payload.id))
      .reduce((sum, k) => sum + toPercent(k?.weight), 0);
    const nextTotal = Math.round((existingSum + nextWeight) * 10) / 10;
    if (nextTotal > 100) {
      showToast({
        title: "Invalid weightage",
        message: `Total for ${nextBand} • ${nextStream} would be ${nextTotal}%. Keep it within 100%.`,
      });
      return;
    }

    setKpiSaving(true);
    try {
      const res =
        kpiModalMode === "edit"
          ? await updateKpiDefinition(payload)
          : await addKpiDefinition(payload);
      const normalized = normalizeKpiDefinition(res, payload);

      setKpis((prev) => {
        const idx = prev.findIndex((k) => String(k.id) === String(normalized.id));
        if (idx === -1) return [normalized, ...prev];
        return prev.map((k) => (String(k.id) === String(normalized.id) ? normalized : k));
      });

      setAllKpis((prev) => {
        const idx = prev.findIndex((k) => String(k.id) === String(normalized.id));
        if (idx === -1) return [normalized, ...prev];
        return prev.map((k) => (String(k.id) === String(normalized.id) ? normalized : k));
      });

      showToast({
        title: kpiModalMode === "edit" ? "KPI updated" : "KPI added",
        message: normalized.title,
      });
      setShowKPIModal(false);
      await reloadKpis().catch(() => {});
      await reloadAllKpis().catch(() => {});
    } catch (err) {
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
        return;
      }
      showToast({
        title: kpiModalMode === "edit" ? "Update KPI failed" : "Add KPI failed",
        message: err?.message || "Please try again.",
      });
    } finally {
      setKpiSaving(false);
    }
  }

  const reloadAllKpis = useCallback(async ({ signal } = {}) => {
    setAllKpisError("");
    setAllKpisLoading(true);
    try {
      const collected = [];
      const seen = new Set();
      let cursor = KPI_FIRST_CURSOR;

      while (true) {
        const data = await fetchKpiDefinitions({ limit: KPI_BULK_PAGE_SIZE, cursor, signal });
        const page = normalizeCursorPage(data);
        const normalized = normalizeKpiDefinitions(page.items);
        for (const item of normalized) {
          const key = String(item?.id ?? `${item?.title ?? ""}:${item?.band ?? ""}:${item?.stream ?? ""}`);
          if (seen.has(key)) continue;
          seen.add(key);
          collected.push(item);
        }
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }

      setAllKpis(collected);
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
        return;
      }
      const message = err?.message || "Failed to load all KPIs.";
      setAllKpisError(message);
    } finally {
      setAllKpisLoading(false);
    }
  }, [onLogout, showToast]);

  const reloadKpis = useCallback(async ({ signal, cursor, pageAction = "stay" } = {}) => {
    const resolvedCursorRaw = cursor === undefined ? kpisCursorRef.current : cursor;
    const resolvedCursor = String(resolvedCursorRaw ?? "").trim() || KPI_FIRST_CURSOR;
    const previousCursor = String(kpisCursorRef.current ?? "").trim() || KPI_FIRST_CURSOR;
    setKpisError("");
    setKpisLoading(true);
    try {
      const data = await fetchKpiDefinitions({ limit: kpiPageSize, cursor: resolvedCursor, signal });
      const page = normalizeCursorPage(data);
      setKpis(normalizeKpiDefinitions(page.items));
      setKpisNextCursor(page.nextCursor);
      setKpisCursor(resolvedCursor);
      kpisCursorRef.current = resolvedCursor;
      setKpisCursorStack((prev) => {
        if (pageAction === "next") return [...prev, previousCursor];
        if (pageAction === "prev") return prev.slice(0, -1);
        if (pageAction === "reset") return [];
        return prev;
      });
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
        return;
      }
      const message = err?.message || "Failed to load KPIs.";
      setKpisError(message);
      throw err;
    } finally {
      setKpisLoading(false);
    }
  }, [kpiPageSize, onLogout, showToast]);

  const reloadValues = useCallback(async ({ signal, cursor, pageAction = "stay" } = {}) => {
    const resolvedCursor = cursor === undefined ? (valuesCursorRef.current ?? null) : (cursor ?? null);
    const previousCursor = valuesCursorRef.current ?? null;
    setValuesError("");
    setValuesLoading(true);
    try {
      const primary = await fetchValues(false, { limit: DIRECTORY_PAGE_SIZE, cursor: resolvedCursor, signal });
      const primaryPage = normalizeCursorPage(primary);
      let normalized = normalizeWebknotValuesList(primaryPage.items);
      let nextCursor = primaryPage.nextCursor;

      if (!normalized.length) {
        const fallback = [];
        let portalCursor = null;
        for (let i = 0; i < 50; i += 1) {
          const portalRaw = await fetchEmployeePortalWebknotValues({ limit: DIRECTORY_PAGE_SIZE, cursor: portalCursor, signal });
          const portalPage = normalizeCursorPage(portalRaw);
          fallback.push(...normalizeWebknotValues(portalPage.items));
          if (!portalPage.nextCursor) break;
          portalCursor = portalPage.nextCursor;
        }
        normalized = fallback;
        nextCursor = null;
      }

      const sorted = normalized.sort((a, b) => String(a?.title || "").localeCompare(String(b?.title || ""), undefined, { numeric: true }));
      setValues(sorted);
      setValuesNextCursor(nextCursor);
      setValuesCursor(resolvedCursor);
      valuesCursorRef.current = resolvedCursor;
      setValuesCursorStack((prev) => {
        if (pageAction === "next") return [...prev, previousCursor];
        if (pageAction === "prev") return prev.slice(0, -1);
        if (pageAction === "reset") return [];
        return prev;
      });
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
        return;
      }
      const message = err?.message || "Failed to load values.";
      setValuesError(message);
      throw err;
    } finally {
      setValuesLoading(false);
    }
  }, [onLogout, showToast]);

  useEffect(() => {
    const controller = new AbortController();
    reloadKpis({ signal: controller.signal, cursor: KPI_FIRST_CURSOR, pageAction: "reset" }).catch(() => {});
    return () => controller.abort();
  }, [reloadKpis]);

  useEffect(() => {
    const controller = new AbortController();
    reloadAllKpis({ signal: controller.signal }).catch(() => {});
    return () => controller.abort();
  }, [reloadAllKpis]);

  useEffect(() => {
    const controller = new AbortController();
    reloadValues({ signal: controller.signal }).catch(() => {});
    return () => controller.abort();
  }, [reloadValues]);

  const handleReloadKpis = useCallback(() => {
    reloadKpis({ pageAction: "stay" }).catch(() => {});
    reloadAllKpis().catch(() => {});
  }, [reloadAllKpis, reloadKpis]);
  const [portalWindow, setPortalWindow] = useState(() => defaultPortalWindow());
  const [portalWindowLoading, setPortalWindowLoading] = useState(false);
  const [portalWindowError, setPortalWindowError] = useState("");

  const reloadPortalWindow = useCallback(async ({ signal } = {}) => {
    setPortalWindowError("");
    setPortalWindowLoading(true);
    try {
      const data = await fetchSubmissionWindowCurrent({ signal });
      setPortalWindow((prev) => {
        const next = portalWindowFromServer(data);
        if (!next.start) return prev;
        return next;
      });
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
        return;
      }
      setPortalWindowError(err?.message || "Failed to load submission window.");
      throw err;
    } finally {
      setPortalWindowLoading(false);
    }
  }, [onLogout, showToast]);

  useEffect(() => {
    const controller = new AbortController();
    reloadPortalWindow({ signal: controller.signal }).catch(() => {});
    return () => controller.abort();
  }, [reloadPortalWindow]);
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeesError, setEmployeesError] = useState("");

  useEffect(() => { if (portalWindowError) showToast({ title: "Portal Window Error", message: portalWindowError, tone: "error" }); }, [portalWindowError, showToast]);
  useEffect(() => { if (employeesError) showToast({ title: "Employees Error", message: employeesError, tone: "error" }); }, [employeesError, showToast]);

  const [, setEmployeesCursor] = useState(null);
  const [employeesNextCursor, setEmployeesNextCursor] = useState(null);
  const [employeesCursorStack, setEmployeesCursorStack] = useState([]);
  const [employeesTotalCount, setEmployeesTotalCount] = useState(null);
  const [employeesDirectoryTotals, setEmployeesDirectoryTotals] = useState({
    managerCount: null,
    adminCount: null,
    employeeCount: null,
    bandCount: null,
  });
  const employeesCursorRef = useRef(null);
  const [submissionExtrasByEmployee, setSubmissionExtrasByEmployee] = useState({});

  const [ability6m, setAbility6m] = useState(() =>
    buildLastMonths(6).map((m) => ({ month: m.label, avg: 0 }))
  );
  const [submissionSummary, setSubmissionSummary] = useState(() => ({
    monthKey: formatYearMonth(new Date()),
    submittedByRole: { employee: 0, manager: 0, admin: 0 },
    submittedIds: [],
    total: 0,
  }));
  const [submissionCycleMap, setSubmissionCycleMap] = useState({});

  useEffect(() => {
    const currentMonthKey = formatYearMonth(new Date());
    if (submissionSummary?.monthKey !== currentMonthKey) return;
    if (!Array.isArray(submissionSummary?.submittedIds)) return;

    const submittedIds = new Set(submissionSummary.submittedIds.map(String));
    if (!submittedIds.size) return;

    setEmployees((prev) => {
      let changed = false;
      const next = prev.map((emp) => {
        if (!submittedIds.has(String(emp.id)) || emp.submitted) return emp;
        changed = true;
        return { ...emp, submitted: true };
      });
      return changed ? next : prev;
    });
  }, [submissionSummary]);

  const commitEmployeesPage = useCallback((page, { cursor, cursorStack }) => {
    const base = normalizeEmployees(page.items);
    const extras = loadEmployeeExtras();

    const currentMonthKey = formatYearMonth(new Date());
    const summaryMatches = submissionSummary?.monthKey === currentMonthKey;
    const submittedIds = summaryMatches && Array.isArray(submissionSummary?.submittedIds)
      ? new Set(submissionSummary.submittedIds.map(String))
      : null;

    const applied = applyEmployeeExtras(base, extras).map((emp) => {
      if (!submittedIds) return emp;
      return submittedIds.has(String(emp.id)) ? { ...emp, submitted: true } : emp;
    });

    setEmployees(applied);
    setEmployeesNextCursor(page.nextCursor);
    const totalRaw = page?.raw?.total;
    const totalNum =
      typeof totalRaw === "number"
        ? totalRaw
        : typeof totalRaw === "string"
          ? Number.parseInt(totalRaw, 10)
          : null;
    const managerRaw = page?.raw?.managerCount;
    const adminRaw = page?.raw?.adminCount;
    const employeeRaw = page?.raw?.employeeCount;
    const bandRaw = page?.raw?.bandCount;
    const managerNum =
      typeof managerRaw === "number"
        ? managerRaw
        : typeof managerRaw === "string"
          ? Number.parseInt(managerRaw, 10)
          : null;
    const adminNum =
      typeof adminRaw === "number"
        ? adminRaw
        : typeof adminRaw === "string"
          ? Number.parseInt(adminRaw, 10)
          : null;
    const employeeNum =
      typeof employeeRaw === "number"
        ? employeeRaw
        : typeof employeeRaw === "string"
          ? Number.parseInt(employeeRaw, 10)
          : null;
    const bandNum =
      typeof bandRaw === "number"
        ? bandRaw
        : typeof bandRaw === "string"
          ? Number.parseInt(bandRaw, 10)
          : null;
    setEmployeesTotalCount((prev) => (
      Number.isFinite(totalNum) ? totalNum : prev
    ));
    setEmployeesDirectoryTotals((prev) => ({
      managerCount: Number.isFinite(managerNum) ? managerNum : prev.managerCount,
      adminCount: Number.isFinite(adminNum) ? adminNum : prev.adminCount,
      employeeCount: Number.isFinite(employeeNum) ? employeeNum : prev.employeeCount,
      bandCount: Number.isFinite(bandNum) ? bandNum : prev.bandCount,
    }));
    setEmployeesCursor(cursor ?? null);
    employeesCursorRef.current = cursor ?? null;
    if (Array.isArray(cursorStack)) setEmployeesCursorStack(cursorStack);
  }, [submissionSummary]);

  const reloadEmployees = useCallback(async ({ signal, cursor, pageAction = "stay", cursorStackOverride = null } = {}) => {
    const resolvedCursor = cursor === undefined ? (employeesCursorRef.current ?? null) : (cursor ?? null);
    const previousCursor = employeesCursorRef.current ?? null;
    setEmployeesError("");
    setEmployeesLoading(true);
    try {
      const data = await fetchEmployees({ limit: DIRECTORY_PAGE_SIZE, cursor: resolvedCursor, signal });
      const page = normalizeCursorPage(data);
      const cursorStack =
        Array.isArray(cursorStackOverride)
          ? cursorStackOverride
          : pageAction === "next"
            ? [...employeesCursorStack, previousCursor]
            : pageAction === "prev"
              ? employeesCursorStack.slice(0, -1)
              : pageAction === "reset"
                ? []
                : employeesCursorStack;
      commitEmployeesPage(page, { cursor: resolvedCursor, cursorStack });
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
        return;
      }
      const message = err?.message || "Failed to load employees.";
      setEmployeesError(message);
      setEmployees([]);
      setEmployeesTotalCount(null);
      setEmployeesDirectoryTotals({
        managerCount: null,
        adminCount: null,
        employeeCount: null,
        bandCount: null,
      });
      throw err;
    } finally {
      setEmployeesLoading(false);
    }
  }, [commitEmployeesPage, employeesCursorStack, onLogout, showToast]);

  const jumpEmployeesToPage = useCallback(async (rawPage) => {
    const parsed = Number.parseInt(String(rawPage ?? "").trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 1) return;

    const currentPage = employeesCursorStack.length + 1;
    if (parsed === currentPage) return;

    if (parsed < currentPage) {
      const targetCursor = parsed <= 1 ? null : (employeesCursorStack[parsed - 1] ?? null);
      const targetStack = parsed <= 1 ? [] : employeesCursorStack.slice(0, parsed - 1);
      await reloadEmployees({
        cursor: targetCursor,
        pageAction: "jump",
        cursorStackOverride: targetStack,
      });
      return;
    }

    setEmployeesError("");
    setEmployeesLoading(true);
    try {
      let workingStack = [...employeesCursorStack];
      let previousCursor = employeesCursorRef.current ?? null;
      let nextCursor = employeesNextCursor;
      let targetPage = null;
      let targetCursor = null;

      for (let pageNo = currentPage + 1; pageNo <= parsed; pageNo += 1) {
        if (!nextCursor) {
          throw new Error(`Page ${parsed} is not available.`);
        }
        const data = await fetchEmployees({ limit: DIRECTORY_PAGE_SIZE, cursor: nextCursor });
        const page = normalizeCursorPage(data);
        workingStack = [...workingStack, previousCursor];
        previousCursor = nextCursor;

        if (pageNo === parsed) {
          targetPage = page;
          targetCursor = previousCursor;
          break;
        }
        nextCursor = page.nextCursor;
      }

      if (!targetPage) throw new Error(`Page ${parsed} is not available.`);
      commitEmployeesPage(targetPage, { cursor: targetCursor, cursorStack: workingStack });
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
        return;
      }
      const message = err?.message || `Failed to navigate to page ${parsed}.`;
      setEmployeesError(message);
      showToast({ title: "Page navigation failed", message });
      throw err;
    } finally {
      setEmployeesLoading(false);
    }
  }, [
    commitEmployeesPage,
    employeesCursorStack,
    employeesNextCursor,
    onLogout,
    reloadEmployees,
    showToast,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    reloadEmployees({ signal: controller.signal }).catch(() => {});
    return () => controller.abort();
  }, [reloadEmployees]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    (async () => {
      try {
        const data = await fetchAdminAllSubmissions({ status: "SUBMITTED", signal: controller.signal });
        if (!mounted) return;

        const rows = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
            ? data.data
            : [];

        const currentMonthKey = formatYearMonth(new Date());
        const submittedIds = new Set();
        const submittedByRole = { employee: 0, manager: 0, admin: 0 };
        const submissionExtras = {};
        const cycleSummaries = new Map();
        const buckets = new Map();
        for (const raw of rows) {
          const normalized = normalizeMonthlySubmission(raw);
          const monthKey = normalizeYearMonth(
            normalized?.month ??
            raw?.month ??
            normalized?.cycleKey ??
            raw?.cycleKey ??
            normalized?.cycleMonth ??
            raw?.cycleMonth
          ) || String(
            normalized?.month ??
            raw?.month ??
            normalized?.cycleKey ??
            raw?.cycleKey ??
            normalized?.cycleMonth ??
            raw?.cycleMonth ??
            ""
          ).trim();
          if (!monthKey) continue;
          const score = computeSubmissionAbilityScore(normalized);
          if (Number.isFinite(score)) {
            const prev = buckets.get(monthKey) || { sum: 0, count: 0 };
            prev.sum += score;
            prev.count += 1;
            buckets.set(monthKey, prev);
          }

          const roleHint = String(
            normalized?.targetRole ??
            normalized?.raw?.targetRole ??
            raw?.targetRole ??
            raw?.payload?.targetRole ??
            raw?.employee?.role ??
            raw?.employee?.empRole ??
            normalized?.raw?.employee?.role ??
            normalized?.raw?.employee?.empRole ??
            ""
          ).trim().toLowerCase();

          let roleKey = "employee";
          if (roleHint.includes("admin")) roleKey = "admin";
          else if (roleHint.includes("manager")) roleKey = "manager";
          else if (normalized?.submissionType === "MANAGER_SELF_REVIEW") roleKey = "manager";

          const subjectId =
            normalized?.subjectEmployeeId ||
            normalized?.raw?.subjectEmployeeId ||
            normalized?.raw?.employeeId ||
            raw?.subjectEmployeeId ||
            raw?.employeeId ||
            raw?.employee?.employeeId;
          if (subjectId) {
            const id = String(subjectId);

            const cycle = cycleSummaries.get(monthKey) || { submittedIds: new Set(), submittedByRole: { employee: 0, manager: 0, admin: 0 } };
            cycle.submittedIds.add(id);
            cycle.submittedByRole[roleKey] = (cycle.submittedByRole[roleKey] || 0) + 1;
            cycleSummaries.set(monthKey, cycle);

            if (monthKey === currentMonthKey) {
              submittedIds.add(id);

              const recRaw = normalized?.recognitionsCount ?? normalized?.raw?.recognitionsCount ?? raw?.recognitionsCount;
              const recognitions = Number(recRaw || 0) || 0;
              const certsList = Array.isArray(normalized?.certifications)
                ? normalized.certifications
                : Array.isArray(normalized?.raw?.certifications)
                  ? normalized.raw.certifications
                  : Array.isArray(raw?.certifications)
                    ? raw.certifications
                    : [];
              const createdAt = normalized?.createdAt || normalized?.raw?.createdAt || raw?.createdAt || 0;
              const prevExtra = submissionExtras[id];
              if (!prevExtra || Number(prevExtra.createdAt || 0) <= Number(createdAt || 0)) {
                submissionExtras[id] = { recognitions, certifications: certsList, createdAt, abilityScore: Number.isFinite(score) ? score : null };
              }
            }
          }

          if (monthKey === currentMonthKey) {
            submittedByRole[roleKey] = (submittedByRole[roleKey] || 0) + 1;
          }
        }

        const months = buildLastMonths(6);
        const points = months.map(({ key, label }) => {
          const bucket = buckets.get(key);
          const avg = bucket?.count ? Math.round((bucket.sum / bucket.count) * 10) / 10 : 0;
          return { month: label, avg };
        });
        setAbility6m(points);
        const cycleMapObj = {};
        for (const [key, entry] of cycleSummaries.entries()) {
          cycleMapObj[key] = {
            submittedIds: Array.from(entry.submittedIds),
            submittedByRole: entry.submittedByRole,
          };
        }
        setSubmissionCycleMap(cycleMapObj);
        setSubmissionExtrasByEmployee(submissionExtras);
        setSubmissionSummary({
          monthKey: currentMonthKey,
          submittedByRole,
          submittedIds: Array.from(submittedIds),
          total: submittedIds.size,
        });
      } catch (err) {
        if (!mounted) return;
        if (err?.name === "AbortError") return;
        if (err?.status === 401) {
          showToast({ title: "Session expired", message: "Please login again." });
          onLogout?.();
          return;
        }
        setAbility6m(buildLastMonths(6).map((m) => ({ month: m.label, avg: 0 })));
      }
    })();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [onLogout, showToast]);

  const employeePager = useMemo(() => {
    const page = employeesCursorStack.length + 1;
    const maxPage =
      typeof employeesTotalCount === "number" && employeesTotalCount > 0
        ? Math.max(1, Math.ceil(employeesTotalCount / DIRECTORY_PAGE_SIZE))
        : null;
    const shownCount = Array.isArray(employees) ? employees.length : 0;
    const label = maxPage
      ? `Page ${page} • ${DIRECTORY_PAGE_SIZE}/page • showing ${shownCount} of ${employeesTotalCount}`
      : `Page ${page} • ${DIRECTORY_PAGE_SIZE}/page`;

    return {
      canPrev: employeesCursorStack.length > 0,
      canNext: Boolean(employeesNextCursor),
      onReset: () => {
        reloadEmployees({ cursor: null, pageAction: "reset", cursorStackOverride: [] }).catch(() => {});
      },
      onPrev: () => {
        const prevCursor = employeesCursorStack[employeesCursorStack.length - 1] ?? null;
        reloadEmployees({ cursor: prevCursor, pageAction: "prev" }).catch(() => {});
      },
      onNext: () => {
        if (!employeesNextCursor) return;
        reloadEmployees({ cursor: employeesNextCursor, pageAction: "next" }).catch(() => {});
      },
      onPageChange: (targetPage) => {
        jumpEmployeesToPage(targetPage).catch(() => {});
      },
      page,
      maxPage,
      loading: employeesLoading,
      label,
    };
  }, [
    employees,
    employeesCursorStack,
    employeesNextCursor,
    employeesLoading,
    employeesTotalCount,
    jumpEmployeesToPage,
    reloadEmployees,
  ]);

  const kpiPager = useMemo(() => ({
    canPrev: kpisCursorStack.length > 0,
    canNext: Boolean(kpisNextCursor),
    onPrev: () => {
      const prevCursor = kpisCursorStack[kpisCursorStack.length - 1] ?? null;
      reloadKpis({ cursor: prevCursor, pageAction: "prev" }).catch(() => {});
    },
    onNext: () => {
      if (!kpisNextCursor) return;
      reloadKpis({ cursor: kpisNextCursor, pageAction: "next" }).catch(() => {});
    },
    loading: kpisLoading,
    label: `Page ${kpisCursorStack.length + 1} • ${kpiPageSize}/page`,
  }), [kpiPageSize, kpisCursorStack, kpisNextCursor, kpisLoading, reloadKpis]);

  const valuesPager = useMemo(() => ({
    canPrev: valuesCursorStack.length > 0,
    canNext: Boolean(valuesNextCursor),
    onPrev: () => {
      const prevCursor = valuesCursorStack[valuesCursorStack.length - 1] ?? null;
      reloadValues({ cursor: prevCursor, pageAction: "prev" }).catch(() => {});
    },
    onNext: () => {
      if (!valuesNextCursor) return;
      reloadValues({ cursor: valuesNextCursor, pageAction: "next" }).catch(() => {});
    },
    loading: valuesLoading,
    label: `Page ${valuesCursorStack.length + 1}`,
  }), [reloadValues, valuesCursorStack, valuesLoading, valuesNextCursor]);

  const certificationsPager = useMemo(() => ({
    canPrev: certificationsCursorStack.length > 0,
    canNext: Boolean(certificationsNextCursor),
    onPrev: () => {
      const prevCursor = certificationsCursorStack[certificationsCursorStack.length - 1] ?? null;
      reloadCertifications({ cursor: prevCursor, pageAction: "prev" }).catch(() => {});
    },
    onNext: () => {
      if (!certificationsNextCursor) return;
      reloadCertifications({ cursor: certificationsNextCursor, pageAction: "next" }).catch(() => {});
    },
    loading: certificationsLoading,
    label: "Page " + (certificationsCursorStack.length + 1),
  }), [
    certificationsCursorStack,
    certificationsLoading,
    certificationsNextCursor,
    reloadCertifications,
  ]);

  const markNotificationRead = useCallback(async (notificationId) => {
    const id = String(notificationId ?? "").trim();
    if (!id) return;
    try {
      await markAdminNotificationRead(id);
      setNotifications((prev) => prev.map((item) => (
        String(item?.id) === id ? { ...item, read: true } : item
      )));
    } catch (err) {
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
        return;
      }
      showToast({ title: "Unable to mark read", message: err?.message || "Please try again." });
    }
  }, [onLogout, showToast]);

  const markEveryNotificationRead = useCallback(async () => {
    try {
      await markAllAdminNotificationsRead();
      setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
    } catch (err) {
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
        return;
      }
      showToast({ title: "Unable to mark all read", message: err?.message || "Please try again." });
    }
  }, [onLogout, showToast]);

  useEffect(() => {
    saveCertificationCatalogToStorage(certificationCatalog);
  }, [certificationCatalog]);

  const addCertificationToCatalog = useCallback(async (name) => {
    const cert = String(name ?? "").trim();
    if (!cert) return;
    try {
      await addCertification({ name: cert, listed: true });
      await reloadCertifications().catch(() => {});
    } catch (err) {
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
      }
      throw err;
    }
  }, [onLogout, reloadCertifications, showToast]);

  const editCertificationInCatalog = useCallback(async (id, nextName) => {
    const targetId = String(id ?? "").trim();
    const name = String(nextName ?? "").trim();
    if (!targetId || !name) return;
    const current = certificationCatalog.find((c) => String(c?.id) === targetId) || null;
    const listed = current ? Boolean(current.listed) : true;
    try {
      await updateCertification(targetId, { name, listed });
      await reloadCertifications().catch(() => {});
    } catch (err) {
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
      }
      throw err;
    }
  }, [certificationCatalog, onLogout, reloadCertifications, showToast]);

  const setCertificationListed = useCallback(async (id, listed) => {
    const targetId = String(id ?? "").trim();
    if (!targetId) return;
    const current = certificationCatalog.find((c) => String(c?.id) === targetId) || null;
    const name = String(current?.name ?? "").trim();
    if (!name) {
      await reloadCertifications().catch(() => {});
      throw new Error("Missing certification name.");
    }
    try {
      await updateCertification(targetId, { name, listed: Boolean(listed) });
      await reloadCertifications().catch(() => {});
    } catch (err) {
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
      }
      throw err;
    }
  }, [certificationCatalog, onLogout, reloadCertifications, showToast]);

  const deleteCertificationFromCatalog = useCallback(async (id) => {
    const targetId = String(id ?? "").trim();
    if (!targetId) return;
    try {
      await deleteCertification(targetId);
      await reloadCertifications().catch(() => {});
    } catch (err) {
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
      }
      throw err;
    }
  }, [onLogout, reloadCertifications, showToast]);

  const _incrementEmployeeRecognitions = useCallback((employeeId) => {
    const id = String(employeeId);
    setEmployees((prev) => {
      const next = prev.map((e) =>
        e.id === id ? { ...e, recognitions: Number(e.recognitions || 0) + 1 } : e
      );

      const extras = loadEmployeeExtras();
      const current = extras[id] && typeof extras[id] === "object" ? extras[id] : {};
      saveEmployeeExtras({
        ...extras,
        [id]: {
          ...current,
          recognitions: (Number(current.recognitions) || 0) + 1,
          certifications: Array.isArray(current.certifications) ? current.certifications : [],
        },
      });

      return next;
    });
  }, []);

  const _addEmployeeCertification = useCallback((employeeId, certification) => {
    const id = String(employeeId);
    const cert = String(certification || "").trim();
    if (!cert) return;
    const allowed = certificationCatalog.some(
      (c) =>
        Boolean(c?.listed) &&
        String(c?.name ?? "").trim().toLowerCase() === cert.toLowerCase()
    );
    if (!allowed) return;

    setEmployees((prev) => {
      const next = prev.map((e) => {
        if (e.id !== id) return e;
        const existing = Array.isArray(e.certifications) ? e.certifications : [];
        if (existing.some((c) => String(c).toLowerCase() === cert.toLowerCase())) return e;
        return { ...e, certifications: [cert, ...existing] };
      });

      const extras = loadEmployeeExtras();
      const current = extras[id] && typeof extras[id] === "object" ? extras[id] : {};
      const existing = Array.isArray(current.certifications) ? current.certifications : [];
      const merged =
        existing.some((c) => String(c).toLowerCase() === cert.toLowerCase())
          ? existing
          : [cert, ...existing];
      saveEmployeeExtras({
        ...extras,
        [id]: {
          ...current,
          recognitions: Number(current.recognitions) || 0,
          certifications: merged,
        },
      });

      return next;
    });
  }, [certificationCatalog]);

  const setEmployeeSubmissionWindowOverride = useCallback((employeeId, mode) => {
    const id = String(employeeId ?? "").trim();
    if (!id) return;

    const action = String(mode ?? "").trim().toLowerCase();
    if (action !== "open" && action !== "close") return;

    const nextForceOpen = action === "open";
    const nextForceClosed = action === "close";

    setEmployees((prev) =>
      prev.map((e) =>
        String(e.id) === id
          ? { ...e, submissionWindowForceOpen: nextForceOpen, submissionWindowForceClosed: nextForceClosed }
          : e
      )
    );

    const extras = loadEmployeeExtras();
    const current = extras[id] && typeof extras[id] === "object" ? extras[id] : {};
    saveEmployeeExtras({
      ...extras,
      [id]: {
        ...current,
        submissionWindowForceOpen: nextForceOpen,
        submissionWindowForceClosed: nextForceClosed,
      },
    });
  }, [setEmployees]);

  const account = useMemo(() => {
    const role = String(auth?.role || auth?.claims?.role || "").trim() || "Employee";
    const rawEmail = String(auth?.email || auth?.claims?.sub || "").trim();
    let email = rawEmail || null;
    if (!email) {
      const roleKey = role.toLowerCase();
      const candidates = employees
        .filter((e) => String(e?.role || "").trim().toLowerCase() === roleKey)
        .filter((e) => String(e?.email || "").trim());
      if (candidates.length === 1) {
        email = String(candidates[0].email).trim();
      }
    }

    let name = String(auth?.employeeName || "").trim() || null;
    let designation = null;
    let stream = String(auth?.stream || "").trim() || null;
    let band = String(auth?.band || "").trim() || null;
    if (email) {
      const match = employees.find(
        (e) => String(e?.email || "").trim().toLowerCase() === email.toLowerCase()
      );
      if (match?.name) name = match.name;
      if (match?.designation) designation = match.designation;
      if (match?.stream) stream = match.stream;
      if (match?.band) band = match.band;
    }

    const subtitle =
      designation ||
      [stream, band].filter(Boolean).join(" • ") ||
      null;

    return { email, role, name: name || email, subtitle };
  }, [auth?.email, auth?.claims?.sub, auth?.role, auth?.claims?.role, auth?.employeeName, auth?.stream, auth?.band, employees]);

  const currentEmployeeId = useMemo(() => {
    if (auth?.employeeId) return String(auth.employeeId);
    const email = String(auth?.email || auth?.claims?.sub || "").trim();
    if (!email) return null;
    const match = employees.find(
      (e) => String(e?.email || "").trim().toLowerCase() === email.toLowerCase()
    );
    return match?.id ?? null;
  }, [auth?.employeeId, auth?.email, auth?.claims?.sub, employees]);

  const globalWindowOpen = useMemo(
    () => isPortalWindowOpenNow(portalWindow, new Date()),
    [portalWindow]
  );

  function generateReport() {
    const lines = [
      "Report Type,Admin Control Center Summary",
      `Generated At,${new Date().toISOString()}`,
      `Portal Window Start,${portalWindow.start}`,
      `Portal Window End,${portalWindow.end}`,
      "",
      "Employees",
      "Employee ID,Name,Role,Band,Submitted",
      ...employees.map(e => `${e.id},${e.name},${e.role},${e.band},${e.submitted ? "Yes" : "No"}`)
    ].join("\n")

    downloadTextFile({
      filename: "admin-report.csv",
      text: lines,
      mime: "text/csv"
    })
  }

  return (
    <>
    {/* ─── Cycle label + Notification Panel (outside rt-shell to avoid overflow:hidden breaking fixed) ─── */}
    <div className="fixed right-4 top-4 z-[65] flex items-center gap-3 md:right-6 md:top-5">
      <span className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))]/60 bg-[rgb(var(--surface))]/80 backdrop-blur-md px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--muted))] shadow-sm">
        <Calendar size={14} />
        {currentCycleLabel}
      </span>
      <div className="flex flex-col items-end" ref={notificationsPanelRef}>
        {/* Bell trigger */}
        <button
          type="button"
          onClick={() => {
            const nextOpen = !notificationsOpen;
            setNotificationsOpen(nextOpen);
            if (nextOpen) reloadNotifications({ silent: true }).catch(() => {});
          }}
            className={[
              "group relative inline-flex h-10 w-10 items-center justify-center rounded-xl",
              "border border-[rgb(var(--border))]/60 bg-[rgb(var(--surface))]/80 backdrop-blur-md",
              "text-[rgb(var(--text))] shadow-sm",
              "transition-all duration-200 hover:shadow-md hover:border-[rgb(var(--primary))]/40",
              notificationsOpen ? "ring-2 ring-[rgb(var(--primary))]/20 border-[rgb(var(--primary))]/40" : "",
            ].join(" ")}
            aria-label="Admin notifications"
            title="Admin notifications"
          >
            {unreadNotificationsCount > 0 ? (
              <BellDot size={17} className="transition-transform duration-200 group-hover:scale-110" />
            ) : (
              <Bell size={17} className="transition-transform duration-200 group-hover:scale-110" />
            )}
            {unreadNotificationsCount > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-rose-600 px-1 text-[10px] font-bold text-white shadow-sm shadow-red-500/30">
                {unreadNotificationsCount > 99 ? "99+" : unreadNotificationsCount}
              </span>
            ) : null}
          </button>

          {/* Dropdown panel */}
          <AnimatePresence mode="wait">
            {notificationsOpen ? (
              <Motion.div
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.7 }}
                className="mt-2.5 w-[min(92vw,440px)] origin-top-right overflow-hidden rounded-2xl border border-[rgb(var(--border))]/60 bg-[rgb(var(--surface))]/95 backdrop-blur-xl shadow-xl shadow-black/8"
              >
                {/* Header */}
                <div className="relative px-5 py-4">
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[rgb(var(--primary))]/20 to-transparent" />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgb(var(--primary))]/10">
                        <Bell size={16} className="text-[rgb(var(--primary))]" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-[rgb(var(--text))]">Notifications</h3>
                        <p className="text-[11px] text-[rgb(var(--muted))]">
                          {unreadNotificationsCount > 0
                            ? `${unreadNotificationsCount} unread`
                            : "All caught up"}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNotificationsOpen(false)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[rgb(var(--muted))] transition-colors hover:bg-[rgb(var(--surface-2))] hover:text-[rgb(var(--text))]"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* Action pills */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => reloadNotifications().catch(() => {})}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))]/60 bg-[rgb(var(--surface-2))]/60 px-2.5 py-1.5 text-[11px] font-medium text-[rgb(var(--muted))] transition-all hover:border-[rgb(var(--border))] hover:text-[rgb(var(--text))] hover:shadow-sm"
                    >
                      <RefreshCw size={12} />
                      Refresh
                    </button>
                    <button
                      type="button"
                      onClick={() => reloadNotifications({ types: ["FORGOT_PASSWORD_REQUESTED"] }).catch(() => {})}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[rgb(var(--primary))]/8 px-2.5 py-1.5 text-[11px] font-medium text-[rgb(var(--primary))] transition-all hover:bg-[rgb(var(--primary))]/15"
                      title="Force-load password reset notifications"
                    >
                      <KeyRound size={12} />
                      Password resets
                    </button>
                    <button
                      type="button"
                      onClick={() => markEveryNotificationRead().catch(() => {})}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))]/60 bg-[rgb(var(--surface-2))]/60 px-2.5 py-1.5 text-[11px] font-medium text-[rgb(var(--muted))] transition-all hover:border-[rgb(var(--border))] hover:text-[rgb(var(--text))] hover:shadow-sm"
                    >
                      <CheckCheck size={12} />
                      Mark all read
                    </button>
                  </div>
                </div>

                {/* Divider */}
                <div className="h-px bg-gradient-to-r from-transparent via-[rgb(var(--border))]/60 to-transparent" />

                {/* Notification list */}
                <div className="max-h-[420px] overflow-y-auto overscroll-contain px-3 py-3">
                  {/* Loading state */}
                  {!notificationsError && notificationsLoading && notifications.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-8">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[rgb(var(--border))] border-t-[rgb(var(--primary))]" />
                      <p className="text-xs text-[rgb(var(--muted))]">Loading notifications…</p>
                    </div>
                  ) : null}

                  {/* Empty state */}
                  {!notificationsError && !notificationsLoading && notifications.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-10">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgb(var(--surface-2))]">
                        <Bell size={20} className="text-[rgb(var(--muted))]" />
                      </div>
                      <p className="text-sm font-medium text-[rgb(var(--text))]">No notifications yet</p>
                      <p className="text-xs text-[rgb(var(--muted))]">You&apos;re all caught up!</p>
                    </div>
                  ) : null}

                  {/* Notification items */}
                  <div className="space-y-2">
                    {notifications.map((item, index) => {
                      const payload = item?.payload && typeof item.payload === "object" ? item.payload : {};
                      const adminCode = payload.adminCode || payload.verificationCode || payload.otp || payload.code || "";
                      const requestId = payload.requestId || payload.resetRequestId || payload.resetId || "";
                      const expiresAt = payload.expiresAt || payload.expiry || payload.expiresOn || "";
                      const email = payload.email || payload.employeeEmail || payload.employeeId || item?.message || "";
                      const expiryLabel = expiresAt ? formatNotificationTimestamp(expiresAt) : null;
                      const typeUpper = String(item.type || "").toUpperCase();
                      const isPasswordReset = typeUpper.includes("FORGOT") || Boolean(adminCode);

                      return (
                        <Motion.button
                          key={String(item.id)}
                          type="button"
                          onClick={() => markNotificationRead(item.id)}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94], delay: Math.min(index * 0.04, 0.28) }}
                          whileHover={{ scale: 1.005 }}
                          className={[
                            "group/item w-full rounded-xl border px-3.5 py-3 text-left transition-all duration-200",
                            item.read
                              ? "border-[rgb(var(--border))]/40 bg-[rgb(var(--surface-2))]/50 hover:border-[rgb(var(--border))]/70 hover:bg-[rgb(var(--surface-2))]"
                              : "border-[rgb(var(--primary))]/20 bg-[rgb(var(--primary))]/[0.04] hover:border-[rgb(var(--primary))]/30 hover:bg-[rgb(var(--primary))]/[0.07]",
                          ].join(" ")}
                        >
                          <div className="flex items-start gap-3">
                            {/* Type icon */}
                            <div className={[
                              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                              isPasswordReset
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                : "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                            ].join(" ")}>
                              {isPasswordReset ? (
                                <Lock size={14} />
                              ) : (
                                <FileBarChart2 size={14} />
                              )}
                            </div>

                            {/* Content */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <span className={[
                                    "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                                    isPasswordReset
                                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                      : "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                                  ].join(" ")}>
                                    {isPasswordReset ? "Password Reset" : "Submission"}
                                  </span>
                                  <div className="mt-1.5 text-[13px] font-medium leading-snug text-[rgb(var(--text))] break-words">{item.title}</div>
                                  {item.message ? (
                                    <div className="mt-1 text-xs leading-relaxed text-[rgb(var(--muted))] break-words">{item.message}</div>
                                  ) : null}
                                </div>
                                <div className="shrink-0 pt-0.5">
                                  <span className="text-[10px] tabular-nums text-[rgb(var(--muted))]">
                                    {formatNotificationTimestamp(item.createdAt)}
                                  </span>
                                  {!item.read ? (
                                    <div className="mx-auto mt-1.5 h-1.5 w-1.5 rounded-full bg-[rgb(var(--primary))]" />
                                  ) : null}
                                </div>
                              </div>

                              {/* Password reset metadata */}
                              {isPasswordReset ? (
                                <div className="mt-2.5 space-y-1.5">
                                  {adminCode ? (
                                    <div className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500/10 to-indigo-500/10 px-2.5 py-1.5">
                                      <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-300">Code</span>
                                      <span className="font-mono text-sm font-semibold tracking-widest text-blue-700 dark:text-blue-200">{adminCode}</span>
                                    </div>
                                  ) : null}
                                  <div className="flex flex-wrap gap-1.5">
                                    {requestId ? (
                                      <span className="inline-flex items-center gap-1.5 rounded-md bg-[rgb(var(--surface-2))] px-2 py-1 text-[10px] text-[rgb(var(--muted))]">
                                        <span className="font-semibold uppercase tracking-wider">Req</span>
                                        <span className="font-mono text-[rgb(var(--text))] break-all">{requestId}</span>
                                      </span>
                                    ) : null}
                                    {email ? (
                                      <span className="inline-flex items-center gap-1.5 rounded-md bg-[rgb(var(--surface-2))] px-2 py-1 text-[10px] text-[rgb(var(--muted))]">
                                        <span className="font-semibold uppercase tracking-wider">User</span>
                                        <span className="font-mono text-[rgb(var(--text))] break-all">{email}</span>
                                      </span>
                                    ) : null}
                                    {expiryLabel ? (
                                      <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/8 px-2 py-1 text-[10px] text-amber-700 dark:text-amber-300">
                                        <span className="font-semibold uppercase tracking-wider">Exp</span>
                                        <span className="font-mono">{expiryLabel}</span>
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </Motion.button>
                      );
                    })}
                  </div>

                  {/* Load more */}
                  {notificationsNextCursor ? (
                    <button
                      type="button"
                      onClick={() => reloadNotifications({ cursor: notificationsNextCursor, append: true }).catch(() => {})}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[rgb(var(--border))]/60 bg-[rgb(var(--surface-2))]/30 px-3 py-2.5 text-xs font-medium text-[rgb(var(--muted))] transition-all hover:border-[rgb(var(--border))] hover:bg-[rgb(var(--surface-2))] hover:text-[rgb(var(--text))]"
                    >
                      <ChevronDown size={14} />
                      Load more notifications
                    </button>
                  ) : null}
                </div>
              </Motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

    <div className="rt-shell flex overflow-x-hidden bg-[rgb(var(--bg))]">
      {isSidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-label="Close sidebar"
        />
      ) : null}

      <button
        type="button"
        className="fixed left-4 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))] shadow-lg md:hidden"
        onClick={() => setIsSidebarOpen((prev) => !prev)}
        aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
      >
        {isSidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
      </button>

      <Sidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={onLogout}
        account={account}
      />

      <main className={`relative flex-1 transition-all duration-300 ${isSidebarOpen ? 'md:ml-64' : 'md:ml-[72px]'} px-3 py-4 pt-16 sm:px-4 md:pt-6 lg:px-8 lg:py-8`}>
        {activeTab === "dashboard" && (
          <AdminDashboard
            portalWindow={portalWindow}
            setPortalWindow={setPortalWindow}
            portalWindowLoading={portalWindowLoading}
            portalWindowError={portalWindowError}
            reloadPortalWindow={reloadPortalWindow}
            employees={employees}
            setEmployees={setEmployees}
            reloadEmployees={reloadEmployees}
            employeesLoading={employeesLoading}
            employeesError={employeesError}
            totalEmployeesCount={employeesTotalCount}
            directoryTotals={employeesDirectoryTotals}
            ability6m={ability6m}
            submissionSummary={submissionSummary}
            submissionCycleMap={submissionCycleMap}
            submissionExtrasByEmployee={submissionExtrasByEmployee}
            onGenerateReport={generateReport}
          />
        )}

        {activeTab === "submissions" && (
          <AdminSubmissions onLogout={onLogout} employees={employees} />
        )}

        {activeTab === "certifications" && (
          <>
            {certificationsLoading ? (
              <div className="max-w-7xl mx-auto mb-6 rt-panel-subtle p-4 text-sm text-[rgb(var(--muted))]">
                Loading certifications…
              </div>
            ) : null}
            <Certifications
              certificationCatalog={certificationCatalog}
              onAddCertificationToCatalog={addCertificationToCatalog}
              onEditCertificationInCatalog={editCertificationInCatalog}
              onSetCertificationListed={setCertificationListed}
              onDeleteCertificationFromCatalog={deleteCertificationFromCatalog}
              pager={certificationsPager}
            />
          </>
        )}

        {activeTab === "directory" && (
          <EmployeeDirectory
            employees={employees}
            setEmployees={setEmployees}
            reloadEmployees={reloadEmployees}
            employeesLoading={employeesLoading}
            employeesError={employeesError}
            totalEmployeesCount={employeesTotalCount}
            directoryTotals={employeesDirectoryTotals}
            currentEmployeeId={currentEmployeeId}
            pager={employeePager}
            onSetEmployeeSubmissionWindow={setEmployeeSubmissionWindowOverride}
            globalWindowOpen={globalWindowOpen}
          />
        )}

        {activeTab === "kpi" && (
          <KPIRegistry
            kpis={kpis}
            allKpis={allKpis}
            allKpisLoading={allKpisLoading}
            allKpisError={allKpisError}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onAddKpi={openKpiModal}
            onEditKpi={openEditKpiModal}
            onDeleteKpi={requestDeleteKpi}
            loading={kpisLoading}
            error={kpisError}
            onReload={handleReloadKpis}
            pager={kpiPager}
            pageSize={kpiPageSize}
            pageSizeOptions={KPI_PAGE_SIZE_OPTIONS}
            onPageSizeChange={(nextSize) => {
              const parsed = Number.parseInt(String(nextSize), 10);
              if (!Number.isFinite(parsed) || parsed <= 0) return;
              setKpiPageSize(parsed);
            }}
          />
        )}

        {activeTab === "values" && (
          <>
            {valuesLoading ? (
              <div className="max-w-7xl mx-auto mb-6 rt-panel-subtle p-4 text-sm text-[rgb(var(--muted))]">
                Loading values…
              </div>
            ) : null}
            <WebknotValueDirectory
              values={values}
              searchQuery={valuesSearchQuery}
              setSearchQuery={setValuesSearchQuery}
              onAddValue={openValueModal}
              onEditValue={openEditValueModal}
              onDeleteValue={deleteValue}
              pager={valuesPager}
            />
          </>
        )}

        {activeTab === "band-streams" && <BandStreamDirectory />}

        {activeTab === "csv-import" && (
          <CsvImportPanel
            onImportComplete={() => {
              reloadEmployees?.();
            }}
            showToast={showToast}
          />
        )}

        {activeTab === "agents" && isAdmin ? <AIAgentsConfig /> : null}

        {activeTab === "settings" && <SettingsPanel />}
      </main>

      
      {showKPIModal ? (
        <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 z-[60] overflow-y-auto">
          <div className="w-full max-w-lg rt-panel p-4 sm:p-6 my-4 sm:my-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold uppercase tracking-tight">
                  {kpiModalMode === "edit" ? "Edit KPI" : "Add KPI"}
                </h3>
                <p className="text-gray-500 text-sm mt-1">
                  {kpiModalMode === "edit" ? (
                    <span>
                      Updating <span className="font-mono">{String(editingKpiId ?? "")}</span>
                    </span>
                  ) : (
                    "Creates a new KPI definition."
                  )}
                </p>
              </div>
              <button
                onClick={closeKpiModal}
                className="p-2 rounded-md hover:bg-[rgb(var(--surface-2))]"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={submitKpi} className="mt-6 space-y-4">
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  Objective *
                </label>
                <input
                  value={kpiDraft.title}
                  onChange={(e) => setKpiDraft((d) => ({ ...d, title: e.target.value }))}
                  className="mt-2 rt-input text-sm"
                  placeholder="e.g., Technical Velocity"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    Stream *
                  </label>
                  <select
                    value={kpiDraft.stream}
                    onChange={(e) => setKpiDraft((d) => ({ ...d, stream: e.target.value }))}
                    className="mt-2 rt-input text-sm"
                  >
                    {kpiStreamOptions.map((stream) => (
                      <option key={`kpi-stream:${stream}`} value={stream}>
                        {stream}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    Band *
                  </label>
                  <select
                    value={kpiDraft.band}
                    onChange={(e) => setKpiDraft((d) => ({ ...d, band: e.target.value }))}
                    className="mt-2 rt-input text-sm"
                  >
                    {kpiBandOptions.map((band) => (
                      <option key={`kpi-band:${band}`} value={band}>
                        {band}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  Weight *
                </label>
                <input
                  value={kpiDraft.weight}
                  onChange={(e) => setKpiDraft((d) => ({ ...d, weight: e.target.value }))}
                  className="mt-2 rt-input text-sm"
                  placeholder="e.g., 30%"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeKpiModal}
                  disabled={kpiSaving}
                  className="rt-btn-ghost disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={kpiSaving}
                  className="rt-btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {kpiSaving ? "Saving…" : (kpiModalMode === "edit" ? "Save Changes" : "Add KPI")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      
      {showValueModal ? (
        <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 z-[60] overflow-y-auto">
          <div className="w-full max-w-lg rt-panel p-4 sm:p-6 my-4 sm:my-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold uppercase tracking-tight">
                  {valueModalMode === "edit" ? "Edit Value" : "Add Value"}
                </h3>
                <p className="text-gray-500 text-sm mt-1">
                  {valueModalMode === "edit" ? (
                    <span>
                      Updating <span className="font-mono">{String(editingValueId ?? "")}</span>
                    </span>
                  ) : (
                    "Creates a new Webknot value."
                  )}
                </p>
              </div>
              <button
                onClick={closeValueModal}
                className="p-2 rounded-md hover:bg-[rgb(var(--surface-2))]"
                aria-label="Close"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={submitValue} className="mt-6 space-y-4">
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  Value *
                </label>
                <input
                  value={valueDraft.title}
                  onChange={(e) => setValueDraft((d) => ({ ...d, title: e.target.value }))}
                  className="mt-2 rt-input text-sm"
                  placeholder="e.g., Own The Outcome"
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  Evaluation Criteria *
                </label>
                <input
                  value={valueDraft.pillar}
                  onChange={(e) => setValueDraft((d) => ({ ...d, pillar: e.target.value }))}
                  className="mt-2 rt-input text-sm"
                  placeholder="e.g., Ownership"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeValueModal}
                  disabled={valueSaving}
                  className="rt-btn-ghost disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={valueSaving}
                  className="rt-btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {valueSaving ? "Saving…" : (valueModalMode === "edit" ? "Save Changes" : "Add Value")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={Boolean(pendingDeleteKpi)}
        title="Delete KPI"
        message={'Delete "' + String(pendingDeleteKpi?.title ?? "") + '"?'}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        onCancel={() => setPendingDeleteKpi(null)}
        onConfirm={confirmDeleteKpi}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteValue)}
        title="Delete Value"
        message={`Delete "${String(pendingDeleteValue?.title ?? "")}"?`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        onCancel={() => setPendingDeleteValue(null)}
        onConfirm={confirmDeleteValue}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
    </>
  );
}
