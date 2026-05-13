import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Bell,
  BellDot,
  Calendar,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Clock3,
  Eye,
  FolderKanban,
  LogOut,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  UserCircle2,
  Users,
  X,
  XCircle,
} from "lucide-react";

import { fetchMe } from "../../api/auth.js";
import { fetchPortalManager } from "../../api/portal.js";
import {
  fetchMyMonthlySubmission,
  fetchManagerTeamSubmissions,
  formatYearMonth,
  normalizeMonthlySubmission,
  saveMonthlyDraft,
  submitMonthlySubmission,
} from "../../api/monthly-submissions.js";
import { normalizeCursorPage } from "../../api/employee-portal.js";
import { fetchKpiDefinitions, normalizeKpiDefinitions } from "../../api/kpi-definitions.js";
import { fetchManagerReportees, normalizeEmployees } from "../../api/employees.js";
import { fetchValues, normalizeWebknotValuesList } from "../../api/webknotValueApi.js";
import { enhanceReviewText, fetchActiveAiAgent } from "../../api/ai-agents.js";
import {
  fetchProjects,
  normalizeProjects,
  submitProjectRating,
} from "../../api/projects.js";
import { getAppSettings } from "../../utils/appSettings.js";
import { buildCycleMeta, buildCycleMonthOptions, getCycleForMonth, isResubmissionRequested, normalizeYearMonth } from "../../utils/reviewCycles.js";
import { playNotificationSound } from "../../utils/notificationSound.js";
import { safeJsonParse } from "../../utils/json.js";
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
import ModalOverlay from "../shared/ModalOverlay.jsx";

