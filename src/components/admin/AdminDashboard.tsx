// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAdminMonthlyOverview } from "../../hooks/queries";
import { fetchAdminAllSubmissions, fetchSubmissionCycles } from "../../api/monthly-submissions";
import { fetchAllocations, normalizeAllocations } from "../../api/allocations";
import { fetchAvailableProjects, normalizeProjects } from "../../api/projects";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  Shield,
  Search,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import ListPaginationBar from "../shared/ListPaginationBar";
import Toast from "../shared/Toast";
import { useClientPagination } from "../../hooks/useClientPagination";
import AdminPageHeader, { AdminPageShell } from "./AdminPageHeader";
import { ADMIN_TAB_COPY } from "../../config/portalNavigation";

import {
  buildCycleMeta,
  collectCycleKeysFromUnknown,
  collectRatedCycleCounts,
  currentReviewCycleKey,
  formatCycleKeyLabel,
  getCycleSlotLabel,
  normalizeCycleKey,
  normalizeYearMonth,
  resolveSubmissionCycleKey,
} from "../../utils/reviewCycles";
import { toUserFacingMessage, userFacingMessageForStatus } from "../../utils/userFacingError";
import { normalizeMonthlySubmission } from "../../api/monthly-submissions";
import { resolveRoleStatsBucket } from "../../api/employees";
import {
  computeEmployeePerformanceScore,
  computeEmployeeBrowniePoints,
} from "../../utils/employeePerformanceScore";
import { computeSubmissionWindowOpen } from "../../utils/submissionWindow";

/* ───── helpers ───── */

