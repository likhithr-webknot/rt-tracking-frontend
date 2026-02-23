import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BellDot,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  LogOut,
  RefreshCw,
  Sparkles,
  TrendingUp,
  UserCircle2,
  Users,
  X
} from "lucide-react";

import { fetchMe } from "../../api/auth.js";
import { fetchPortalManager } from "../../api/portal.js";
import {
  fetchMyMonthlySubmission,
  fetchManagerTeamSubmissions,
  formatYearMonth,
  normalizeMonthlySubmission,
  saveMonthlyDraft,
  submitMonthlySubmission
} from "../../api/monthly-submissions.js";
import { normalizeCursorPage } from "../../api/employee-portal.js";
import { fetchKpiDefinitions, normalizeKpiDefinitions } from "../../api/kpi-definitions.js";
import { fetchManagerReportees, normalizeEmployees } from "../../api/employees.js";
import { fetchValues, normalizeWebknotValuesList } from "../../api/webknotValueApi.js";
import { enhanceReviewText, fetchActiveAiAgent } from "../../api/ai-agents.js";
import { getAppSettings } from "../../utils/appSettings.js";
import { buildCycleMeta, buildCycleMonthOptions, getCycleForMonth, isResubmissionRequested, normalizeYearMonth } from "../../utils/reviewCycles.js";
import {
  fetchManagerNotifications,
  markAllManagerNotificationsRead,
  markManagerNotificationRead,
  normalizeManagerNotificationPage,
  subscribeManagerNotificationsStream,
} from "../../api/notifications.js";
import Toast from "../shared/Toast.jsx";
import CursorPagination from "../shared/CursorPagination.jsx";
import ThemeToggle from "../shared/ThemeToggle.jsx";

const MANAGER_REVIEW_DRAFT_KEY = "rt_tracking_manager_review_draft_v1";
const MANAGER_SIDEBAR_PREF_KEY = "rt_tracking_manager_sidebar_open_v1";
const TEAM_PAGE_SIZE = 12;
const MANAGER_NOTIFICATION_PAGE_SIZE = 25;
const MANAGER_NOTIFICATION_POLL_MS = 30_000;

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function loadManagerReviewDrafts() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(MANAGER_REVIEW_DRAFT_KEY);
    const parsed = safeJsonParse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveManagerReviewDrafts(next) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MANAGER_REVIEW_DRAFT_KEY, JSON.stringify(next || {}));
  } catch { void 0; }
}

function isSubmittedStatus(status) {
  const s = String(status || "").trim().toUpperCase();
  return s === "SUBMITTED" || s === "APPROVED" || s === "COMPLETED" || s === "FINAL";
}

function normalizeCertificationsForState(input) {
  const arr = Array.isArray(input) ? input : [];
  return arr
    .map((raw) => {
      if (typeof raw === "string") {
        const name = String(raw).trim();
        return name ? { name, proof: "" } : null;
      }
      if (!raw || typeof raw !== "object") return null;
      const name = String(raw.name ?? raw.certificationName ?? raw.title ?? "").trim();
      if (!name) return null;
      const proof = String(raw.proof ?? raw.url ?? raw.link ?? raw.credentialId ?? "").trim();
      return { name, proof };
    })
    .filter(Boolean);
}

function normalizeTeamSubmissions(data) {
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : [];
  return arr
    .map((raw) => {
      const obj = raw && typeof raw === "object" ? raw : null;
      if (!obj) return null;

      const submission = normalizeMonthlySubmission(obj) || null;
      const emp = obj.employee || obj.reportee || obj.user || obj.emp || null;
      const employeeId = emp?.employeeId ?? emp?.empId ?? emp?.id ?? obj.employeeId ?? null;
      const employeeName = emp?.employeeName ?? emp?.name ?? emp?.fullName ?? obj.employeeName ?? null;
      const email = emp?.email ?? obj.email ?? null;
      const payloadObj =
        submission && typeof submission === "object"
          ? submission
          : {
              selfReviewText: String(obj?.selfReviewText ?? ""),
              certifications: [],
              kpiRatings: {},
              webknotValues: [],
              webknotValueRatings: {},
              recognitionsCount: 0,
              raw: obj,
            };
      const managerSubmitted = Boolean(
        obj?.managerSubmittedAt ||
        obj?.managerReviewedAt ||
        obj?.reviewedByManager ||
        obj?.managerReview ||
        obj?.managerEvaluation ||
        obj?.payload?.managerSubmittedAt ||
        obj?.payload?.managerReviewedAt ||
        obj?.payload?.managerReview ||
        obj?.payload?.managerEvaluation
      );
      const managerSubmittedAt = String(
        obj?.managerSubmittedAt ??
        obj?.managerReviewedAt ??
        obj?.payload?.managerSubmittedAt ??
        obj?.payload?.managerReviewedAt ??
        ""
      ).trim() || null;

      return {
        submissionId: submission?.id ?? (obj.submissionId ? String(obj.submissionId) : null),
        month: submission?.month ?? (typeof obj.month === "string" ? obj.month : null),
        status: submission?.status ?? (typeof obj.status === "string" ? obj.status : null),
        updatedAt: submission?.updatedAt ?? (obj.updatedAt ? String(obj.updatedAt) : null),
        submittedAt: submission?.submittedAt ?? (obj.submittedAt ? String(obj.submittedAt) : null),
        managerSubmitted,
        managerSubmittedAt,
        employee: {
          id: employeeId == null ? "—" : String(employeeId),
          name: employeeName ? String(employeeName) : (email ? String(email) : "Unknown"),
          email: email ? String(email) : "",
        },
        payload: payloadObj,
        raw: obj,
      };
    })
    .filter(Boolean);
}

function normalizeCursorToken(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (typeof value === "bigint") {
    return String(value);
  }
  return null;
}

function normalizeTeamPage(data) {
  const root =
    data && typeof data === "object" && !Array.isArray(data) && data?.data && typeof data.data === "object"
      ? data.data
      : data && typeof data === "object" && !Array.isArray(data)
        ? data
        : {};

  const itemsRaw =
    Array.isArray(root.items)
      ? root.items
      : Array.isArray(root.results)
        ? root.results
        : Array.isArray(root.content)
          ? root.content
          : Array.isArray(root.data)
            ? root.data
            : Array.isArray(data)
              ? data
              : [];

  return {
    items: normalizeTeamSubmissions(itemsRaw),
    nextCursor: normalizeCursorToken(
      root?.nextCursor ??
      root?.next ??
      root?.nextToken ??
      root?.page?.nextCursor ??
      root?.pageInfo?.nextCursor ??
      null
    ),
    total:
      typeof root?.total === "number" && Number.isFinite(root.total)
        ? root.total
        : null,
    submittedCount:
      typeof root?.submittedCount === "number" && Number.isFinite(root.submittedCount)
        ? root.submittedCount
        : null,
    pendingManagerReviewCount:
      typeof root?.pendingManagerReviewCount === "number" && Number.isFinite(root.pendingManagerReviewCount)
        ? root.pendingManagerReviewCount
        : null,
  };
}

function normalizeReporteesAsPendingSubmissions(data, month) {
  const reportees = normalizeEmployees(data);
  const monthKey = String(month || "").trim();
  return reportees.map((emp) => ({
    submissionId: null,
    month: monthKey || null,
    status: "NOT_SUBMITTED",
    updatedAt: emp?.updatedAt || null,
    submittedAt: null,
    managerSubmitted: false,
    managerSubmittedAt: null,
    employee: {
      id: String(emp?.id || "—"),
      name: String(emp?.name || emp?.email || "Unknown"),
      email: String(emp?.email || ""),
    },
    payload: {
      selfReviewText: "",
      certifications: [],
      kpiRatings: {},
      webknotValues: [],
      webknotValueRatings: {},
      recognitionsCount: 0,
      raw: emp?.raw || emp || {},
    },
    raw: emp?.raw || emp || {},
  }));
}

function toSortEpoch(row) {
  const submitted = new Date(row?.submittedAt || "");
  if (!Number.isNaN(submitted.getTime())) return submitted.getTime();
  const updated = new Date(row?.updatedAt || "");
  if (!Number.isNaN(updated.getTime())) return updated.getTime();
  return 0;
}

function sortTeamRowsByLatest(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => toSortEpoch(b) - toSortEpoch(a));
}

function dedupeTeamRows(rows, fallbackMonth = "") {
  const list = Array.isArray(rows) ? rows : [];
  const month = String(fallbackMonth || "").trim();
  const byKey = new Map();
  let anonIdx = 0;
  for (const row of list) {
    const submissionId = String(row?.submissionId ?? row?.id ?? "").trim();
    const employeeId = String(row?.employee?.id ?? row?.employeeId ?? "").trim();
    const monthKey = String(row?.month ?? month).trim();
    const key = submissionId || (employeeId ? `${employeeId}:${monthKey}` : `anon:${anonIdx++}`);
    const prev = byKey.get(key);
    if (!prev || toSortEpoch(row) >= toSortEpoch(prev)) {
      byKey.set(key, row);
    }
  }
  return Array.from(byKey.values());
}

function normalizeSelfKpiRatings(input) {
  if (!input || typeof input !== "object") return {};
  const out = {};
  for (const [idRaw, valueRaw] of Object.entries(input)) {
    const id = String(idRaw || "").trim();
    if (!id) continue;
    const parsed =
      typeof valueRaw === "number" ? valueRaw : Number.parseFloat(String(valueRaw ?? ""));
    if (!Number.isFinite(parsed)) continue;
    const rounded = Math.round(parsed * 10) / 10;
    if (rounded < 1 || rounded > 5) continue;
    out[id] = rounded;
  }
  return out;
}

function normalizeFilterKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeBandKey(value) {
  return normalizeFilterKey(value).replace(/[^a-z0-9]/g, "");
}

function normalizeStreamKey(value) {
  const key = normalizeFilterKey(value).replace(/[^a-z0-9]/g, "");
  if (!key) return "";
  if (key === "*" || key === "all" || key === "any" || key === "general" || key === "global") {
    return key;
  }
  if (key === "qa" || key === "qualityassurance" || key === "qualityengineering") return "qa";
  if (key === "devops" || key === "devsecops" || key === "sre" || key === "ops" || key === "operations") return "devops";
  if (key === "data" || key === "datascience" || key === "analytics" || key === "aiml" || key === "ai" || key === "ml") return "data";
  if (key === "uiux" || key === "uxui" || key === "ui" || key === "ux" || key === "design" || key === "uidesign" || key === "uxdesign") {
    return "uiux";
  }
  if (key === "development" || key === "dev" || key === "backend" || key === "frontend" || key === "mobile" || key === "fullstack" || key === "engineering") {
    return "development";
  }
  return key;
}

function isWildcardValue(key) {
  const normalized = normalizeFilterKey(key);
  return normalized === "" || normalized === "*" || normalized === "all" || normalized === "any" || normalized === "general" || normalized === "global";
}

function kpiAppliesToManager(kpi, managerProfile) {
  const managerBand = normalizeBandKey(managerProfile?.band);
  const managerStream = normalizeStreamKey(managerProfile?.stream);

  if (!managerBand && !managerStream) return true;

  const kpiBand = normalizeBandKey(kpi?.band);
  const kpiStream = normalizeStreamKey(kpi?.stream);

  const bandOk = isWildcardValue(kpiBand) || !kpiBand || !managerBand || kpiBand === managerBand;
  const streamOk =
    isWildcardValue(kpiStream) ||
    !kpiStream ||
    !managerStream ||
    kpiStream === managerStream;

  return bandOk && streamOk;
}

function formatOneDecimalDisplay(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return (Math.round(value * 10) / 10).toFixed(1);
}

function normalizeSelfValueRatings(input) {
  if (!input) return {};
  const out = {};

  const assign = (idRaw, ratingRaw, fallback = null) => {
    const id = String(idRaw ?? "").trim();
    if (!id) return;
    const parsed =
      ratingRaw == null || ratingRaw === ""
        ? fallback
        : typeof ratingRaw === "number"
          ? ratingRaw
          : Number.parseFloat(String(ratingRaw));
    if (!Number.isFinite(parsed)) return;
    const rounded = Math.round(parsed * 10) / 10;
    if (rounded < 1 || rounded > 5) return;
    out[id] = rounded;
  };

  if (Array.isArray(input)) {
    for (const item of input) {
      if (item && typeof item === "object") {
        const id =
          item.valueId ?? item.webknotValueId ?? item.id ?? item.code ?? item.key ?? item.value ?? item.title ?? item.name;
        const rating = item.rating ?? item.valueRating ?? item.score ?? item.value;
        assign(id, rating, 1);
        continue;
      }
      assign(item, null, 1);
    }
    return out;
  }

  if (typeof input === "object") {
    for (const [k, v] of Object.entries(input)) assign(k, v);
  }

  return out;
}

