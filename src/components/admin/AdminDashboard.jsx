import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, useSpring, useTransform, useInView } from "framer-motion";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Award,
  BarChart3,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileBarChart,
  Filter,
  Layers,
  Minus,
  Play,
  Power,
  Shield,
  Square,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import Toast from "../shared/Toast.jsx";

import { deleteEmployee, promoteEmployee as promoteEmployeeApi } from "../../api/employees.js";
import { formatYearMonth } from "../../api/monthly-submissions.js";
import {
  closeSubmissionWindowNow,
  openSubmissionWindowNow,
  scheduleSubmissionWindow,
  closeRoleSubmissionWindowNow,
  openRoleSubmissionWindowNow,
  scheduleRoleSubmissionWindow,
  fetchRoleSubmissionWindow,
} from "../../api/submission-window.js";

/* ───── helpers ───── */

function parseLocalInputValue(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(value);
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

function getProjectLabel(emp) {
  return String(emp?.project || emp?.projectName || emp?.account || emp?.client || "Unassigned").trim() || "Unassigned";
}

/**
 * Weighted performance score:
 *   85 % = average of manager KPI ratings for the employee
 *   15 % = average of manager Webknot-value ratings for the employee
 * Returns a 1-5 scale number (rounded to 1 decimal), or null when data is
 * missing.  Falls back to the old ability-score if no manager eval exists.
 */
function computeEmployeePerformanceScore(emp) {
  const toAvg = (obj) => {
    if (!obj || typeof obj !== "object") return null;
    const nums = Object.values(obj)
      .map((v) => (typeof v === "number" ? v : Number.parseFloat(String(v ?? ""))))
      .filter((v) => Number.isFinite(v) && v >= 1 && v <= 5);
    return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null;
  };

  const mgrKpiAvg = toAvg(emp?.managerKpiRatings);
  const mgrValueAvg = toAvg(emp?.managerWebknotValueRatings);

  if (mgrKpiAvg != null || mgrValueAvg != null) {
    let weighted;
    if (mgrKpiAvg != null && mgrValueAvg != null) {
      weighted = 0.85 * mgrKpiAvg + 0.15 * mgrValueAvg;
    } else if (mgrKpiAvg != null) {
      weighted = mgrKpiAvg; // only KPI available
    } else {
      weighted = mgrValueAvg; // only values available
    }
    return Math.round(Math.min(5, Math.max(1, weighted)) * 10) / 10;
  }

  /* Fallback: direct ability score from backend */
  const directRaw = Number(emp?.submissionAbility ?? emp?.abilityScore ?? emp?.avgScore ?? emp?.ability ?? NaN);
  if (Number.isFinite(directRaw)) return Math.round(Math.min(5, Math.max(1, directRaw)) * 10) / 10;
  const ratingAvg = Number(emp?.abilityScoreFromRatings ?? emp?.abilityFromRatings ?? emp?.abilityScore ?? NaN);
  if (Number.isFinite(ratingAvg)) return Math.round(Math.min(5, Math.max(1, ratingAvg)) * 10) / 10;
  return null;
}

/**
 * Compute brownie points for an employee:
 *   certifications count + recognitions count + 1 if tech showcase provided
 */
function computeBrowniePoints(emp) {
  const certs = Number(emp?.certCount ?? 0) || 0;
  const recognitions = Number(emp?.recognitions ?? 0) || 0;
  const techShowcase = String(emp?.techShowcase ?? "").trim() ? 1 : 0;
  return certs + recognitions + techShowcase;
}

function buildBreakdownRows({ employees, ability6m, keySelector }) {
  const list = Array.isArray(employees) ? employees : [];
  const trend = Array.isArray(ability6m) ? ability6m : [];
  if (!list.length || !trend.length) return [];
  const firstBase = Number(trend[0]?.avg) || 0;
  const latestBase = Number(trend[trend.length - 1]?.avg) || 0;
  const grouped = new Map();
  for (const emp of list) {
    const key = String(keySelector(emp) || "Unassigned").trim() || "Unassigned";
    const prev = grouped.get(key) || { total: 0, submitted: 0 };
    prev.total += 1;
    if (emp?.submitted) prev.submitted += 1;
    grouped.set(key, prev);
  }
  return Array.from(grouped.entries())
    .map(([group, s]) => {
      const submissionRate = s.total > 0 ? s.submitted / s.total : 0;
      const sizeFactor = Math.min(0.25, s.total * 0.02);
      const modifier = (submissionRate - 0.5) * 0.9 + sizeFactor - 0.1;
      const latestAvg = Math.round(clampAbility(latestBase + modifier) * 10) / 10;
      const firstAvg = Math.round(clampAbility(firstBase + modifier - 0.2) * 10) / 10;
      const delta = Math.round((latestAvg - firstAvg) * 10) / 10;
      const bell = classifyBellCurve(latestAvg);
      const needsIntervention = latestAvg < 3.4 || delta < -0.2 || submissionRate < 0.5;
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
    backgroundColor: resolve("--surface") || "#16121b",
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

function StatCard({ label, value, subtitle, icon: Icon, iconColor = "text-blue-500", trend, trendLabel }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const colorBase = iconColor.replace("text-", "").replace("-500", "");
  return (
    <motion.div
      ref={ref}
      className="rt-panel p-5 relative overflow-hidden group hover:shadow-lg hover:shadow-[rgb(var(--primary)/.05)] transition-all duration-300"
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {/* solid accent at top */}
      <div className={`absolute top-0 left-0 right-0 h-[2px] bg-${colorBase}-500/50`} />
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="rt-kicker mb-2">{label}</p>
          <p className="text-3xl font-bold tracking-tight rt-stat-value">
            {typeof value === "number" ? (
              <AnimatedCounter value={value} decimals={Number.isInteger(value) ? 0 : 1} />
            ) : value}
          </p>
          {subtitle ? <p className="mt-1.5 text-xs text-[rgb(var(--muted))]">{subtitle}</p> : null}
          {trend !== undefined && trend !== null ? (
            <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium">
              {trend > 0 ? <ArrowUp size={12} className="text-emerald-500" /> : trend < 0 ? <ArrowDown size={12} className="text-red-500" /> : <Minus size={12} className="text-[rgb(var(--muted))]" />}
              <span className={trend > 0 ? "text-emerald-600 dark:text-emerald-400" : trend < 0 ? "text-red-600 dark:text-red-400" : "text-[rgb(var(--muted))]"}>
                {trendLabel || `${trend > 0 ? "+" : ""}${formatPercent(trend)}%`}
              </span>
            </div>
          ) : null}
        </div>
        <div className={`flex-shrink-0 rounded-xl p-3 ${iconColor.replace("text-", "bg-").replace("500", "500/10")} ${iconColor} ring-1 ring-inset ring-[rgb(var(--border)/.3)]`}>
          <Icon size={20} strokeWidth={1.8} />
        </div>
      </div>
    </motion.div>
  );
}

function InsightCard({ icon: Icon, iconColor = "text-blue-500", title, value, detail }) {
  return (
    <motion.div
      className="rt-panel-subtle p-4 flex items-start gap-3 group hover:bg-[rgb(var(--surface-2)/.5)] transition-colors duration-200"
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
    >
      <div className={`flex-shrink-0 mt-0.5 rounded-lg p-2 ${iconColor.replace("text-", "bg-").replace("500", "500/10")} ${iconColor}`}>
        <Icon size={16} strokeWidth={1.8} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="rt-kicker">{title}</div>
        <div className="mt-1 font-bold text-[rgb(var(--text))] truncate">{value}</div>
        {detail ? <div className="mt-0.5 text-xs text-[rgb(var(--muted))]">{detail}</div> : null}
      </div>
    </motion.div>
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

/* ── animated counter ── */
function AnimatedCounter({ value, decimals = 0, duration = 1.2, prefix = "", suffix = "" }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const springVal = useSpring(0, { duration: duration * 1000, bounce: 0 });
  const display = useTransform(springVal, (v) => {
    const num = decimals > 0 ? v.toFixed(decimals) : Math.round(v);
    return `${prefix}${num}${suffix}`;
  });

  useEffect(() => {
    if (inView) springVal.set(Number(value) || 0);
  }, [inView, value, springVal]);

  return <motion.span ref={ref}>{display}</motion.span>;
}

/* ── radial progress gauge ── */
function RadialGauge({ value, size = 88, strokeWidth = 7, color = "#2563eb", trackColor, label }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const springPct = useSpring(0, { duration: 1400, bounce: 0 });
  const dashOffset = useTransform(springPct, (v) => circumference - (v / 100) * circumference);
  const displayVal = useTransform(springPct, (v) => `${Math.round(v)}%`);

  useEffect(() => {
    if (inView) springPct.set(Math.min(100, Math.max(0, Number(value) || 0)));
  }, [inView, value, springPct]);

  const resolvedTrack = trackColor || "rgb(var(--border))";

  return (
    <div ref={ref} className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={resolvedTrack} strokeWidth={strokeWidth} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference}
          style={{ strokeDashoffset: dashOffset }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span className="text-base font-bold text-[rgb(var(--text))]">{displayVal}</motion.span>
        {label ? <span className="text-[9px] font-semibold text-[rgb(var(--muted))] mt-0.5">{label}</span> : null}
      </div>
    </div>
  );
}

/* ── funnel step ── */
function FunnelStep({ label, count, total, color, delay = 0 }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });
  return (
    <div ref={ref} className="group flex items-center gap-4 py-0.5">
      <div className="w-14 text-right flex-shrink-0">
        <div className="text-base font-bold tabular-nums" style={{ color }}>{count}</div>
        <div className="text-[10px] font-medium text-[rgb(var(--muted))]">{pct}%</div>
      </div>
      <div className="flex-1 relative">
        <div className="h-8 rounded-lg bg-[rgb(var(--surface-2))] overflow-hidden">
          <motion.div
            className="h-full rounded-lg relative overflow-hidden"
            style={{ backgroundColor: color }}
            initial={{ width: 0 }}
            animate={inView ? { width: `${Math.max(pct, 2)}%` } : { width: 0 }}
            transition={{ duration: 0.9, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
          >

          </motion.div>
        </div>
      </div>
      <div className="w-32 text-xs font-semibold text-[rgb(var(--text))] truncate">{label}</div>
    </div>
  );
}

/* ───── main component ───── */

export default function AdminDashboard({
  portalWindow,
  setPortalWindow,
  portalWindowLoading,
  portalWindowError,
  reloadPortalWindow,
  employees,
  setEmployees,
  reloadEmployees,
  employeesLoading,
  employeesError,
  totalEmployeesCount,
  directoryTotals,
  ability6m,
  submissionSummary,
  submissionCycleMap = {},
  submissionExtrasByEmployee = {},
  onGenerateReport,
}) {
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const [promotingId, setPromotingId] = useState(null);
  const [portalWindowBusy, setPortalWindowBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [selectedCycleKey, setSelectedCycleKey] = useState(() => formatYearMonth(new Date()));

  /* ── separate employee / manager window state ── */
  const [empWindow, setEmpWindow] = useState({ start: "", end: "", manualClosed: false, isOpen: false });
  const [mgrWindow, setMgrWindow] = useState({ start: "", end: "", manualClosed: false, isOpen: false });
  const [empWindowBusy, setEmpWindowBusy] = useState(false);
  const [mgrWindowBusy, setMgrWindowBusy] = useState(false);

  /* Fetch the actual role-specific windows from the server on mount */
  const [empWindowLoaded, setEmpWindowLoaded] = useState(false);
  const [mgrWindowLoaded, setMgrWindowLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetchRoleSubmissionWindow("employee", { signal: controller.signal });
        if (!alive) return;
        const parsed = parseRoleWindowResponse(res, "");
        if (parsed.start) { setEmpWindow(parsed); setEmpWindowLoaded(true); }
      } catch { /* ignore – will fall back to global sync below */ }
    })();
    return () => { alive = false; controller.abort(); };
  }, []);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetchRoleSubmissionWindow("manager", { signal: controller.signal });
        if (!alive) return;
        const parsed = parseRoleWindowResponse(res, "");
        if (parsed.start) { setMgrWindow(parsed); setMgrWindowLoaded(true); }
      } catch { /* ignore – will fall back to global sync below */ }
    })();
    return () => { alive = false; controller.abort(); };
  }, []);

  /* Fallback: sync from global when role-specific fetch didn't provide data */
  useEffect(() => {
    if (portalWindow?.start) {
      if (!empWindowLoaded) setEmpWindow((prev) => prev.start ? prev : { start: portalWindow.start, end: portalWindow.end || "", manualClosed: Boolean(portalWindow.manualClosed), isOpen: undefined });
      if (!mgrWindowLoaded) setMgrWindow((prev) => prev.start ? prev : { start: portalWindow.start, end: portalWindow.end || "", manualClosed: Boolean(portalWindow.manualClosed), isOpen: undefined });
    }
  }, [portalWindow?.start, portalWindow?.end, portalWindow?.manualClosed, empWindowLoaded, mgrWindowLoaded]);

  const CHART_TOOLTIP_STYLE = useChartTooltipStyle();

  function showToast(nextToast) {
    setToast(nextToast);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  }

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(id);
  }, []);

  const cycleOptions = useMemo(() => {
    const keys = Object.keys(submissionCycleMap || {});
    const sorted = keys.sort((a, b) => b.localeCompare(a));
    return [{ key: "ALL", label: "All cycles" }, ...sorted.map((k) => ({ key: k, label: k }))];
  }, [submissionCycleMap]);

  useEffect(() => {
    const currentKey = formatYearMonth(new Date());
    const validKeys = new Set(cycleOptions.map((c) => c.key));
    if (!validKeys.has(selectedCycleKey)) {
      setSelectedCycleKey(validKeys.has(currentKey) ? currentKey : "ALL");
    }
  }, [cycleOptions, selectedCycleKey]);

  function portalWindowFromServer(data) {
    const obj = data && typeof data === "object" ? data : {};
    const startAt = obj.startAt ? new Date(obj.startAt) : null;
    const endAt = obj.endAt ? new Date(obj.endAt) : null;
    return {
      start: startAt && !Number.isNaN(startAt.getTime()) ? toLocalInputValue(startAt) : portalWindow.start,
      end: endAt && !Number.isNaN(endAt.getTime()) ? toLocalInputValue(endAt) : "",
      manualClosed: Boolean(obj.manualClosed),
      cycleKey: typeof obj.cycleKey === "string" ? obj.cycleKey : null,
      meta: { ...(portalWindow.meta ?? {}), lastAction: "server", updatedAt: Date.now() },
    };
  }

  const portalIsOpenNow = useMemo(() => {
    if (portalWindow?.manualClosed) return false;
    const start = parseLocalInputValue(portalWindow.start);
    if (!start) return false;
    const endRaw = String(portalWindow.end ?? "").trim();
    const end = endRaw ? parseLocalInputValue(endRaw) : null;
    if (endRaw && !end) return false;
    if (now < start) return false;
    if (!end) return true;
    return now <= end;
  }, [portalWindow?.manualClosed, portalWindow.start, portalWindow.end, now]);

  function isWindowOpen(win) {
    /* If server explicitly told us the state, use it */
    if (win?.manualClosed) return false;
    if (typeof win?.isOpen === "boolean") return win.isOpen;
    /* Fallback: compute from dates */
    const start = parseLocalInputValue(win?.start);
    if (!start) return false;
    const endRaw = String(win?.end ?? "").trim();
    const end = endRaw ? parseLocalInputValue(endRaw) : null;
    if (endRaw && !end) return false;
    if (now < start) return false;
    if (!end) return true;
    return now <= end;
  }

  const empWindowOpen = isWindowOpen(empWindow);
  const mgrWindowOpen = isWindowOpen(mgrWindow);

  function parseRoleWindowResponse(res, fallbackStart) {
    const obj = res && typeof res === "object" ? res : {};
    const startAt = obj.startAt ? new Date(obj.startAt) : null;
    const endAt = obj.endAt ? new Date(obj.endAt) : null;
    return {
      start: startAt && !Number.isNaN(startAt.getTime()) ? toLocalInputValue(startAt) : fallbackStart || "",
      end: endAt && !Number.isNaN(endAt.getTime()) ? toLocalInputValue(endAt) : "",
      manualClosed: Boolean(obj.manualClosed),
      isOpen: typeof obj.isOpen === "boolean" ? obj.isOpen : undefined,
    };
  }

  async function handleRoleToggle(role) {
    const isEmp = role === "employee";
    const isOpen = isEmp ? empWindowOpen : mgrWindowOpen;
    const setBusy = isEmp ? setEmpWindowBusy : setMgrWindowBusy;
    const setWin = isEmp ? setEmpWindow : setMgrWindow;
    setBusy(true);
    try {
      const res = isOpen
        ? await closeRoleSubmissionWindowNow(role)
        : await openRoleSubmissionWindowNow(role);
      const parsed = parseRoleWindowResponse(res, isOpen ? "" : toLocalInputValue(new Date()));
      /* Always force the correct state based on the action we just took */
      if (isOpen) {
        parsed.manualClosed = true;
        parsed.isOpen = false;
      } else {
        parsed.manualClosed = false;
        parsed.isOpen = true;
      }
      setWin(parsed);
      showToast({ title: isOpen ? `${isEmp ? "Employee" : "Manager"} window stopped` : `${isEmp ? "Employee" : "Manager"} window started`, message: isOpen ? "Window closed." : "Window opened." });
    } catch (err) {
      showToast({ title: "Window update failed", message: err?.message || "Please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleSchedule(role) {
    const isEmp = role === "employee";
    const win = isEmp ? empWindow : mgrWindow;
    const start = parseLocalInputValue(win.start);
    const end = parseLocalInputValue(win.end);
    if (!start || !end) { showToast({ title: "Invalid schedule", message: "Pick a valid Open at and Close at." }); return; }
    if (end <= start) { showToast({ title: "Invalid schedule", message: "Close at must be after Open at." }); return; }
    if (end <= now) { showToast({ title: "Invalid schedule", message: "Close at must be in the future." }); return; }
    const setBusy = isEmp ? setEmpWindowBusy : setMgrWindowBusy;
    const setWin = isEmp ? setEmpWindow : setMgrWindow;
    setBusy(true);
    try {
      const res = await scheduleRoleSubmissionWindow(role, { startAt: new Date(win.start).toISOString(), endAt: new Date(win.end).toISOString() });
      const parsed = parseRoleWindowResponse(res, win.start);
      /* Scheduling re-opens the window (clears a previous manual close) */
      parsed.manualClosed = false;
      if (parsed.isOpen === undefined) parsed.isOpen = undefined; /* let isWindowOpen recalculate from dates */
      setWin(parsed);
      showToast({ title: `${isEmp ? "Employee" : "Manager"} window scheduled`, message: "Schedule updated." });
    } catch (err) {
      showToast({ title: "Schedule failed", message: err?.message || "Please try again." });
    } finally {
      setBusy(false);
    }
  }

  /* ───── data computations ───── */

  const normalizedEmployees = useMemo(() => {
    const currentMonthKey = formatYearMonth(new Date());
    const summaryMatches = submissionSummary?.monthKey === currentMonthKey;
    const cycleEntry = selectedCycleKey && selectedCycleKey !== "ALL" ? submissionCycleMap?.[selectedCycleKey] : null;
    const cycleSubmittedIds = cycleEntry && Array.isArray(cycleEntry.submittedIds)
      ? new Set(cycleEntry.submittedIds.map(String))
      : null;
    const allCycleSubmittedIds = (() => {
      const set = new Set();
      for (const entry of Object.values(submissionCycleMap || {}))
        if (Array.isArray(entry?.submittedIds)) entry.submittedIds.forEach((id) => set.add(String(id)));
      return set;
    })();
    const submittedIds = cycleSubmittedIds
      ? cycleSubmittedIds
      : selectedCycleKey === "ALL"
        ? allCycleSubmittedIds
        : summaryMatches && Array.isArray(submissionSummary?.submittedIds)
          ? new Set(submissionSummary.submittedIds.map(String))
          : new Set();
    return employees.map((e) => {
      const roleKey = String(e.role || "").trim().toLowerCase();
      return {
        ...e,
        submitted: submittedIds.has(String(e.id)) || Boolean(e.submitted),
        _roleKey: roleKey,
        _isManager: roleKey === "manager",
        _isEmployee: roleKey !== "manager" && roleKey !== "admin",
        _isAdmin: roleKey === "admin",
      };
    });
  }, [employees, selectedCycleKey, submissionCycleMap, submissionSummary]);

  const stats = useMemo(() => {
    const directoryEmployeeCount = Number.isFinite(directoryTotals?.employeeCount) ? directoryTotals.employeeCount : null;
    const directoryManagerCount = Number.isFinite(directoryTotals?.managerCount) ? directoryTotals.managerCount : null;
    const directoryAdminCount = Number.isFinite(directoryTotals?.adminCount) ? directoryTotals.adminCount : null;
    const employeesOnly = normalizedEmployees.filter((e) => e._isEmployee);
    const managersOnly = normalizedEmployees.filter((e) => e._isManager);
    const adminsOnly = normalizedEmployees.filter((e) => e._isAdmin);

    let totalHeadcount = Number.isFinite(totalEmployeesCount) ? totalEmployeesCount : null;
    if (!Number.isFinite(totalHeadcount)) {
      const summed = [directoryEmployeeCount, directoryManagerCount, directoryAdminCount].filter(Number.isFinite).reduce((s, n) => s + n, 0);
      totalHeadcount = summed > 0 ? summed : null;
    }
    if (!Number.isFinite(totalHeadcount)) totalHeadcount = normalizedEmployees.length;

    const employeeHeadcount = Number.isFinite(directoryEmployeeCount) ? directoryEmployeeCount : employeesOnly.length;
    const totalManagers = Number.isFinite(directoryManagerCount) ? directoryManagerCount : managersOnly.length;
    const totalAdmins = Number.isFinite(directoryAdminCount) ? directoryAdminCount : adminsOnly.length;

    const employeesSubmitted = employeesOnly.filter((e) => e.submitted).length;
    const managersSubmitted = managersOnly.filter((e) => e.submitted).length;

    const avg6m = ability6m.length
      ? Math.round((ability6m.reduce((s, p) => s + p.avg, 0) / ability6m.length) * 10) / 10
      : 0;

    const latestAbility = ability6m.length ? ability6m[ability6m.length - 1]?.avg || 0 : 0;
    const prevAbility = ability6m.length >= 2 ? ability6m[ability6m.length - 2]?.avg || 0 : 0;
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
  }, [ability6m, directoryTotals, normalizedEmployees, totalEmployeesCount]);

  const enrichedEmployees = useMemo(() => {
    return normalizedEmployees.map((emp) => {
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
        browniePoints: computeBrowniePoints({ ...merged, certCount }),
      };
    });
  }, [normalizedEmployees, submissionExtrasByEmployee]);

  const departmentBreakdown = useMemo(
    () => buildBreakdownRows({ employees: normalizedEmployees, ability6m, keySelector: getDepartmentLabel }),
    [normalizedEmployees, ability6m],
  );

  const projectBreakdown = useMemo(
    () => buildBreakdownRows({ employees: normalizedEmployees, ability6m, keySelector: getProjectLabel }),
    [normalizedEmployees, ability6m],
  );

  const roleThroughputData = useMemo(() => {
    return ["Employee", "Manager", "Admin"]
      .map((roleLabel) => {
        const subset = normalizedEmployees.filter((emp) => String(emp?._roleKey || emp?.role || "").trim().toLowerCase() === roleLabel.toLowerCase());
        return { role: roleLabel, submitted: subset.filter((e) => e.submitted).length, pending: Math.max(0, subset.length - subset.filter((e) => e.submitted).length) };
      })
      .filter((r) => r.submitted > 0 || r.pending > 0);
  }, [normalizedEmployees]);

  const bandDistributionData = useMemo(() => {
    const groups = new Map();
    for (const emp of normalizedEmployees) {
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
  }, [normalizedEmployees]);

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
        .filter((emp) => String(emp?.role || "").trim().toLowerCase() === "manager")
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

  const intelligence = useMemo(() => {
    const bestDept = departmentPerformanceData[0] || null;
    const bestBand = bandPerformanceData[0] || null;
    const strongestMgr = managerOwnershipData.slice().sort((a, b) => b.avgScore - a.avgScore || b.submitted - a.submitted)[0] || null;
    const topPerf = topPerformers[0] || null;
    return { bestDept, bestBand, strongestMgr, topPerf };
  }, [bandPerformanceData, departmentPerformanceData, managerOwnershipData, topPerformers]);

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
        base.push({ metric: d.group, employees: d.headcount || 0 });
      }
    } else {
      base.push({ metric: "No Departments", employees: 0 });
    }
    const maxVal = Math.max(...base.map((d) => d.employees), 1);
    return base.map((d) => ({ ...d, fullMark: maxVal }));
  }, [stats, departmentBreakdown]);

  const cycleComparisonData = useMemo(() => {
    const entries = Object.entries(submissionCycleMap || {}).sort(([a], [b]) => a.localeCompare(b));
    return entries.slice(-6).map(([key, entry]) => {
      const total = entry?.totalEligible || entry?.total || employees.length || 0;
      const submitted = Array.isArray(entry?.submittedIds) ? entry.submittedIds.length : 0;
      return { cycle: key, submitted, pending: Math.max(0, total - submitted), rate: total > 0 ? Math.round((submitted / total) * 100) : 0 };
    });
  }, [submissionCycleMap, employees.length]);

  /* ── performance distribution (histogram) ── */
  const performanceDistribution = useMemo(() => {
    const buckets = [
      { range: "1.0–2.0", min: 1, max: 2, count: 0, color: "#ef4444" },
      { range: "2.0–3.0", min: 2, max: 3, count: 0, color: "#f59e0b" },
      { range: "3.0–3.5", min: 3, max: 3.5, count: 0, color: "#3b82f6" },
      { range: "3.5–4.0", min: 3.5, max: 4, count: 0, color: "#6366f1" },
      { range: "4.0–4.5", min: 4, max: 4.5, count: 0, color: "#8b5cf6" },
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
      { label: "Total Eligible", count: totalEligible, color: "#6366f1" },
      { label: "In Draft", count: inDraft, color: "#a855f7" },
      { label: "Submitted", count: submitted, color: "#3b82f6" },
      { label: "Manager Reviewed", count: managerReviewed, color: "#f59e0b" },
      { label: "Admin Approved", count: adminApproved, color: "#10b981" },
    ];
  }, [stats, enrichedEmployees, submissionExtrasByEmployee]);

  /* ───── Report generator ───── */
  function handleGenerateReport() {
    const ts = new Date().toISOString();
    const sections = [];
    sections.push("=== RT TRACKING — ADMIN PERFORMANCE REPORT ===");
    sections.push(`Generated: ${ts}`);
    sections.push(`Cycle: ${selectedCycleKey}`);
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
    for (const point of ability6m) sections.push(`${point.month},${point.avg}`);
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
    a.download = `rt-admin-report-${selectedCycleKey}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast({ title: "Report downloaded", message: "Full report CSV exported." });
  }

  /* ───── portal window actions ───── */

  async function handleToggleWindow() {
    if (portalWindowBusy || portalWindowLoading) return;
    setPortalWindowBusy(true);
    try {
      const res = portalIsOpenNow ? await closeSubmissionWindowNow() : await openSubmissionWindowNow();
      const parsed = portalWindowFromServer(res);
      /* Explicitly set manualClosed when we close, clear when we open */
      if (portalIsOpenNow) {
        parsed.manualClosed = true;
      } else {
        parsed.manualClosed = false;
      }
      setPortalWindow(parsed);
      showToast({ title: portalIsOpenNow ? "Window stopped" : "Window started", message: portalIsOpenNow ? "Submission window closed." : "Submission window opened." });
    } catch (err) {
      showToast({ title: "Window update failed", message: err?.message || "Please try again." });
    } finally {
      setPortalWindowBusy(false);
    }
  }

  async function handleScheduleWindow() {
    const start = parseLocalInputValue(portalWindow.start);
    const end = parseLocalInputValue(portalWindow.end);
    if (!start || !end) { showToast({ title: "Invalid schedule", message: "Pick a valid Open at and Close at." }); return; }
    if (end <= start) { showToast({ title: "Invalid schedule", message: "Close at must be after Open at." }); return; }
    if (end <= now) { showToast({ title: "Invalid schedule", message: "Close at must be in the future." }); return; }
    if (portalWindowBusy || portalWindowLoading) return;
    setPortalWindowBusy(true);
    try {
      const res = await scheduleSubmissionWindow({ startAt: new Date(portalWindow.start).toISOString(), endAt: new Date(portalWindow.end).toISOString() });
      setPortalWindow(portalWindowFromServer(res));
      showToast({ title: "Window scheduled", message: "Submission window schedule updated." });
    } catch (err) {
      showToast({ title: "Schedule failed", message: err?.message || "Please try again." });
    } finally {
      setPortalWindowBusy(false);
    }
  }

  async function promoteEmployee(employeeId) {
    const emp = normalizedEmployees.find((e) => e.id === employeeId);
    if (!emp) return;
    setPromotingId(employeeId);
    try {
      await promoteEmployeeApi(employeeId);
      await reloadEmployees?.();
      showToast({ title: "Promotion applied", message: `${emp.name} promoted successfully.` });
    } catch (err) {
      showToast({ title: "Promotion failed", message: err?.message || "Please try again." });
    } finally {
      setPromotingId(null);
    }
  }

  async function removeEmployee(employeeId) {
    try {
      await deleteEmployee(employeeId);
      await reloadEmployees?.();
      setEmployees((prev) => prev.filter((e) => e.id !== employeeId));
      showToast({ title: "Employee removed", message: `Removed ${employeeId}` });
    } catch (err) {
      showToast({ title: "Delete failed", message: err?.message || "Please try again." });
    }
  }

  /* ───── render ───── */

  return (
    <div className="space-y-8 max-w-7xl mx-auto">

      {/* ── header ── */}
      <header className="rt-panel p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-9 w-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                <BarChart3 size={18} strokeWidth={1.8} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[rgb(var(--muted))]">Admin Dashboard</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-[rgb(var(--text))]">Dashboard Overview</h2>
            <p className="text-sm text-[rgb(var(--muted))] mt-1">Real-time performance analytics & submission tracking</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={selectedCycleKey}
              onChange={(e) => setSelectedCycleKey(e.target.value)}
              className="rt-input px-3 py-2.5 text-sm w-40"
            >
              {cycleOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
            <button onClick={handleGenerateReport} className="rt-btn-ghost py-2.5">
              <Download size={15} /> Export
            </button>
          </div>
        </div>
      </header>

      {/* ── stat cards ── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Headcount"
          value={stats.totalHeadcount}
          subtitle={`${stats.employeeHeadcount} emp · ${stats.totalManagers} mgr · ${stats.totalAdmins} admin`}
          icon={Users}
          iconColor="text-blue-500"
        />
        <StatCard
          label="Submissions Done"
          value={stats.employeesSubmitted + stats.managersSubmitted}
          subtitle={`of ${stats.employeeHeadcount + stats.totalManagers} eligible`}
          icon={CheckCircle2}
          iconColor="text-emerald-500"
        />
        <StatCard
          label="Pending Reviews"
          value={Math.max(0, (stats.employeeHeadcount - stats.employeesSubmitted) + (stats.totalManagers - stats.managersSubmitted))}
          subtitle="Awaiting submission"
          icon={Clock}
          iconColor="text-amber-500"
        />
        <StatCard
          label="Ability Score"
          value={stats.latestAbility || stats.avg6m}
          subtitle="6-month rolling average"
          icon={TrendingUp}
          iconColor="text-purple-500"
          trend={stats.abilityDelta !== null ? (stats.abilityDelta > 0 ? 1 : stats.abilityDelta < 0 ? -1 : 0) : null}
          trendLabel={stats.abilityDelta !== null ? `${stats.abilityDelta > 0 ? "+" : ""}${stats.abilityDelta} vs prev` : undefined}
        />
      </section>

      {/* ── submission rate cards with radial gauges ── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rt-panel p-5 flex items-center gap-5">
          <RadialGauge value={stats.employeeSubmissionRate} color="#2563eb" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="rounded-md p-1.5 bg-blue-500/10 text-blue-500"><UserCheck size={14} /></div>
              <div className="rt-kicker">Employee Submission</div>
            </div>
            <div className="text-xs text-[rgb(var(--muted))] mt-1">{stats.employeesSubmitted} of {stats.employeeHeadcount} submitted</div>
            <div className="mt-2">
              <MiniProgressBar value={stats.employeeSubmissionRate} color="bg-blue-500" />
            </div>
          </div>
        </div>
        <div className="rt-panel p-5 flex items-center gap-5">
          <RadialGauge value={stats.managerSubmissionRate} color="#059669" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="rounded-md p-1.5 bg-emerald-500/10 text-emerald-500"><Shield size={14} /></div>
              <div className="rt-kicker">Manager Submission</div>
            </div>
            <div className="text-xs text-[rgb(var(--muted))] mt-1">{stats.managersSubmitted} of {stats.totalManagers} submitted</div>
            <div className="mt-2">
              <MiniProgressBar value={stats.managerSubmissionRate} color="bg-emerald-500" />
            </div>
          </div>
        </div>
        <div className="rt-panel p-5 flex items-center gap-5">
          <RadialGauge value={stats.overallSubmissionRate} color="#7c3aed" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="rounded-md p-1.5 bg-purple-500/10 text-purple-500"><Activity size={14} /></div>
              <div className="rt-kicker">Submission Rate</div>
            </div>
            <div className="text-xs text-[rgb(var(--muted))] mt-1">All the employees submission rate</div>
            <div className="mt-2">
              <MiniProgressBar value={stats.overallSubmissionRate} color="bg-purple-500" />
            </div>
          </div>
        </div>
      </section>

      {/* ── intelligence highlights ── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <InsightCard
          icon={Briefcase} iconColor="text-blue-500" title="Best Department"
          value={intelligence.bestDept?.department || "—"}
          detail={intelligence.bestDept ? `Score ${intelligence.bestDept.avgScore.toFixed(1)} · ${intelligence.bestDept.submissionRate}% submitted` : undefined}
        />
        <InsightCard
          icon={Layers} iconColor="text-purple-500" title="Strongest Band"
          value={intelligence.bestBand?.band || "—"}
          detail={intelligence.bestBand ? `Score ${intelligence.bestBand.avgScore.toFixed(1)} · ${intelligence.bestBand.submissionRate}% submitted` : undefined}
        />
        <InsightCard
          icon={Shield} iconColor="text-emerald-500" title="Top Manager Team"
          value={intelligence.strongestMgr?.managerName || "—"}
          detail={intelligence.strongestMgr ? `Team ${intelligence.strongestMgr.teamSize} · Avg ${intelligence.strongestMgr.avgScore.toFixed(1)}` : undefined}
        />
        <InsightCard
          icon={Award} iconColor="text-amber-500" title="Highest Performer"
          value={intelligence.topPerf?.name || "—"}
          detail={intelligence.topPerf ? `Score ${(intelligence.topPerf.performanceScore || 0).toFixed(1)} · ${intelligence.topPerf.band || "—"}` : undefined}
        />
      </section>

      {/* ── ability trend + org health radar ── */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 rt-panel p-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="rounded-lg p-2 bg-blue-500/10 text-blue-500"><TrendingUp size={16} /></div>
            <div className="rt-section-header">
              <h3 className="rt-section-title">Performance Trend</h3>
              <p className="rt-section-subtitle">6-month rolling average score</p>
            </div>
          </div>
          <div className="mt-4 w-full" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={ability6m} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="month" stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} domain={[0, 5]} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ color: CHART_TOOLTIP_STYLE.color, fontWeight: 600 }} />
                <Area type="monotone" dataKey="avg" stroke="#2563eb" strokeWidth={2.5} fill="#2563eb" fillOpacity={0.1} dot={{ r: 4, strokeWidth: 2, fill: "rgb(var(--surface))", stroke: "#2563eb" }} activeDot={{ r: 6, strokeWidth: 2, fill: "#2563eb" }} animationDuration={1200} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rt-panel p-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="rounded-lg p-2 bg-purple-500/10 text-purple-500"><Target size={16} /></div>
            <div className="rt-section-header">
              <h3 className="rt-section-title">Workforce Distribution</h3>
              <p className="rt-section-subtitle">Employee headcount by department</p>
            </div>
          </div>
          <div className="mt-4 w-full" style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart outerRadius="65%" data={orgHealthRadarData}>
                <PolarGrid stroke="rgb(var(--border))" strokeDasharray="3 3" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 9, fill: "rgb(var(--muted))" }} />
                <PolarRadiusAxis angle={90} domain={[0, 'dataMax']} tick={{ fontSize: 9, fill: "rgb(var(--muted))" }} axisLine={false} />
                <Radar name="Employees" dataKey="employees" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.12} strokeWidth={2} dot={{ r: 3, fill: "#7c3aed" }} animationDuration={1200} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value) => [`${value} employee${value !== 1 ? 's' : ''}`, 'Headcount']} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* ── cycle comparison + completion trend + pie ── */}
      {cycleComparisonData.length > 0 ? (
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="rt-panel p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-lg p-2 bg-emerald-500/10 text-emerald-500"><BarChart3 size={16} /></div>
              <div className="rt-section-header">
                <h3 className="rt-section-title">Review Cycle Comparison</h3>
                <p className="rt-section-subtitle">Submission volume per cycle</p>
              </div>
            </div>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cycleComparisonData} barGap={4} barCategoryGap={20}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="cycle" stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ color: CHART_TOOLTIP_STYLE.color, fontWeight: 600 }} />
                  <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                  <Bar dataKey="submitted" name="Submitted" fill="#2563eb" opacity={0.85} radius={[6, 6, 0, 0]} maxBarSize={40} animationDuration={1000} />
                  <Bar dataKey="pending" name="Pending" fill="#f59e0b" opacity={0.85} radius={[6, 6, 0, 0]} maxBarSize={40} animationDuration={1000} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rt-panel p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-lg p-2 bg-blue-500/10 text-blue-500"><TrendingUp size={16} /></div>
              <div className="rt-section-header">
                <h3 className="rt-section-title">Completion Rate Trend</h3>
                <p className="rt-section-subtitle">Submission rate % across cycles</p>
              </div>
            </div>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cycleComparisonData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                  <XAxis dataKey="cycle" stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ color: CHART_TOOLTIP_STYLE.color, fontWeight: 600 }} formatter={(value) => [`${value}%`, "Completion Rate"]} />
                  <Line type="monotone" dataKey="rate" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 4, strokeWidth: 2, fill: "rgb(var(--surface))", stroke: "#2563eb" }} activeDot={{ r: 6, strokeWidth: 2, fill: "#2563eb" }} animationDuration={1200} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rt-panel p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-lg p-2 bg-amber-500/10 text-amber-500"><FileBarChart size={16} /></div>
              <div className="rt-section-header">
                <h3 className="rt-section-title">Current Cycle Status</h3>
                <p className="rt-section-subtitle">Employee vs manager submission progress</p>
              </div>
            </div>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={cycleHealthPieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={88} paddingAngle={3} strokeWidth={0} animationDuration={1000}>
                    {cycleHealthPieData.map((entry, idx) => <Cell key={`hc:${idx}`} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend
                    verticalAlign="bottom"
                    height={40}
                    content={({ payload }) => (
                      <div className="flex flex-wrap items-center justify-center gap-3 px-2 text-[11px] font-semibold text-[rgb(var(--text))]">
                        {(payload || []).map((entry, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry?.color || "#8884d8" }} />
                            {entry?.value}
                          </span>
                        ))}
                      </div>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── performance distribution + submission pipeline ── */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rt-panel p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-lg p-2 bg-indigo-500/10 text-indigo-500"><BarChart3 size={16} /></div>
            <div className="rt-section-header">
              <h3 className="rt-section-title">Score Distribution</h3>
              <p className="rt-section-subtitle">Performance bell curve across all employees</p>
            </div>
          </div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performanceDistribution.buckets} barCategoryGap="20%" margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="range" stroke="rgb(var(--muted))" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={{ color: CHART_TOOLTIP_STYLE.color, fontWeight: 600 }}
                  formatter={(value) => [`${value} employee${value !== 1 ? "s" : ""}`, "Count"]}
                />
                <Bar dataKey="count" name="Employees" radius={[8, 8, 0, 0]} maxBarSize={52} animationDuration={1200} animationEasing="ease-out">
                  {performanceDistribution.buckets.map((b, i) => (
                    <Cell key={`cell-${i}`} fill={b.color} opacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex items-center justify-center gap-5 text-[10px] text-[rgb(var(--muted))]">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-500" />Needs Improvement</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />Core</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Top Performers</span>
          </div>
        </div>

        <div className="rt-panel p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="rounded-lg p-2 bg-violet-500/10 text-violet-500"><Filter size={16} /></div>
            <div className="rt-section-header">
              <h3 className="rt-section-title">Review Pipeline</h3>
              <p className="rt-section-subtitle">End-to-end submission funnel</p>
            </div>
          </div>
          <div className="space-y-2">
            {submissionFunnel.map((step, idx) => (
              <FunnelStep
                key={step.label}
                label={step.label}
                count={step.count}
                total={submissionFunnel[0]?.count || 1}
                color={step.color}
                delay={idx * 0.1}
              />
            ))}
          </div>
          <div className="mt-5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-2)/.3)] p-3.5 flex items-center gap-3">
            <div className="rounded-md p-1.5 bg-emerald-500/10 text-emerald-500"><CheckCircle2 size={14} /></div>
            <div className="flex-1">
              <div className="text-xs font-semibold text-[rgb(var(--text))]">
                Pipeline Efficiency
              </div>
              <div className="text-[11px] text-[rgb(var(--muted))]">
                {submissionFunnel[0]?.count
                  ? `${Math.round((submissionFunnel[submissionFunnel.length - 1]?.count / submissionFunnel[0].count) * 100)}% completion rate from eligible to approved`
                  : "No data yet"}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── department & project breakdown ── */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rt-panel p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-lg p-2 bg-blue-500/10 text-blue-500"><Briefcase size={16} /></div>
            <div className="rt-section-header">
              <h3 className="rt-section-title">Department Analysis</h3>
              <p className="rt-section-subtitle">Performance classification & alerts</p>
            </div>
          </div>
          <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
            {departmentBreakdown.slice(0, 8).map((row) => (
              <div key={`dep-${row.group}`} className="rt-panel-subtle p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-sm text-[rgb(var(--text))] truncate">{row.group}</div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${row.bell.className}`}>{row.bell.label}</span>
                    {row.needsIntervention ? (
                      <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">Action</span>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-[rgb(var(--muted))] flex-wrap">
                  <span>Avg <span className="font-mono text-[rgb(var(--text))]">{row.latestAvg.toFixed(1)}</span></span>
                  <span>Δ <span className="font-mono">{formatDelta(row.delta)}</span></span>
                  <span>HC {row.headcount}</span>
                  <span>{Math.round(row.submissionRate * 100)}% submitted</span>
                </div>
              </div>
            ))}
            {!departmentBreakdown.length ? <p className="text-sm text-[rgb(var(--muted))]">No data available.</p> : null}
          </div>
        </div>

        <div className="rt-panel p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-lg p-2 bg-emerald-500/10 text-emerald-500"><Zap size={16} /></div>
            <div className="rt-section-header">
              <h3 className="rt-section-title">Project Analysis</h3>
              <p className="rt-section-subtitle">Performance by project assignment</p>
            </div>
          </div>
          <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
            {projectBreakdown.slice(0, 8).map((row) => (
              <div key={`proj-${row.group}`} className="rt-panel-subtle p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-sm text-[rgb(var(--text))] truncate">{row.group}</div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${row.bell.className}`}>{row.bell.label}</span>
                    {row.needsIntervention ? (
                      <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">Action</span>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-[rgb(var(--muted))] flex-wrap">
                  <span>Avg <span className="font-mono text-[rgb(var(--text))]">{row.latestAvg.toFixed(1)}</span></span>
                  <span>Δ <span className="font-mono">{formatDelta(row.delta)}</span></span>
                  <span>HC {row.headcount}</span>
                  <span>{Math.round(row.submissionRate * 100)}% submitted</span>
                </div>
              </div>
            ))}
            {!projectBreakdown.length ? <p className="text-sm text-[rgb(var(--muted))]">No data available.</p> : null}
          </div>
        </div>
      </section>

      {/* ── delivery analytics ── */}
      <section className="rt-panel p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="rounded-lg p-2 bg-blue-500/10 text-blue-500"><BarChart3 size={16} /></div>
          <div className="rt-section-header">
            <h3 className="rt-section-title">Operational Analytics</h3>
            <p className="rt-section-subtitle">Role throughput and band distribution</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rt-panel-subtle p-4 flex flex-col" style={{ height: 340 }}>
            <div className="flex items-center gap-2 mb-3">
              <Users size={14} className="text-[rgb(var(--muted))]" />
              <div className="rt-kicker">Role Throughput</div>
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={roleThroughputData} barGap={6} barCategoryGap={24}>
                  <XAxis dataKey="role" stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: "rgb(var(--surface-2))", opacity: 0.5 }} />
                  <Legend wrapperStyle={{ fontSize: 10, fontWeight: 600 }} />
                  <Bar dataKey="submitted" name="Submitted" fill="#2563eb" opacity={0.85} radius={[6, 6, 0, 0]} maxBarSize={36} animationDuration={1000} />
                  <Bar dataKey="pending" name="Pending" fill="#94a3b8" opacity={0.85} radius={[6, 6, 0, 0]} maxBarSize={36} animationDuration={1000} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rt-panel-subtle p-4 flex flex-col" style={{ height: 340 }}>
            <div className="flex items-center gap-2 mb-3 shrink-0">
              <Layers size={14} className="text-[rgb(var(--muted))]" />
              <div className="rt-kicker">Band Distribution</div>
            </div>
            <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
              {bandDistributionData.length ? bandDistributionData.map((row) => (
                <div key={`bd:${row.band}`} className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[rgb(var(--text))]">{row.band}</span>
                    <span className="font-mono text-[rgb(var(--muted))]">{row.total}</span>
                  </div>
                  <MiniProgressBar value={row.submittedRate} color="bg-emerald-500" />
                  <div className="mt-1 text-[10px] text-[rgb(var(--muted))]">{row.submittedRate}% submitted</div>
                </div>
              )) : <p className="text-sm text-[rgb(var(--muted))]">No band data yet.</p>}
            </div>
          </div>
        </div>
      </section>

      {/* ── dept & band performance charts ── */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rt-panel p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-lg p-2 bg-blue-500/10 text-blue-500"><Briefcase size={16} /></div>
            <div className="rt-section-header">
              <h3 className="rt-section-title">Department Performance</h3>
              <p className="rt-section-subtitle">Average score & submission rate by department</p>
            </div>
          </div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={departmentPerformanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="department" stroke="rgb(var(--muted))" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" domain={[0, 5]} stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ color: CHART_TOOLTIP_STYLE.color, fontWeight: 600 }} />
                <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                <Bar yAxisId="left" dataKey="avgScore" name="Avg Score" fill="#2563eb" opacity={0.85} radius={[6, 6, 0, 0]} animationDuration={1000} />
                <Bar yAxisId="right" dataKey="submissionRate" name="Submission %" fill="#0f766e" opacity={0.85} radius={[6, 6, 0, 0]} animationDuration={1000} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rt-panel p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-lg p-2 bg-purple-500/10 text-purple-500"><Layers size={16} /></div>
            <div className="rt-section-header">
              <h3 className="rt-section-title">Band Performance</h3>
              <p className="rt-section-subtitle">Performance by employee band</p>
            </div>
          </div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bandPerformanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="band" stroke="rgb(var(--muted))" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" domain={[0, 5]} stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ color: CHART_TOOLTIP_STYLE.color, fontWeight: 600 }} />
                <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                <Bar yAxisId="left" dataKey="avgScore" name="Avg Score" fill="#7c3aed" opacity={0.85} radius={[6, 6, 0, 0]} animationDuration={1000} />
                <Bar yAxisId="right" dataKey="submissionRate" name="Submission %" fill="#f59e0b" opacity={0.85} radius={[6, 6, 0, 0]} animationDuration={1000} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* ── manager ownership + top performers ── */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rt-panel p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-lg p-2 bg-emerald-500/10 text-emerald-500"><Shield size={16} /></div>
            <div className="rt-section-header">
              <h3 className="rt-section-title">Manager Team Overview</h3>
              <p className="rt-section-subtitle">Team composition and submission progress</p>
            </div>
          </div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={managerOwnershipData} barGap={4} barCategoryGap={24}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" vertical={false} />
                <XAxis dataKey="managerName" stroke="rgb(var(--muted))" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={{ color: CHART_TOOLTIP_STYLE.color, fontWeight: 600 }} />
                <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                <Bar dataKey="submitted" name="Submitted" fill="#16a34a" opacity={0.85} radius={[6, 6, 0, 0]} maxBarSize={36} animationDuration={1000} />
                <Bar dataKey="pending" name="Pending" fill="#f97316" opacity={0.85} radius={[6, 6, 0, 0]} maxBarSize={36} animationDuration={1000} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rt-panel p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-lg p-2 bg-amber-500/10 text-amber-500"><Award size={16} /></div>
            <div className="rt-section-header">
              <h3 className="rt-section-title">Top Performers</h3>
              <p className="rt-section-subtitle">Highest-rated employees this cycle</p>
            </div>
          </div>
          <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
            {topPerformers.length ? topPerformers.map((emp, idx) => (
              <motion.div
                key={`top:${emp.id}`}
                className="rt-panel-subtle p-3 flex items-center gap-3 group hover:bg-[rgb(var(--surface-2)/.5)] transition-colors"
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.08, duration: 0.4 }}
              >
                <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${idx === 0 ? "bg-amber-500" : idx === 1 ? "bg-slate-400" : idx === 2 ? "bg-orange-500" : "bg-[rgb(var(--surface-3))] text-[rgb(var(--text))]"}`}>
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-[rgb(var(--text))] truncate">{emp.name}</div>
                  <div className="text-[11px] text-[rgb(var(--muted))]">{getDepartmentLabel(emp)} · {emp.band || "—"}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-lg font-bold rt-stat-value">{(emp.performanceScore || 0).toFixed(1)}</div>
                  <div className="text-[10px] text-[rgb(var(--muted))]">Brownie: {emp.browniePoints || 0}</div>
                </div>
              </motion.div>
            )) : <p className="text-sm text-[rgb(var(--muted))]">No performance data yet.</p>}
          </div>
        </div>
      </section>

      {/* ── department granularity table ── */}
      <section className="rt-panel overflow-hidden">
        <div className="p-6 flex items-center gap-3">
          <div className="rounded-lg p-2 bg-blue-500/10 text-blue-500"><FileBarChart size={16} /></div>
          <div className="rt-section-header">
            <h3 className="rt-section-title">Department Details</h3>
            <p className="rt-section-subtitle">Comprehensive breakdown with employee and manager metrics</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-[rgb(var(--muted))] border-t border-b border-[rgb(var(--border))]">
              <tr>
                <th className="py-3 px-4 font-semibold">Department</th>
                <th className="py-3 px-4 font-semibold">Employees</th>
                <th className="py-3 px-4 font-semibold">Managers</th>
                <th className="py-3 px-4 font-semibold">Avg Score</th>
                <th className="py-3 px-4 font-semibold">Submission</th>
                <th className="py-3 px-4 font-semibold">Top Employee</th>
                <th className="py-3 px-4 font-semibold">Top Manager</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {departmentGranularityRows.map((row) => (
                <tr key={`dg:${row.department}`} className="hover:bg-[rgb(var(--surface-2))] transition-colors">
                  <td className="py-3 px-4 font-semibold text-sm text-[rgb(var(--text))]">{row.department}</td>
                  <td className="py-3 px-4 font-mono text-sm text-[rgb(var(--muted))]">{row.headcount}</td>
                  <td className="py-3 px-4 font-mono text-sm text-[rgb(var(--muted))]">{row.managerCount}</td>
                  <td className="py-3 px-4 font-mono text-sm text-[rgb(var(--text))]">{row.avgScore.toFixed(1)}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <MiniProgressBar value={row.submissionRate} color={row.submissionRate >= 70 ? "bg-emerald-500" : row.submissionRate >= 40 ? "bg-amber-500" : "bg-red-500"} />
                      <span className="text-xs font-mono text-[rgb(var(--muted))]">{row.submissionRate}%</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-[rgb(var(--text))]">{row.topEmployeeName}</td>
                  <td className="py-3 px-4 text-sm text-[rgb(var(--text))]">{row.topManagerName}</td>
                </tr>
              ))}
              {!departmentGranularityRows.length ? (
                <tr><td className="py-6 px-4 text-[rgb(var(--muted))]" colSpan={7}>No data available.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── employee roster ── */}
      <section className="rt-panel overflow-hidden">
        <div className="p-6 flex items-center gap-3">
          <div className="rounded-lg p-2 bg-blue-500/10 text-blue-500"><Users size={16} /></div>
          <div className="rt-section-header">
            <h3 className="rt-section-title">Employee Roster</h3>
            <p className="rt-section-subtitle">Complete directory with submission status</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-[rgb(var(--muted))] border-t border-b border-[rgb(var(--border))]">
              <tr>
                <th className="py-3 px-4 font-semibold">Employee</th>
                <th className="py-3 px-4 font-semibold">Role</th>
                <th className="py-3 px-4 font-semibold">Band</th>
                <th className="py-3 px-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {normalizedEmployees.map((emp) => (
                <tr key={emp.id} className="hover:bg-[rgb(var(--surface-2))] transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-sm text-[rgb(var(--text))]">{emp.name}</div>
                    <div className="text-xs text-[rgb(var(--muted))] mt-0.5 break-all">{emp.email || "—"}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 bg-[rgb(var(--surface-2))] text-[rgb(var(--text))] rounded border border-[rgb(var(--border))]">
                      {emp.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-sm text-blue-500">{emp.band}</td>
                  <td className="py-3 px-4">
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${
                      emp.submitted
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                        : "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20"
                    }`}>
                      {emp.submitted ? "Submitted" : "Pending"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