function parseLocalInputValue(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function clampAbility(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(5, Math.max(1, n));
}

function classifyBellCurve(avg) {
  if (avg >= 4.2) return { label: "Top", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20" };
  if (avg >= 3.3) return { label: "Core", className: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20" };
  return { label: "Low", className: "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20" };
}

function formatDelta(delta) {
  const value = Math.round((delta || 0) * 10) / 10;
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

function getDepartmentLabel(emp) {
  return String(emp?.stream || emp?.designation || emp?.role || "Unassigned").trim() || "Unassigned";
}

function isSubmittedStatus(status) {
  const s = String(status || "").trim().toUpperCase();
  return s === "SUBMITTED" || s === "APPROVED" || s === "COMPLETED" || s === "FINAL" || s === "REVIEWED";
}

function formatPresentMonth(value) {
  const normalized = normalizeYearMonth(value);
  if (!normalized) return "—";
  const [yText, mText] = normalized.split("-");
  const y = Number(yText);
  const m = Number(mText);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return normalized;
  try {
    return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
  } catch {
    return normalized;
  }
}

function extractSubmissionEmployeeId(raw, submission) {
  const obj = raw && typeof raw === "object" ? raw : {};
  const payload =
    obj.payload && typeof obj.payload === "object"
      ? obj.payload
      : submission?.raw?.payload && typeof submission.raw.payload === "object"
        ? submission.raw.payload
        : {};
  const employee = obj.employee || obj.user || obj.emp || payload?.employee || null;
  return String(
    employee?.employeeId ??
      employee?.empId ??
      employee?.id ??
      obj.employeeId ??
      obj.empId ??
      obj.userId ??
      payload?.employeeId ??
      payload?.subjectEmployeeId ??
      submission?.subjectEmployeeId ??
      "",
  ).trim();
}

function submissionCountsAsSubmitted(raw, submission) {
  if (!submission) return false;
  const status = String(submission.status ?? submission.reviewStatus ?? "").trim();
  if (isSubmittedStatus(status)) return true;
  if (submission.submittedAt) return true;
  const payload = submission.raw?.payload && typeof submission.raw.payload === "object" ? submission.raw.payload : raw?.payload;
  if (payload && typeof payload === "object") {
    const kpi = payload.kpiRatings ?? submission.kpiRatings;
    const values = payload.webknotValueRatings ?? submission.webknotValueRatings;
    if (kpi && typeof kpi === "object" && Object.keys(kpi).length > 0) return true;
    if (values && typeof values === "object" && Object.keys(values).length > 0) return true;
  }
  return false;
}

function isPortalWindowOpen(windowData, at = new Date()) {
  return computeSubmissionWindowOpen(windowData, at);
}

function buildBreakdownRows({ employees, ability6m, keySelector, scoreGetter }) {
  const list = Array.isArray(employees) ? employees : [];
  const trend = Array.isArray(ability6m) ? ability6m : [];
  if (!list.length) return [];

  const hasTrend = trend.length >= 2;
  const firstBase = hasTrend ? Number(trend[0]?.avg) || 0 : 0;
  const latestBase = hasTrend ? Number(trend[trend.length - 1]?.avg) || 0 : 0;

  const grouped = new Map();
  for (const emp of list) {
    const key = String(keySelector(emp) || "Unassigned").trim() || "Unassigned";
    const prev = grouped.get(key) || { total: 0, submitted: 0 };
    prev.total += 1;
    if (emp?.submitted) prev.submitted += 1;
    grouped.set(key, prev);
  }

  const keyFor = (emp) => String(keySelector(emp) || "Unassigned").trim() || "Unassigned";

  return Array.from(grouped.entries())
    .map(([group, s]) => {
      const submissionRate = s.total > 0 ? s.submitted / s.total : 0;
      let latestAvg;
      let firstAvg;
      let delta;

      if (hasTrend) {
        const sizeFactor = Math.min(0.25, s.total * 0.02);
        const modifier = (submissionRate - 0.5) * 0.9 + sizeFactor - 0.1;
        latestAvg = Math.round(clampAbility(latestBase + modifier) * 10) / 10;
        firstAvg = Math.round(clampAbility(firstBase + modifier - 0.2) * 10) / 10;
        delta = Math.round((latestAvg - firstAvg) * 10) / 10;
      } else {
        const inGroup = list.filter((e) => keyFor(e) === group);
        const scores = inGroup
          .map((e) => (typeof scoreGetter === "function" ? scoreGetter(e) : null))
          .filter((n) => Number.isFinite(n) && n >= 1);
        latestAvg = scores.length
          ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
          : 0;
        firstAvg = latestAvg;
        delta = 0;
      }

      const bell = classifyBellCurve(latestAvg);
      const needsIntervention =
        latestAvg < 3.4 || (hasTrend && delta < -0.2) || submissionRate < 0.5;
      return { group, latestAvg, delta, bell, submissionRate, headcount: s.total, needsIntervention };
    })
    .sort((a, b) => (a.needsIntervention !== b.needsIntervention ? (a.needsIntervention ? -1 : 1) : a.latestAvg - b.latestAvg));
}

/* ───── sub-components ───── */

function getChartTooltipStyle() {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const resolve = (name) => {
    const raw = style.getPropertyValue(name).trim();
    return raw ? `rgb(${raw})` : undefined;
  };
  return {
    backgroundColor: resolve("--surface") || "#141824",
    border: `1px solid ${resolve("--border") || "#28293e"}`,
    borderRadius: "0.5rem",
    color: resolve("--text") || "#edeef3",
    fontSize: "0.75rem",
    boxShadow: "0 4px 12px rgb(0 0 0 / 0.2)",
    padding: "8px 12px",
  };
}

function useChartTooltipStyle() {
  const isDark = document.documentElement.classList.contains("dark");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getChartTooltipStyle(), [isDark]);
}

function SectionHeader({ icon: Icon, iconClassName, title, subtitle, compact = false, className = "" }) {
  const iconNode = Icon ? React.createElement(Icon, { size: 16 }) : null;
  return (
    <div className={`pulse-section-head ${compact ? "!mb-2" : ""} ${className}`.trim()}>
      <div className={`pulse-section-icon ${iconClassName}`}>{iconNode}</div>
      <div>
        <h3 className="pulse-section-title">{title}</h3>
        <p className="pulse-section-subtitle">{subtitle}</p>
      </div>
    </div>
  );
}

function formatWindowLabel(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return "No schedule configured";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return value;
  }
}

function DashMetric({ label, value, hint, icon: Icon, accent = "blue" }) {
  const accents = {
    blue: "text-blue-600 dark:text-blue-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    rose: "text-rose-600 dark:text-rose-400",
  };
  const iconNode = Icon ? React.createElement(Icon, { size: 18, className: accents[accent] || accents.blue }) : null;
  return (
    <div className="pulse-metric">
      <div className="flex items-start justify-between gap-3">
        <div className="pulse-metric-label">{label}</div>
        {iconNode}
      </div>
      <div className="pulse-metric-value">{value}</div>
      {hint ? <div className="pulse-metric-hint">{hint}</div> : null}
    </div>
  );
}

function MiniProgressBar({ value, max = 100, color = "bg-blue-500" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-[rgb(var(--surface-3))] overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ProjectRatingsTooltip({ active, payload, tooltipStyle }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const members = Array.isArray(row.members) ? row.members : [];
  return (
    <div style={tooltipStyle}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{row.project}</div>
      <div style={{ marginBottom: 8 }}>
        Average rating: <strong>{Number(row.avgRating || 0).toFixed(1)}</strong>
        {row.memberCount ? ` · ${row.memberCount} member${row.memberCount === 1 ? "" : "s"}` : ""}
      </div>
      {members.length ? (
        <div style={{ display: "grid", gap: 4 }}>
          {members.map((member) => (
            <div key={member.id} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span>{member.name}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {member.score != null ? Number(member.score).toFixed(1) : "—"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div>No scored members on this project yet.</div>
      )}
    </div>
  );
}

/* ───── main component ───── */

export default function AdminDashboard({
  portalWindow,
  employees = [],
  totalEmployeesCount = null,
  directoryTotals = null,
  ability6m = [],
  submissionSummary = null,
  submissionCycleMap = {},
  submissionExtrasByEmployee = {},
}) {
  // AdminControlCenter currently only wires `employees`, `employeesLoading`
  // and `portalWindow`. The remaining props arrive as `undefined`, which
  // crashed the dashboard at `ability6m.length` (and a few similar spots).
  // The destructure defaults above guard the happy path; the lines below are
  // additional belt-and-suspenders for callers that pass `null` explicitly.
  const safeEmployees = useMemo(
    () => (Array.isArray(employees) ? employees : []),
    [employees],
  );
  const safeAbility6mProp = useMemo(
    () => (Array.isArray(ability6m) ? ability6m : []),
    [ability6m],
  );
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const [selectedCycleKey, setSelectedCycleKey] = useState("");
  const [serverCycleKeys, setServerCycleKeys] = useState([]);
  const [allSubmissions, setAllSubmissions] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [projectIndex, setProjectIndex] = useState({});
  const [cyclesLoading, setCyclesLoading] = useState(true);
  const [submissionTab, setSubmissionTab] = useState("submitted");
  const [submissionRosterSearch, setSubmissionRosterSearch] = useState("");
  const [rosterDepartmentFilter, setRosterDepartmentFilter] = useState("all");
  const [rosterBandFilter, setRosterBandFilter] = useState("all");
  const [projectChartSearch, setProjectChartSearch] = useState("");
  const [projectMinMembers, setProjectMinMembers] = useState("1");

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setCyclesLoading(true);
    Promise.all([
      fetchSubmissionCycles({ signal: controller.signal }).catch(() => []),
      fetchAdminAllSubmissions({ signal: controller.signal }).catch(() => []),
      fetchAllocations({ signal: controller.signal }).catch(() => []),
      fetchAvailableProjects({ signal: controller.signal }).catch(() => []),
    ])
      .then(([cyclesData, submissions, allocationRaw, projectsRaw]) => {
        if (!alive) return;
        setServerCycleKeys([...collectCycleKeysFromUnknown(cyclesData)]);
        setAllSubmissions(Array.isArray(submissions) ? submissions : []);
        setAllocations(normalizeAllocations(allocationRaw));
        const index = {};
        for (const project of normalizeProjects(projectsRaw)) {
          const id = String(project?.id ?? "").trim();
          if (!id) continue;
          index[id] = String(project?.name ?? project?.projectName ?? id);
        }
        setProjectIndex(index);
      })
      .finally(() => {
        if (alive) setCyclesLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  const currentSubmissionMonth = normalizeYearMonth(new Date());
  const activeCycleKey =
    normalizeCycleKey(selectedCycleKey) || currentReviewCycleKey();

  const ratedCycleCounts = useMemo(
    () => collectRatedCycleCounts(allSubmissions),
    [allSubmissions],
  );

  const cycleOptions = useMemo(() => {
    const keys = new Set();
    const currentKey = currentReviewCycleKey();
    if (currentKey) keys.add(currentKey);

    for (const [key] of ratedCycleCounts.entries()) {
      if (key) keys.add(key);
    }

    for (const [rawKey, entry] of Object.entries(submissionCycleMap || {})) {
      const submittedCount = Array.isArray(entry?.submittedIds)
        ? entry.submittedIds.length
        : Number(entry?.submitted) || 0;
      if (submittedCount <= 0) continue;
      const normalized = normalizeCycleKey(rawKey);
      if (normalized) keys.add(normalized);
    }

    for (const key of serverCycleKeys) {
      const normalized = normalizeCycleKey(key);
      if (normalized) keys.add(normalized);
    }

    return [...keys]
      .sort((a, b) => b.localeCompare(a))
      .map((key) => {
        const ratingCount = ratedCycleCounts.get(key) || 0;
        const suffix = ratingCount > 0 ? ` · ${ratingCount} rated` : "";
        return {
          key,
          label: `${formatCycleKeyLabel(key)}${suffix}`,
          ratingCount,
        };
      });
  }, [ratedCycleCounts, submissionCycleMap, serverCycleKeys]);

  const overviewQuery = useAdminMonthlyOverview({
    month: currentSubmissionMonth,
    cycleKey: activeCycleKey,
  });
  const monthlyOverview = overviewQuery.data ?? null;

  const CHART_TOOLTIP_STYLE = useChartTooltipStyle();

  function showToast(nextToast) {
    setToast(nextToast);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 6000);
  }

  useEffect(() => {
    if (!overviewQuery.error) return;
    const err = overviewQuery.error as Error & { status?: number };
    console.error("Failed to load monthly overview", err);
    showToast({
      title: "Couldn't load overview",
      message: toUserFacingMessage(
        err?.message,
        userFacingMessageForStatus(err?.status, "Please try again in a moment."),
      ),
      tone: "error",
      ts: Date.now(),
    });
  }, [overviewQuery.error]);


  useEffect(() => {
    if (cyclesLoading) return;
    const validKeys = new Set(cycleOptions.map((c) => c.key));
    if (selectedCycleKey && validKeys.has(selectedCycleKey)) return;

    const currentKey = currentReviewCycleKey();
    const nextKey = validKeys.has(currentKey)
      ? currentKey
      : cycleOptions[0]?.key || "";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedCycleKey(nextKey);
  }, [cycleOptions, cyclesLoading, selectedCycleKey]);

  const cycleHeroLabel = useMemo(() => {
    const key =
      normalizeCycleKey(monthlyOverview?.cycleKey) ||
      activeCycleKey ||
      currentReviewCycleKey();
    return key ? formatCycleKeyLabel(key) : "Current review cycle";
  }, [monthlyOverview?.cycleKey, activeCycleKey]);

  const cycleHeroKey = useMemo(() => {
    return (
      normalizeCycleKey(monthlyOverview?.cycleKey) ||
      activeCycleKey ||
      currentReviewCycleKey() ||
      "—"
    );
  }, [monthlyOverview?.cycleKey, activeCycleKey]);

  const presentMonthLabel = useMemo(() => {
    const month =
      normalizeYearMonth(monthlyOverview?.month) ||
      currentSubmissionMonth ||
      buildCycleMeta(new Date()).month;
    return formatPresentMonth(month);
  }, [monthlyOverview?.month, currentSubmissionMonth]);

  const activeCycleSubmittedIds = useMemo(() => {
    const targetCycle = normalizeCycleKey(activeCycleKey) || currentReviewCycleKey();
    const ids = new Set();
    for (const raw of allSubmissions) {
      const submission = normalizeMonthlySubmission(raw);
      if (!submission) continue;
      const itemCycle =
        normalizeCycleKey(submission.cycleKey) ||
        resolveSubmissionCycleKey({ month: submission.month, cycleKey: submission.cycleKey });
      if (targetCycle && itemCycle && itemCycle !== targetCycle) continue;
      if (!submissionCountsAsSubmitted(raw, submission)) continue;
      const empId = extractSubmissionEmployeeId(raw, submission);
      if (empId) ids.add(empId.toLowerCase());
    }
    return ids;
  }, [allSubmissions, activeCycleKey]);

  /* ───── data computations ───── */

  const normalizedEmployees = useMemo(() => {
    const currentMonthKey = normalizeYearMonth(new Date());
    const summaryMatches = submissionSummary?.monthKey === currentMonthKey;
    const cycleEntry =
      selectedCycleKey
        ? submissionCycleMap?.[selectedCycleKey] ??
          submissionCycleMap?.[normalizeCycleKey(selectedCycleKey) ?? ""]
        : null;
    const cycleSubmittedIds = cycleEntry && Array.isArray(cycleEntry.submittedIds)
      ? new Set(cycleEntry.submittedIds.map(String))
      : null;
    const submittedIds = cycleSubmittedIds
      ? cycleSubmittedIds
      : summaryMatches && Array.isArray(submissionSummary?.submittedIds)
        ? new Set(submissionSummary.submittedIds.map(String))
        : activeCycleSubmittedIds.size
          ? activeCycleSubmittedIds
          : new Set();
    return safeEmployees.map((e) => {
      const bucket = resolveRoleStatsBucket(e);
      return {
        ...e,
        submitted:
          submittedIds.has(String(e.id).trim().toLowerCase()) ||
          submittedIds.has(String(e.id).trim()) ||
          Boolean(e.submitted),
        _roleKey: bucket,
        _isManager: bucket === "manager",
        _isEmployee: bucket === "employee",
        _isAdmin: bucket === "admin",
      };
    });
  }, [safeEmployees, selectedCycleKey, submissionCycleMap, submissionSummary, activeCycleSubmittedIds]);

  const dashboardFilterOptions = useMemo(() => {
    const departments = new Set();
    const bands = new Set();
    for (const emp of normalizedEmployees) {
      const dept = getDepartmentLabel(emp);
      if (dept && dept !== "Unassigned") departments.add(dept);
      const band = String(emp?.band || "").trim();
      if (band) bands.add(band);
    }
    return {
      departments: [...departments].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
      bands: [...bands].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })),
    };
  }, [normalizedEmployees]);

  // Org-wide metrics/charts use the full directory for the selected cycle.
  // Card-scoped filters (roster / project chart) apply only inside those cards.
  const filteredEmployees = normalizedEmployees;
  const filtersActive = false;

  const stats = useMemo(() => {
    const useDirectoryTotals = !filtersActive;
    const directoryEmployeeCount = useDirectoryTotals && Number.isFinite(directoryTotals?.employeeCount) ? directoryTotals.employeeCount : null;
    const directoryManagerCount = useDirectoryTotals && Number.isFinite(directoryTotals?.managerCount) ? directoryTotals.managerCount : null;
    const directoryAdminCount = useDirectoryTotals && Number.isFinite(directoryTotals?.adminCount) ? directoryTotals.adminCount : null;
    const employeesOnly = filteredEmployees.filter((e) => e._isEmployee);
    const managersOnly = filteredEmployees.filter((e) => e._isManager);
    const adminsOnly = filteredEmployees.filter((e) => e._isAdmin);

    let totalHeadcount = useDirectoryTotals && Number.isFinite(totalEmployeesCount) ? totalEmployeesCount : null;
    if (!Number.isFinite(totalHeadcount)) {
      const summed = [directoryEmployeeCount, directoryManagerCount, directoryAdminCount].filter(Number.isFinite).reduce((s, n) => s + n, 0);
      totalHeadcount = summed > 0 ? summed : null;
    }
    if (!Number.isFinite(totalHeadcount)) totalHeadcount = filteredEmployees.length;

    const employeeHeadcount = Number.isFinite(directoryEmployeeCount) ? directoryEmployeeCount : employeesOnly.length;
    const totalManagers = Number.isFinite(directoryManagerCount) ? directoryManagerCount : managersOnly.length;
    const totalAdmins = Number.isFinite(directoryAdminCount) ? directoryAdminCount : adminsOnly.length;

    const employeesSubmitted = employeesOnly.filter((e) => e.submitted).length;
    const managersSubmitted = managersOnly.filter((e) => e.submitted).length;

    const avg6m = safeAbility6mProp.length
      ? Math.round((safeAbility6mProp.reduce((s, p) => s + (Number(p?.avg) || 0), 0) / safeAbility6mProp.length) * 10) / 10
      : 0;

    const latestAbility = safeAbility6mProp.length ? Number(safeAbility6mProp[safeAbility6mProp.length - 1]?.avg) || 0 : 0;
    const prevAbility = safeAbility6mProp.length >= 2 ? Number(safeAbility6mProp[safeAbility6mProp.length - 2]?.avg) || 0 : 0;
    const abilityDelta = latestAbility && prevAbility ? Math.round((latestAbility - prevAbility) * 10) / 10 : null;

    return {
      totalHeadcount,
      employeeHeadcount,
      employeesSubmitted,
      totalManagers,
      managersSubmitted,
      totalAdmins,
      avg6m,
      latestAbility: Math.round(latestAbility * 10) / 10,
      abilityDelta,
      employeeSubmissionRate: employeeHeadcount ? Math.round((employeesSubmitted / employeeHeadcount) * 100) : 0,
      managerSubmissionRate: totalManagers ? Math.round((managersSubmitted / totalManagers) * 100) : 0,
      overallSubmissionRate: totalHeadcount ? Math.round(((employeesSubmitted + managersSubmitted) / totalHeadcount) * 100) : 0,
    };
  }, [safeAbility6mProp, directoryTotals, filteredEmployees, totalEmployeesCount, filtersActive]);

  const enrichedEmployees = useMemo(() => {
    return filteredEmployees.map((emp) => {
      const submissionExtras = submissionExtrasByEmployee?.[String(emp?.id)] || null;
      const recognitions = Number(submissionExtras?.recognitions ?? emp?.recognitions ?? emp?.recognitionsCount ?? 0) || 0;
      const certifications = Array.isArray(submissionExtras?.certifications)
        ? submissionExtras.certifications
        : Array.isArray(emp?.certifications) ? emp.certifications : [];
      const managerKpiRatings = submissionExtras?.managerKpiRatings ?? null;
      const managerWebknotValueRatings = submissionExtras?.managerWebknotValueRatings ?? null;
      const techShowcase = String(submissionExtras?.techShowcase ?? "").trim();
      const merged = {
        ...emp,
        recognitions, certifications,
        managerKpiRatings, managerWebknotValueRatings, techShowcase,
        abilityScoreFromRatings: submissionExtras?.abilityScore ?? null,
      };
      const certCount = certifications.length;
      return {
        ...merged,
        certCount,
        performanceScore: computeEmployeePerformanceScore(merged),
        browniePoints: computeEmployeeBrowniePoints({ ...merged, certCount }),
      };
    });
  }, [filteredEmployees, submissionExtrasByEmployee]);

  const departmentBreakdown = useMemo(
    () =>
      buildBreakdownRows({
        employees: filteredEmployees,
        ability6m: safeAbility6mProp,
        keySelector: getDepartmentLabel,
        scoreGetter: computeEmployeePerformanceScore,
      }),
    [filteredEmployees, safeAbility6mProp],
  );

  const roleThroughputData = useMemo(() => {
    return [
      { label: "Employee", test: (emp) => emp._isEmployee },
      { label: "Manager", test: (emp) => emp._isManager },
      { label: "Admin", test: (emp) => emp._isAdmin },
    ]
      .map(({ label, test }) => {
        const subset = filteredEmployees.filter(test);
        const sub = subset.filter((e) => e.submitted).length;
        return { role: label, submitted: sub, pending: Math.max(0, subset.length - sub) };
      })
      .filter((r) => r.submitted > 0 || r.pending > 0);
  }, [filteredEmployees]);

  const bandDistributionData = useMemo(() => {
    const groups = new Map();
    for (const emp of filteredEmployees) {
      const band = String(emp?.band || "Unassigned").trim() || "Unassigned";
      const prev = groups.get(band) || { total: 0, submitted: 0 };
      prev.total += 1;
      if (emp?.submitted) prev.submitted += 1;
      groups.set(band, prev);
    }
    const rows = Array.from(groups.entries())
      .map(([band, s]) => ({ band, total: s.total, submittedCount: s.submitted, submittedRate: s.total ? Math.round((s.submitted / s.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total);
    if (rows.length <= 8) return rows;
    const top = rows.slice(0, 7);
    const rest = rows.slice(7);
    const restTotal = rest.reduce((s, r) => s + r.total, 0);
    const restSubmitted = rest.reduce((s, r) => s + r.submittedCount, 0);
    return [...top, { band: "Other", total: restTotal, submittedCount: restSubmitted, submittedRate: restTotal ? Math.round((restSubmitted / restTotal) * 100) : 0 }];
  }, [filteredEmployees]);

  const cycleHealthPieData = useMemo(() => {
    return [
      { name: "Employees Done", value: Math.max(0, stats.employeesSubmitted), color: "#2563eb" },
      { name: "Employees Pending", value: Math.max(0, stats.employeeHeadcount - stats.employeesSubmitted), color: "#f59e0b" },
      { name: "Managers Done", value: Math.max(0, stats.managersSubmitted), color: "#059669" },
      { name: "Managers Pending", value: Math.max(0, stats.totalManagers - stats.managersSubmitted), color: "#f43f5e" },
    ].filter((row) => row.value > 0);
  }, [stats]);

  const departmentPerformanceData = useMemo(() => {
    const groups = new Map();
    for (const emp of enrichedEmployees) {
      const dept = getDepartmentLabel(emp);
      const prev = groups.get(dept) || { total: 0, submitted: 0, scoreSum: 0 };
      prev.total += 1;
      prev.scoreSum += Number(emp?.performanceScore || 0);
      if (emp?.submitted) prev.submitted += 1;
      groups.set(dept, prev);
    }
    return Array.from(groups.entries())
      .map(([department, s]) => ({
        department,
        headcount: s.total,
        submissionRate: s.total ? Math.round((s.submitted / s.total) * 100) : 0,
        avgScore: s.total ? Math.round((s.scoreSum / s.total) * 10) / 10 : 0,
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 10);
  }, [enrichedEmployees]);

  const bandPerformanceData = useMemo(() => {
    const groups = new Map();
    for (const emp of enrichedEmployees) {
      const band = String(emp?.band || "Unassigned").trim() || "Unassigned";
      const prev = groups.get(band) || { total: 0, submitted: 0, scoreSum: 0 };
      prev.total += 1;
      prev.scoreSum += Number(emp?.performanceScore || 0);
      if (emp?.submitted) prev.submitted += 1;
      groups.set(band, prev);
    }
    return Array.from(groups.entries())
      .map(([band, s]) => ({
        band,
        headcount: s.total,
        submissionRate: s.total ? Math.round((s.submitted / s.total) * 100) : 0,
        avgScore: s.total ? Math.round((s.scoreSum / s.total) * 10) / 10 : 0,
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 10);
  }, [enrichedEmployees]);

  const managerOwnershipData = useMemo(() => {
    const managerNameById = new Map(
      enrichedEmployees
        .filter((emp) => emp._isManager)
        .map((mgr) => [String(mgr?.id || "").trim(), String(mgr?.name || mgr?.email || "Unknown").trim()]),
    );
    const grouped = new Map();
    for (const emp of enrichedEmployees) {
      if (emp._isAdmin || emp._isManager) continue;
      const managerKey = String(emp?.managerId || emp?.managerName || "Unmapped").trim() || "Unmapped";
      const prev = grouped.get(managerKey) || { teamSize: 0, submitted: 0, scoreSum: 0, managerId: managerKey };
      prev.teamSize += 1;
      prev.scoreSum += Number(emp?.performanceScore || 0);
      if (emp?.submitted) prev.submitted += 1;
      grouped.set(managerKey, prev);
    }
    return Array.from(grouped.entries())
      .map(([key, row]) => ({
        managerId: row.managerId,
        managerName: managerNameById.get(row.managerId) || managerNameById.get(key) || key,
        teamSize: row.teamSize,
        submitted: row.submitted,
        pending: Math.max(0, row.teamSize - row.submitted),
        avgScore: row.teamSize ? Math.round((row.scoreSum / row.teamSize) * 10) / 10 : 0,
      }))
      .sort((a, b) => b.teamSize - a.teamSize || b.avgScore - a.avgScore)
      .slice(0, 8);
  }, [enrichedEmployees]);

  const topPerformers = useMemo(() => {
    return enrichedEmployees
      .filter((emp) => !emp._isAdmin)
      .sort((a, b) => (b.performanceScore || 0) - (a.performanceScore || 0) || (b.recognitions || 0) - (a.recognitions || 0))
      .slice(0, 6);
  }, [enrichedEmployees]);

  const projectRatingsData = useMemo(() => {
    const employeeByKey = new Map();
    for (const emp of enrichedEmployees) {
      for (const key of [emp?.id, emp?.empId, emp?.userId, emp?.email]) {
        const text = String(key ?? "").trim();
        if (!text) continue;
        employeeByKey.set(text.toLowerCase(), emp);
        if (text.includes("@")) employeeByKey.set(`email:${text.toLowerCase()}`, emp);
      }
    }

    const grouped = new Map();
    for (const alloc of allocations) {
      const projectKey = String(alloc?.projectId ?? alloc?.projectName ?? "").trim();
      if (!projectKey) continue;
      const projectLabel =
        projectIndex[projectKey] ||
        String(alloc?.projectName ?? "").trim() ||
        projectKey;
      const employeeKey = String(alloc?.employeeId ?? "").trim().toLowerCase();
      const emp =
        employeeByKey.get(employeeKey) ||
        employeeByKey.get(String(alloc?.employeeName ?? "").trim().toLowerCase()) ||
        null;
      // When workforce filters are active, only include allocations for people in scope.
      if (filtersActive && !emp) continue;
      const member = {
        id: String(emp?.id ?? alloc?.employeeId ?? alloc?.id ?? projectKey).trim(),
        name: String(emp?.name ?? alloc?.employeeName ?? alloc?.employeeId ?? "Unknown").trim(),
        score: Number.isFinite(Number(emp?.performanceScore)) ? Number(emp.performanceScore) : null,
      };
      const prev = grouped.get(projectKey) || {
        project: projectLabel,
        members: [],
        memberIds: new Set(),
      };
      if (!prev.memberIds.has(member.id)) {
        prev.members.push(member);
        prev.memberIds.add(member.id);
      }
      grouped.set(projectKey, prev);
    }

    const q = projectChartSearch.trim().toLowerCase();
    const minMembers = Math.max(1, Number.parseInt(String(projectMinMembers), 10) || 1);

    return Array.from(grouped.values())
      .map((row) => {
        const scored = row.members.filter((member) => member.score != null);
        const avgRating = scored.length
          ? Math.round((scored.reduce((sum, member) => sum + member.score, 0) / scored.length) * 10) / 10
          : 0;
        return {
          project: row.project,
          avgRating,
          memberCount: row.members.length,
          members: row.members.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
        };
      })
      .filter((row) => row.memberCount >= minMembers)
      .filter((row) => {
        if (!q) return true;
        if (row.project.toLowerCase().includes(q)) return true;
        return row.members.some((member) => String(member.name || "").toLowerCase().includes(q));
      })
      .sort((a, b) => b.avgRating - a.avgRating || b.memberCount - a.memberCount)
      .slice(0, 12);
  }, [allocations, enrichedEmployees, projectIndex, filtersActive, projectChartSearch, projectMinMembers]);

  const departmentGranularityRows = useMemo(() => {
    const managersById = new Map(enrichedEmployees.map((emp) => [String(emp?.id || "").trim(), emp]));
    const managerNameById = new Map();
    for (const emp of enrichedEmployees) {
      const mId = String(emp?.managerId || "").trim();
      const mName = String(emp?.managerName || emp?.reportingManagerName || "").trim();
      if (mId && mName) managerNameById.set(mId, mName);
    }
    const grouped = new Map();
    for (const emp of enrichedEmployees) {
      const dept = getDepartmentLabel(emp);
      const prev = grouped.get(dept) || { employees: [], managerIds: new Set(), scoreSum: 0 };
      prev.employees.push(emp);
      prev.scoreSum += Number(emp?.performanceScore || 0);
      if (emp?.managerId) prev.managerIds.add(String(emp.managerId).trim());
      grouped.set(dept, prev);
    }
    return Array.from(grouped.entries())
      .map(([department, row]) => {
        const hc = row.employees.length;
        const managerIds = Array.from(row.managerIds).filter(Boolean);
        const submitted = row.employees.filter((e) => e.submitted).length;
        const topEmp = row.employees.slice().sort((a, b) => (b.performanceScore || 0) - (a.performanceScore || 0))[0];
        const topMgr = managerIds.map((id) => managersById.get(id)).filter(Boolean).sort((a, b) => (b.performanceScore || 0) - (a.performanceScore || 0))[0];
        return {
          department,
          headcount: hc,
          managerCount: managerIds.length,
          submissionRate: hc ? Math.round((submitted / hc) * 100) : 0,
          avgScore: hc ? Math.round((row.scoreSum / hc) * 10) / 10 : 0,
          topEmployeeName: topEmp?.name || "—",
          topManagerName: topMgr?.name || managerNameById.get(managerIds[0]) || "—",
        };
      })
      .sort((a, b) => b.avgScore - a.avgScore);
  }, [enrichedEmployees]);

  const orgHealthRadarData = useMemo(() => {
    const base = [];
    const deptRows = departmentBreakdown.filter((d) => d.group && d.group !== "Unassigned");
    if (deptRows.length > 0) {
      for (const d of deptRows.slice(0, 8)) {
        const employees = Number.isFinite(d.headcount) ? d.headcount : 0;
        base.push({ metric: d.group, employees });
      }
    } else {
      base.push({ metric: "No Departments", employees: 0 });
    }
    const maxVal = Math.max(...base.map((d) => d.employees), 1);
    return base.map((d) => ({ ...d, fullMark: maxVal }));
  }, [departmentBreakdown]);

  const hasRadarData = useMemo(
    () => orgHealthRadarData.some((d) => Number.isFinite(d.employees)),
    [orgHealthRadarData]
  );

  const safeAbility6m = useMemo(
    () => safeAbility6mProp.map((row) => ({
      month: String(row?.month ?? ""),
      avg: Number.isFinite(Number(row?.avg)) ? Number(row.avg) : 0,
    })),
    [safeAbility6mProp],
  );

  const cycleComparisonData = useMemo(() => {
    const entries = Object.entries(submissionCycleMap || {}).sort(([a], [b]) => a.localeCompare(b));
    const mapped = entries
      .slice(-6)
      .map(([key, entry]) => {
        const totalRaw = entry?.totalEligible ?? entry?.total ?? safeEmployees.length ?? 0;
        const total = Number.isFinite(Number(totalRaw)) ? Number(totalRaw) : 0;
        const submittedRaw = Array.isArray(entry?.submittedIds)
          ? entry.submittedIds.length
          : Number.isFinite(Number(entry?.submitted))
            ? Number(entry.submitted)
            : 0;
        const submitted = Number.isFinite(submittedRaw) ? submittedRaw : 0;
        const pending = Math.max(0, total - submitted);
        const rate =
          total > 0 && Number.isFinite(total)
            ? Math.max(0, Math.min(100, Math.round((submitted / total) * 100)))
            : 0;
        const normalizedKey = normalizeCycleKey(key) || key;
        return {
          cycle: normalizedKey ? getCycleSlotLabel(normalizedKey) : "—",
          submitted,
          pending,
          rate,
        };
      })
      .filter((row) => Number.isFinite(row.submitted) && Number.isFinite(row.pending) && Number.isFinite(row.rate));

    if (mapped.length > 0) return mapped;

    const total = stats.employeeHeadcount + stats.totalManagers;
    const submitted = stats.employeesSubmitted + stats.managersSubmitted;
    if (!total) return [];
    return [
      {
        cycle: activeCycleKey ? getCycleSlotLabel(activeCycleKey) : getCycleSlotLabel(currentReviewCycleKey()),
        submitted,
        pending: Math.max(0, total - submitted),
        rate: Math.max(0, Math.min(100, Math.round((submitted / total) * 100))),
      },
    ];
  }, [submissionCycleMap, safeEmployees, stats, activeCycleKey]);

  /* ── performance distribution (histogram) ── */
  const performanceDistribution = useMemo(() => {
    const buckets = [
      { range: "1.0–2.0", min: 1, max: 2, count: 0, color: "#ef4444" },
      { range: "2.0–3.0", min: 2, max: 3, count: 0, color: "#f59e0b" },
      { range: "3.0–3.5", min: 3, max: 3.5, count: 0, color: "#3b82f6" },
      { range: "3.5–4.0", min: 3.5, max: 4, count: 0, color: "#3b82f6" },
      { range: "4.0–4.5", min: 4, max: 4.5, count: 0, color: "#60a5fa" },
      { range: "4.5–5.0", min: 4.5, max: 5.01, count: 0, color: "#10b981" },
    ];
    let maxCount = 0;
    for (const emp of enrichedEmployees) {
      const score = emp.performanceScore;
      if (!Number.isFinite(score) || score < 1) continue;
      for (const b of buckets) {
        if (score >= b.min && score < b.max) { b.count += 1; break; }
      }
    }
    for (const b of buckets) if (b.count > maxCount) maxCount = b.count;
    return { buckets, maxCount };
  }, [enrichedEmployees]);

  /* ── submission pipeline funnel ── */
  const submissionFunnel = useMemo(() => {
    const totalEligible = stats.employeeHeadcount + stats.totalManagers;
    const submitted = stats.employeesSubmitted + stats.managersSubmitted;
    const inDraft = Math.max(0, totalEligible - submitted);
    // count how many have been manager-reviewed and admin-reviewed
    let managerReviewed = 0;
    let adminApproved = 0;
    for (const emp of enrichedEmployees) {
      if (emp._isAdmin) continue;
      const extras = submissionExtrasByEmployee?.[String(emp?.id)] || null;
      const mStatus = extras?.managerReviewStatus || emp?.managerReviewStatus || "";
      const aStatus = extras?.adminReviewStatus || emp?.adminReviewStatus || emp?.reviewStatus || "";
      if (mStatus === "APPROVED" || mStatus === "approved" || mStatus === "REVIEWED") managerReviewed++;
      if (aStatus === "APPROVED" || aStatus === "approved") adminApproved++;
    }
    return [
      { label: "Total Eligible", count: totalEligible, color: "#3b82f6" },
      { label: "In Draft", count: inDraft, color: "#60a5fa" },
      { label: "Submitted", count: submitted, color: "#3b82f6" },
      { label: "Manager Reviewed", count: managerReviewed, color: "#f59e0b" },
      { label: "Admin Approved", count: adminApproved, color: "#10b981" },
    ];
  }, [stats, enrichedEmployees, submissionExtrasByEmployee]);

  const portalLiveOpen = isPortalWindowOpen(portalWindow, new Date());

  const managerReviewDone = Number.isFinite(Number(monthlyOverview?.managerReviewedCount))
    ? Number(monthlyOverview.managerReviewedCount)
    : stats.managersSubmitted;

  const totalSubmissionRecords = Number.isFinite(Number(monthlyOverview?.totalSubmissions))
    ? Number(monthlyOverview.totalSubmissions)
    : (stats.employeesSubmitted + stats.managersSubmitted);

  const managerReviewCompletionRate = totalSubmissionRecords > 0
    ? Math.round((managerReviewDone / totalSubmissionRecords) * 100)
    : 0;

  const pendingManagerReviews = Number.isFinite(Number(monthlyOverview?.pendingManagerReviews))
    ? Number(monthlyOverview.pendingManagerReviews)
    : Math.max(0, stats.totalManagers - stats.managersSubmitted);

  const interventionDeptCount = departmentBreakdown.filter((d) => d.needsIntervention).length;

  const pendingContributors = Math.max(
    0,
    stats.employeeHeadcount + stats.totalManagers - (stats.employeesSubmitted + stats.managersSubmitted),
  );

  const submissionRoster = useMemo(() => {
    const contributors = enrichedEmployees
      .filter((emp) => !emp._isAdmin)
      .map((emp) => ({
        id: String(emp?.id ?? "").trim(),
        name: String(emp?.name || emp?.email || emp?.id || "Unknown").trim(),
        department: getDepartmentLabel(emp),
        band: String(emp?.band || "—").trim() || "—",
        role: emp._isManager ? "Manager" : "Employee",
        submitted: Boolean(emp.submitted),
      }))
      .filter((row) => row.id)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

    return {
      submitted: contributors.filter((row) => row.submitted),
      pending: contributors.filter((row) => !row.submitted),
    };
  }, [enrichedEmployees]);

  const activeSubmissionRows = useMemo(() => {
    const base = submissionTab === "submitted" ? submissionRoster.submitted : submissionRoster.pending;
    const q = submissionRosterSearch.trim().toLowerCase();
    return base.filter((row) => {
      if (rosterDepartmentFilter !== "all" && row.department !== rosterDepartmentFilter) return false;
      if (rosterBandFilter !== "all" && row.band !== rosterBandFilter) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        row.department.toLowerCase().includes(q) ||
        row.band.toLowerCase().includes(q) ||
        row.role.toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q)
      );
    });
  }, [
    submissionTab,
    submissionRoster,
    submissionRosterSearch,
    rosterDepartmentFilter,
    rosterBandFilter,
  ]);

  const submissionListPagination = useClientPagination(activeSubmissionRows, {
    pageSize: 12,
    pageSizeOptions: [12, 24, 48],
    resetKey: `${submissionTab}|${activeCycleKey}|${submissionRosterSearch}|${rosterDepartmentFilter}|${rosterBandFilter}`,
  });

  const workforceMaxHeadcount = useMemo(
    () => Math.max(...departmentPerformanceData.map((row) => row.headcount), 1),
    [departmentPerformanceData],
  );

  const bandWorkforceMax = useMemo(
    () => Math.max(...bandDistributionData.map((row) => row.total), 1),
    [bandDistributionData],
  );

  /* ───── Report generator ───── */
  function handleGenerateReport() {
    const ts = new Date().toISOString();
    const portalIsOpenNow = isPortalWindowOpen(portalWindow, new Date());
    const sections = [];
    sections.push("=== RT TRACKING — ADMIN PERFORMANCE REPORT ===");
    sections.push(`Generated: ${ts}`);
    sections.push(`Cycle: ${activeCycleKey || "ALL"}`);
    sections.push(`Portal Status: ${portalIsOpenNow ? "OPEN" : "CLOSED"}`);
    sections.push(`Window Start: ${portalWindow.start || "N/A"}`);
    sections.push(`Window End: ${portalWindow.end || "N/A"}`);
    sections.push("");
    sections.push("--- EXECUTIVE SUMMARY ---");
    sections.push(`Total Headcount: ${stats.totalHeadcount}`);
    sections.push(`Employees: ${stats.employeeHeadcount} | Managers: ${stats.totalManagers} | Admins: ${stats.totalAdmins}`);
    sections.push(`Employee Submissions: ${stats.employeesSubmitted}/${stats.employeeHeadcount} (${stats.employeeSubmissionRate}%)`);
    sections.push(`Manager Submissions: ${stats.managersSubmitted}/${stats.totalManagers} (${stats.managerSubmissionRate}%)`);
    sections.push(`Overall Submission Rate: ${stats.overallSubmissionRate}%`);
    sections.push(`Avg Ability (6-month): ${stats.avg6m}`);
    sections.push(`Latest Ability Score: ${stats.latestAbility}`);
    sections.push("");
    sections.push("--- CYCLE REVIEW ---");
    sections.push("Cycle,Submitted,Pending,Rate");
    for (const row of cycleComparisonData) sections.push(`${row.cycle},${row.submitted},${row.pending},${row.rate}%`);
    sections.push("");
    sections.push("--- 6-MONTH ABILITY TREND ---");
    sections.push("Month,Average");
    for (const point of safeAbility6m) sections.push(`${point.month},${point.avg}`);
    sections.push("");
    sections.push("--- DEPARTMENT PERFORMANCE ---");
    sections.push("Department,Headcount,Avg Score,Submission Rate,Top Employee,Top Manager");
    for (const row of departmentGranularityRows) sections.push(`${row.department},${row.headcount},${row.avgScore},${row.submissionRate}%,${row.topEmployeeName},${row.topManagerName}`);
    sections.push("");
    sections.push("--- BAND PERFORMANCE ---");
    sections.push("Band,Headcount,Avg Score,Submission Rate");
    for (const row of bandPerformanceData) sections.push(`${row.band},${row.headcount},${row.avgScore},${row.submissionRate}%`);
    sections.push("");
    sections.push("--- MANAGER TEAM OWNERSHIP ---");
    sections.push("Manager,Team Size,Submitted,Pending,Avg Score");
    for (const row of managerOwnershipData) sections.push(`${row.managerName},${row.teamSize},${row.submitted},${row.pending},${row.avgScore}`);
    sections.push("");
    sections.push("--- TOP PERFORMERS ---");
    sections.push("Rank,Name,Department,Band,Score,Recognitions,Certifications");
    topPerformers.forEach((emp, i) => sections.push(`${i + 1},${emp.name},${getDepartmentLabel(emp)},${emp.band || "—"},${(emp.performanceScore || 0).toFixed(1)},${emp.recognitions},${emp.certCount}`));
    sections.push("");
    sections.push("--- PROJECT AVERAGE RATINGS ---");
    sections.push("Project,Avg Rating,Members,Member List");
    for (const row of projectRatingsData) {
      const memberList = row.members
        .map((member) => `${member.name} (${member.score != null ? member.score.toFixed(1) : "—"})`)
        .join("; ");
      sections.push(`${row.project},${row.avgRating.toFixed(1)},${row.memberCount},"${memberList}"`);
    }
    sections.push("");
    const interventionDepts = departmentBreakdown.filter((d) => d.needsIntervention);
    if (interventionDepts.length) {
      sections.push("--- DEPARTMENTS NEEDING INTERVENTION ---");
      sections.push("Department,Avg Score,Delta,Submission Rate");
      for (const row of interventionDepts) sections.push(`${row.group},${row.latestAvg},${formatDelta(row.delta)},${Math.round(row.submissionRate * 100)}%`);
      sections.push("");
    }
    sections.push("--- FULL EMPLOYEE ROSTER ---");
    sections.push("ID,Name,Email,Role,Band,Department,Submitted,Performance Score,Brownie Points");
    for (const emp of enrichedEmployees) sections.push(`${emp.id},"${emp.name}",${emp.email || "—"},${emp.role},${emp.band || "—"},${getDepartmentLabel(emp)},${emp.submitted ? "Yes" : "No"},${(emp.performanceScore || 0).toFixed(1)},${emp.browniePoints || 0}`);

    const blob = new Blob([sections.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rt-admin-report-${activeCycleKey || "all-cycles"}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast({ title: "Report downloaded", message: "Full report CSV exported." });
  }

  const selectedCycleRatingCount = ratedCycleCounts.get(activeCycleKey) || 0;
  const attentionDepartments = departmentBreakdown.filter((d) => d.needsIntervention).slice(0, 6);

  /* ───── render ───── */

  return (
    <AdminPageShell>
      <AdminPageHeader
        title={ADMIN_TAB_COPY.dashboard.title}
        subtitle={ADMIN_TAB_COPY.dashboard.subtitle}
        sectionLabel={ADMIN_TAB_COPY.dashboard.sectionLabel}
      >
        <label className="sr-only" htmlFor="dash-cycle-select">
          Review cycle
        </label>
        <select
          id="dash-cycle-select"
          value={selectedCycleKey}
          onChange={(e) => setSelectedCycleKey(e.target.value)}
          disabled={cyclesLoading || !cycleOptions.length}
          className="rt-input min-w-[14rem] text-sm"
        >
          {cyclesLoading ? (
            <option value="">Loading cycles…</option>
          ) : cycleOptions.length ? (
            cycleOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))
          ) : (
            <option value={currentReviewCycleKey() || ""}>
              {formatCycleKeyLabel(currentReviewCycleKey()) || "Current cycle"}
            </option>
          )}
        </select>
        <button type="button" onClick={handleGenerateReport} className="rt-btn-secondary">
          <Download size={15} /> Export brief
        </button>
      </AdminPageHeader>

      {activeCycleKey || cycleHeroKey !== "—" ? (
        <div className="pulse-hero-band -mt-4">
          <span className="pulse-chip pulse-chip--accent">Cycle · {cycleHeroLabel}</span>
          <span className="pulse-chip">Month · {presentMonthLabel}</span>
          {selectedCycleRatingCount > 0 ? (
            <span className="pulse-chip">
              {selectedCycleRatingCount} rated submission{selectedCycleRatingCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DashMetric
          label="Workforce"
          value={stats.totalHeadcount}
          hint={`${stats.employeeHeadcount} employees · ${stats.totalManagers} managers`}
          icon={Users}
          accent="blue"
        />
        <DashMetric
          label="Coverage"
          value={`${stats.overallSubmissionRate}%`}
          hint={`${stats.employeesSubmitted + stats.managersSubmitted} contributors submitted`}
          icon={CheckCircle2}
          accent="emerald"
        />
        <DashMetric
          label="Pending"
          value={pendingContributors}
          hint="Still need to submit this cycle"
          icon={Clock}
          accent={pendingContributors > 0 ? "amber" : "emerald"}
        />
        <DashMetric
          label="Ability"
          value={stats.latestAbility ? stats.latestAbility.toFixed(1) : "0.0"}
          hint={
            stats.abilityDelta != null
              ? `${stats.abilityDelta > 0 ? "+" : ""}${stats.abilityDelta.toFixed(1)} vs previous`
              : "Awaiting baseline"
          }
          icon={TrendingUp}
          accent="blue"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="pulse-surface xl:col-span-3">
          <SectionHeader
            icon={Activity}
            iconClassName="bg-blue-500/10 text-blue-600 dark:text-blue-300"
            title="Submission pipeline"
            subtitle="Progress from eligibility through manager review"
            compact
          />
          <div className="mt-4 space-y-4">
            {submissionFunnel.slice(0, 4).map((step) => (
              <div key={step.label}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-[rgb(var(--text))]">{step.label}</span>
                  <span className="tabular-nums text-[rgb(var(--muted))]">{step.count}</span>
                </div>
                <MiniProgressBar
                  value={step.count}
                  max={submissionFunnel[0]?.count || 1}
                  color="bg-blue-500"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="pulse-surface xl:col-span-2 space-y-3">
          <div className="pulse-surface-muted">
            <div className="pulse-metric-label">Submission window</div>
            <div className={`pulse-metric-value text-xl ${portalLiveOpen ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
              {portalLiveOpen ? "Open" : "Closed"}
            </div>
            <div className="pulse-metric-hint">
              {portalWindow?.start ? `Opens ${formatWindowLabel(portalWindow.start)}` : "No schedule configured"}
            </div>
          </div>
          <div className="pulse-surface-muted">
            <div className="pulse-metric-label">Manager review</div>
            <div className="pulse-metric-value text-xl">{managerReviewCompletionRate}%</div>
            <div className="pulse-metric-hint">
              {managerReviewDone}/{totalSubmissionRecords} reviewed
            </div>
          </div>
          <div className="pulse-surface-muted">
            <div className="pulse-metric-label">Needs attention</div>
            <div className="pulse-metric-value text-xl">{interventionDeptCount}</div>
            <div className="pulse-metric-hint">Departments flagged for intervention</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="pulse-surface">
          <SectionHeader
            icon={Users}
            iconClassName="bg-blue-500/10 text-blue-600 dark:text-blue-300"
            title="Workforce by department"
            subtitle="Headcount distribution across the company"
            compact
          />
          <div className="mt-4 space-y-3">
            {departmentPerformanceData.length ? (
              departmentPerformanceData.map((row) => (
                <div key={`dept:${row.department}`}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-medium text-[rgb(var(--text))]">{row.department}</span>
                    <span className="shrink-0 tabular-nums text-[rgb(var(--muted))]">
                      {row.headcount} · {row.submissionRate}% submitted
                    </span>
                  </div>
                  <MiniProgressBar value={row.headcount} max={workforceMaxHeadcount} color="bg-blue-500" />
                </div>
              ))
            ) : (
              <p className="text-sm text-[rgb(var(--muted))]">No department data available.</p>
            )}
          </div>
        </div>

        <div className="pulse-surface">
          <SectionHeader
            icon={Activity}
            iconClassName="bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
            title="Workforce by band"
            subtitle="People grouped by career band"
            compact
          />
          <div className="mt-4 space-y-3">
            {bandDistributionData.length ? (
              bandDistributionData.map((row) => (
                <div key={`band:${row.band}`}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                    <span className="font-mono font-medium text-[rgb(var(--text))]">{row.band}</span>
                    <span className="shrink-0 tabular-nums text-[rgb(var(--muted))]">
                      {row.total} · {row.submittedRate}% submitted
                    </span>
                  </div>
                  <MiniProgressBar value={row.total} max={bandWorkforceMax} color="bg-emerald-500" />
                </div>
              ))
            ) : (
              <p className="text-sm text-[rgb(var(--muted))]">No band data available.</p>
            )}
          </div>
        </div>
      </div>

      <div className="pulse-surface overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-[rgb(var(--border))]/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeader
            icon={CheckCircle2}
            iconClassName="bg-blue-500/10 text-blue-600 dark:text-blue-300"
            title="Submission roster"
            subtitle={`${submissionRoster.submitted.length} submitted · ${submissionRoster.pending.length} still pending`}
            compact
            className="!mb-0"
          />
          <div className="inline-flex rounded-[0.75rem] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]/60 p-1">
            <button
              type="button"
              onClick={() => setSubmissionTab("submitted")}
              className={[
                "rounded-[0.6rem] px-3 py-1.5 text-xs font-semibold transition-colors",
                submissionTab === "submitted"
                  ? "bg-[rgb(var(--surface))] text-[rgb(var(--text))] shadow-sm"
                  : "text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]",
              ].join(" ")}
            >
              Submitted ({submissionRoster.submitted.length})
            </button>
            <button
              type="button"
              onClick={() => setSubmissionTab("pending")}
              className={[
                "rounded-[0.6rem] px-3 py-1.5 text-xs font-semibold transition-colors",
                submissionTab === "pending"
                  ? "bg-[rgb(var(--surface))] text-[rgb(var(--text))] shadow-sm"
                  : "text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]",
              ].join(" ")}
            >
              Not submitted ({submissionRoster.pending.length})
            </button>
          </div>
        </div>

        <div className="border-b border-[rgb(var(--border))]/70 px-4 py-3 space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label className="relative block sm:col-span-2 lg:col-span-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" />
              <input
                type="search"
                value={submissionRosterSearch}
                onChange={(e) => setSubmissionRosterSearch(e.target.value)}
                placeholder="Search name, department, band, or role…"
                className="rt-input h-10 w-full pl-9 text-sm"
                aria-label="Search submission roster"
              />
            </label>
            <label className="block space-y-1">
              <span className="sr-only">Filter roster by department</span>
              <select
                value={rosterDepartmentFilter}
                onChange={(e) => setRosterDepartmentFilter(e.target.value)}
                className="rt-input h-10 w-full text-sm"
                aria-label="Filter roster by department"
              >
                <option value="all">All departments</option>
                {dashboardFilterOptions.departments.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="sr-only">Filter roster by band</span>
              <select
                value={rosterBandFilter}
                onChange={(e) => setRosterBandFilter(e.target.value)}
                className="rt-input h-10 w-full text-sm"
                aria-label="Filter roster by band"
              >
                <option value="all">All bands</option>
                {dashboardFilterOptions.bands.map((band) => (
                  <option key={band} value={band}>{band}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Department</th>
                <th className="px-4 py-3 font-semibold">Band</th>
                <th className="px-4 py-3 text-right font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {submissionListPagination.slice.length ? (
                submissionListPagination.slice.map((row) => (
                  <tr key={`roster:${row.id}`} className="hover:bg-[rgb(var(--surface-2))]/45">
                    <td className="px-4 py-3 font-medium text-[rgb(var(--text))]">{row.name}</td>
                    <td className="px-4 py-3 text-[rgb(var(--muted))]">{row.role}</td>
                    <td className="px-4 py-3 text-[rgb(var(--muted))]">{row.department}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[rgb(var(--muted))]">{row.band}</td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={[
                          "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                          row.submitted
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "bg-amber-500/10 text-amber-800 dark:text-amber-200",
                        ].join(" ")}
                      >
                        {row.submitted ? "Submitted" : "Pending"}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[rgb(var(--muted))]">
                    {submissionRosterSearch.trim()
                      ? "No roster entries match your search."
                      : submissionTab === "submitted"
                        ? "No submissions recorded for this cycle yet."
                        : "Everyone in scope has submitted for this cycle."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {submissionListPagination.show ? (
          <ListPaginationBar
            rangeLabel={submissionListPagination.rangeLabel}
            page={submissionListPagination.page}
            maxPage={submissionListPagination.maxPage}
            pageSize={submissionListPagination.pageSize}
            pageSizeOptions={submissionListPagination.pageSizeOptions}
            onPageChange={submissionListPagination.setPage}
            onPageSizeChange={submissionListPagination.setPageSize}
          />
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="pulse-surface xl:col-span-2">
          <SectionHeader
            icon={TrendingUp}
            iconClassName="bg-blue-500/10 text-blue-600 dark:text-blue-300"
            title="Performance trend"
            subtitle="Six-month rolling average score"
            compact
          />
          <div className="mt-4 w-full" style={{ height: 260 }}>
            {safeAbility6m.length > 0 && safeAbility6m.some((p) => String(p?.month || "").trim()) ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={safeAbility6m} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="month" stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} domain={[0, 5]} />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelStyle={{ color: CHART_TOOLTIP_STYLE.color, fontWeight: 600 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="avg"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    fill="#2563eb"
                    fillOpacity={0.12}
                    dot={false}
                    animationDuration={900}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center px-4 text-center text-sm text-[rgb(var(--muted))]">
                No trend data yet for this cycle.
              </div>
            )}
          </div>
        </div>

        <div className="pulse-surface">
          <SectionHeader
            icon={Zap}
            iconClassName="bg-amber-500/10 text-amber-600 dark:text-amber-300"
            title="Top performers"
            subtitle="Highest scores this cycle"
            compact
          />
          <div className="mt-3 max-h-[280px] space-y-2 overflow-y-auto custom-scrollbar pr-1">
            {topPerformers.length ? (
              topPerformers.map((emp, idx) => (
                <div key={`top:${emp.id}`} className="pulse-list-row">
                  <span className="pulse-rank">{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-sm text-[rgb(var(--text))]">{emp.name}</div>
                    <div className="truncate text-[11px] text-[rgb(var(--muted))]">
                      {getDepartmentLabel(emp)} · {emp.band || "—"}
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="text-base font-bold text-[rgb(var(--text))]">
                      {(emp.performanceScore || 0).toFixed(1)}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-[rgb(var(--muted))]">No performance data yet.</p>
            )}
          </div>
        </div>
      </div>

      <div className="pulse-surface">
        <div className="flex flex-col gap-4 border-b border-[rgb(var(--border))]/70 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeader
            icon={BarChart3}
            iconClassName="bg-blue-500/10 text-blue-600 dark:text-blue-300"
            title="Project average ratings"
            subtitle="Hover a bar to see project members and their scores"
            compact
            className="!mb-0"
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative block min-w-[14rem] flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" />
              <input
                type="search"
                value={projectChartSearch}
                onChange={(e) => setProjectChartSearch(e.target.value)}
                placeholder="Filter projects or members…"
                className="rt-input h-10 w-full pl-9 text-sm"
                aria-label="Filter project chart"
              />
            </label>
            <label className="min-w-[9rem] space-y-1 sm:space-y-0">
              <span className="sr-only">Minimum members</span>
              <select
                value={projectMinMembers}
                onChange={(e) => setProjectMinMembers(e.target.value)}
                className="rt-input h-10 w-full text-sm"
                aria-label="Minimum project members"
              >
                <option value="1">1+ members</option>
                <option value="2">2+ members</option>
                <option value="3">3+ members</option>
                <option value="5">5+ members</option>
              </select>
            </label>
          </div>
        </div>
        <div className="mt-4 w-full" style={{ height: 320 }}>
          {projectRatingsData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={projectRatingsData} margin={{ top: 10, right: 16, bottom: 48, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis
                  dataKey="project"
                  stroke="rgb(var(--muted))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={-24}
                  textAnchor="end"
                  height={70}
                />
                <YAxis stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} domain={[0, 5]} />
                <Tooltip
                  content={<ProjectRatingsTooltip tooltipStyle={CHART_TOOLTIP_STYLE} />}
                  cursor={{ fill: "rgb(var(--surface-2))", opacity: 0.35 }}
                />
                <Bar dataKey="avgRating" fill="#2563eb" radius={[8, 8, 0, 0]} maxBarSize={56} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="grid h-full place-items-center px-4 text-center text-sm text-[rgb(var(--muted))]">
              {projectChartSearch.trim() || Number(projectMinMembers) > 1
                ? "No projects match the current chart filters."
                : "No project allocation data yet. Assign people to projects to see average ratings here."}
            </div>
          )}
        </div>
      </div>

      {attentionDepartments.length ? (
        <div className="pulse-surface">
          <SectionHeader
            icon={Shield}
            iconClassName="bg-rose-500/10 text-rose-600 dark:text-rose-300"
            title="Departments needing attention"
            subtitle="Low scores, declining trends, or weak submission rates"
            compact
          />
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {attentionDepartments.map((row) => (
              <div key={`alert:${row.group}`} className="pulse-surface-muted">
                <div className="font-semibold text-sm text-[rgb(var(--text))]">{row.group}</div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-[rgb(var(--muted))]">
                  <span>Avg {row.latestAvg.toFixed(1)}</span>
                  <span>{Math.round(row.submissionRate * 100)}% submitted</span>
                  <span>{row.headcount} people</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </AdminPageShell>
  );
}