function buildManagerSelfSubmissionPayload({
  month,
  selfReviewText,
  kpiRatings,
  selectedValues,
  allowedKpiIds,
  managerId,
  reviewStatus = null,
  reopenedForResubmission = null,
}) {
  const cycleMeta = buildCycleMeta(month);
  const normalizedKpisRaw = normalizeSelfKpiRatings(kpiRatings);
  const allowedSet = new Set(
    Array.isArray(allowedKpiIds) ? allowedKpiIds.map((id) => String(id || "").trim()).filter(Boolean) : []
  );
  const normalizedKpis =
    allowedSet.size > 0
      ? Object.fromEntries(
          Object.entries(normalizedKpisRaw).filter(([id]) => allowedSet.has(String(id || "").trim()))
        )
      : normalizedKpisRaw;
  const kpiEntries = Object.entries(normalizedKpis).sort(([a], [b]) =>
    String(a).localeCompare(String(b), undefined, { numeric: true })
  );
  const kpiRatingsArray = kpiEntries.map(([kpiId, rating]) => ({
    kpiId: String(kpiId || "").trim(),
    rating,
  }));

  const normalizedValues = normalizeSelfValueRatings(selectedValues);
  const valueEntries = Object.entries(normalizedValues).sort(([a], [b]) =>
    String(a).localeCompare(String(b), undefined, { numeric: true })
  );
  const stableValueRatings = Object.fromEntries(valueEntries);
  const webknotValueResponses = valueEntries.map(([valueId, rating]) => ({
    valueId: String(valueId || "").trim(),
    rating,
  }));
  const webknotValues = valueEntries.map(([id]) => String(id));
  const monthKey = normalizeYearMonth(month) || String(month || "").trim() || null;

  const next = {
    month: monthKey,
    monthKey,
    cycleKey: cycleMeta.cycleKey,
    cycleLabel: cycleMeta.cycleLabel,
    cycleShortLabel: cycleMeta.cycleShortLabel,
    cycleStartMonth: cycleMeta.cycleStartMonth,
    cycleEndMonth: cycleMeta.cycleEndMonth,
    cycleMonth: cycleMeta.month,
    profileVerified: true,
    submissionType: "MANAGER_SELF_REVIEW",
    actorRole: "MANAGER",
    targetRole: "ADMIN",
    subjectEmployeeId: String(managerId || "").trim() || null,
    selfReviewText: String(selfReviewText || ""),
    certifications: [],
    kpiRatings: kpiRatingsArray,
    webknotValues,
    webknotValueRatings: stableValueRatings,
    webknotValueResponses,
    recognitionsCount: 0,
  };
  if (reviewStatus != null) next.reviewStatus = String(reviewStatus || "").trim() || null;
  if (reopenedForResubmission != null) next.reopenedForResubmission = Boolean(reopenedForResubmission);
  return next;
}

function isFinalSubmissionStatus(status, meta) {
  const s = String(status || "").trim().toUpperCase();
  if (s === "SUBMITTED" || s === "APPROVED" || s === "COMPLETED" || s === "FINAL") return true;
  if (meta?.submittedAt) return true;
  return false;
}

function isManagerSelfReviewLocked(meta) {
  if (!isFinalSubmissionStatus(meta?.status, meta)) return false;
  return !isResubmissionRequested(meta);
}

function payloadHash(payload) {
  try {
    return JSON.stringify(payload ?? {});
  } catch {
    return String(Date.now());
  }
}

function isAiEnhancementConfigured(raw) {
  const obj = raw && typeof raw === "object" ? raw : {};
  if (typeof obj.configured === "boolean") return obj.configured;
  return Boolean(String(obj.provider ?? "").trim());
}

function getDraftAutosaveDelayMs() {
  const n = Number.parseInt(String(getAppSettings()?.draftAutosaveDelayMs ?? 900), 10);
  if (!Number.isFinite(n)) return 900;
  return Math.min(5000, Math.max(500, n));
}