const MANAGER_REVIEW_DRAFT_KEY = "rt_tracking_manager_review_draft_v1";
const MANAGER_SIDEBAR_PREF_KEY = "rt_tracking_manager_sidebar_open_v1";
const TEAM_PAGE_SIZE = 12;
const MANAGER_NOTIFICATION_PAGE_SIZE = 25;
const MANAGER_NOTIFICATION_POLL_MS = 30_000;

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
  } catch {
    void 0;
  }
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
      /* After employee resubmission the status becomes "SUBMITTED" but the
         server may still carry the old managerReview with action:"REJECT".
         Treat that as stale so the row shows as "Pending" again.            */
      const currentStatus = String(
        submission?.status ?? obj?.status ?? ""
      ).trim().toUpperCase();
      const rawManagerAction = String(
        obj?.managerReview?.action ||
        obj?.payload?.managerReview?.action ||
        ""
      ).trim().toUpperCase();
      const staleManagerReject =
        currentStatus === "SUBMITTED" && rawManagerAction === "REJECT";

      const managerSubmittedFromSubmission =
        typeof submission?.managerSubmitted === "boolean" ? submission.managerSubmitted : null;
      const managerSubmitted = staleManagerReject
        ? false
        : managerSubmittedFromSubmission != null
          ? managerSubmittedFromSubmission
          : Boolean(
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
  valueComments,
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
  const normalizedValueComments = valueComments && typeof valueComments === "object" ? valueComments : {};
  const valueEntries = Object.entries(normalizedValues).sort(([a], [b]) =>
    String(a).localeCompare(String(b), undefined, { numeric: true })
  );
  const stableValueRatings = Object.fromEntries(valueEntries);
  const webknotValueResponses = valueEntries.map(([valueId, rating]) => ({
    valueId: String(valueId || "").trim(),
    rating,
    comment: String(normalizedValueComments?.[valueId] || "").trim() || undefined,
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
    kpiRatings: kpiRatingsArray,
    webknotValues,
    webknotValueRatings: stableValueRatings,
    webknotValueResponses,
    webknotValueComments: normalizedValueComments,
    recognitionsCount: 0,
  };
  if (reviewStatus != null) next.reviewStatus = String(reviewStatus || "").trim() || null;
  if (reopenedForResubmission != null) next.reopenedForResubmission = Boolean(reopenedForResubmission);
  return next;
}

function formatReviewTimestamp(value) {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString();
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

function formatSubmittedAt(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "—") return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
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
        "rt-sidebar fixed left-0 top-0 h-full z-50 flex flex-col",
        "md:translate-x-0 will-change-transform transition-[transform,width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
        isOpen ? "translate-x-0 w-[280px]" : "-translate-x-full md:translate-x-0 md:w-[84px]",
      ].join(" ")}
    >
      <div className="p-5 flex items-center justify-between">
        {isOpen ? (
          <div className="flex items-center gap-2.5">
            <img
              src="/unnamed.webp"
              alt="Webknot Technologies logo"
              className="h-8 w-8 rounded-md object-cover bg-white"
            />
            <span className="font-semibold tracking-tight text-[rgb(var(--sidebar-text))]">
              Webknot
            </span>
          </div>
        ) : null}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="hidden md:inline-flex p-1.5 hover:bg-[rgb(var(--sidebar-hover))] rounded-md text-[rgb(var(--sidebar-muted))] transition-colors"
          aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {isOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>

      <nav className="mt-4 px-3 space-y-0.5 flex-1 overflow-y-auto pb-6">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={[
                "rt-sidebar-nav-item",
                isOpen ? "justify-start gap-3" : "justify-center",
                isActive ? "rt-sidebar-nav-item--active" : "",
              ].join(" ")}
              title={!isOpen ? item.label : undefined}
            >
              <span className="w-5 grid place-items-center shrink-0">
                {item.icon}
              </span>
              {isOpen ? (
                <span className="text-sm font-medium whitespace-nowrap">
                  {item.label}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto w-full px-3 pb-5 space-y-2">
        <div
          className={[
            "rounded-md bg-[rgb(var(--sidebar-hover))] border border-[rgb(var(--sidebar-border))] p-3",
            isOpen ? "" : "hidden",
          ].join(" ")}
        >
          <div className="font-medium text-[rgb(var(--sidebar-text))] truncate text-sm">
            {account?.name || account?.email || "Unknown"}
          </div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--sidebar-muted))] truncate">
            {account?.role || "Manager"}
          </div>
          <div className="mt-1 text-xs text-[rgb(var(--sidebar-muted))] truncate">{account?.subtitle || "—"}</div>
        </div>

        {!isOpen ? (
          <div className="grid place-items-center text-[rgb(var(--sidebar-muted))]">
            <div
              className="h-9 w-9 rounded-md bg-[rgb(var(--sidebar-hover))] border border-[rgb(var(--sidebar-border))] grid place-items-center"
              title={[
                account?.name || account?.email || "Unknown",
                account?.role || "Manager",
                account?.subtitle || "",
              ].filter(Boolean).join(" • ")}
            >
              <UserCircle2 size={16} />
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
            "w-full rounded-md transition-colors font-medium group text-[rgb(var(--sidebar-muted))]",
            isOpen ? "flex items-center justify-start gap-3 px-3 py-2.5" : "flex items-center justify-center p-2.5",
            "hover:text-red-400 hover:bg-[rgb(var(--sidebar-hover))]",
          ].join(" ")}
          title={!isOpen ? "Logout" : undefined}
        >
          <span className="w-5 grid place-items-center shrink-0">
            <LogOut size={18} />
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
  const [filter, setFilter] = useState("PENDING_MANAGER_REVIEW"); // SUBMITTED | ALL | PENDING_MANAGER_REVIEW
  const [teamSearch, setTeamSearch] = useState("");
  /* ── Path-based routing: sync activeTab ↔ URL path ── */
  const MGR_VALID_TABS = useMemo(() => new Set(["team", "self-review"]), []);

  const getMgrTabFromPath = useCallback(() => {
    const raw = window.location.pathname.replace(/^\//, "").split("/")[0];
    return MGR_VALID_TABS.has(raw) ? raw : "team";
  }, [MGR_VALID_TABS]);

  const [activeTab, setActiveTabRaw] = useState(() => getMgrTabFromPath());

  const setActiveTab = useCallback((tab) => {
    setActiveTabRaw(tab);
    const path = tab === "team" ? "/" : `/${tab}`;
    if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
  }, []);

  useEffect(() => {
    const onPathChange = () => setActiveTabRaw(getMgrTabFromPath());
    window.addEventListener("popstate", onPathChange);
    return () => {
      window.removeEventListener("popstate", onPathChange);
    };
  }, [getMgrTabFromPath]);
  const [managerSelfReviewText, setManagerSelfReviewText] = useState("");
  const [managerSelfKpiRatings, setManagerSelfKpiRatings] = useState({});
  const [managerSelfValueRatings, setManagerSelfValueRatings] = useState({});
  const [managerSelfValueComments, setManagerSelfValueComments] = useState({});
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

  const [reviewModal, setReviewModal] = useState({ open: false, row: null });

  /* ── quick reject dialog state ── */
  const [quickRejectModal, setQuickRejectModal] = useState({ open: false, row: null });
  const [quickRejectComment, setQuickRejectComment] = useState("");
  const [quickRejectBusy, setQuickRejectBusy] = useState(false);

  /* ── review queue page state ── */
  const [queueView, setQueueView] = useState(null); // "reportees" | "submitted" | "pending" | null
  const [queueSearch, setQueueSearch] = useState("");

  /* ── project ratings state ── */
  const [mgrProjects, setMgrProjects] = useState([]);
  const [mgrProjectsLoading, setMgrProjectsLoading] = useState(false);
  const [mgrProjectsError, setMgrProjectsError] = useState("");
  const [prSelectedProject, setPrSelectedProject] = useState(null);
  const [prSelectedEmployee, setPrSelectedEmployee] = useState(null);
  const [prRating, setPrRating] = useState(0);
  const [prComments, setPrComments] = useState("");
  const [prSubmitting, setPrSubmitting] = useState(false);
  const [prSuccess, setPrSuccess] = useState("");
  const [prError, setPrError] = useState("");
  const [prSearch, setPrSearch] = useState("");

  const [kpiIndex, setKpiIndex] = useState({}); // { [id]: { title, weight } }
  const [selfKpis, setSelfKpis] = useState([]);
  const [selfKpisLoading, setSelfKpisLoading] = useState(false);
  const [selfValues, setSelfValues] = useState([]);
  const [selfValuesLoading, setSelfValuesLoading] = useState(false);
  const valueLabelIndex = useMemo(() => {
    const map = {};
    for (const v of selfValues) {
      const key = String(v?.id || "").trim();
      if (!key) continue;
      map[key] = String(v?.title || v?.name || key);
    }
    // Include any values present in the selected submission payload so labels render even if manager catalog differs
    const payloadValues = Array.isArray(reviewModal?.row?.payload?.webknotValues)
      ? reviewModal.row.payload.webknotValues
      : [];
    const payloadValueRatings = reviewModal?.row?.payload?.webknotValueRatings;
    const payloadKeys = [
      ...payloadValues.map((v) => String(v || "").trim()),
      ...(payloadValueRatings && typeof payloadValueRatings === "object"
        ? Object.keys(payloadValueRatings).map((k) => String(k || "").trim())
        : []),
    ].filter(Boolean);
    for (const key of payloadKeys) {
      if (!map[key]) map[key] = key;
    }
    return map;
  }, [reviewModal?.row?.payload?.webknotValueRatings, reviewModal?.row?.payload?.webknotValues, selfValues]);
  const selfValuesByPillar = useMemo(() => {
    const groups = new Map();
    for (const valueItem of selfValues) {
      const pillar = String(valueItem?.pillar || "—").trim() || "—";
      if (!groups.has(pillar)) groups.set(pillar, []);
      groups.get(pillar).push(valueItem);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => String(a).localeCompare(String(b), undefined, { numeric: true }))
      .map(([pillar, items]) => ({
        pillar,
        items: items
          .slice()
          .sort((a, b) => String(a?.title || a?.id || "").localeCompare(String(b?.title || b?.id || ""), undefined, { numeric: true })),
      }));
  }, [selfValues]);
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

  useEffect(() => { if (notificationsError) showToast({ title: "Notifications Error", message: notificationsError, tone: "error" }); }, [notificationsError, showToast]);
  useEffect(() => { if (teamError) showToast({ title: "Team Load Failed", message: teamError, tone: "error" }); }, [teamError, showToast]);
  useEffect(() => { if (managerDraftError) showToast({ title: "Draft Error", message: managerDraftError, tone: "error" }); }, [managerDraftError, showToast]);
  useEffect(() => { if (selfRatingValidationError) showToast({ title: "Validation", message: selfRatingValidationError, tone: "error" }); }, [selfRatingValidationError, showToast]);

  /* ── load projects for manager project rating tab ── */
  const loadMgrProjects = useCallback(async (opts = {}) => {
    setMgrProjectsLoading(true);
    setMgrProjectsError("");
    try {
      const raw = await fetchProjects(opts);
      const all = normalizeProjects(raw).filter((p) => p.active !== false);
      setMgrProjects(all);
    } catch (err) {
      if (err?.name === "AbortError") return;
      setMgrProjectsError(err?.message || "Failed to load projects.");
    } finally {
      setMgrProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "project-ratings") return;
    const controller = new AbortController();
    loadMgrProjects({ signal: controller.signal });
    return () => controller.abort();
  }, [activeTab, loadMgrProjects]);

  /* projects assigned to this manager */
  const myManagedProjects = useMemo(() => {
    if (!managerId) return mgrProjects;
    const managed = mgrProjects.filter(
      (p) => p.managerId === managerId || !p.managerId,
    );
    /* if no projects explicitly assigned to this manager, show all so they can still rate */
    return managed.length > 0 ? managed : mgrProjects;
  }, [mgrProjects, managerId]);

  /* filtered for search */
  const filteredMgrProjects = useMemo(() => {
    const q = prSearch.trim().toLowerCase();
    if (!q) return myManagedProjects;
    return myManagedProjects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
    );
  }, [myManagedProjects, prSearch]);

  /* submit a project rating */
  async function handleSubmitProjectRating() {
    if (!prSelectedProject || !prSelectedEmployee || !prRating) return;
    setPrSubmitting(true);
    setPrError("");
    setPrSuccess("");
    try {
      await submitProjectRating(prSelectedProject, {
        employeeId: prSelectedEmployee,
        rating: prRating,
        comments: prComments.trim(),
      });
      setPrSuccess("Rating submitted successfully!");
      setPrRating(0);
      setPrComments("");
      setPrSelectedEmployee(null);
      showToast({ title: "Rating Submitted", message: "Project rating saved.", tone: "success" });
    } catch (err) {
      setPrError(err?.message || "Failed to submit rating.");
      showToast({ title: "Rating Failed", message: err?.message || "Please try again.", tone: "error" });
    } finally {
      setPrSubmitting(false);
    }
  }

  const unreadNotificationsCount = useMemo(
    () => notifications.reduce((count, item) => (item?.read ? count : count + 1), 0),
    [notifications]
  );
  const notificationUserId = useMemo(() => {
    const candidates = [
      managerId,
      auth?.id,
      auth?.userId,
      auth?.employeeId,
      auth?.empId,
      auth?.claims?.userId,
      auth?.claims?.uid,
      auth?.claims?.sub,
    ];
    for (const candidate of candidates) {
      const text = String(candidate ?? "").trim();
      if (text) return text;
    }
    return "";
  }, [
    managerId,
    auth?.claims?.sub,
    auth?.claims?.uid,
    auth?.claims?.userId,
    auth?.empId,
    auth?.employeeId,
    auth?.id,
    auth?.userId,
  ]);

  const reloadNotifications = useCallback(async ({
    signal,
    cursor = null,
    append = false,
    silent = false,
  } = {}) => {
    if (!notificationUserId) {
      setNotifications([]);
      setNotificationsNextCursor(null);
      setNotificationsError("");
      notificationsLoadedRef.current = false;
      return { items: [], nextCursor: null, unreadCount: 0 };
    }
    if (!silent || !notificationsLoadedRef.current) {
      setNotificationsLoading(true);
    }
    setNotificationsError("");
    try {
      const data = await fetchManagerNotifications({
        userId: notificationUserId,
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
        showToast({ title: "Session expired", message: "Please login again.", tone: "error" });
        onLogout?.();
        return null;
      }
      setNotificationsError(err?.message || "Failed to load notifications.");
      return null;
    } finally {
      setNotificationsLoading(false);
    }
  }, [notificationUserId, onLogout, showToast]);

  const pushIncomingNotification = useCallback((incoming) => {
    if (!incoming) return;
    const eventKey = String(incoming?.id ?? `${incoming?.type}:${incoming?.createdAt}:${incoming?.message ?? incoming?.title ?? ""}`);
    setNotifications((prev) => mergeNotifications(prev, [incoming]).slice(0, MANAGER_NOTIFICATION_PAGE_SIZE * 3));
    if (notifiedEventKeysRef.current.has(eventKey)) return;
    notifiedEventKeysRef.current.add(eventKey);
    if (notifiedEventKeysRef.current.size > 500) {
      notifiedEventKeysRef.current = new Set(Array.from(notifiedEventKeysRef.current).slice(-250));
    }
    playNotificationSound().catch(() => {});
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
      showToast({ title: "Unable to mark read", message: err?.message || "Please try again.", tone: "error" });
    }
  }, [onLogout, showToast]);

  const markEveryNotificationRead = useCallback(async () => {
    try {
      await markAllManagerNotificationsRead({ notifications });
      setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
    } catch (err) {
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again.", tone: "error" });
        onLogout?.();
        return;
      }
      showToast({ title: "Unable to mark all read", message: err?.message || "Please try again.", tone: "error" });
    }
  }, [notifications, onLogout, showToast]);

  useEffect(() => {
    if (!notificationUserId) return;
    const controller = new AbortController();
    reloadNotifications({ signal: controller.signal }).catch(() => {});

    const timer = window.setInterval(() => {
      reloadNotifications({ silent: true }).catch(() => {});
    }, MANAGER_NOTIFICATION_POLL_MS);

    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [notificationUserId, reloadNotifications]);

  useEffect(() => {
    if (!notificationUserId) return;
    const unsubscribe = subscribeManagerNotificationsStream({
      userId: notificationUserId,
      onNotification: (item) => {
        pushIncomingNotification(item);
      },
      onError: () => {
        reloadNotifications({ silent: true }).catch(() => {});
      },
    });
    return () => unsubscribe?.();
  }, [notificationUserId, pushIncomingNotification, reloadNotifications]);

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
      const status = err?.status ? ` [${err.status}]` : "";
      showToast({ title: "AI failed", message: `${err?.message || "Please try again."}${status}`, tone: "error" });
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
      const status = err?.status ? ` [${err.status}]` : "";
      showToast({ title: "AI failed", message: `${err?.message || "Please try again."}${status}`, tone: "error" });
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

  /* ── quick reject (from table action button) ── */
  async function submitQuickReject() {
    const row = quickRejectModal.row;
    if (!row) return;
    const comment = String(quickRejectComment || "").trim();
    if (comment.length < 10) {
      showToast({ title: "Too short", message: "Rejection comments must be at least 10 characters." });
      return;
    }
    const empId = String(row.employee?.id || "").trim();
    const m = String(row.month || month || "").trim();
    if (!empId || !m) {
      showToast({ title: "Missing data", message: "Employee id or month is missing." });
      return;
    }
    setQuickRejectBusy(true);
    try {
      const employeePayload = row.payload || {};
      const reviewedAt = new Date().toISOString();
      const cycleMeta = buildCycleMeta(m);
      const employeeKpiRatings = normalizeSelfKpiRatings(employeePayload.kpiRatings || {});
      const employeeValueRatings = normalizeSelfValueRatings(
        employeePayload.webknotValueRatings ?? employeePayload.webknotValues
      );
      const employeeValueEntries = Object.entries(employeeValueRatings);
      const employeeCertifications = normalizeCertificationsForState(employeePayload.certifications);
      const payload = {
        month: m,
        monthKey: m,
        cycleKey: cycleMeta.cycleKey,
        cycleLabel: cycleMeta.cycleLabel,
        cycleShortLabel: cycleMeta.cycleShortLabel,
        cycleStartMonth: cycleMeta.cycleStartMonth,
        cycleEndMonth: cycleMeta.cycleEndMonth,
        cycleMonth: cycleMeta.month,
        submissionType: row?.submissionType || "EMPLOYEE_MONTHLY_SUBMISSION",
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
          kpiRatings: {},
          webknotValueRatings: {},
          comments: comment,
          reviewedAt,
          reviewedBy: managerId || null,
        },
        managerReview: {
          action: "REJECT",
          comments: comment,
          reviewedAt,
          reviewedBy: managerId || null,
        },
        managerSubmittedAt: null,
        managerComments: comment,
        managerNotes: comment,
        reviewStatus: "NEEDS_REVIEW",
        reopenedForResubmission: true,
      };
      await submitMonthlySubmission(payload);
      showToast({ title: "Rejected", message: "Sent back with comments for resubmission." });
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
      setQuickRejectModal({ open: false, row: null });
      setQuickRejectComment("");
      await reloadTeam();
      await reloadTeamInsights();
    } catch (err) {
      showToast({ title: "Reject failed", message: err?.message || "Please try again.", tone: "error" });
    } finally {
      setQuickRejectBusy(false);
    }
  }

  const selectedRow = reviewModal.open ? reviewModal.row : null;
  const selectedKey = selectedRow ? `${selectedRow.employee.id}:${String(selectedRow.month || month)}` : "";
  const selectedValueComments = useMemo(() => {
    if (!selectedRow) return {};
    const payload = selectedRow.payload || {};
    const out = {};
    if (payload.webknotValueComments && typeof payload.webknotValueComments === "object") {
      for (const [id, comment] of Object.entries(payload.webknotValueComments)) {
        const key = String(id || "").trim();
        if (!key) continue;
        const text = String(comment || "").trim();
        if (text) out[key] = text;
      }
    }
    if (Array.isArray(payload.webknotValueResponses)) {
      for (const entry of payload.webknotValueResponses) {
        const key = String(entry?.valueId || entry?.id || "").trim();
        if (!key) continue;
        const text = String(entry?.comment || "").trim();
        if (text) out[key] = text;
      }
    }
    return out;
  }, [selectedRow]);

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
      } catch (err) {
        if (err?.name !== "AbortError" && mounted) showToast({ title: "KPI Load Failed", message: err?.message || "Failed to load KPI definitions.", tone: "error" });
      } finally {
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
      } catch (err) {
        if (!mounted) return;
        setSelfValues([]);
        if (err?.name !== "AbortError") showToast({ title: "Values Load Failed", message: err?.message || "Failed to load values.", tone: "error" });
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
        showToast({ title: "Team Insights Failed", message: err?.message || "Failed to load team insights.", tone: "error" });
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
        const data = await fetchMyMonthlySubmission({
          month,
          employeeId: String(managerId || auth?.employeeId || "").trim(),
          signal: controller.signal,
        });
        if (!mounted) return;

        const normalized = normalizeMonthlySubmission(data);
        if (!normalized) {
          setSelfSubmissionMeta(null);
          setManagerSelfReviewText("");
          setManagerSelfKpiRatings({});
          setManagerSelfValueRatings({});
          setManagerSelfValueComments({});
          const cleared = buildManagerSelfSubmissionPayload({
            month,
            selfReviewText: "",
            kpiRatings: {},
            selectedValues: {},
            valueComments: {},
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
        const nextValueComments = (normalized.webknotValueComments && typeof normalized.webknotValueComments === "object")
          ? normalized.webknotValueComments
          : Array.isArray(normalized.webknotValueResponses)
            ? Object.fromEntries(
                normalized.webknotValueResponses
                  .map((entry) => [String(entry?.valueId || entry?.id || ""), String(entry?.comment || "").trim()])
                  .filter(([id, comment]) => id)
              )
            : {};
        setManagerSelfValueComments(nextValueComments);

        const loaded = buildManagerSelfSubmissionPayload({
          month: normalized.month || month,
          selfReviewText: normalized.selfReviewText || "",
          kpiRatings: nextKpis,
          selectedValues: nextValues,
            valueComments: nextValueComments,
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
  const selfStatusSummary = useMemo(() => {
    const reviewStatus = String(selfSubmissionMeta?.reviewStatus || "DRAFT").trim().toUpperCase();
    const adminAction = String(selfSubmissionMeta?.adminReview?.action || "").trim().toUpperCase();
    const submittedAt = selfSubmissionMeta?.submittedAt || selfSubmissionMeta?.updatedAt || null;
    const actor = selfSubmissionMeta?.adminReview?.reviewedBy || "Admin";
    const needsChanges = Boolean(isResubmissionRequested(selfSubmissionMeta));
    if (needsChanges) {
      return {
        chip: "Changes requested",
        chipClass: "bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/30",
        title: "Admin returned your self review",
        detail: "Address the feedback and resubmit. Only admins can approve manager self reviews.",
        timestamp: formatReviewTimestamp(selfSubmissionMeta?.adminReview?.reviewedAt || submittedAt),
      };
    }
    if (reviewStatus.includes("APPROVED")) {
      return {
        chip: "Approved",
        chipClass: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/30",
        title: "Approved by admin",
        detail: actor ? `${actor} approved this self review.` : "Admin approved this self review.",
        timestamp: formatReviewTimestamp(selfSubmissionMeta?.adminReview?.reviewedAt || submittedAt),
      };
    }
    if (reviewStatus.includes("SUBMITTED")) {
      return {
        chip: adminAction ? `Admin: ${adminAction}` : "Submitted",
        chipClass: "bg-blue-500/15 text-blue-800 dark:text-blue-200 border-blue-500/30",
        title: "Pending admin evaluation",
        detail: "Admins review and finalize manager self reviews. You can edit until approval unless locked.",
        timestamp: formatReviewTimestamp(submittedAt),
      };
    }
    return {
      chip: "Draft",
      chipClass: "bg-slate-500/10 text-slate-700 dark:text-slate-200 border-slate-500/20",
      title: "Draft in progress",
      detail: "Submit to send your self review to admins for evaluation.",
      timestamp: submittedAt ? formatReviewTimestamp(submittedAt) : "—",
    };
  }, [selfSubmissionMeta]);

  useEffect(() => {
    if (!String(month || "").trim()) return;
    if (hydratingSelfSubmission) return;
    if (selfReviewLocked) return;

    const payload = buildManagerSelfSubmissionPayload({
      month,
      selfReviewText: managerSelfReviewText,
      kpiRatings: managerSelfKpiRatings,
      selectedValues: managerSelfValueRatings,
      valueComments: managerSelfValueComments,
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
    managerSelfValueComments,
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

  /* ── employee list for review queue popover ── */
  const queueEmployeeList = useMemo(() => {
    const rows = teamInsightSourceRows.length ? teamInsightSourceRows : teamSubs;
    const seen = new Map();
    for (const s of rows) {
      const empId = String(s?.employee?.id || "").trim();
      if (!empId || empId === "—") continue;
      if (seen.has(empId)) continue;
      const status = String(s.status || "").trim().toUpperCase();
      const submitted = isSubmittedStatus(status);
      const pendingReview = submitted && !s.managerSubmitted;
      seen.set(empId, {
        id: empId,
        name: s.employee?.name || s.employee?.email || empId,
        email: s.employee?.email || "—",
        submitted,
        pendingReview,
        managerSubmitted: Boolean(s.managerSubmitted),
        status,
      });
    }
    return Array.from(seen.values());
  }, [teamInsightSourceRows, teamSubs]);

  const filteredQueueEmployees = useMemo(() => {
    const q = String(queueSearch || "").trim().toLowerCase();
    let list = queueEmployeeList;
    if (queueView === "submitted") list = list.filter((e) => e.submitted);
    else if (queueView === "pending") list = list.filter((e) => e.pendingReview);
    if (!q) return list;
    return list.filter((e) => e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q) || e.id.toLowerCase().includes(q));
  }, [queueEmployeeList, queueView, queueSearch]);

  const filteredTeamSubs = useMemo(() => {
    const mode = String(filter || "").toUpperCase();
    const pending = teamSubs.filter((s) => !s.managerSubmitted);
    const submittedByManager = teamSubs.filter((s) => s.managerSubmitted);

    const matchesSearch = (row) => {
      const q = String(teamSearch || "").trim().toLowerCase();
      if (!q) return true;
      const name = String(row?.employee?.name || "").toLowerCase();
      const email = String(row?.employee?.email || "").toLowerCase();
      const id = String(row?.employee?.id || "").toLowerCase();
      return name.includes(q) || email.includes(q) || id.includes(q);
    };

    let base = pending;
    if (mode === "SUBMITTED") base = submittedByManager;
    if (mode === "ALL") base = teamSubs;

    return base.filter(matchesSearch);
  }, [filter, teamSearch, teamSubs]);

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
      valueComments: managerSelfValueComments,
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
      showToast({ title: "Save failed", message: err?.message || "Please try again.", tone: "error" });
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
        valueComments: managerSelfValueComments,
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
      const normalizedValueComments = (normalized?.webknotValueComments && typeof normalized.webknotValueComments === "object")
        ? normalized.webknotValueComments
        : Array.isArray(normalized?.webknotValueResponses)
          ? Object.fromEntries(
              normalized.webknotValueResponses
                .map((entry) => [String(entry?.valueId || entry?.id || ""), String(entry?.comment || "").trim()])
                .filter(([id, comment]) => id)
            )
          : managerSelfValueComments;
      setManagerSelfValueComments(normalizedValueComments);
      lastSavedSelfDraftHashRef.current = payloadHash(
        buildManagerSelfSubmissionPayload({
          month,
          selfReviewText: managerSelfReviewText,
          kpiRatings: managerSelfKpiRatings,
          selectedValues: managerSelfValueRatings,
          valueComments: normalizedValueComments,
          allowedKpiIds: filteredSelfKpiIds,
          managerId,
          reviewStatus: "SUBMITTED",
          reopenedForResubmission: false,
        })
      );
      showToast({ title: "Submitted", message: "Manager self review submitted." });
    } catch (err) {
      showToast({ title: "Submit failed", message: err?.message || "Please try again.", tone: "error" });
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
      showToast({ title: "Validation failed", message: check.message || "Please review the input.", tone: "error" });
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
      submissionId: selectedRow?.submissionId ?? selectedRow?.id ?? null,
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
          // Remove from local list so manager can no longer access it
          setTeamSubs((prev) =>
            prev.filter((s) => {
              const sameEmp = String(s?.employee?.id || "") === empId;
              const sameMonth = String(s?.month || "") === m;
              return !(sameEmp && sameMonth);
            })
          );
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
      showToast({ title: `${reviewAction === "REJECT" ? "Reject" : "Submit"} failed`, message: err?.message || "Please try again.", tone: "error" });
    } finally {
      setSavingReview(false);
    }
  }

  return (
    <>
    {/* ─── Cycle label + Notification Panel (outside rt-shell) ─── */}
    <div className="fixed right-4 top-4 z-[65] flex items-center gap-3 md:right-6 md:top-5">
      <span className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))]/60 bg-[rgb(var(--surface))]/80 backdrop-blur-md px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--muted))] shadow-sm">
        <Calendar size={14} />
        {cycleInfo?.label || "—"}
      </span>
      <div className="flex flex-col items-end" ref={notificationsPanelRef}>
        <button
          type="button"
          onClick={() => {
              const nextOpen = !notificationsOpen;
              setNotificationsOpen(nextOpen);
              if (nextOpen) reloadNotifications({ silent: true }).catch(() => {});
            }}
            className={[
              "relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-[rgb(var(--border))]",
              "bg-[rgb(var(--surface))] text-[rgb(var(--text))]",
              "transition-all duration-200 hover:bg-[rgb(var(--surface-2))]",
              unreadNotificationsCount > 0 ? "" : "",
            ].join(" ")}
            aria-label="Manager notifications"
            title="Manager notifications"
          >
            {unreadNotificationsCount > 0 ? <BellDot size={16} /> : <Bell size={16} />}
            {unreadNotificationsCount > 0 ? (
              <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-red-600 px-1 py-0.5 text-center text-[9px] font-semibold text-white">
                {unreadNotificationsCount > 99 ? "99+" : unreadNotificationsCount}
              </span>
            ) : null}
          </button>

          {notificationsOpen ? (
            <div className="mt-3 w-[min(92vw,420px)] rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-lg">
              <div className="flex items-center justify-between border-b border-[rgb(var(--border))] px-4 py-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                    Manager Alerts
                  </div>
                  <div className="mt-1 text-sm font-medium text-[rgb(var(--text))]">
                    {unreadNotificationsCount} unread
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => reloadNotifications().catch(() => {})}
                    className="rounded-md border border-[rgb(var(--border))] px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => markEveryNotificationRead().catch(() => {})}
                    className="inline-flex items-center gap-1 rounded-md border border-[rgb(var(--border))] px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
                  >
                    <CheckCheck size={13} />
                    Mark all
                  </button>
                </div>
              </div>

              <div className="max-h-[400px] overflow-y-auto p-3">
                {!notificationsError && notificationsLoading && notifications.length === 0 ? (
                  <div className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-3 text-xs text-[rgb(var(--muted))]">
                    Loading alerts...
                  </div>
                ) : null}
                {!notificationsError && !notificationsLoading && notifications.length === 0 ? (
                  <div className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-3 text-xs text-[rgb(var(--muted))]">
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
                        "w-full rounded-md border px-3 py-2.5 text-left transition",
                        item.read
                          ? "border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] opacity-90"
                          : "border-blue-500/35 bg-blue-500/10",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                            Employee Submission
                          </div>
                          <div className="mt-1 text-sm font-bold text-[rgb(var(--text))] break-words">{item.title}</div>
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

                {notificationsNextCursor ? (
                  <button
                    type="button"
                    onClick={() => reloadNotifications({ cursor: notificationsNextCursor, append: true }).catch(() => {})}
                    className="mt-3 w-full rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-2 text-xs font-bold uppercase tracking-wider text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
                  >
                    Load more
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

    <div className="rt-shell flex min-h-screen text-[rgb(var(--text))] font-sans overflow-x-hidden">
      {isSidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-label="Close sidebar"
        />
      ) : null}

      <Sidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        activeTab={activeTab}
        setActiveTab={handleSidebarTabChange}
        onLogout={onLogout}
        account={account}
      />

      <main className={`relative flex-1 transition-all duration-300 ${isSidebarOpen ? "md:ml-[280px]" : "md:ml-[84px]"} p-4 pt-20 md:p-6 md:pt-8 lg:p-10`}>
        <header className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[rgb(var(--text))]">
              {activeTab === "team" ? "Team Submissions Workspace" : "Manager Self Review Workspace"}
            </h1>
            <p className="text-sm text-[rgb(var(--muted))] mt-1.5">
              Monitor submission health, review reportees, and complete your monthly manager self review.
            </p>
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-xs font-medium text-[rgb(var(--text))]">
                <Users size={14} className="text-[rgb(var(--muted))]" /> {reporteeCount} Reportees
              </span>
              <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 size={14} /> {submittedCount} Submitted
              </span>
              <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-xs font-medium text-amber-700 dark:text-amber-300">
                <Clock size={14} /> {pendingManagerReviewCount} Pending
              </span>
            </div>
          </div>

          <div className="flex items-end md:items-end gap-3 flex-wrap md:justify-end">
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Month</label>
              <div className="relative">
                <select
                  value={month}
                  disabled
                  className="rt-input appearance-none py-2.5 px-4 pr-9 text-sm rounded-xl cursor-not-allowed opacity-75"
                  title="Month is locked to the current period"
                >
                  {cycleMonthOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" />
              </div>
              <div className="text-[10px] text-[rgb(var(--muted))]">
                Cycle: {cycleInfo?.label || "May-Oct / Nov-Apr"}
              </div>
            </div>

            {activeTab === "team" ? (
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Filter</label>
                  <div className="relative">
                    <select
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      className="rt-input appearance-none py-2.5 px-4 pr-9 text-sm rounded-xl"
                      title="Filter"
                    >
                      <option value="PENDING_MANAGER_REVIEW">Pending manager review</option>
                      <option value="SUBMITTED">Submitted</option>
                      <option value="ALL">All</option>
                    </select>
                    <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" />
                  </div>
                </div>
                <div className="space-y-1.5 w-full md:w-56">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Search</label>
                  <input
                    value={teamSearch}
                    onChange={(e) => setTeamSearch(e.target.value)}
                    className="rt-input py-2.5 px-4 text-sm rounded-xl"
                    placeholder="Search name, email, or ID"
                    aria-label="Search team submissions"
                  />
                </div>
              </div>
            ) : null}

            <button
              onClick={() => {
                reloadTeam({ cursor: teamCursor ?? null, pageAction: "stay" }).catch(() => {});
                reloadTeamInsights().catch(() => {});
              }}
              disabled={teamLoading || teamInsightsLoading}
              className={[
                "rt-btn-ghost transition-all",
                teamLoading || teamInsightsLoading ? "opacity-60 cursor-not-allowed" : "",
              ].join("")}
              title="Refresh"
            >
              <RefreshCw size={18} /> {teamLoading || teamInsightsLoading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </header>

      <AnimatePresence mode="wait">
      {activeTab === "team" && queueView ? (
        <motion.section
          key={`queue-${queueView}`}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-5xl mx-auto mt-10"
        >
          <button
            type="button"
            onClick={() => { setQueueView(null); setQueueSearch(""); }}
            className="rt-btn-ghost text-sm gap-2 mb-6"
          >
            <ArrowLeft size={16} /> Back to Team Submissions
          </button>

          <div className="rt-panel rounded-2xl overflow-hidden">
            <div className="p-6 sm:p-8 border-b border-[rgb(var(--border))]">
              <div className="flex items-center gap-3 mb-1">
                {queueView === "reportees" ? <Users size={20} className="text-blue-500" /> : queueView === "submitted" ? <CheckCircle2 size={20} className="text-emerald-500" /> : <Clock size={20} className="text-amber-500" />}
                <h2 className="text-xl font-bold tracking-tight text-[rgb(var(--text))]">
                  {queueView === "reportees" ? "All Reportees" : queueView === "submitted" ? "Submitted" : "Pending Manager Review"}
                </h2>
                <span className="ml-auto text-sm font-mono text-[rgb(var(--muted))]">
                  {filteredQueueEmployees.length} {filteredQueueEmployees.length === 1 ? "employee" : "employees"}
                </span>
              </div>
              <p className="text-sm text-[rgb(var(--muted))]">
                {queueView === "reportees"
                  ? "All employees reporting to you in the current cycle."
                  : queueView === "submitted"
                    ? "Employees who have submitted their self-review."
                    : "Submissions awaiting your review."}
              </p>
              <div className="relative mt-5">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" />
                <input
                  type="text"
                  value={queueSearch}
                  onChange={(e) => setQueueSearch(e.target.value)}
                  placeholder="Search by name, email, or ID…"
                  className="w-full rt-input py-2.5 pl-10 pr-4 text-sm rounded-xl"
                  autoFocus
                />
              </div>
            </div>

            <div className="divide-y divide-[rgb(var(--border))]">
              {filteredQueueEmployees.length > 0 ? filteredQueueEmployees.map((emp) => (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => {
                    const matchRow = teamSubs.find((s) => String(s?.employee?.id || "") === emp.id);
                    if (matchRow) setReviewModal({ open: true, row: matchRow });
                  }}
                  className="w-full text-left px-6 sm:px-8 py-4 hover:bg-[rgb(var(--surface-2)/.4)] transition-colors group flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="h-10 w-10 rounded-full bg-[rgb(var(--surface-2))] flex items-center justify-center flex-shrink-0">
                      <UserCircle2 size={20} className="text-[rgb(var(--muted))]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-[rgb(var(--text))] truncate group-hover:text-blue-500 transition-colors">{emp.name}</div>
                      <div className="text-xs text-[rgb(var(--muted))] truncate mt-0.5">
                        <span className="font-mono">{emp.id}</span> · {emp.email}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={[
                      "text-[10px] font-semibold uppercase px-2.5 py-1 rounded-full border",
                      emp.managerSubmitted
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-300 border-blue-500/20"
                        : emp.submitted
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
                    ].join(" ")}>
                      {emp.managerSubmitted ? "Reviewed" : emp.submitted ? "Submitted" : "Pending"}
                    </span>
                    <ChevronRight size={14} className="text-[rgb(var(--muted))] group-hover:text-[rgb(var(--text))] transition-colors" />
                  </div>
                </button>
              )) : (
                <div className="text-sm text-[rgb(var(--muted))] text-center py-12">No employees found.</div>
              )}
            </div>
          </div>
        </motion.section>
      ) : activeTab === "team" ? (
        <motion.section
          key="team-tab"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-7xl mx-auto mt-10 grid grid-cols-1 xl:grid-cols-3 gap-8"
        >
          {(teamLoading && teamSubs.length === 0) || (teamInsightsLoading && teamInsightSourceRows.length === 0) ? (
            <div className="xl:col-span-3 rt-panel-subtle rounded-lg p-6 text-sm text-[rgb(var(--muted))] animate-pulse">
              Loading team submissions and manager insights…
            </div>
          ) : null}
          <section className="xl:col-span-3 rt-panel p-6 sm:p-7">
            <div className="flex items-center gap-3 mb-5">
              <div className="rounded-lg p-2 bg-emerald-500/10 text-emerald-500"><Target size={16} /></div>
              <div>
                <h2 className="font-bold tracking-tight text-[rgb(var(--text))]">Manager Insights</h2>
                <p className="text-xs text-[rgb(var(--muted))] mt-0.5">Queue health, review velocity, and actionable pending load.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2)/.3)] p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Review Coverage</div>
                <div className="mt-2 text-2xl font-bold text-[rgb(var(--text))]">{managerInsights.reviewedCoverage}%</div>
              </div>
              <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2)/.3)] p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Pending Queue</div>
                <div className="mt-2 text-2xl font-bold text-[rgb(var(--text))]">{managerInsights.pendingCoverage}%</div>
              </div>
              <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2)/.3)] p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Avg Review Time</div>
                <div className="mt-2 flex items-center gap-2 text-2xl font-bold text-[rgb(var(--text))]">
                  <Clock3 size={16} className="text-[rgb(var(--muted))]" />
                  {managerInsights.avgTurnaroundHours}h
                </div>
              </div>
              <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2)/.3)] p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Reject Signals</div>
                <div className="mt-2 flex items-center gap-2 text-2xl font-bold text-[rgb(var(--text))]">
                  <TrendingUp size={16} className="text-[rgb(var(--muted))]" />
                  {managerInsights.rejectedCount}
                </div>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rt-panel-subtle p-4 rounded-lg">
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
              <div className="rt-panel-subtle p-4 rounded-lg">
                <div className="rt-kicker">Pending Preview</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {managerInsights.pendingPreview.length ? (
                    managerInsights.pendingPreview.map((emp) => (
                      <span
                        key={`pending:${emp.id}`}
                        className="inline-flex items-center gap-2 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-1.5 text-xs"
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
              <div className="rt-panel-subtle p-4 rounded-lg">
                <div className="rt-kicker">Stream Granularity</div>
                <div className="mt-3 space-y-2">
                  {managerGranularity.streamRows.length ? (
                    managerGranularity.streamRows.map((row) => (
                      <div key={`stream:${row.name}`} className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2">
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
              <div className="rt-panel-subtle p-4 rounded-lg">
                <div className="rt-kicker">Band Granularity</div>
                <div className="mt-3 space-y-2">
                  {managerGranularity.bandRows.length ? (
                    managerGranularity.bandRows.map((row) => (
                      <div key={`band:${row.name}`} className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2">
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
              <div className="rt-panel-subtle p-4 rounded-lg">
                <div className="rt-kicker">Top Employee Signals</div>
                <div className="mt-3 space-y-2">
                  {managerGranularity.topEmployees.length ? (
                    managerGranularity.topEmployees.map((row, idx) => (
                      <div key={`signal:${row.id}:${idx}`} className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-[rgb(var(--text))] truncate">{row.name}</span>
                          <span className="font-mono text-[rgb(var(--text))]">{row.score.toFixed(1)}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-[rgb(var(--muted))]">
                          {row.stream} • {row.band}
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

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-[rgb(var(--muted))] border-t border-b border-[rgb(var(--border))]">
                  <tr>
                    <th className="p-6 font-semibold">Employee</th>
                    <th className="p-6 font-semibold">Status</th>
                    <th className="p-6 font-semibold">Submitted At</th>
                    <th className="p-6 font-semibold">Manager Review</th>
                    <th className="p-6 text-right font-semibold px-8">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgb(var(--border))]">
                  {filteredTeamSubs.map((s) => {
                    const status = String(s.status || "—").toUpperCase();
                    const isSubmitted = isSubmittedStatus(status);
                    const submittedWhen = s.submittedAt || s.updatedAt || "—";
                    return (
                      <motion.tr
                        key={`${s.employee.email || s.employee.name}:${s.submissionId || submittedWhen}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.25 }}
                        className="hover:bg-[rgb(var(--surface-2))] transition-colors group"
                      >
                        <td className="p-6">
                          <button
                            type="button"
                            onClick={() => setReviewModal({ open: true, row: s })}
                            className="font-bold text-[rgb(var(--text))] tracking-tight hover:text-blue-500 transition-colors text-left"
                            title="Open submission review"
                          >
                            {s.employee.name}
                          </button>
                          <div className="text-xs text-[rgb(var(--muted))] mt-1 font-mono">
                            {s.employee.id || "—"}
                          </div>
                        </td>
                        <td className="p-6">
                          <span
                            className={[
                              "text-[10px] font-semibold uppercase px-3 py-1 rounded-lg border",
                              isSubmitted
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                                : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
                            ].join(" ")}
                          >
                            {status}
                          </span>
                        </td>
                        <td className="p-6 text-xs text-[rgb(var(--muted))]">
                          {formatSubmittedAt(submittedWhen)}
                        </td>
                        <td className="p-6">
                          {s.managerSubmitted ? (
                            <span className="text-[10px] font-semibold uppercase px-3 py-1 rounded-lg border bg-blue-500/10 text-blue-600 dark:text-blue-300 border-blue-500/20">
                              Submitted
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold uppercase px-3 py-1 rounded-lg border bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="p-6 text-right px-8">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setReviewModal({ open: true, row: s })}
                              className="rt-btn-ghost transition-all text-xs gap-1.5"
                              title="Review submission"
                            >
                              <Eye size={13} /> Review
                            </button>
                            <button
                              type="button"
                              onClick={() => { setQuickRejectModal({ open: true, row: s }); setQuickRejectComment(""); }}
                              className="rt-btn-danger transition-all text-xs gap-1.5"
                              title="Reject with comments"
                            >
                              <XCircle size={13} /> Reject
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}

                  {!teamLoading && filteredTeamSubs.length === 0 ? (
                    <tr>
                      <td className="p-10 text-center text-[rgb(var(--muted))]" colSpan={5}>
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
                    "rt-btn-ghost",
                    teamPager.loading ? "opacity-50 cursor-not-allowed" : "",
                  ].join("")}
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
              Click a card to view employee details.
            </p>
            <div className="mt-5 space-y-3">
              {[
                { key: "reportees", label: "Reportees", count: reporteeCount, color: "blue", icon: <Users size={16} /> },
                { key: "submitted", label: "Submitted", count: submittedCount, color: "emerald", icon: <CheckCircle2 size={16} /> },
                { key: "pending", label: "Pending Manager Review", count: pendingManagerReviewCount, color: "amber", icon: <Clock size={16} /> },
              ].map((card) => (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => { setQueueView(card.key); setQueueSearch(""); }}
                  className="w-full text-left rt-panel-subtle rounded-xl px-5 py-4 hover:bg-[rgb(var(--surface-2)/.5)] transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center bg-${card.color}-500/10 text-${card.color}-600 dark:text-${card.color}-400`}>
                        {card.icon}
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">{card.label}</div>
                        <div className="text-xl font-semibold text-[rgb(var(--text))]">{card.count}</div>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-[rgb(var(--muted))] group-hover:text-[rgb(var(--text))] transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          </section>
        </motion.section>
      ) : null}

      {activeTab === "self-review" ? (
        <motion.section
          key="self-review-tab"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-7xl mx-auto mt-10"
        >
          <section className="rt-panel p-8 max-w-4xl">
            <h2 className="rt-section-title">Manager Self Review</h2>
            <p className="rt-section-subtitle mt-1">Write your monthly self review, rate KPIs and Webknot values, then submit.</p>

            <div className="mt-5 rounded-2xl border border-[rgb(var(--border))] bg-gradient-to-r from-[rgb(var(--surface))] via-[rgb(var(--surface-2)/.6)] to-white/60 dark:from-[rgb(var(--surface-2))] dark:via-[rgb(var(--surface-2))] dark:to-transparent shadow-sm p-5 sm:p-6 relative overflow-hidden">
              <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-blue-500 via-indigo-500 to-cyan-500" aria-hidden="true" />
              <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_15%_20%,rgba(59,130,246,0.08),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(99,102,241,0.08),transparent_28%)]" aria-hidden="true" />
              <div className="relative flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Admin-only evaluation</div>
                    <div className="text-sm font-semibold text-[rgb(var(--text))]">Admins review and finalize manager self reviews.</div>
                  </div>
                  <span className={[
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider",
                    selfStatusSummary.chipClass,
                  ].join(" ")}>{selfStatusSummary.chip}</span>
                </div>
                <p className="text-xs text-[rgb(var(--muted))] leading-relaxed">{selfStatusSummary.detail}</p>
                <div className="text-[11px] text-[rgb(var(--muted))]">Last update: {selfStatusSummary.timestamp}</div>
              </div>
            </div>

            {selfReviewLocked && !selfNeedsResubmission ? (
              <div className="mt-5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-200">
                This month is submitted and locked. You can submit once per month.
              </div>
            ) : null}
            {!selfReviewLocked && selfNeedsResubmission ? (
              <div className="mt-5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
                Admin requested changes. Please update your self review and submit again.
                {selfLatestReviewComment ? (
                  <div className="mt-2 text-xs font-mono text-amber-900 dark:text-amber-100 break-words">
                    Feedback: {selfLatestReviewComment}
                  </div>
                ) : null}
              </div>
            ) : null}

            {(hydratingSelfSubmission || selfKpisLoading || selfValuesLoading) ? (
              <div className="mt-5 rt-panel-subtle rounded-lg p-4 text-sm text-[rgb(var(--muted))] animate-pulse">
                Loading your self review template (KPIs and Webknot values)…
              </div>
            ) : null}

            <div className="mt-5 text-xs text-[rgb(var(--muted))]">
              Draft: {selfReviewLocked ? "Locked" : (hydratingSelfSubmission ? "Loading…" : managerDraftSaving ? "Saving…" : "Saved")}
            </div>
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
                    "rt-btn-primary transition-all",
                    selfReviewLocked || aiEnhancingSelfReview || !String(managerSelfReviewText || "").trim() || !aiAgent
                      ? "!bg-[rgb(var(--surface-2))] !text-[rgb(var(--muted))] !border-[rgb(var(--border))] cursor-not-allowed"
                      : "",
                  ].join(" ")}
                >
                  <Sparkles size={16} /> {aiEnhancingSelfReview ? "Enhancing…" : "AI Enhance"}
                </button>
              </div>

              <div className="rt-panel-subtle rounded-lg p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">KPI Ratings (1-5)</div>
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

              <div className="rt-panel-subtle rounded-lg p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Webknot Values Ratings (1-5)</div>
                <div className="mt-3 space-y-4 max-h-[320px] overflow-y-auto pr-1">
                  {selfValuesByPillar.map((group) => (
                    <div key={group.pillar} className="space-y-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">{group.pillar}</div>
                      {group.items.map((valueItem) => {
                        const id = String(valueItem?.id || "").trim();
                        const value = managerSelfValueRatings?.[id];
                        const display = formatOneDecimalDisplay(value);
                        const comment = managerSelfValueComments?.[id] || "";
                        return (
                          <div key={id} className="space-y-2 rounded-md border border-[rgb(var(--border))] p-3 bg-[rgb(var(--surface-1))]">
                            <div className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-3">
                              <div className="min-w-0 pr-2">
                                <div className="text-sm text-[rgb(var(--text))] truncate">{String(valueItem?.title || id)}</div>
                                <div className="text-[10px] text-[rgb(var(--muted))] mt-1">{String(valueItem?.pillar || group.pillar || "—")}</div>
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
                            <div>
                              <label className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Self comments</label>
                              <textarea
                                value={comment}
                                onChange={(e) => setManagerSelfValueComments((prev) => ({ ...prev, [id]: e.target.value }))}
                                readOnly={selfReviewLocked}
                                rows={2}
                                className={[
                                  "mt-2 rt-input p-2 text-sm w-full resize-none",
                                  selfReviewLocked ? "opacity-75 cursor-not-allowed" : "",
                                ].join(" ")}
                                placeholder="Add a short note for this evaluation criteria"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
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
                  className="rt-btn-ghost disabled:opacity-60"
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  onClick={submitManagerSelfReview}
                  disabled={savingSelfReview || selfReviewLocked}
                  className="rt-btn-primary disabled:opacity-60"
                >
                  {selfReviewLocked ? "Submitted" : "Submit Self Review"}
                </button>
              </div>
            </div>
          </section>
        </motion.section>
      ) : null}
      </AnimatePresence>

      </main>

      {reviewModal.open && selectedRow ? (
        <ModalOverlay
          open={reviewModal.open}
          onClose={closeReviewModal}
          maxWidth="max-w-6xl"
          zIndex={70}
          header={
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                Manager Review
              </div>
              <div className="mt-2 text-2xl font-semibold tracking-tight text-[rgb(var(--text))]">
                {selectedRow.employee.name}
              </div>
              <div className="mt-1 text-xs text-[rgb(var(--muted))]">
                {String(selectedRow.month || month)}
              </div>
            </div>
          }
        >

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rt-panel-subtle rounded-2xl p-6">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                  Employee Submitted
                </div>
                <div className="mt-4 space-y-5">
                  <div className="grid grid-cols-2 gap-3 text-xs text-[rgb(var(--muted))] font-mono">
                    <div>
                      <div className="uppercase tracking-wider text-[rgb(var(--muted))]">Employee</div>
                      <div className="mt-1 text-[rgb(var(--text))] font-semibold">{selectedRow.employee.name}</div>
                      <div className="mt-0.5">{selectedRow.employee.email || "—"}</div>
                    </div>
                    <div className="text-right">
                      <div className="uppercase tracking-wider text-[rgb(var(--muted))]">Month</div>
                      <div className="mt-1 text-[rgb(var(--text))] font-semibold">{String(selectedRow.month || month)}</div>
                      {selectedRow.cycleLabel ? (
                        <div className="mt-0.5">{String(selectedRow.cycleLabel)}</div>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-[rgb(var(--muted))]">Self Review</div>
                    <div className="mt-2 text-sm text-[rgb(var(--text))] whitespace-pre-wrap">
                      {String(selectedRow.payload?.selfReviewText || "—")}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-[rgb(var(--muted))]">KPI Ratings (Employee)</div>
                    <div className="mt-2 space-y-2">
                      {Object.keys(selectedRow.payload?.kpiRatings || {}).length ? (
                        Object.entries(selectedRow.payload.kpiRatings).map(([id, v]) => (
                          <div key={id} className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm text-[rgb(var(--text))] truncate">{kpiIndex?.[id]?.title || id}</div>
                              {kpiIndex?.[id]?.weight ? (
                                <div className="text-[10px] text-[rgb(var(--muted))] font-mono">Weight: {kpiIndex[id].weight}</div>
                              ) : null}
                            </div>
                            <div className="text-sm font-mono text-purple-200">{Number(v).toFixed(1)}</div>
                          </div>
                        ))
                      ) : (
                        <div className="flex items-center justify-between gap-3 text-sm text-[rgb(var(--text))]">
                          <span className="truncate">Defaulted (no self rating)</span>
                          <span className="font-mono text-purple-200">2</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-[rgb(var(--muted))]">Webknot Values (Employee)</div>
                    <div className="mt-2 space-y-2">
                      {selectedRow.payload?.webknotValueRatings && typeof selectedRow.payload.webknotValueRatings === "object" && Object.keys(selectedRow.payload.webknotValueRatings).length ? (
                        Object.entries(selectedRow.payload.webknotValueRatings)
                          .sort(([a], [b]) => String(a).localeCompare(String(b), undefined, { numeric: true }))
                          .map(([id, rating]) => (
                            <div key={String(id || "")} className="flex items-center justify-between gap-4">
                              <div className="text-sm text-[rgb(var(--text))] truncate">{valueLabelIndex[String(id)] || String(id || "")}</div>
                              <div className="text-sm font-mono text-purple-200">{rating != null ? Number(rating).toFixed(1) : "—"}</div>
                            </div>
                          ))
                      ) : Array.isArray(selectedRow.payload?.webknotValues) && selectedRow.payload.webknotValues.length ? (
                        selectedRow.payload.webknotValues.map((v) => (
                          <div key={String(v || "")} className="text-sm text-[rgb(var(--text))]">
                            {valueLabelIndex[String(v)] || String(v || "")}
                          </div>
                        ))
                      ) : (
                        <div className="flex items-center justify-between gap-3 text-sm text-[rgb(var(--text))]">
                          <span className="truncate">Defaulted (no self rating)</span>
                          <span className="font-mono text-purple-200">2.0</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-[rgb(var(--muted))]">Certifications</div>
                    <div className="mt-2 space-y-2">
                      {normalizeCertificationsForState(selectedRow.payload?.certifications).length ? (
                        normalizeCertificationsForState(selectedRow.payload?.certifications).map((cert, idx) => (
                          <div key={`${cert.name}:${idx}`} className="rt-panel-subtle rounded-md px-3 py-2 text-sm">
                            <div className="font-semibold text-[rgb(var(--text))]">{cert.name}</div>
                            <div className="text-[11px] text-[rgb(var(--muted))] break-words">{cert.proof || "No proof provided"}</div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-[rgb(var(--muted))]">No certifications added.</div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rt-panel-subtle rounded-md px-3 py-3">
                      <div className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">Recognitions</div>
                      <div className="mt-1 text-lg font-semibold text-[rgb(var(--text))]">
                        {Number(selectedRow.payload?.recognitionsCount || 0)}
                      </div>
                    </div>
                    <div className="rt-panel-subtle rounded-md px-3 py-3">
                      <div className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">Status</div>
                      <div className="mt-1 text-sm font-bold text-[rgb(var(--text))]">
                        {String(selectedRow.status || selectedRow.reviewStatus || "SUBMITTED")}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rt-panel-subtle rounded-2xl p-6">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                  Manager Evaluation
                </div>
                <div className="mt-4 space-y-5">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-[rgb(var(--muted))]">Webknot Values (Employee Reference)</div>
                    <div className="mt-2 space-y-2">
                      {selectedRow.payload?.webknotValueRatings && typeof selectedRow.payload.webknotValueRatings === "object" && Object.keys(selectedRow.payload.webknotValueRatings).length ? (
                        Object.entries(selectedRow.payload.webknotValueRatings)
                          .sort(([a], [b]) => String(a).localeCompare(String(b), undefined, { numeric: true }))
                          .map(([id, rating]) => (
                            <div key={`emp-ref-${String(id || "")}`} className="flex items-center justify-between gap-4 text-[13px]">
                              <div className="text-[rgb(var(--muted))] truncate">{valueLabelIndex[String(id)] || String(id || "")}</div>
                              <div className="font-mono text-[rgb(var(--text))]">{rating != null ? Number(rating).toFixed(1) : "—"}</div>
                            </div>
                          ))
                      ) : Array.isArray(selectedRow.payload?.webknotValues) && selectedRow.payload.webknotValues.length ? (
                        selectedRow.payload.webknotValues.map((v) => (
                          <div key={`emp-ref-${String(v || "")}`} className="flex items-center justify-between gap-4 text-[13px]">
                            <div className="text-[rgb(var(--muted))] truncate">{valueLabelIndex[String(v)] || String(v || "")}</div>
                            <div className="font-mono text-[rgb(var(--text))]">—</div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-[rgb(var(--muted))]">No values provided by employee.</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-[rgb(var(--muted))]">KPI Ratings (Manager)</div>
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
                        <div className="text-sm text-[rgb(var(--muted))]">No KPIs.</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-[rgb(var(--muted))]">Webknot Value Ratings (Manager)</div>
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
                            const valueLabel = valueLabelIndex[String(id)] || id;
                            const selfComment = selectedValueComments?.[String(id)] || "";
                            return (
                              <div key={id} className="space-y-2 rounded-md border border-[rgb(var(--border))] p-3 bg-[rgb(var(--surface-1))]">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="text-sm text-[rgb(var(--text))] leading-tight">{String(valueLabel)}</div>
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
                                {selfComment ? (
                                  <div className="text-xs text-[rgb(var(--muted))] leading-snug">
                                    Self comment: <span className="text-[rgb(var(--text))]">{selfComment}</span>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })
                      ) : (
                        <div className="text-sm text-[rgb(var(--muted))]">No Webknot values.</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-[rgb(var(--muted))]">Manager Comments</div>
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
                          "rt-btn-primary rt-btn-sm transition-all",
                          aiEnhancingManagerNotes || !String(managerNotes || "").trim() || !aiAgent
                            ? "!bg-[rgb(var(--surface-2))] !text-[rgb(var(--muted))] !border-[rgb(var(--border))] cursor-not-allowed"
                            : "",
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
                      className="rt-btn-ghost transition-all"
                    >
                      Save draft
                    </button>
                    <button
                      type="button"
                      onClick={() => submitManagerReviewDecision("SUBMIT")}
                      disabled={savingReview}
                      className={[
                        "rt-btn-primary transition-all",
                        savingReview
                          ? "!bg-[rgb(var(--surface-2))] !text-[rgb(var(--muted))] !border-[rgb(var(--border))] cursor-not-allowed"
                          : "",
                      ].join(" ")}
                    >
                      {savingReview ? "Submitting…" : "Submit review"}
                    </button>
                  </div>
                  <div className="text-[10px] text-[rgb(var(--muted))]">
                    Validation: submit requires KPI/value ratings (1-5).
                  </div>
                  <div className="text-[11px] text-[rgb(var(--muted))]">
                    Manager ratings and comments are the scores forwarded to admins.
                  </div>
                </div>
              </div>
            </div>
        </ModalOverlay>
      ) : null}

      {/* ── Quick Reject Dialog ── */}
      {quickRejectModal.open && quickRejectModal.row ? (
        <ModalOverlay
          isOpen
          onClose={() => { setQuickRejectModal({ open: false, row: null }); setQuickRejectComment(""); }}
          title="Reject Submission"
          maxWidth="max-w-lg"
          zIndex={80}
        >
          <div className="p-6 space-y-5">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <XCircle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                  Rejecting submission from {quickRejectModal.row?.employee?.name || "employee"}
                </span>
              </div>
              <div className="text-xs text-amber-700 dark:text-amber-300">
                The employee will see your comments below and can update &amp; resubmit.
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                Manager Comments <span className="text-red-500">*</span>
              </label>
              <textarea
                value={quickRejectComment}
                onChange={(e) => setQuickRejectComment(e.target.value)}
                rows={4}
                className="w-full rt-input py-3 px-4 text-sm rounded-xl resize-none"
                placeholder="Provide feedback for the employee — what needs to be changed or improved (min 10 characters)..."
                autoFocus
              />
              <div className="flex items-center justify-between">
                <div className="text-[10px] text-[rgb(var(--muted))] flex items-center gap-1">
                  <Eye size={10} /> Visible to employee
                </div>
                <div className="text-[10px] text-[rgb(var(--muted))]">
                  {quickRejectComment.length} / 10 min
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => { setQuickRejectModal({ open: false, row: null }); setQuickRejectComment(""); }}
                className="rt-btn-ghost"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitQuickReject}
                disabled={quickRejectBusy || quickRejectComment.trim().length < 10}
                className={[
                  "rt-btn-danger transition-all",
                  quickRejectBusy || quickRejectComment.trim().length < 10
                    ? "opacity-50 cursor-not-allowed"
                    : "",
                ].join(" ")}
              >
                <XCircle size={14} />
                {quickRejectBusy ? "Rejecting…" : "Reject"}
              </button>
            </div>
          </div>
        </ModalOverlay>
      ) : null}

      <Toast toast={toast} onDismiss={() => setToast(null)} durationMs={2800} />
    </div>
    </>
  );
}