function preventWheelInputChange(e) {
  e.currentTarget.blur();
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

const Sidebar = ({ isOpen, setIsOpen, activeTab, setActiveTab, onLogout, account }) => {
  const navItems = [
    { id: "team", icon: <Users size={20} />, label: "Team Submissions" },
    { id: "self-review", icon: <ClipboardCheck size={20} />, label: "Self Review" },
  ];

  return (
    <aside
      className={[
        "fixed left-0 top-0 h-full bg-[linear-gradient(180deg,_rgb(var(--surface))_0%,_rgb(var(--surface-2))_100%)] backdrop-blur-xl transition-all duration-300 z-50 shadow-[0_16px_36px_rgba(8,22,45,0.18)]",
        "flex flex-col",
        "md:translate-x-0",
        isOpen ? "translate-x-0 w-72" : "-translate-x-full md:translate-x-0 md:w-24",
      ].join(" ")}
    >
      <div className="p-6 flex items-center justify-between">
        {isOpen ? (
          <div className="flex items-center gap-2">
            <img
              src="/unnamed.webp"
              alt="Webknot Technologies logo"
              className="h-9 w-9 rounded-xl object-cover bg-white"
            />
            <span className="font-black tracking-tight uppercase text-[rgb(var(--text))]">
              Webknot
            </span>
          </div>
        ) : null}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 hover:bg-[rgb(var(--surface-2))] rounded-xl text-slate-500 transition-colors"
          aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {isOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
      </div>

      <nav className="mt-6 px-3 space-y-1.5 flex-1 overflow-y-auto pb-6">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={[
                "w-full rounded-xl transition-all duration-150 border group",
                "px-4 py-3.5",
                isOpen ? "flex items-center justify-start gap-4" : "flex items-center justify-center",
                isActive
                  ? "bg-[rgb(var(--primary-soft))] border-transparent text-[rgb(var(--text))] shadow-[0_10px_18px_rgba(46,103,220,0.16)]"
                  : "border-transparent text-[rgb(var(--muted))] hover:bg-[rgb(var(--surface-2))] hover:text-[rgb(var(--text))]",
              ].join(" ")}
              title={!isOpen ? item.label : undefined}
            >
              <span
                className={[
                  "w-6 grid place-items-center shrink-0 transition-colors",
                  isActive ? "text-[rgb(var(--primary))]" : "text-[rgb(var(--muted))] group-hover:text-[rgb(var(--text))]",
                ].join(" ")}
              >
                {item.icon}
              </span>
              {isOpen ? (
                <span className="text-sm font-bold tracking-tight whitespace-nowrap">
                  {item.label}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto w-full px-3 pb-6 space-y-3">
        <div
          className={[
            "rounded-xl bg-[rgb(var(--surface-2))] p-3 text-[rgb(var(--text))]",
            isOpen ? "" : "hidden",
          ].join(" ")}
        >
          <div className="font-bold tracking-tight text-[rgb(var(--text))] truncate">
            {account?.name || account?.email || "Unknown"}
          </div>
          <div className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-[rgb(var(--muted))] truncate">
            {account?.role || "Manager"}
          </div>
          <div className="mt-1 text-xs text-slate-500 truncate">{account?.subtitle || "—"}</div>
        </div>

        {!isOpen ? (
          <div className="grid place-items-center text-slate-500">
            <div
              className="h-10 w-10 rounded-xl bg-[rgb(var(--surface-2))] grid place-items-center"
              title={[
                account?.name || account?.email || "Unknown",
                account?.role || "Manager",
                account?.subtitle || "",
              ].filter(Boolean).join(" • ")}
            >
              <UserCircle2 size={18} />
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
            "w-full rounded-xl transition-all font-bold group",
            isOpen ? "flex items-center justify-start gap-4 p-3" : "flex items-center justify-center p-3",
            "hover:bg-red-500/10",
          ].join(" ")}
          title={!isOpen ? "Logout" : undefined}
        >
          <span className="w-6 grid place-items-center shrink-0">
            <LogOut size={20} className="group-hover:translate-x-1 transition-transform" />
          </span>
          {isOpen ? <span className="text-sm">Logout</span> : null}
        </button>
      </div>
    </aside>
  );
};

export default function ManagerPortal({ onLogout, auth }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const stored = window.localStorage.getItem(MANAGER_SIDEBAR_PREF_KEY);
      if (stored === "0") return false;
      if (stored === "1") return true;
    } catch { void 0; }
    return window.innerWidth >= 1024;
  });
  const [month, setMonth] = useState(() => formatYearMonth(new Date()));
  const [managerId, setManagerId] = useState(() => String(auth?.employeeId || "").trim() || "");
  const [managerBand, setManagerBand] = useState(() => String(auth?.band || "").trim());
  const [managerStream, setManagerStream] = useState(() => String(auth?.stream || "").trim());
  const [filter, setFilter] = useState("ALL"); // SUBMITTED | ALL | PENDING_MANAGER_REVIEW
  const [activeTab, setActiveTab] = useState("team"); // team | self-review
  const [managerSelfReviewText, setManagerSelfReviewText] = useState("");
  const [managerSelfKpiRatings, setManagerSelfKpiRatings] = useState({});
  const [managerSelfValueRatings, setManagerSelfValueRatings] = useState({});
  const [savingSelfReview, setSavingSelfReview] = useState(false);
  const [managerDraftSaving, setManagerDraftSaving] = useState(false);
  const [managerDraftError, setManagerDraftError] = useState("");
  const [selfRatingValidationError, setSelfRatingValidationError] = useState("");
  const [hydratingSelfSubmission, setHydratingSelfSubmission] = useState(false);
  const [selfSubmissionMeta, setSelfSubmissionMeta] = useState(null);

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [notificationsNextCursor, setNotificationsNextCursor] = useState(null);
  const notificationsPanelRef = useRef(null);
  const notificationsLoadedRef = useRef(false);
  const notifiedEventKeysRef = useRef(new Set());
  const lastSavedSelfDraftHashRef = useRef("");
  const [aiAgent, setAiAgent] = useState(null);
  const [aiEnhancingSelfReview, setAiEnhancingSelfReview] = useState(false);
  const [aiEnhancingManagerNotes, setAiEnhancingManagerNotes] = useState(false);

  const [kpiIndex, setKpiIndex] = useState({}); // { [id]: { title, weight } }
  const [selfKpis, setSelfKpis] = useState([]);
  const [selfKpisLoading, setSelfKpisLoading] = useState(false);
  const [selfValues, setSelfValues] = useState([]);
  const [selfValuesLoading, setSelfValuesLoading] = useState(false);
  const filteredSelfKpis = useMemo(
    () => selfKpis.filter((k) => kpiAppliesToManager(k, { band: managerBand, stream: managerStream })),
    [managerBand, managerStream, selfKpis]
  );
  const filteredSelfKpiIds = useMemo(
    () => filteredSelfKpis.map((k) => String(k?.id || "").trim()).filter(Boolean),
    [filteredSelfKpis]
  );

  const [teamSubs, setTeamSubs] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState("");
  const [teamCursor, setTeamCursor] = useState(null);
  const [teamNextCursor, setTeamNextCursor] = useState(null);
  const [teamCursorStack, setTeamCursorStack] = useState([]);
  const [teamTotals, setTeamTotals] = useState({
    total: null,
    submittedCount: null,
    pendingManagerReviewCount: null,
  });
  const [teamInsightsRows, setTeamInsightsRows] = useState([]);
  const [teamInsightsLoading, setTeamInsightsLoading] = useState(false);
  const teamCursorRef = useRef(null);

  const [reviewModal, setReviewModal] = useState({ open: false, row: null });
  const [reviewDrafts, setReviewDrafts] = useState(() => loadManagerReviewDrafts());
  const [managerRatings, setManagerRatings] = useState({});
  const [managerValueRatings, setManagerValueRatings] = useState({});
  const [managerNotes, setManagerNotes] = useState("");
  const [savingReview, setSavingReview] = useState(false);
  const cycleInfo = useMemo(() => getCycleForMonth(month || new Date()), [month]);
  const cycleMonthOptions = useMemo(() => buildCycleMonthOptions(month || new Date()), [month]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MANAGER_SIDEBAR_PREF_KEY, isSidebarOpen ? "1" : "0");
    } catch { void 0; }
  }, [isSidebarOpen]);

  useEffect(() => {
    teamCursorRef.current = teamCursor;
  }, [teamCursor]);

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

  const showToast = useCallback((next) => {
    setToast(next);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  const unreadNotificationsCount = useMemo(
    () => notifications.reduce((count, item) => (item?.read ? count : count + 1), 0),
    [notifications]
  );

  const reloadNotifications = useCallback(async ({
    signal,
    cursor = null,
    append = false,
    silent = false,
  } = {}) => {
    if (!silent || !notificationsLoadedRef.current) {
      setNotificationsLoading(true);
    }
    setNotificationsError("");
    try {
      const data = await fetchManagerNotifications({
        limit: MANAGER_NOTIFICATION_PAGE_SIZE,
        cursor,
        unreadOnly: false,
        signal,
      });
      const page = normalizeManagerNotificationPage(data);
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
    setNotifications((prev) => mergeNotifications(prev, [incoming]).slice(0, MANAGER_NOTIFICATION_PAGE_SIZE * 3));
    if (notifiedEventKeysRef.current.has(eventKey)) return;
    notifiedEventKeysRef.current.add(eventKey);
    if (notifiedEventKeysRef.current.size > 500) {
      notifiedEventKeysRef.current = new Set(Array.from(notifiedEventKeysRef.current).slice(-250));
    }
    showToast({
      title: incoming.title || "New employee submission",
      message: incoming.message || "",
    });
  }, [showToast]);

  const markNotificationRead = useCallback(async (notificationId) => {
    const id = String(notificationId ?? "").trim();
    if (!id) return;
    try {
      await markManagerNotificationRead(id);
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
      await markAllManagerNotificationsRead();
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
    const controller = new AbortController();
    reloadNotifications({ signal: controller.signal }).catch(() => {});

    const timer = window.setInterval(() => {
      reloadNotifications({ silent: true }).catch(() => {});
    }, MANAGER_NOTIFICATION_POLL_MS);

    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [reloadNotifications]);

  useEffect(() => {
    const unsubscribe = subscribeManagerNotificationsStream({
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
    (async () => {
      try {
        const data = await fetchActiveAiAgent({ signal: controller.signal });
        if (!mounted) return;
        const provider = String(data?.provider || "").trim();
        setAiAgent(isAiEnhancementConfigured(data) ? { provider: provider || "openai" } : null);
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!mounted) return;
        setAiAgent(null);
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!cycleMonthOptions.length) return;
    const current = normalizeYearMonth(month);
    if (current && cycleMonthOptions.some((opt) => opt.value === current)) return;
    setMonth(cycleMonthOptions[cycleMonthOptions.length - 1].value);
  }, [cycleMonthOptions, month]);

  function handleSelfRatingChange(kind, id, rawValue) {
    if (selfReviewLocked) return;

    const raw = String(rawValue ?? "").trim();
    if (raw === "") {
      setSelfRatingValidationError("");
      if (kind === "kpi") {
        setManagerSelfKpiRatings((prev) => {
          const next = { ...(prev || {}) };
          delete next[id];
          return next;
        });
      } else {
        setManagerSelfValueRatings((prev) => {
          const next = { ...(prev || {}) };
          delete next[id];
          return next;
        });
      }
      return;
    }

    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) {
      setSelfRatingValidationError("Enter a valid rating between 1 and 5.");
      return;
    }

    const rounded = Math.round(parsed * 10) / 10;
    if (rounded > 5) {
      setSelfRatingValidationError("Rating cannot be more than 5.");
      return;
    }
    if (rounded < 1) {
      setSelfRatingValidationError("Rating cannot be less than 1.");
      return;
    }

    setSelfRatingValidationError("");
    if (kind === "kpi") {
      setManagerSelfKpiRatings((prev) => ({
        ...(prev || {}),
        [id]: rounded,
      }));
    } else {
      setManagerSelfValueRatings((prev) => ({
        ...(prev || {}),
        [id]: rounded,
      }));
    }
  }

  async function enhanceManagerSelfReview() {
    if (!aiAgent) {
      showToast({ title: "AI unavailable", message: "No active AI agent is configured." });
      return;
    }
    const input = String(managerSelfReviewText || "").trim();
    if (!input) {
      showToast({ title: "Missing content", message: "Write your self review first." });
      return;
    }

    setAiEnhancingSelfReview(true);
    try {
      const enhanced = await enhanceReviewText({ text: input, mode: "self_review" });
      setManagerSelfReviewText(enhanced);
      showToast({ title: "Enhanced", message: "Updated your self review text." });
    } catch (err) {
      showToast({ title: "AI failed", message: err?.message || "Please try again." });
    } finally {
      setAiEnhancingSelfReview(false);
    }
  }

  async function enhanceManagerReviewNotes() {
    if (!aiAgent) {
      showToast({ title: "AI unavailable", message: "No active AI agent is configured." });
      return;
    }
    const input = String(managerNotes || "").trim();
    if (!input) {
      showToast({ title: "Missing content", message: "Write manager comments first." });
      return;
    }

    setAiEnhancingManagerNotes(true);
    try {
      const enhanced = await enhanceReviewText({ text: input, mode: "manager_review" });
      setManagerNotes(enhanced);
      showToast({ title: "Enhanced", message: "Updated manager comments." });
    } catch (err) {
      showToast({ title: "AI failed", message: err?.message || "Please try again." });
    } finally {
      setAiEnhancingManagerNotes(false);
    }
  }

  function closeReviewModal() {
    setReviewModal({ open: false, row: null });
    setManagerRatings({});
    setManagerValueRatings({});
    setManagerNotes("");
    setSavingReview(false);
  }

  const selectedRow = reviewModal.open ? reviewModal.row : null;
  const selectedKey = selectedRow ? `${selectedRow.employee.id}:${String(selectedRow.month || month)}` : "";

  useEffect(() => {
    if (!reviewModal.open || !selectedRow) return;
    const existing = selectedKey ? reviewDrafts?.[selectedKey] : null;
    const managerEval =
      selectedRow?.raw?.managerEvaluation && typeof selectedRow.raw.managerEvaluation === "object"
        ? selectedRow.raw.managerEvaluation
        : selectedRow?.raw?.payload?.managerEvaluation && typeof selectedRow.raw.payload.managerEvaluation === "object"
          ? selectedRow.raw.payload.managerEvaluation
          : {};
    const baseRatings = normalizeSelfKpiRatings(
      managerEval?.kpiRatings && typeof managerEval.kpiRatings === "object"
        ? managerEval.kpiRatings
        : selectedRow?.payload?.kpiRatings && typeof selectedRow.payload.kpiRatings === "object"
          ? selectedRow.payload.kpiRatings
          : {}
    );
    const initialRatings =
      existing?.kpiRatings && typeof existing.kpiRatings === "object"
        ? existing.kpiRatings
        : baseRatings;
    const baseValueRatings = normalizeSelfValueRatings(
      managerEval?.webknotValueRatings ??
      managerEval?.webknotValues ??
      selectedRow?.payload?.webknotValueRatings ??
      selectedRow?.payload?.webknotValues
    );
    const initialValueRatings =
      existing?.valueRatings && typeof existing.valueRatings === "object"
        ? normalizeSelfValueRatings(existing.valueRatings)
        : baseValueRatings;
    setManagerRatings({ ...(initialRatings || {}) });
    setManagerValueRatings({ ...(initialValueRatings || {}) });
    setManagerNotes(String(existing?.notes ?? managerEval?.comments ?? "").trim());
  }, [reviewDrafts, reviewModal.open, selectedKey, selectedRow]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      try {
        await fetchPortalManager({ signal: controller.signal });
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
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      const hasManagerId = Boolean(String(managerId || "").trim());
      const hasManagerBand = Boolean(String(managerBand || "").trim());
      const hasManagerStream = Boolean(String(managerStream || "").trim());
      if (hasManagerId && hasManagerBand && hasManagerStream) return;
      try {
        const me = await fetchMe({ signal: controller.signal });
        if (!mounted) return;
        const root = me && typeof me === "object" ? me : {};
        const obj =
          root?.data && typeof root.data === "object" && !Array.isArray(root.data)
            ? root.data
            : root;

        const id = String(obj?.employeeId ?? obj?.empId ?? obj?.id ?? "").trim();
        const band = String(obj?.band ?? obj?.level ?? "").trim();
        const stream = String(obj?.stream ?? obj?.context ?? "").trim();
        if (id) setManagerId(id);
        if (band) setManagerBand(band);
        if (stream) setManagerStream(stream);
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
  }, [managerBand, managerId, managerStream, onLogout]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      setSelfKpisLoading(true);
      try {
        const data = await fetchKpiDefinitions({ signal: controller.signal });
        if (!mounted) return;
        const list = normalizeKpiDefinitions(data);
        const map = {};
        for (const k of list) map[String(k.id)] = { title: k.title, weight: k.weight };
        setKpiIndex(map);
        setSelfKpis(list);
      } catch { void 0; } finally {
        if (mounted) setSelfKpisLoading(false);
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      setSelfValuesLoading(true);
      try {
        const rows = [];
        let cursor = null;
        for (let i = 0; i < 100; i += 1) {
          const data = await fetchValues(true, {
            limit: 100,
            cursor,
            signal: controller.signal,
          });
          const page = normalizeCursorPage(data);
          rows.push(...normalizeWebknotValuesList(page.items));
          if (!page.nextCursor) break;
          cursor = page.nextCursor;
        }

        const list = rows
          .map((v) => ({
            id: String(v?.id || "").trim(),
            title: String(v?.title || v?.id || "").trim(),
            pillar: String(v?.pillar || "—").trim() || "—",
          }))
          .filter((v) => Boolean(v.id));
        const deduped = [];
        const seen = new Set();
        for (const item of list) {
          const id = String(item.id || "").trim();
          if (!id || seen.has(id)) continue;
          seen.add(id);
          deduped.push(item);
        }
        if (!mounted) return;
        setSelfValues(deduped);
      } catch {
        if (!mounted) return;
        setSelfValues([]);
      } finally {
        if (mounted) setSelfValuesLoading(false);
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  const reloadTeam = useCallback(
    async ({ signal, cursor, pageAction = "stay", fromCursor = null } = {}) => {
      const resolvedCursor = cursor === undefined ? (teamCursorRef.current ?? null) : (cursor ?? null);
      setTeamError("");
      setTeamLoading(true);
      try {
        const data = await fetchManagerTeamSubmissions({
          month,
          limit: TEAM_PAGE_SIZE,
          cursor: resolvedCursor,
          signal,
        });
        const page = normalizeTeamPage(data);
        let rows = Array.isArray(page.items) ? page.items : [];
        let nextCursor = page.nextCursor ?? null;
        let total = page.total;
        let submitted = page.submittedCount;
        let pendingReview = page.pendingManagerReviewCount;

        if (rows.length === 0 && !nextCursor) {
          const managerKey = String(managerId || auth?.employeeId || "").trim();
          if (managerKey) {
            const reporteeData = await fetchManagerReportees(managerKey, { signal });
            const fallbackRows = normalizeReporteesAsPendingSubmissions(reporteeData, month)
              .sort((a, b) =>
                String(b?.submittedAt || b?.updatedAt || "").localeCompare(String(a?.submittedAt || a?.updatedAt || ""))
              );
            const offset = Number.parseInt(String(resolvedCursor ?? "0"), 10);
            const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;
            const end = Math.min(safeOffset + TEAM_PAGE_SIZE, fallbackRows.length);
            rows = fallbackRows.slice(safeOffset, end);
            nextCursor = end < fallbackRows.length ? String(end) : null;
            total = fallbackRows.length;
            submitted = fallbackRows.filter((s) => isSubmittedStatus(s.status)).length;
            pendingReview = fallbackRows.filter((s) => isSubmittedStatus(s.status) && !s.managerSubmitted).length;
          }
        }

        const sorted = sortTeamRowsByLatest(dedupeTeamRows(rows, month));
        setTeamSubs(sorted);
        setTeamNextCursor(nextCursor);
        setTeamCursor(resolvedCursor);
        teamCursorRef.current = resolvedCursor;
        setTeamTotals({
          total: Number.isFinite(total) ? total : null,
          submittedCount: Number.isFinite(submitted) ? submitted : null,
          pendingManagerReviewCount: Number.isFinite(pendingReview) ? pendingReview : null,
        });
        setTeamCursorStack((prev) => {
          if (pageAction === "next") return [...prev, (fromCursor ?? teamCursorRef.current ?? null)];
          if (pageAction === "prev") return prev.slice(0, -1);
          if (pageAction === "reset") return [];
          return prev;
        });
      } catch (err) {
        if (err?.status === 401) {
          onLogout?.();
          return;
        }
        setTeamError(err?.message || "Failed to load team submissions.");
        setTeamSubs([]);
        setTeamNextCursor(null);
        setTeamTotals({
          total: null,
          submittedCount: null,
          pendingManagerReviewCount: null,
        });
      } finally {
        setTeamLoading(false);
      }
    },
    [auth?.employeeId, managerId, month, onLogout]
  );

  const reloadTeamInsights = useCallback(
    async ({ signal } = {}) => {
      if (!String(month || "").trim()) {
        setTeamInsightsRows([]);
        return;
      }

      setTeamInsightsLoading(true);
      try {
        const rows = [];
        let cursor = null;

        for (let i = 0; i < 200; i += 1) {
          const data = await fetchManagerTeamSubmissions({
            month,
            limit: 100,
            cursor,
            signal,
          });
          const page = normalizeTeamPage(data);
          if (Array.isArray(page.items) && page.items.length) {
            rows.push(...page.items);
          }
          if (!page.nextCursor) break;
          cursor = page.nextCursor;
        }

        if (rows.length === 0) {
          const managerKey = String(managerId || auth?.employeeId || "").trim();
          if (managerKey) {
            const reporteeData = await fetchManagerReportees(managerKey, { signal });
            rows.push(...normalizeReporteesAsPendingSubmissions(reporteeData, month));
          }
        }

        setTeamInsightsRows(sortTeamRowsByLatest(dedupeTeamRows(rows, month)));
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (err?.status === 401) {
          onLogout?.();
          return;
        }
        setTeamInsightsRows([]);
      } finally {
        setTeamInsightsLoading(false);
      }
    },
    [auth?.employeeId, managerId, month, onLogout]
  );

  useEffect(() => {
    if (!String(month || "").trim()) return;
    reloadTeam({ cursor: null, pageAction: "reset" }).catch(() => {});
  }, [managerId, month, reloadTeam]);

  useEffect(() => {
    if (!String(month || "").trim()) return;
    const controller = new AbortController();
    reloadTeamInsights({ signal: controller.signal }).catch(() => {});
    return () => controller.abort();
  }, [managerId, month, reloadTeamInsights]);

  useEffect(() => {
    if (!String(month || "").trim()) return;
    let mounted = true;
    const controller = new AbortController();

    async function run() {
      setHydratingSelfSubmission(true);
      setManagerDraftError("");
      try {
        const data = await fetchMyMonthlySubmission({ month, signal: controller.signal });
        if (!mounted) return;

        const normalized = normalizeMonthlySubmission(data);
        if (!normalized) {
          setSelfSubmissionMeta(null);
          setManagerSelfReviewText("");
          setManagerSelfKpiRatings({});
          setManagerSelfValueRatings({});
          const cleared = buildManagerSelfSubmissionPayload({
            month,
            selfReviewText: "",
            kpiRatings: {},
            selectedValues: {},
            allowedKpiIds: filteredSelfKpiIds,
            managerId,
            reviewStatus: "DRAFT",
            reopenedForResubmission: false,
          });
          lastSavedSelfDraftHashRef.current = payloadHash(cleared);
          return;
        }

        const nextKpis = normalizeSelfKpiRatings(normalized.kpiRatings);
        const nextValues = normalizeSelfValueRatings(
          normalized.webknotValueRatings ?? normalized.webknotValues
        );

        setSelfSubmissionMeta({
          id: normalized.id,
          month: normalized.month || month,
          status: normalized.status || null,
          submissionType: normalized.submissionType || "MANAGER_SELF_REVIEW",
          cycleKey: normalized.cycleKey || null,
          cycleLabel: normalized.cycleLabel || null,
          reviewStatus: normalized.reviewStatus || null,
          managerReview: normalized.managerReview || null,
          managerSubmittedAt: normalized.managerSubmittedAt || null,
          adminReview: normalized.adminReview || null,
          adminSubmittedAt: normalized.adminSubmittedAt || null,
          reopenedForResubmission: Boolean(normalized.reopenedForResubmission),
          resubmissionRequested: Boolean(normalized.resubmissionRequested),
          submittedAt: normalized.submittedAt || null,
          updatedAt: normalized.updatedAt || null,
        });
        setManagerSelfReviewText(normalized.selfReviewText || "");
        setManagerSelfKpiRatings(nextKpis);
        setManagerSelfValueRatings(nextValues);

        const loaded = buildManagerSelfSubmissionPayload({
          month: normalized.month || month,
          selfReviewText: normalized.selfReviewText || "",
          kpiRatings: nextKpis,
          selectedValues: nextValues,
          allowedKpiIds: filteredSelfKpiIds,
          managerId,
          reviewStatus: normalized.reviewStatus || "DRAFT",
          reopenedForResubmission: normalized.reopenedForResubmission,
        });
        lastSavedSelfDraftHashRef.current = payloadHash(loaded);
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!mounted) return;
        if (err?.status === 401) {
          onLogout?.();
          return;
        }
        setManagerDraftError(err?.message || "Failed to load self review.");
      } finally {
        if (mounted) setHydratingSelfSubmission(false);
      }
    }

    run();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [filteredSelfKpiIds, managerId, month, onLogout]);

  const selfReviewLocked = useMemo(
    () => isManagerSelfReviewLocked(selfSubmissionMeta),
    [selfSubmissionMeta]
  );
  const selfNeedsResubmission = useMemo(
    () => Boolean(isResubmissionRequested(selfSubmissionMeta)),
    [selfSubmissionMeta]
  );
  const selfLatestReviewComment = useMemo(() => {
    const admin = String(selfSubmissionMeta?.adminReview?.comments || "").trim();
    const manager = String(selfSubmissionMeta?.managerReview?.comments || "").trim();
    return admin || manager || "";
  }, [selfSubmissionMeta?.adminReview?.comments, selfSubmissionMeta?.managerReview?.comments]);

  useEffect(() => {
    if (!String(month || "").trim()) return;
    if (hydratingSelfSubmission) return;
    if (selfReviewLocked) return;

    const payload = buildManagerSelfSubmissionPayload({
      month,
      selfReviewText: managerSelfReviewText,
      kpiRatings: managerSelfKpiRatings,
      selectedValues: managerSelfValueRatings,
      allowedKpiIds: filteredSelfKpiIds,
      managerId,
      reviewStatus: selfSubmissionMeta?.reviewStatus || "DRAFT",
      reopenedForResubmission: selfSubmissionMeta?.reopenedForResubmission,
    });

    const hash = payloadHash(payload);
    if (hash === lastSavedSelfDraftHashRef.current) return;

    const delayMs = getDraftAutosaveDelayMs();
    const id = window.setTimeout(async () => {
      setManagerDraftError("");
      setManagerDraftSaving(true);
      try {
        await saveMonthlyDraft(payload);
        lastSavedSelfDraftHashRef.current = hash;
      } catch (err) {
        if (err?.status === 401) {
          onLogout?.();
          return;
        }
        setManagerDraftError(err?.message || "Failed to save draft.");
      } finally {
        setManagerDraftSaving(false);
      }
    }, delayMs);

    return () => window.clearTimeout(id);
  }, [
    hydratingSelfSubmission,
    managerSelfKpiRatings,
    managerSelfReviewText,
    managerSelfValueRatings,
    managerId,
    month,
    onLogout,
    filteredSelfKpiIds,
    selfSubmissionMeta?.reviewStatus,
    selfSubmissionMeta?.reopenedForResubmission,
    selfReviewLocked,
  ]);

  const teamInsightSourceRows = useMemo(
    () => (teamInsightsRows.length ? teamInsightsRows : teamSubs),
    [teamInsightsRows, teamSubs]
  );
  const hasFullInsights = teamInsightsRows.length > 0;

  const reporteeCount = useMemo(() => {
    if (hasFullInsights) {
      const ids = new Set(
        teamInsightsRows
          .map((s) => String(s?.employee?.id || "").trim())
          .filter((id) => id && id !== "—")
      );
      return ids.size;
    }
    if (Number.isFinite(teamTotals.total)) return Number(teamTotals.total);
    const ids = new Set(
      teamInsightSourceRows
        .map((s) => String(s?.employee?.id || "").trim())
        .filter((id) => id && id !== "—")
    );
    return ids.size;
  }, [hasFullInsights, teamInsightSourceRows, teamInsightsRows, teamTotals.total]);
  const submittedCount = useMemo(() => {
    if (hasFullInsights) {
      return teamInsightsRows.filter((s) => isSubmittedStatus(s.status)).length;
    }
    if (Number.isFinite(teamTotals.submittedCount)) return Number(teamTotals.submittedCount);
    return teamInsightSourceRows.filter((s) => isSubmittedStatus(s.status)).length;
  }, [hasFullInsights, teamInsightSourceRows, teamInsightsRows, teamTotals.submittedCount]);
  const pendingManagerReviewCount = useMemo(() => {
    if (hasFullInsights) {
      return teamInsightsRows.filter((s) => isSubmittedStatus(s.status) && !s.managerSubmitted).length;
    }
    if (Number.isFinite(teamTotals.pendingManagerReviewCount)) return Number(teamTotals.pendingManagerReviewCount);
    return teamInsightSourceRows.filter((s) => isSubmittedStatus(s.status) && !s.managerSubmitted).length;
  }, [hasFullInsights, teamInsightSourceRows, teamInsightsRows, teamTotals.pendingManagerReviewCount]);

  const filteredTeamSubs = useMemo(() => {
    const mode = String(filter || "").toUpperCase();
    if (mode === "ALL") return teamSubs;
    if (mode === "PENDING_MANAGER_REVIEW") {
      return teamSubs.filter((s) => isSubmittedStatus(s.status) && !s.managerSubmitted);
    }
    return teamSubs.filter((s) => isSubmittedStatus(s.status));
  }, [filter, teamSubs]);

  const teamPager = useMemo(
    () => ({
      canPrev: teamCursorStack.length > 0,
      canNext: Boolean(teamNextCursor),
      onReset: () => {
        reloadTeam({ cursor: null, pageAction: "reset" }).catch(() => {});
      },
      onPrev: () => {
        const prevCursor = teamCursorStack[teamCursorStack.length - 1] ?? null;
        reloadTeam({ cursor: prevCursor, pageAction: "prev" }).catch(() => {});
      },
      onNext: () => {
        if (!teamNextCursor) return;
        reloadTeam({ cursor: teamNextCursor, pageAction: "next", fromCursor: teamCursor }).catch(() => {});
      },
      loading: teamLoading,
      label: `Page ${teamCursorStack.length + 1}`,
    }),
    [reloadTeam, teamCursor, teamCursorStack, teamLoading, teamNextCursor]
  );

  const managerInsights = useMemo(() => {
    const submittedRows = teamInsightSourceRows.filter((row) => isSubmittedStatus(row?.status));
    const reviewedRows = submittedRows.filter((row) => row?.managerSubmitted);
    const pendingRows = submittedRows.filter((row) => !row?.managerSubmitted);
    const rejectedRows = teamInsightSourceRows.filter((row) => String(row?.status || "").toUpperCase().includes("NEEDS_REVIEW"));

    const reviewedCoverage = submittedRows.length
      ? Math.round((reviewedRows.length / submittedRows.length) * 100)
      : 0;
    const pendingCoverage = submittedRows.length
      ? Math.round((pendingRows.length / submittedRows.length) * 100)
      : 0;

    const turnaroundHours = reviewedRows
      .map((row) => {
        const start = new Date(row?.submittedAt || row?.updatedAt || "");
        const end = new Date(row?.managerSubmittedAt || row?.updatedAt || "");
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
        const deltaHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        return Number.isFinite(deltaHours) && deltaHours >= 0 ? deltaHours : null;
      })
      .filter((v) => typeof v === "number");
    const avgTurnaroundHours = turnaroundHours.length
      ? Math.round((turnaroundHours.reduce((sum, v) => sum + v, 0) / turnaroundHours.length) * 10) / 10
      : 0;

    const pendingPreview = pendingRows
      .slice(0, 5)
      .map((row) => ({
        id: String(row?.employee?.id || "—"),
        name: String(row?.employee?.name || "Unknown"),
      }));

    const queueFunnel = [
      { id: "submitted", label: "Submitted", value: submittedRows.length, colorClass: "bg-blue-500" },
      { id: "reviewed", label: "Reviewed", value: reviewedRows.length, colorClass: "bg-emerald-500" },
      { id: "pending", label: "Pending", value: pendingRows.length, colorClass: "bg-amber-500" },
      { id: "rejected", label: "Rejected", value: rejectedRows.length, colorClass: "bg-rose-500" },
    ];
    const maxFunnel = Math.max(1, ...queueFunnel.map((item) => item.value));

    return {
      reviewedCoverage,
      pendingCoverage,
      avgTurnaroundHours,
      pendingPreview,
      queueFunnel,
      maxFunnel,
      rejectedCount: rejectedRows.length,
    };
  }, [teamInsightSourceRows]);

  const managerGranularity = useMemo(() => {
    const streamMap = new Map();
    const bandMap = new Map();
    const topSignals = [];

    const getScore = (row) => {
      const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
      const managerEval =
        row?.raw?.managerEvaluation && typeof row.raw.managerEvaluation === "object"
          ? row.raw.managerEvaluation
          : row?.raw?.payload?.managerEvaluation && typeof row.raw.payload.managerEvaluation === "object"
            ? row.raw.payload.managerEvaluation
            : null;

      const kpiSource = managerEval?.kpiRatings ?? payload?.kpiRatings;
      const valueSource = managerEval?.webknotValueRatings ?? payload?.webknotValueRatings;
      const values = [];

      if (kpiSource && typeof kpiSource === "object") {
        for (const v of Object.values(kpiSource)) {
          const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
          if (Number.isFinite(n) && n >= 1 && n <= 5) values.push(n);
        }
      }
      if (valueSource && typeof valueSource === "object") {
        for (const v of Object.values(valueSource)) {
          const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
          if (Number.isFinite(n) && n >= 1 && n <= 5) values.push(n);
        }
      }
      if (!values.length) return null;
      return Math.round((values.reduce((sum, x) => sum + x, 0) / values.length) * 10) / 10;
    };

    for (const row of teamInsightSourceRows) {
      const employeeRaw =
        row?.raw?.employee && typeof row.raw.employee === "object"
          ? row.raw.employee
          : row?.raw?.reportee && typeof row.raw.reportee === "object"
            ? row.raw.reportee
            : {};
      const stream = String(employeeRaw?.stream || row?.raw?.stream || "Unassigned").trim() || "Unassigned";
      const band = String(employeeRaw?.band || row?.raw?.band || "Unassigned").trim() || "Unassigned";
      const submitted = isSubmittedStatus(row?.status);
      const reviewed = Boolean(row?.managerSubmitted);

      const streamStats = streamMap.get(stream) || { total: 0, submitted: 0, reviewed: 0 };
      streamStats.total += 1;
      if (submitted) streamStats.submitted += 1;
      if (reviewed) streamStats.reviewed += 1;
      streamMap.set(stream, streamStats);

      const bandStats = bandMap.get(band) || { total: 0, submitted: 0, reviewed: 0 };
      bandStats.total += 1;
      if (submitted) bandStats.submitted += 1;
      if (reviewed) bandStats.reviewed += 1;
      bandMap.set(band, bandStats);

      const score = getScore(row);
      if (score != null) {
        topSignals.push({
          id: String(row?.employee?.id || "—"),
          name: String(row?.employee?.name || "Unknown"),
          band,
          stream,
          score,
        });
      }
    }

    const streamRows = Array.from(streamMap.entries())
      .map(([name, stats]) => ({
        name,
        total: stats.total,
        submittedRate: stats.total ? Math.round((stats.submitted / stats.total) * 100) : 0,
        reviewedRate: stats.total ? Math.round((stats.reviewed / stats.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    const bandRows = Array.from(bandMap.entries())
      .map(([name, stats]) => ({
        name,
        total: stats.total,
        submittedRate: stats.total ? Math.round((stats.submitted / stats.total) * 100) : 0,
        reviewedRate: stats.total ? Math.round((stats.reviewed / stats.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    const topEmployees = topSignals
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return { streamRows, bandRows, topEmployees };
  }, [teamInsightSourceRows]);

  const account = useMemo(() => {
    const name =
      String(auth?.employeeName || "").trim() ||
      String(auth?.name || "").trim() ||
      String(auth?.email || auth?.claims?.sub || "").trim() ||
      "Unknown";
    const email = String(auth?.email || auth?.claims?.sub || "").trim() || null;
    const role = "Manager";
    const subtitle = [managerStream, managerBand].filter(Boolean).join(" • ") || null;
    return { name, email, role, subtitle };
  }, [auth?.claims?.sub, auth?.email, auth?.employeeName, auth?.name, managerBand, managerStream]);

  const handleSidebarTabChange = (nextTab) => {
    setActiveTab(nextTab);
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  async function saveManagerSelfReviewDraft() {
    if (selfReviewLocked) {
      showToast({ title: "Locked", message: "You already submitted this month's self review." });
      return;
    }
    const payload = buildManagerSelfSubmissionPayload({
      month,
      selfReviewText: managerSelfReviewText,
      kpiRatings: managerSelfKpiRatings,
      selectedValues: managerSelfValueRatings,
      allowedKpiIds: filteredSelfKpiIds,
      managerId,
      reviewStatus: selfSubmissionMeta?.reviewStatus || "DRAFT",
      reopenedForResubmission: selfSubmissionMeta?.reopenedForResubmission,
    });
    setSavingSelfReview(true);
    setManagerDraftError("");
    try {
      await saveMonthlyDraft(payload);
      lastSavedSelfDraftHashRef.current = payloadHash(payload);
      showToast({ title: "Draft saved", message: "Manager self review saved." });
    } catch (err) {
      setManagerDraftError(err?.message || "Please try again.");
      showToast({ title: "Save failed", message: err?.message || "Please try again." });
    } finally {
      setSavingSelfReview(false);
    }
  }

  async function submitManagerSelfReview() {
    if (selfReviewLocked) {
      showToast({ title: "Already submitted", message: "Manager self review can be submitted once per month." });
      return;
    }
    const text = String(managerSelfReviewText || "").trim();
    if (!text) {
      showToast({ title: "Missing self review", message: "Write your self review before submitting." });
      return;
    }
    const payload = {
      ...buildManagerSelfSubmissionPayload({
        month,
        selfReviewText: text,
        kpiRatings: managerSelfKpiRatings,
        selectedValues: managerSelfValueRatings,
        allowedKpiIds: filteredSelfKpiIds,
        managerId,
        reviewStatus: "SUBMITTED",
        reopenedForResubmission: false,
      }),
      submittedAt: new Date().toISOString(),
    };
    setSavingSelfReview(true);
    try {
      const res = await submitMonthlySubmission(payload);
      const normalized = normalizeMonthlySubmission(res);
      const now = new Date().toISOString();
      setSelfSubmissionMeta({
        id: normalized?.id ?? selfSubmissionMeta?.id ?? null,
        month: normalized?.month ?? month,
        status: normalized?.status ?? "SUBMITTED",
        submissionType: normalized?.submissionType ?? "MANAGER_SELF_REVIEW",
        cycleKey: normalized?.cycleKey ?? buildCycleMeta(month).cycleKey,
        cycleLabel: normalized?.cycleLabel ?? buildCycleMeta(month).cycleLabel,
        reviewStatus: normalized?.reviewStatus ?? "SUBMITTED",
        managerReview: normalized?.managerReview ?? null,
        managerSubmittedAt: normalized?.managerSubmittedAt ?? null,
        adminReview: normalized?.adminReview ?? null,
        adminSubmittedAt: normalized?.adminSubmittedAt ?? null,
        reopenedForResubmission: Boolean(normalized?.reopenedForResubmission),
        resubmissionRequested: Boolean(normalized?.resubmissionRequested),
        submittedAt: normalized?.submittedAt ?? payload.submittedAt ?? now,
        updatedAt: normalized?.updatedAt ?? now,
      });
      lastSavedSelfDraftHashRef.current = payloadHash(
        buildManagerSelfSubmissionPayload({
          month,
          selfReviewText: managerSelfReviewText,
          kpiRatings: managerSelfKpiRatings,
          selectedValues: managerSelfValueRatings,
          allowedKpiIds: filteredSelfKpiIds,
          managerId,
          reviewStatus: "SUBMITTED",
          reopenedForResubmission: false,
        })
      );
      showToast({ title: "Submitted", message: "Manager self review submitted." });
    } catch (err) {
      showToast({ title: "Submit failed", message: err?.message || "Please try again." });
    } finally {
      setSavingSelfReview(false);
    }
  }

  function validateManagerReview(action) {
    if (!selectedRow) return { ok: false, message: "No submission selected." };
    const reviewAction = String(action || "").trim().toUpperCase();
    const expectedIds = Object.keys(selectedRow?.payload?.kpiRatings || {});
    const normalizedRatings = {};
    const expectedValueIds = Array.from(
      new Set([
        ...Object.keys(
          selectedRow?.payload?.webknotValueRatings && typeof selectedRow.payload.webknotValueRatings === "object"
            ? selectedRow.payload.webknotValueRatings
            : {}
        ),
        ...(Array.isArray(selectedRow?.payload?.webknotValues)
          ? selectedRow.payload.webknotValues.map((x) => String(x || "").trim())
          : []),
      ].filter(Boolean))
    );
    const normalizedValueRatings = {};

    for (const id of expectedIds) {
      const raw = managerRatings?.[id];
      if (reviewAction === "SUBMIT" && (raw == null || raw === "")) {
        return { ok: false, message: "Rate all KPIs before submitting review." };
      }
      if (raw == null || raw === "") continue;
      const parsed = typeof raw === "number" ? raw : Number.parseFloat(String(raw));
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) {
        return { ok: false, message: "Manager KPI ratings must be between 1 and 5." };
      }
      normalizedRatings[id] = Math.round(parsed * 10) / 10;
    }

    for (const id of expectedValueIds) {
      const raw = managerValueRatings?.[id];
      if (reviewAction === "SUBMIT" && (raw == null || raw === "")) {
        return { ok: false, message: "Rate all Webknot values before submitting review." };
      }
      if (raw == null || raw === "") continue;
      const parsed = typeof raw === "number" ? raw : Number.parseFloat(String(raw));
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) {
        return { ok: false, message: "Manager Webknot value ratings must be between 1 and 5." };
      }
      normalizedValueRatings[id] = Math.round(parsed * 10) / 10;
    }

    const notes = String(managerNotes || "").trim();
    if (reviewAction === "REJECT" && notes.length < 10) {
      return { ok: false, message: "Rejection comments must be at least 10 characters." };
    }

    return {
      ok: true,
      notes,
      normalizedRatings,
      normalizedValueRatings,
    };
  }

  async function submitManagerReviewDecision(action) {
    if (!selectedRow) return;

    const check = validateManagerReview(action);
    if (!check.ok) {
      showToast({ title: "Validation failed", message: check.message || "Please review the input." });
      return;
    }

    const reviewAction = String(action || "").trim().toUpperCase();
    const empId = String(selectedRow.employee.id || "").trim();
    const m = String(selectedRow.month || month || "").trim();
    if (!empId || !m) {
      showToast({ title: "Missing data", message: "Employee id or month is missing." });
      return;
    }

    const employeePayload = selectedRow.payload || {};
    const reviewedAt = new Date().toISOString();
    const employeeKpiRatings = normalizeSelfKpiRatings(employeePayload.kpiRatings || {});
    const employeeValueRatings = normalizeSelfValueRatings(
      employeePayload.webknotValueRatings ?? employeePayload.webknotValues
    );
    const employeeValueEntries = Object.entries(employeeValueRatings);
    const employeeCertifications = normalizeCertificationsForState(employeePayload.certifications);
    const cycleMeta = buildCycleMeta(m);
    const payload = {
      month: m,
      monthKey: m,
      cycleKey: cycleMeta.cycleKey,
      cycleLabel: cycleMeta.cycleLabel,
      cycleShortLabel: cycleMeta.cycleShortLabel,
      cycleStartMonth: cycleMeta.cycleStartMonth,
      cycleEndMonth: cycleMeta.cycleEndMonth,
      cycleMonth: cycleMeta.month,
      submissionType: selectedRow?.submissionType || "EMPLOYEE_MONTHLY_SUBMISSION",
      actorRole: "MANAGER",
      targetRole: "EMPLOYEE",
      workflowStage: "MANAGER_REVIEW",
      subjectEmployeeId: empId,
      profileVerified: true,
      employeeId: empId,
      selfReviewText: String(employeePayload.selfReviewText || ""),
      certifications: employeeCertifications,
      webknotValues: employeeValueEntries.map(([valueId]) => String(valueId || "").trim()),
      webknotValueRatings: Object.fromEntries(employeeValueEntries),
      webknotValueResponses: employeeValueEntries.map(([valueId, rating]) => ({
        valueId: String(valueId || "").trim(),
        rating,
      })),
      recognitionsCount: Number(employeePayload.recognitionsCount || 0) || 0,
      kpiRatings: Object.entries(employeeKpiRatings || {}).map(([kpiId, rating]) => ({
        kpiId: String(kpiId || "").trim(),
        rating,
      })),
      managerEvaluation: {
        kpiRatings: check.normalizedRatings,
        webknotValueRatings: check.normalizedValueRatings,
        comments: check.notes,
        reviewedAt,
        reviewedBy: managerId || null,
      },
      managerReview: {
        action: reviewAction,
        comments: check.notes,
        reviewedAt,
        reviewedBy: managerId || null,
      },
      managerSubmittedAt: reviewAction === "SUBMIT" ? reviewedAt : null,
      managerComments: check.notes,
      managerNotes: check.notes,
      reviewStatus: reviewAction === "REJECT" ? "NEEDS_REVIEW" : "MANAGER_SUBMITTED",
      reopenedForResubmission: reviewAction === "REJECT",
    };

    try {
      setSavingReview(true);
      if (reviewAction === "SUBMIT" || reviewAction === "REJECT") {
        await submitMonthlySubmission(payload);
        if (reviewAction === "SUBMIT") {
          showToast({ title: "Submitted", message: "Manager review submitted." });
        } else {
          showToast({ title: "Rejected", message: "Sent back with comments for resubmission." });
        }
      } else {
        await saveMonthlyDraft(payload);
      }
      if (reviewAction === "REJECT") {
        setTeamSubs((prev) =>
          prev.map((s) => {
            const sameEmp = String(s?.employee?.id || "") === empId;
            const sameMonth = String(s?.month || "") === m;
            if (!sameEmp || !sameMonth) return s;
            return {
              ...s,
              status: "NEEDS_REVIEW",
              updatedAt: reviewedAt,
              managerSubmitted: false,
              raw: {
                ...(s.raw && typeof s.raw === "object" ? s.raw : {}),
                managerReview: payload.managerReview,
                managerEvaluation: payload.managerEvaluation,
                reviewStatus: "NEEDS_REVIEW",
                reopenedForResubmission: true,
              },
            };
          })
        );
      }

      closeReviewModal();
      await reloadTeam();
      await reloadTeamInsights();
    } catch (err) {
      showToast({ title: `${reviewAction === "REJECT" ? "Reject" : "Submit"} failed`, message: err?.message || "Please try again." });
    } finally {
      setSavingReview(false);
    }
  }

  return (
    <div className="rt-shell flex min-h-screen text-[rgb(var(--text))] font-sans overflow-x-hidden">
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
        className="fixed left-4 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))] shadow-lg md:hidden"
        onClick={() => setIsSidebarOpen((prev) => !prev)}
        aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
      >
        {isSidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
      </button>

      <Sidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        activeTab={activeTab}
        setActiveTab={handleSidebarTabChange}
        onLogout={onLogout}
        account={account}
      />

      <main className={`relative flex-1 transition-all duration-300 ${isSidebarOpen ? "md:ml-72" : "md:ml-24"} p-4 pt-20 md:pt-6 lg:p-10`}>
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-24 right-14 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="absolute bottom-8 left-1/3 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
        </div>
        <div className="fixed right-4 top-4 z-[65] flex flex-col items-end md:right-8 md:top-5" ref={notificationsPanelRef}>
          <button
            type="button"
            onClick={() => {
              const nextOpen = !notificationsOpen;
              setNotificationsOpen(nextOpen);
              if (nextOpen) reloadNotifications({ silent: true }).catch(() => {});
            }}
            className={[
              "relative inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[rgb(var(--border))]",
              "bg-[rgb(var(--surface))] text-[rgb(var(--text))] shadow-[0_12px_28px_rgba(8,22,45,0.15)]",
              "transition-all duration-300 hover:bg-[rgb(var(--surface-2))] hover:shadow-[0_16px_30px_rgba(8,22,45,0.2)]",
              unreadNotificationsCount > 0 ? "animate-[pulse_2.4s_ease-in-out_infinite]" : "",
            ].join(" ")}
            aria-label="Manager notifications"
            title="Manager notifications"
          >
            {unreadNotificationsCount > 0 ? <BellDot size={18} /> : <Bell size={18} />}
            {unreadNotificationsCount > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 min-w-[20px] rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[10px] font-black text-white">
                {unreadNotificationsCount > 99 ? "99+" : unreadNotificationsCount}
              </span>
            ) : null}
          </button>

          {notificationsOpen ? (
            <div className="mt-3 w-[min(92vw,420px)] rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-[0_24px_52px_rgba(7,18,42,0.24)] backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-[rgb(var(--border))] px-4 py-3">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-[rgb(var(--muted))]">
                    Manager Alerts
                  </div>
                  <div className="mt-1 text-sm font-bold text-[rgb(var(--text))]">
                    {unreadNotificationsCount} unread
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => reloadNotifications().catch(() => {})}
                    className="rounded-lg border border-[rgb(var(--border))] px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => markEveryNotificationRead().catch(() => {})}
                    className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--border))] px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
                  >
                    <CheckCheck size={13} />
                    Mark all
                  </button>
                </div>
              </div>

              <div className="max-h-[400px] overflow-y-auto p-3">
                {notificationsError ? (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-200">
                    {notificationsError}
                  </div>
                ) : null}
                {!notificationsError && notificationsLoading && notifications.length === 0 ? (
                  <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-3 text-xs text-[rgb(var(--muted))]">
                    Loading alerts...
                  </div>
                ) : null}
                {!notificationsError && !notificationsLoading && notifications.length === 0 ? (
                  <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-3 text-xs text-[rgb(var(--muted))]">
                    No manager alerts yet.
                  </div>
                ) : null}
                <div className="space-y-2">
                  {notifications.map((item) => (
                    <button
                      key={String(item.id)}
                      type="button"
                      onClick={() => markNotificationRead(item.id)}
                      className={[
                        "w-full rounded-xl border px-3 py-2.5 text-left transition",
                        item.read
                          ? "border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] opacity-90"
                          : "border-blue-500/35 bg-blue-500/10",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[rgb(var(--muted))]">
                            Employee Submission
                          </div>
                          <div className="mt-1 text-sm font-bold text-[rgb(var(--text))] break-words">{item.title}</div>
                          {item.message ? (
                            <div className="mt-1 text-xs text-[rgb(var(--muted))] break-words">{item.message}</div>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-[rgb(var(--muted))]">
                          {formatNotificationTimestamp(item.createdAt)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {notificationsNextCursor ? (
                  <button
                    type="button"
                    onClick={() => reloadNotifications({ cursor: notificationsNextCursor, append: true }).catch(() => {})}
                    className="mt-3 w-full rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
                  >
                    Load more
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        <header className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div className="rt-page-header">
            <div className="rt-kicker">Manager Portal</div>
            <h1 className="rt-page-title">
              {activeTab === "team" ? "Team Submissions Workspace" : "Manager Self Review Workspace"}
            </h1>
            <p className="rt-page-subtitle">
              Monitor submission health, review reportees, and complete your monthly manager self review.
            </p>
            <div className="mt-2 flex items-center gap-3 flex-wrap text-xs text-[rgb(var(--muted))]">
              <span className="inline-flex items-center gap-2">
                <Users size={16} /> Reportees: <span className="font-mono text-[rgb(var(--text))]">{reporteeCount}</span>
              </span>
              <span className="inline-flex items-center gap-2">
                Submitted: <span className="font-mono text-[rgb(var(--text))]">{submittedCount}</span>
              </span>
              <span className="inline-flex items-center gap-2">
                Pending Review: <span className="font-mono text-[rgb(var(--text))]">{pendingManagerReviewCount}</span>
              </span>
              {managerId ? (
                <span className="text-gray-500 font-mono">Manager ID: {managerId}</span>
              ) : null}
            </div>
          </div>

          <div className="flex items-end md:items-end gap-3 flex-wrap md:justify-end">
            <div className="space-y-1">
              <div className="rt-kicker">Month</div>
              <select
                value={month}
                onChange={(e) => {
                  const next = normalizeYearMonth(e.target.value);
                  if (!next) return;
                  setMonth(next);
                }}
                className="rt-input text-sm"
                title="Select month"
              >
                {cycleMonthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <div className="text-[10px] text-slate-600 dark:text-slate-400">
                Cycle: {cycleInfo?.label || "May-Oct / Nov-Apr"}
              </div>
            </div>

            {activeTab === "team" ? (
              <div className="space-y-1">
                <div className="rt-kicker">Filter</div>
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="rt-input text-sm"
                  title="Filter"
                >
                  <option value="PENDING_MANAGER_REVIEW">Pending manager review</option>
                  <option value="SUBMITTED">Submitted</option>
                  <option value="ALL">All</option>
                </select>
              </div>
            ) : null}

            <button
              onClick={() => {
                reloadTeam({ cursor: teamCursor ?? null, pageAction: "stay" }).catch(() => {});
                reloadTeamInsights().catch(() => {});
              }}
              disabled={teamLoading || teamInsightsLoading}
              className={[
                "rt-btn-ghost inline-flex items-center gap-2 text-xs uppercase tracking-widest transition-all",
                teamLoading || teamInsightsLoading ? "opacity-60 cursor-not-allowed" : "",
              ].join(" ")}
              title="Refresh"
            >
              <RefreshCw size={18} /> {teamLoading || teamInsightsLoading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </header>

      {activeTab === "team" ? (
        <section className="max-w-7xl mx-auto mt-10 grid grid-cols-1 xl:grid-cols-3 gap-8">
          {(teamLoading && teamSubs.length === 0) || (teamInsightsLoading && teamInsightSourceRows.length === 0) ? (
            <div className="xl:col-span-3 rt-panel-subtle rounded-3xl p-6 text-sm text-[rgb(var(--muted))] animate-pulse">
              Loading team submissions and manager insights…
            </div>
          ) : null}
          <section className="xl:col-span-3 rt-panel p-6 sm:p-7">
            <div className="rt-section-header">
              <h2 className="rt-section-title">Manager Insights</h2>
              <p className="rt-section-subtitle">Queue health, review velocity, and actionable pending load.</p>
            </div>
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="rt-panel-subtle p-4 rounded-2xl">
                <div className="rt-kicker">Review Coverage</div>
                <div className="mt-2 text-2xl rt-stat-value">{managerInsights.reviewedCoverage}%</div>
              </div>
              <div className="rt-panel-subtle p-4 rounded-2xl">
                <div className="rt-kicker">Pending Queue</div>
                <div className="mt-2 text-2xl rt-stat-value">{managerInsights.pendingCoverage}%</div>
              </div>
              <div className="rt-panel-subtle p-4 rounded-2xl">
                <div className="rt-kicker">Avg Review Time</div>
                <div className="mt-2 flex items-center gap-2 text-2xl rt-stat-value">
                  <Clock3 size={18} />
                  {managerInsights.avgTurnaroundHours}h
                </div>
              </div>
              <div className="rt-panel-subtle p-4 rounded-2xl">
                <div className="rt-kicker">Reject Signals</div>
                <div className="mt-2 flex items-center gap-2 text-2xl rt-stat-value">
                  <TrendingUp size={18} />
                  {managerInsights.rejectedCount}
                </div>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rt-panel-subtle p-4 rounded-2xl">
                <div className="rt-kicker">Queue Funnel</div>
                <div className="mt-4 space-y-3">
                  {managerInsights.queueFunnel.map((item) => (
                    <div key={item.id} className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-[rgb(var(--muted))]">
                        <span>{item.label}</span>
                        <span className="font-mono text-[rgb(var(--text))]">{item.value}</span>
                      </div>
                      <div className="h-2 rounded-full bg-[rgb(var(--surface-3))] overflow-hidden">
                        <div
                          className={`h-full ${item.colorClass}`}
                          style={{ width: `${Math.round((item.value / managerInsights.maxFunnel) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rt-panel-subtle p-4 rounded-2xl">
                <div className="rt-kicker">Pending Preview</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {managerInsights.pendingPreview.length ? (
                    managerInsights.pendingPreview.map((emp) => (
                      <span
                        key={`pending:${emp.id}`}
                        className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs"
                      >
                        <span className="font-semibold text-[rgb(var(--text))]">{emp.name}</span>
                        <span className="font-mono text-[rgb(var(--muted))]">{emp.id}</span>
                      </span>
                    ))
                  ) : (
                    <div className="text-sm text-emerald-700 dark:text-emerald-300">No pending employee reviews.</div>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="rt-panel-subtle p-4 rounded-2xl">
                <div className="rt-kicker">Stream Granularity</div>
                <div className="mt-3 space-y-2">
                  {managerGranularity.streamRows.length ? (
                    managerGranularity.streamRows.map((row) => (
                      <div key={`stream:${row.name}`} className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-[rgb(var(--text))]">{row.name}</span>
                          <span className="font-mono text-[rgb(var(--muted))]">{row.total}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-[rgb(var(--muted))]">
                          Submitted {row.submittedRate}% • Reviewed {row.reviewedRate}%
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-[rgb(var(--muted))]">No stream metadata available.</div>
                  )}
                </div>
              </div>
              <div className="rt-panel-subtle p-4 rounded-2xl">
                <div className="rt-kicker">Band Granularity</div>
                <div className="mt-3 space-y-2">
                  {managerGranularity.bandRows.length ? (
                    managerGranularity.bandRows.map((row) => (
                      <div key={`band:${row.name}`} className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-[rgb(var(--text))]">{row.name}</span>
                          <span className="font-mono text-[rgb(var(--muted))]">{row.total}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-[rgb(var(--muted))]">
                          Submitted {row.submittedRate}% • Reviewed {row.reviewedRate}%
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-[rgb(var(--muted))]">No band metadata available.</div>
                  )}
                </div>
              </div>
              <div className="rt-panel-subtle p-4 rounded-2xl">
                <div className="rt-kicker">Top Employee Signals</div>
                <div className="mt-3 space-y-2">
                  {managerGranularity.topEmployees.length ? (
                    managerGranularity.topEmployees.map((row, idx) => (
                      <div key={`signal:${row.id}:${idx}`} className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-[rgb(var(--text))] truncate">{row.name}</span>
                          <span className="font-mono text-[rgb(var(--text))]">{row.score.toFixed(1)}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-[rgb(var(--muted))]">
                          {row.stream} • {row.band} • {row.id}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-[rgb(var(--muted))]">No scored submissions available yet.</div>
                  )}
                </div>
              </div>
            </div>
          </section>
          <section className="xl:col-span-2 rt-panel overflow-hidden">
            <div className="p-8 flex items-center justify-between gap-4 flex-wrap">
              <div className="rt-section-header">
                <h2 className="rt-section-title">Team Submissions</h2>
                <p className="rt-section-subtitle">
                  Review employee submissions for {month}.
                </p>
              </div>
            </div>

            {teamError ? (
              <div className="px-8 pb-6 text-sm text-red-700 dark:text-red-200">
                Failed to load: <span className="font-mono">{teamError}</span>
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-[0.2em] text-slate-500 border-t border-b border-[rgb(var(--border))]">
                  <tr>
                    <th className="p-6 font-black">Employee</th>
                    <th className="p-6 font-black">Status</th>
                    <th className="p-6 font-black">Submitted At</th>
                    <th className="p-6 font-black">Manager Review</th>
                    <th className="p-6 text-right font-black px-8">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgb(var(--border))]">
                  {filteredTeamSubs.map((s) => {
                    const status = String(s.status || "—").toUpperCase();
                    const isSubmitted = isSubmittedStatus(status);
                    const submittedWhen = s.submittedAt || s.updatedAt || "—";
                    return (
                      <tr key={`${s.employee.id}:${s.submissionId || submittedWhen}`} className="hover:bg-[rgb(var(--surface-2))] transition-colors">
                        <td className="p-6">
                          <button
                            type="button"
                            onClick={() => setReviewModal({ open: true, row: s })}
                            className="font-bold text-[rgb(var(--text))] tracking-tight hover:text-blue-500 transition-colors text-left"
                            title="Open submission review"
                          >
                            {s.employee.name}
                          </button>
                          <div className="text-xs text-gray-500 font-mono mt-1">
                            {s.employee.id}{s.employee.email ? ` • ${s.employee.email}` : ""}
                          </div>
                        </td>
                        <td className="p-6">
                          <span
                            className={[
                              "text-[10px] font-black uppercase px-3 py-1 rounded-lg border",
                              isSubmitted
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                                : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
                            ].join(" ")}
                          >
                            {status}
                          </span>
                        </td>
                        <td className="p-6 text-xs text-[rgb(var(--muted))] font-mono">
                          {submittedWhen}
                        </td>
                        <td className="p-6">
                          {s.managerSubmitted ? (
                            <span className="text-[10px] font-black uppercase px-3 py-1 rounded-lg border bg-blue-500/10 text-blue-600 dark:text-blue-300 border-blue-500/20">
                              Submitted
                            </span>
                          ) : (
                            <span className="text-[10px] font-black uppercase px-3 py-1 rounded-lg border bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="p-6 text-right px-8">
                          <button
                            type="button"
                            onClick={() => setReviewModal({ open: true, row: s })}
                            className={[
                              "inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest transition-all border",
                              "border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-2))]",
                            ].join(" ")}
                            title="Review"
                          >
                            Open Review
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {!teamLoading && filteredTeamSubs.length === 0 ? (
                    <tr>
                      <td className="p-10 text-center text-gray-500" colSpan={5}>
                        No submissions to show.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="px-8 py-5 border-t border-[rgb(var(--border))]">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={teamPager.onReset}
                  disabled={Boolean(teamPager.loading)}
                  className={[
                    "rt-btn-ghost text-xs uppercase tracking-widest",
                    teamPager.loading ? "opacity-50 cursor-not-allowed" : "",
                  ].join(" ")}
                >
                  First Page
                </button>
                <CursorPagination
                  canPrev={Boolean(teamPager.canPrev)}
                  canNext={Boolean(teamPager.canNext)}
                  onPrev={teamPager.onPrev}
                  onNext={teamPager.onNext}
                  loading={Boolean(teamPager.loading)}
                  label={teamPager.label}
                />
              </div>
            </div>
          </section>

          <section className="rt-panel p-8">
            <h2 className="rt-section-title">Review Queue</h2>
            <p className="rt-section-subtitle mt-1">
              Click an employee name in the table to open their submitted content and review inputs.
            </p>
            <div className="mt-5 space-y-3">
              <div className="rt-panel-subtle rounded-2xl px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[rgb(var(--muted))]">Reportees</div>
                <div className="mt-1 text-xl font-black text-[rgb(var(--text))]">{reporteeCount}</div>
              </div>
              <div className="rt-panel-subtle rounded-2xl px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[rgb(var(--muted))]">Submitted</div>
                <div className="mt-1 text-xl font-black text-[rgb(var(--text))]">{submittedCount}</div>
              </div>
              <div className="rt-panel-subtle rounded-2xl px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[rgb(var(--muted))]">Pending Manager Review</div>
                <div className="mt-1 text-xl font-black text-[rgb(var(--text))]">{pendingManagerReviewCount}</div>
              </div>
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === "self-review" ? (
        <section className="max-w-7xl mx-auto mt-10">
          <section className="rt-panel p-8 max-w-4xl">
            <h2 className="rt-section-title">Manager Self Review</h2>
            <p className="rt-section-subtitle mt-1">Write your monthly self review, rate KPIs and Webknot values, then submit.</p>

            {selfReviewLocked && !selfNeedsResubmission ? (
              <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-200">
                This month is submitted and locked. You can submit once per month.
              </div>
            ) : null}
            {!selfReviewLocked && selfNeedsResubmission ? (
              <div className="mt-5 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
                Admin requested changes. Please update your self review and submit again.
                {selfLatestReviewComment ? (
                  <div className="mt-2 text-xs font-mono text-amber-900 dark:text-amber-100 break-words">
                    Feedback: {selfLatestReviewComment}
                  </div>
                ) : null}
              </div>
            ) : null}

            {(hydratingSelfSubmission || selfKpisLoading || selfValuesLoading) ? (
              <div className="mt-5 rt-panel-subtle rounded-2xl p-4 text-sm text-[rgb(var(--muted))] animate-pulse">
                Loading your self review template (KPIs and Webknot values)…
              </div>
            ) : null}

            {managerDraftError ? (
              <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-200">
                {managerDraftError}
              </div>
            ) : null}

            <div className="mt-5 text-xs text-[rgb(var(--muted))]">
              Draft: {selfReviewLocked ? "Locked" : (hydratingSelfSubmission ? "Loading…" : managerDraftSaving ? "Saving…" : "Saved")}
            </div>
            {selfRatingValidationError ? (
              <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                {selfRatingValidationError}
              </div>
            ) : null}

            <div className="mt-6 space-y-4">
              <textarea
                value={managerSelfReviewText}
                onChange={(e) => setManagerSelfReviewText(e.target.value)}
                readOnly={selfReviewLocked}
                rows={10}
                className={[
                  "rt-input p-4 text-sm resize-none",
                  selfReviewLocked ? "opacity-75 cursor-not-allowed" : "",
                ].join(" ")}
                placeholder="Write your self review for this month..."
              />
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {!aiAgent ? (
                  <div className="text-xs text-amber-700 dark:text-amber-300">
                    AI Enhance is not configured.
                  </div>
                ) : (
                  <div className="text-xs text-[rgb(var(--muted))]">
                    Use AI Enhance to improve clarity without changing intent.
                  </div>
                )}
                <button
                  type="button"
                  onClick={enhanceManagerSelfReview}
                  disabled={selfReviewLocked || aiEnhancingSelfReview || !String(managerSelfReviewText || "").trim() || !aiAgent}
                  className={[
                    "inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest transition-all border",
                    selfReviewLocked || aiEnhancingSelfReview || !String(managerSelfReviewText || "").trim() || !aiAgent
                      ? "border-[rgb(var(--border))] text-[rgb(var(--muted))] bg-[rgb(var(--surface-2))] cursor-not-allowed"
                      : "bg-purple-600 text-white border-purple-600 hover:bg-purple-500 shadow-xl shadow-purple-900/20",
                  ].join(" ")}
                >
                  <Sparkles size={16} /> {aiEnhancingSelfReview ? "Enhancing…" : "AI Enhance"}
                </button>
              </div>

              <div className="rt-panel-subtle rounded-2xl p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">KPI Ratings (1-5)</div>
                <div className="mt-3 space-y-3 max-h-[260px] overflow-y-auto pr-1">
                  {filteredSelfKpis.map((k) => {
                    const id = String(k?.id || "").trim();
                    const value = managerSelfKpiRatings?.[id];
                    const display = formatOneDecimalDisplay(value);
                    return (
                      <div key={id} className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-3">
                        <div className="min-w-0 pr-2">
                          <div className="text-sm text-[rgb(var(--text))] truncate">{String(k?.title || id)}</div>
                          <div className="text-[10px] text-[rgb(var(--muted))] font-mono mt-1">
                            {String(k?.weight || "—")}
                          </div>
                        </div>
                        <input
                          type="number"
                          min={1}
                          max={5}
                          step={0.1}
                          value={display}
                          readOnly={selfReviewLocked}
                          onWheel={preventWheelInputChange}
                          onChange={(e) => handleSelfRatingChange("kpi", id, e.target.value)}
                          className={[
                            "rt-input w-36 py-2 px-3 text-sm justify-self-end",
                            selfReviewLocked ? "opacity-75 cursor-not-allowed" : "",
                          ].join(" ")}
                          placeholder="1-5"
                        />
                      </div>
                    );
                  })}
                  {!selfKpisLoading && filteredSelfKpis.length === 0 ? (
                    <div className="text-sm text-[rgb(var(--muted))]">No KPIs available.</div>
                  ) : null}
                </div>
              </div>

              <div className="rt-panel-subtle rounded-2xl p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Webknot Values Ratings (1-5)</div>
                <div className="mt-3 space-y-3 max-h-[260px] overflow-y-auto pr-1">
                  {selfValues.map((valueItem) => {
                    const id = String(valueItem?.id || "").trim();
                    const value = managerSelfValueRatings?.[id];
                    const display = formatOneDecimalDisplay(value);
                    return (
                      <div key={id} className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-3">
                        <div className="min-w-0 pr-2">
                          <div className="text-sm text-[rgb(var(--text))] truncate">{String(valueItem?.title || id)}</div>
                          <div className="text-[10px] text-[rgb(var(--muted))] mt-1">{String(valueItem?.pillar || "—")}</div>
                        </div>
                        <input
                          type="number"
                          min={1}
                          max={5}
                          step={0.1}
                          value={display}
                          readOnly={selfReviewLocked}
                          onWheel={preventWheelInputChange}
                          onChange={(e) => handleSelfRatingChange("value", id, e.target.value)}
                          className={[
                            "rt-input w-36 py-2 px-3 text-sm justify-self-end",
                            selfReviewLocked ? "opacity-75 cursor-not-allowed" : "",
                          ].join(" ")}
                          placeholder="1-5"
                        />
                      </div>
                    );
                  })}
                  {!selfValuesLoading && selfValues.length === 0 ? (
                    <div className="text-sm text-[rgb(var(--muted))]">No values available.</div>
                  ) : null}
                </div>
              </div>

              <div className="text-[10px] text-[rgb(var(--muted))]">
                Showing KPIs for your profile{managerBand ? ` • Band: ${managerBand}` : ""}{managerStream ? ` • Stream: ${managerStream}` : ""}.
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={saveManagerSelfReviewDraft}
                  disabled={savingSelfReview || selfReviewLocked}
                  className="rt-btn-ghost text-xs uppercase tracking-widest disabled:opacity-60"
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  onClick={submitManagerSelfReview}
                  disabled={savingSelfReview || selfReviewLocked}
                  className="rt-btn-primary text-xs uppercase tracking-widest disabled:opacity-60"
                >
                  {selfReviewLocked ? "Submitted" : "Submit Self Review"}
                </button>
              </div>
            </div>
          </section>
        </section>
      ) : null}

      </main>

      {reviewModal.open && selectedRow ? (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 z-[70] overflow-y-auto">
          <div className="w-full max-w-6xl rt-panel rounded-3xl p-4 sm:p-6 my-4 sm:my-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                  Manager Review
                </div>
                <div className="mt-2 text-2xl font-black tracking-tight text-[rgb(var(--text))]">
                  {selectedRow.employee.name}
                </div>
                <div className="mt-1 text-xs text-gray-500 font-mono">
                  {selectedRow.employee.id} • {String(selectedRow.month || month)}
                </div>
              </div>
              <button
                type="button"
                onClick={closeReviewModal}
                className="p-2 rounded-xl hover:bg-[rgb(var(--surface-2))]"
                aria-label="Close"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rt-panel-subtle rounded-[2.5rem] p-6">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                  Employee Submitted
                </div>
                <div className="mt-4 space-y-5">
                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-gray-500">Self Review</div>
                    <div className="mt-2 text-sm text-[rgb(var(--text))] whitespace-pre-wrap">
                      {String(selectedRow.payload?.selfReviewText || "—")}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-gray-500">KPI Ratings</div>
                    <div className="mt-2 space-y-2">
                      {Object.keys(selectedRow.payload?.kpiRatings || {}).length ? (
                        Object.entries(selectedRow.payload.kpiRatings).map(([id, v]) => (
                          <div key={id} className="flex items-center justify-between gap-3">
                            <div className="text-sm text-[rgb(var(--text))]">
                              {kpiIndex?.[id]?.title || id}
                            </div>
                            <div className="text-sm font-mono text-purple-200">{String(v)}</div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-gray-500">No KPI ratings.</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-gray-500">Webknot Values</div>
                    <div className="mt-2 space-y-2">
                      {selectedRow.payload?.webknotValueRatings && typeof selectedRow.payload.webknotValueRatings === "object" && Object.keys(selectedRow.payload.webknotValueRatings).length ? (
                        Object.entries(selectedRow.payload.webknotValueRatings)
                          .sort(([a], [b]) => String(a).localeCompare(String(b), undefined, { numeric: true }))
                          .map(([id, rating]) => (
                            <div key={String(id || "")} className="flex items-center justify-between gap-4">
                              <div className="text-sm text-[rgb(var(--text))]">{String(id || "")}</div>
                              <div className="text-sm font-mono text-purple-200">{String(rating ?? "—")}</div>
                            </div>
                          ))
                      ) : Array.isArray(selectedRow.payload?.webknotValues) && selectedRow.payload.webknotValues.length ? (
                        selectedRow.payload.webknotValues.map((v) => (
                          <div key={String(v || "")} className="text-sm text-[rgb(var(--text))]">
                            {String(v || "")}
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-gray-500">None.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rt-panel-subtle rounded-[2.5rem] p-6">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                  Manager Evaluation
                </div>
                <div className="mt-4 space-y-5">
                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-gray-500">KPI Ratings (Manager)</div>
                    <div className="mt-2 space-y-3">
                      {Object.keys(selectedRow.payload?.kpiRatings || {}).length ? (
                        Object.entries(selectedRow.payload.kpiRatings).map(([id]) => {
                          const current = managerRatings?.[id];
                          const display =
                            typeof current === "number" && Number.isFinite(current) ? current : (current ?? "");
                          return (
                            <div key={id} className="flex items-center justify-between gap-3">
                              <div className="text-sm text-[rgb(var(--text))]">
                                {kpiIndex?.[id]?.title || id}
                              </div>
                              <input
                                type="number"
                                min={1}
                                max={5}
                                step={0.1}
                                value={display}
                                onChange={(e) => {
                                  const raw = String(e.target.value ?? "").trim();
                                  const parsed = raw === "" ? null : Number.parseFloat(raw);
                                  setManagerRatings((prev) => {
                                    const next = { ...(prev || {}) };
                                    if (parsed == null || !Number.isFinite(parsed)) {
                                      delete next[id];
                                      return next;
                                    }
                                    next[id] = Math.round(parsed * 10) / 10;
                                    return next;
                                  });
                                }}
                                className="rt-input w-28 py-2 px-3 text-sm"
                                placeholder="1-5"
                              />
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-sm text-gray-500">No KPIs.</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-gray-500">Webknot Value Ratings (Manager)</div>
                    <div className="mt-2 space-y-3">
                      {Array.from(
                        new Set([
                          ...Object.keys(
                            selectedRow.payload?.webknotValueRatings && typeof selectedRow.payload.webknotValueRatings === "object"
                              ? selectedRow.payload.webknotValueRatings
                              : {}
                          ),
                          ...(Array.isArray(selectedRow.payload?.webknotValues)
                            ? selectedRow.payload.webknotValues.map((x) => String(x || "").trim())
                            : []),
                        ].filter(Boolean))
                      ).length ? (
                        Array.from(
                          new Set([
                            ...Object.keys(
                              selectedRow.payload?.webknotValueRatings && typeof selectedRow.payload.webknotValueRatings === "object"
                                ? selectedRow.payload.webknotValueRatings
                                : {}
                            ),
                            ...(Array.isArray(selectedRow.payload?.webknotValues)
                              ? selectedRow.payload.webknotValues.map((x) => String(x || "").trim())
                              : []),
                          ].filter(Boolean))
                        )
                          .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))
                          .map((id) => {
                            const current = managerValueRatings?.[id];
                            const display =
                              typeof current === "number" && Number.isFinite(current) ? current : (current ?? "");
                            const valueLabel =
                              selfValues.find((v) => String(v?.id || "").trim() === String(id).trim())?.title || id;
                            return (
                              <div key={id} className="flex items-center justify-between gap-3">
                                <div className="text-sm text-[rgb(var(--text))]">{String(valueLabel)}</div>
                                <input
                                  type="number"
                                  min={1}
                                  max={5}
                                  step={0.1}
                                  value={display}
                                  onChange={(e) => {
                                    const raw = String(e.target.value ?? "").trim();
                                    const parsed = raw === "" ? null : Number.parseFloat(raw);
                                    setManagerValueRatings((prev) => {
                                      const next = { ...(prev || {}) };
                                      if (parsed == null || !Number.isFinite(parsed)) {
                                        delete next[id];
                                        return next;
                                      }
                                      next[id] = Math.round(parsed * 10) / 10;
                                      return next;
                                    });
                                  }}
                                  className="rt-input w-28 py-2 px-3 text-sm"
                                  placeholder="1-5"
                                />
                              </div>
                            );
                          })
                      ) : (
                        <div className="text-sm text-gray-500">No Webknot values.</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-gray-500">Manager Comments</div>
                    <textarea
                      value={managerNotes}
                      onChange={(e) => setManagerNotes(e.target.value)}
                      rows={6}
                      className="mt-2 rt-input p-4 text-sm resize-none"
                      placeholder="Add review comments. Required when rejecting."
                    />
                    <div className="mt-3 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={enhanceManagerReviewNotes}
                        disabled={aiEnhancingManagerNotes || !String(managerNotes || "").trim() || !aiAgent}
                        className={[
                          "inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all border",
                          aiEnhancingManagerNotes || !String(managerNotes || "").trim() || !aiAgent
                            ? "border-[rgb(var(--border))] text-[rgb(var(--muted))] bg-[rgb(var(--surface-2))] cursor-not-allowed"
                            : "bg-purple-600 text-white border-purple-600 hover:bg-purple-500",
                        ].join(" ")}
                      >
                        <Sparkles size={14} /> {aiEnhancingManagerNotes ? "Enhancing…" : "AI Enhance Comments"}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 flex-wrap pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedKey) return;
                        const next = {
                          ...reviewDrafts,
                          [selectedKey]: {
                            kpiRatings: managerRatings,
                            valueRatings: managerValueRatings,
                            notes: managerNotes,
                            updatedAt: Date.now(),
                          },
                        };
                        setReviewDrafts(next);
                        saveManagerReviewDrafts(next);
                        showToast({ title: "Saved", message: "Manager draft saved locally." });
                      }}
                      className="rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest border border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-2))] transition-all"
                    >
                      Save draft
                    </button>
                    <button
                      type="button"
                      onClick={() => submitManagerReviewDecision("REJECT")}
                      disabled={savingReview}
                      className={[
                        "rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest transition-all",
                        savingReview
                          ? "bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] border border-[rgb(var(--border))] cursor-not-allowed"
                          : "bg-amber-500/10 text-amber-800 dark:text-amber-200 border border-amber-500/30 hover:bg-amber-500 hover:text-white",
                      ].join(" ")}
                    >
                      {savingReview ? "Working…" : "Reject with comments"}
                    </button>
                    <button
                      type="button"
                      onClick={() => submitManagerReviewDecision("SUBMIT")}
                      disabled={savingReview}
                      className={[
                        "rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest transition-all",
                        savingReview
                          ? "bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] border border-[rgb(var(--border))] cursor-not-allowed"
                          : "bg-purple-600 text-white hover:bg-purple-500 shadow-xl shadow-purple-900/20",
                      ].join(" ")}
                    >
                      {savingReview ? "Submitting…" : "Submit review"}
                    </button>
                  </div>
                  <div className="text-[10px] text-gray-500">
                    Validation: submit requires KPI/value ratings (1-5). Reject requires at least 10 characters of comments.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
