import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpCircle, Calendar, Clock, Download, Play, Power, Square, Trash2, Users, X } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from "recharts";
import Toast from "../shared/Toast.jsx";

import { deleteEmployee, promoteEmployee as promoteEmployeeApi } from "../../api/employees.js";
import {
  closeSubmissionWindowNow,
  openSubmissionWindowNow,
  scheduleSubmissionWindow,
} from "../../api/submission-window.js";

function parseLocalInputValue(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function StatCard({ label, value, icon }) {
  return (
    <div className="rt-panel p-8 relative overflow-hidden group">
      <div className="absolute -right-2 -top-2 opacity-10 transform rotate-12">{icon}</div>
      <p className="rt-kicker mb-1">{label}</p>
      <p className="text-4xl mb-1 rt-stat-value">{value}</p>
    </div>
  );
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
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}`;
}

function getDepartmentLabel(emp) {
  return String(emp?.stream || emp?.designation || emp?.role || "Unassigned").trim() || "Unassigned";
}

function getProjectLabel(emp) {
  return String(emp?.project || emp?.projectName || emp?.account || emp?.client || "Unassigned").trim() || "Unassigned";
}

function computeEmployeePerformanceScore(emp) {
  const directRaw = Number(emp?.submissionAbility ?? emp?.abilityScore ?? emp?.avgScore ?? NaN);
  const direct = Number.isFinite(directRaw) ? Math.min(5, Math.max(1, directRaw)) : null;
  const submitted = Boolean(emp?.submitted);
  const recognitions = Number(emp?.recognitions || 0) || 0;
  const certCount = Array.isArray(emp?.certifications) ? emp.certifications.length : 0;
  const role = String(emp?.role || "").trim().toLowerCase();

  const baseline = submitted ? 2.9 : 1.8;
  const recognitionBonus = Math.min(1.0, recognitions * 0.22);
  const certificationBonus = Math.min(0.9, certCount * 0.18);
  const leadershipBonus = role === "manager" ? 0.2 : role === "admin" ? 0.1 : 0;

  const inferred = Math.min(5, Math.max(1, baseline + recognitionBonus + certificationBonus + leadershipBonus));
  const score = direct == null ? inferred : (direct * 0.7) + (inferred * 0.3);
  return Math.round(score * 10) / 10;
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
    .map(([group, stats]) => {
      const submissionRate = stats.total > 0 ? stats.submitted / stats.total : 0;
      const sizeFactor = Math.min(0.25, stats.total * 0.02);
      const modifier = (submissionRate - 0.5) * 0.9 + sizeFactor - 0.1;

      const latestAvg = Math.round(clampAbility(latestBase + modifier) * 10) / 10;
      const firstAvg = Math.round(clampAbility(firstBase + modifier - 0.2) * 10) / 10;
      const delta = Math.round((latestAvg - firstAvg) * 10) / 10;
      const bell = classifyBellCurve(latestAvg);
      const needsIntervention = latestAvg < 3.4 || delta < -0.2 || submissionRate < 0.5;

      return {
        group,
        latestAvg,
        delta,
        bell,
        submissionRate,
        headcount: stats.total,
        needsIntervention,
      };
    })
    .sort((a, b) => {
      if (a.needsIntervention !== b.needsIntervention) return a.needsIntervention ? -1 : 1;
      return a.latestAvg - b.latestAvg;
    });
}

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
  ability6m,
  onGenerateReport,
}) {
  const [toast, setToast] = useState(null); // { title: string, message?: string }
  const toastTimerRef = useRef(null);
  const [promotingId, setPromotingId] = useState(null);
  const [portalWindowBusy, setPortalWindowBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());

  function showToast(nextToast) {
    setToast(nextToast);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  }

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(id);
  }, []);

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

  const stats = useMemo(() => {
    const totalEmployees = employees.length;
    const employeesSubmitted = employees.filter(e => e.submitted).length;
    const totalManagers = employees.filter(e => e.role === "Manager").length;
    const managersSubmitted = employees.filter(e => e.role === "Manager" && e.submitted).length;
    const avg6m = ability6m.length
      ? Math.round((ability6m.reduce((s, p) => s + p.avg, 0) / ability6m.length) * 10) / 10
      : 0;

    return {
      totalEmployees,
      employeesSubmitted,
      totalManagers,
      managersSubmitted,
      avg6m,
    };
  }, [employees, ability6m]);

  const adminInsights = useMemo(() => {
    const submissionRate = stats.totalEmployees
      ? Math.round((stats.employeesSubmitted / stats.totalEmployees) * 100)
      : 0;
    const managerSubmissionRate = stats.totalManagers
      ? Math.round((stats.managersSubmitted / stats.totalManagers) * 100)
      : 0;
    const pendingEmployees = employees.filter((e) => !e.submitted);
    return {
      submissionRate,
      managerSubmissionRate,
      pendingCount: pendingEmployees.length,
      pendingPreview: pendingEmployees.slice(0, 5),
    };
  }, [employees, stats.employeesSubmitted, stats.managersSubmitted, stats.totalEmployees, stats.totalManagers]);

  const departmentBreakdown = useMemo(
    () => buildBreakdownRows({ employees, ability6m, keySelector: getDepartmentLabel }),
    [employees, ability6m]
  );

  const projectBreakdown = useMemo(
    () => buildBreakdownRows({ employees, ability6m, keySelector: getProjectLabel }),
    [employees, ability6m]
  );

  const roleThroughputData = useMemo(() => {
    const roleGroups = ["Employee", "Manager", "Admin"];
    return roleGroups.map((roleLabel) => {
      const subset = employees.filter((emp) => String(emp?.role || "").trim().toLowerCase() === roleLabel.toLowerCase());
      const submitted = subset.filter((emp) => Boolean(emp?.submitted)).length;
      const pending = Math.max(0, subset.length - submitted);
      return {
        role: roleLabel,
        submitted,
        pending,
      };
    }).filter((row) => row.submitted > 0 || row.pending > 0);
  }, [employees]);

  const bandDistributionData = useMemo(() => {
    const groups = new Map();
    for (const emp of employees) {
      const band = String(emp?.band || "Unassigned").trim() || "Unassigned";
      const prev = groups.get(band) || { total: 0, submitted: 0 };
      prev.total += 1;
      if (emp?.submitted) prev.submitted += 1;
      groups.set(band, prev);
    }
    return Array.from(groups.entries())
      .map(([band, stats]) => ({
        band,
        total: stats.total,
        submittedRate: stats.total ? Math.round((stats.submitted / stats.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [employees]);

  const cycleHealthPieData = useMemo(() => {
    const submitted = Math.max(0, stats.employeesSubmitted);
    const pending = Math.max(0, stats.totalEmployees - submitted);
    const managerSubmitted = Math.max(0, stats.managersSubmitted);
    const managerPending = Math.max(0, stats.totalManagers - managerSubmitted);
    return [
      { name: "Employee Submitted", value: submitted, color: "#1d4ed8" },
      { name: "Employee Pending", value: pending, color: "#f59e0b" },
      { name: "Manager Submitted", value: managerSubmitted, color: "#059669" },
      { name: "Manager Pending", value: managerPending, color: "#fb7185" },
    ].filter((row) => row.value > 0);
  }, [stats.employeesSubmitted, stats.managersSubmitted, stats.totalEmployees, stats.totalManagers]);

  const enrichedEmployees = useMemo(() => {
    return employees.map((emp) => {
      const recognitions = Number(emp?.recognitions || 0) || 0;
      const certCount = Array.isArray(emp?.certifications) ? emp.certifications.length : 0;
      return {
        ...emp,
        recognitions,
        certCount,
        performanceScore: computeEmployeePerformanceScore(emp),
      };
    });
  }, [employees]);

  const departmentPerformanceData = useMemo(() => {
    const groups = new Map();
    for (const emp of enrichedEmployees) {
      const department = getDepartmentLabel(emp);
      const prev = groups.get(department) || { total: 0, submitted: 0, scoreSum: 0 };
      prev.total += 1;
      prev.scoreSum += Number(emp?.performanceScore || 0);
      if (emp?.submitted) prev.submitted += 1;
      groups.set(department, prev);
    }
    return Array.from(groups.entries())
      .map(([department, statsRow]) => ({
        department,
        headcount: statsRow.total,
        submissionRate: statsRow.total ? Math.round((statsRow.submitted / statsRow.total) * 100) : 0,
        avgScore: statsRow.total ? Math.round((statsRow.scoreSum / statsRow.total) * 10) / 10 : 0,
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
      .map(([band, statsRow]) => ({
        band,
        headcount: statsRow.total,
        submissionRate: statsRow.total ? Math.round((statsRow.submitted / statsRow.total) * 100) : 0,
        avgScore: statsRow.total ? Math.round((statsRow.scoreSum / statsRow.total) * 10) / 10 : 0,
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 10);
  }, [enrichedEmployees]);

  const managerOwnershipData = useMemo(() => {
    const managerNameById = new Map(
      enrichedEmployees
        .filter((emp) => String(emp?.role || "").trim().toLowerCase() === "manager")
        .map((mgr) => [String(mgr?.id || "").trim(), String(mgr?.name || "Unknown Manager").trim()])
    );

    const grouped = new Map();
    for (const emp of enrichedEmployees) {
      const roleKey = String(emp?.role || "").trim().toLowerCase();
      if (roleKey === "admin" || roleKey === "manager") continue;
      const managerId = String(emp?.managerId || "").trim() || "UNMAPPED";
      const prev = grouped.get(managerId) || { teamSize: 0, submitted: 0, scoreSum: 0 };
      prev.teamSize += 1;
      prev.scoreSum += Number(emp?.performanceScore || 0);
      if (emp?.submitted) prev.submitted += 1;
      grouped.set(managerId, prev);
    }
    return Array.from(grouped.entries())
      .map(([managerId, row]) => ({
        managerId,
        managerName: managerId === "UNMAPPED" ? "Unmapped Manager" : (managerNameById.get(managerId) || managerId),
        teamSize: row.teamSize,
        submitted: row.submitted,
        pending: Math.max(0, row.teamSize - row.submitted),
        avgScore: row.teamSize ? Math.round((row.scoreSum / row.teamSize) * 10) / 10 : 0,
      }))
      .sort((a, b) => {
        if (b.teamSize !== a.teamSize) return b.teamSize - a.teamSize;
        return b.avgScore - a.avgScore;
      })
      .slice(0, 10);
  }, [enrichedEmployees]);

  const topPerformers = useMemo(() => {
    return enrichedEmployees
      .filter((emp) => String(emp?.role || "").trim().toLowerCase() !== "admin")
      .sort((a, b) => {
        if (b.performanceScore !== a.performanceScore) return b.performanceScore - a.performanceScore;
        if (b.recognitions !== a.recognitions) return b.recognitions - a.recognitions;
        return b.certCount - a.certCount;
      })
      .slice(0, 6);
  }, [enrichedEmployees]);

  const departmentGranularityRows = useMemo(() => {
    const rows = [];
    const managersById = new Map(
      enrichedEmployees
        .filter((emp) => String(emp?.role || "").trim().toLowerCase() === "manager")
        .map((mgr) => [String(mgr?.id || "").trim(), mgr])
    );
    const grouped = new Map();
    for (const emp of enrichedEmployees) {
      const dept = getDepartmentLabel(emp);
      const prev = grouped.get(dept) || { employees: [], managerIds: new Set(), scoreSum: 0 };
      prev.employees.push(emp);
      prev.scoreSum += Number(emp?.performanceScore || 0);
      if (emp?.managerId) prev.managerIds.add(String(emp.managerId).trim());
      grouped.set(dept, prev);
    }

    for (const [department, row] of grouped.entries()) {
      const headcount = row.employees.length;
      const managerIds = Array.from(row.managerIds).filter(Boolean);
      const managerCount = managerIds.length;
      const avgScore = headcount ? Math.round((row.scoreSum / headcount) * 10) / 10 : 0;
      const submitted = row.employees.filter((emp) => emp?.submitted).length;
      const submissionRate = headcount ? Math.round((submitted / headcount) * 100) : 0;
      const topEmployee = row.employees
        .slice()
        .sort((a, b) => Number(b.performanceScore || 0) - Number(a.performanceScore || 0))[0];
      const topManager = managerIds
        .map((id) => managersById.get(id))
        .filter(Boolean)
        .sort((a, b) => Number(b.performanceScore || 0) - Number(a.performanceScore || 0))[0];

      rows.push({
        department,
        headcount,
        managerCount,
        submissionRate,
        avgScore,
        topEmployeeName: String(topEmployee?.name || "—"),
        topManagerName: String(topManager?.name || (managerIds[0] || "—")),
      });
    }

    return rows.sort((a, b) => b.avgScore - a.avgScore);
  }, [enrichedEmployees]);

  const intelligenceHighlights = useMemo(() => {
    const bestDepartment = departmentPerformanceData[0] || null;
    const bestBand = bandPerformanceData[0] || null;
    const strongestManager = managerOwnershipData
      .slice()
      .sort((a, b) => {
        if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
        return b.submitted - a.submitted;
      })[0] || null;
    const topPerformer = topPerformers[0] || null;
    return {
      bestDepartment,
      bestBand,
      strongestManager,
      topPerformer,
    };
  }, [bandPerformanceData, departmentPerformanceData, managerOwnershipData, topPerformers]);

  async function promoteEmployee(employeeId) {
    const emp = employees.find((e) => e.id === employeeId);
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

  return (
    <div className="space-y-10 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h2 className="rt-title">
            Operational Command
          </h2>
          <div className="mt-2 flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${portalIsOpenNow ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
            <span className="rt-kicker">
              Portal is {portalIsOpenNow ? "OPEN" : "CLOSED"} for employees
            </span>
          </div>
        </div>

        <button
          onClick={onGenerateReport}
          className="rt-btn-ghost inline-flex items-center gap-2 text-xs uppercase tracking-widest"
        >
          <Download size={18} /> Generate report
        </button>
      </header>

	      
        <section className="rt-panel p-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
	          <div className="flex items-center gap-3">
              <Calendar className="text-[rgb(var(--text))]" size={22} />
	            <div>
                <h3 className="font-black tracking-tight">Submission Window</h3>
                <p className="text-slate-500 text-sm mt-1">
	                Set when employees can access the portal.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Power className={`${portalIsOpenNow ? "text-emerald-400" : "text-red-400"}`} size={18} />
            <span className="text-xs font-black uppercase tracking-widest text-slate-500">
              Active now: {portalIsOpenNow ? "Yes" : "No"}
            </span>
          </div>
        </div>

	        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
	          <div className="space-y-2">
              <label className="rt-kicker">
	              Open at
            </label>
            <div className="relative">
                <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" size={18} />
	              <input
	                type="datetime-local"
	                value={portalWindow.start}
	                onChange={(e) =>
	                  setPortalWindow((prev) => ({
	                    ...prev,
	                    start: e.target.value,
	                    meta: { ...(prev.meta ?? {}), lastAction: "manual", updatedAt: Date.now() },
	                  }))
	                }
                  className="w-full rt-input py-4 pl-12 pr-4 text-sm"
	              />
            </div>
          </div>

	          <div className="space-y-2">
              <label className="rt-kicker">
	              Close at (optional)
	            </label>
	            <div className="relative">
                <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" size={18} />
		              <input
		                type="datetime-local"
		                value={portalWindow.end}
		                onChange={(e) =>
		                  setPortalWindow((prev) => ({
		                    ...prev,
		                    end: e.target.value,
		                    meta: { ...(prev.meta ?? {}), lastAction: "manual", updatedAt: Date.now() },
		                  }))
		                }
                    className="w-full rt-input py-4 pl-12 pr-4 text-sm"
		                placeholder="Leave blank to keep open"
		              />
	            </div>
	          </div>

			          <div className="flex items-end">
			            <div className="w-full space-y-4">
			              <button
			                onClick={() => {
			                  if (portalWindowBusy || portalWindowLoading) return;
			                  setPortalWindowBusy(true);
			                  (async () => {
			                    try {
			                      const res = portalIsOpenNow
			                        ? await closeSubmissionWindowNow()
			                        : await openSubmissionWindowNow();
			                      setPortalWindow(portalWindowFromServer(res));
			                      showToast({
			                        title: portalIsOpenNow ? "Window stopped" : "Window started",
			                        message: portalIsOpenNow
			                          ? "Submission window is now closed."
			                          : "Submission window is now open.",
			                      });
			                    } catch (err) {
			                      showToast({
			                        title: "Window update failed",
			                        message: err?.message || "Please try again.",
			                      });
			                    } finally {
			                      setPortalWindowBusy(false);
			                    }
			                  })();
			                }}
			                className={[
			                  "w-full px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all grid place-items-center",
			                  portalIsOpenNow
			                    ? "bg-red-500/10 text-red-700 dark:text-red-200 hover:bg-red-500 hover:text-white shadow-xl shadow-red-900/20 border border-red-500/20"
			                    : "bg-emerald-500 text-white hover:bg-emerald-400 shadow-xl shadow-emerald-900/20",
			                ].join(" ")}
			                disabled={portalWindowBusy || portalWindowLoading}
			                title={portalIsOpenNow ? "Stop window" : "Start window"}
			                aria-label={portalIsOpenNow ? "Stop window" : "Start window"}
			              >
			                {portalIsOpenNow ? (
			                  <span className="inline-flex items-center justify-center gap-2">
			                    <Square size={18} /> Stop the window
			                  </span>
			                ) : (
			                  <span className="inline-flex items-center justify-center gap-2">
			                    <Play size={18} /> Start window
			                  </span>
			                )}
			              </button>

			              <button
			                onClick={() => {
			                  const start = parseLocalInputValue(portalWindow.start);
			                  const end = parseLocalInputValue(portalWindow.end);

		                  if (!start || !end) {
		                    showToast({ title: "Invalid schedule", message: "Pick a valid Open at and Close at." });
		                    return;
		                  }
		                  if (end <= start) {
		                    showToast({ title: "Invalid schedule", message: "Close at must be after Open at." });
		                    return;
		                  }
		                  if (end <= now) {
		                    showToast({ title: "Invalid schedule", message: "Close at must be in the future." });
		                    return;
		                  }
		                  if (portalWindowBusy || portalWindowLoading) return;
		                  setPortalWindowBusy(true);
		                  (async () => {
		                    try {
		                      const res = await scheduleSubmissionWindow({
		                        startAt: new Date(portalWindow.start).toISOString(),
		                        endAt: new Date(portalWindow.end).toISOString(),
		                      });
		                      setPortalWindow(portalWindowFromServer(res));
		                      showToast({
		                        title: "Window scheduled",
		                        message: "Submission window schedule updated.",
		                      });
		                    } catch (err) {
		                      showToast({
		                        title: "Schedule failed",
		                        message: err?.message || "Please try again.",
		                      });
		                    } finally {
		                      setPortalWindowBusy(false);
		                    }
		                  })();
			                }}
                    className="w-full rt-btn-primary px-8 py-4 font-black text-xs uppercase tracking-widest"
		                title="Validate and run this schedule"
		                disabled={portalWindowBusy || portalWindowLoading}
		              >
		                Schedule
		              </button>
		              {portalWindowError ? (
		                <div className="text-xs text-red-700 dark:text-red-200/90">
		                  Failed to sync window: {portalWindowError}
		                  {typeof reloadPortalWindow === "function" ? (
		                    <button
		                      type="button"
		                      onClick={() => reloadPortalWindow?.().catch(() => {})}
		                      className="ml-2 underline text-red-700 dark:text-red-200 hover:text-white"
		                    >
		                      Retry
		                    </button>
		                  ) : null}
		                </div>
		              ) : null}
		            </div>
		          </div>
		        </div>
		      </section>

      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Total Employees" value={stats.totalEmployees} icon={<Users className="text-purple-400" />} />
        <StatCard label="Employees Submitted" value={`${stats.employeesSubmitted}/${stats.totalEmployees}`} icon={<Users className="text-emerald-400" />} />
        <StatCard label="Managers Submitted" value={`${stats.managersSubmitted}/${stats.totalManagers}`} icon={<Users className="text-blue-400" />} />
        <StatCard label="Avg Ability (6 months)" value={stats.avg6m} icon={<ArrowUpCircle className="text-fuchsia-400" />} />
      </div>

      <section className="rt-panel p-8">
        <div className="rt-section-header">
          <h3 className="rt-section-title">Admin Insights</h3>
          <p className="rt-section-subtitle">Submission health and pending workload at a glance.</p>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rt-panel-subtle p-5">
            <div className="rt-kicker">Employee Submission Rate</div>
            <div className="mt-2 text-2xl font-black text-[rgb(var(--text))]">{adminInsights.submissionRate}%</div>
          </div>
          <div className="rt-panel-subtle p-5">
            <div className="rt-kicker">Manager Submission Rate</div>
            <div className="mt-2 text-2xl font-black text-[rgb(var(--text))]">{adminInsights.managerSubmissionRate}%</div>
          </div>
          <div className="rt-panel-subtle p-5">
            <div className="rt-kicker">Pending Employees</div>
            <div className="mt-2 text-2xl font-black text-[rgb(var(--text))]">{adminInsights.pendingCount}</div>
          </div>
        </div>

        <div className="mt-6">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Pending Preview</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {adminInsights.pendingPreview.length ? (
              adminInsights.pendingPreview.map((emp) => (
                <span
                  key={emp.id}
                  className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-1.5 text-xs text-[rgb(var(--text))]"
                >
                  <span className="font-semibold">{emp.name}</span>
                  <span className="font-mono text-slate-500">{emp.id}</span>
                </span>
              ))
            ) : (
              <div className="text-sm text-emerald-500">No pending employees. Great work.</div>
            )}
          </div>
        </div>
      </section>

      
      <section className="rt-panel p-8">
        <div className="mb-6 rt-section-header">
          <h3 className="rt-section-title">Average Ability Trend (6 months)</h3>
          <p className="rt-section-subtitle">
            Includes department/project bell-curve and intervention view for reporting.
          </p>
        </div>

        <div className="w-full">
          <ResponsiveContainer width="100%" height={288}>
            <LineChart data={ability6m} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(91,120,160,0.25)" vertical={false} />
              <XAxis dataKey="month" stroke="rgb(91,120,160)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="rgb(91,120,160)" fontSize={12} tickLine={false} axisLine={false} domain={[0, 5]} />
              <Tooltip
                contentStyle={{ backgroundColor: "rgba(255,255,255,0.97)", border: "1px solid rgba(124,146,178,0.45)", borderRadius: "12px" }}
                labelStyle={{ color: "rgb(16,35,61)", fontWeight: 700 }}
                itemStyle={{ color: "rgb(17,88,181)" }}
                cursor={{ stroke: "rgba(60,96,144,0.35)" }}
              />
              <Line
                type="monotone"
                dataKey="avg"
                stroke="#155dbe"
                strokeWidth={3}
                dot={{ r: 4, strokeWidth: 2, fill: "#ffffff" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-8 grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rt-panel-subtle p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Department Breakdown</div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Bell Curve + Intervention</div>
            </div>
            <div className="mt-4 space-y-3">
              {departmentBreakdown.slice(0, 6).map((row) => (
                <div key={`dep-${row.group}`} className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-[rgb(var(--text))] truncate">{row.group}</div>
                    <span className={["text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border", row.bell.className].join(" ")}>{row.bell.label}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                    <span className="font-mono text-[rgb(var(--text))]">Avg {row.latestAvg.toFixed(1)}</span>
                    <span className="font-mono">Δ {formatDelta(row.delta)}</span>
                    <span>Headcount {row.headcount}</span>
                    <span>Submitted {Math.round(row.submissionRate * 100)}%</span>
                    <span className={row.needsIntervention ? "text-amber-800 dark:text-amber-300 font-semibold" : "text-emerald-700 dark:text-emerald-300 font-semibold"}>
                      {row.needsIntervention ? "Intervention Needed" : "Stable"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rt-panel-subtle p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Project Breakdown</div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Bell Curve + Intervention</div>
            </div>
            <div className="mt-4 space-y-3">
              {projectBreakdown.slice(0, 6).map((row) => (
                <div key={`proj-${row.group}`} className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-[rgb(var(--text))] truncate">{row.group}</div>
                    <span className={["text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border", row.bell.className].join(" ")}>{row.bell.label}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                    <span className="font-mono text-[rgb(var(--text))]">Avg {row.latestAvg.toFixed(1)}</span>
                    <span className="font-mono">Δ {formatDelta(row.delta)}</span>
                    <span>Headcount {row.headcount}</span>
                    <span>Submitted {Math.round(row.submissionRate * 100)}%</span>
                    <span className={row.needsIntervention ? "text-amber-800 dark:text-amber-300 font-semibold" : "text-emerald-700 dark:text-emerald-300 font-semibold"}>
                      {row.needsIntervention ? "Intervention Needed" : "Stable"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rt-panel p-8">
        <div className="rt-section-header">
          <h3 className="rt-section-title">Granular Delivery Analytics</h3>
          <p className="rt-section-subtitle">Role throughput, band load profile, and cycle submission mix.</p>
        </div>

        <div className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="rt-panel-subtle p-5">
            <div className="rt-kicker">Role Throughput</div>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={roleThroughputData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(91,120,160,0.2)" vertical={false} />
                  <XAxis dataKey="role" stroke="rgb(91,120,160)" tickLine={false} axisLine={false} />
                  <YAxis stroke="rgb(91,120,160)" tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "rgba(255,255,255,0.97)", border: "1px solid rgba(124,146,178,0.45)", borderRadius: "12px" }}
                    labelStyle={{ color: "rgb(16,35,61)", fontWeight: 700 }}
                  />
                  <Legend />
                  <Bar dataKey="submitted" stackId="a" name="Submitted" fill="#1d4ed8" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="pending" stackId="a" name="Pending" fill="#f59e0b" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rt-panel-subtle p-5">
            <div className="rt-kicker">Band Distribution</div>
            <div className="mt-4 space-y-3">
              {bandDistributionData.length ? (
                bandDistributionData.map((row) => (
                  <div key={`band:${row.band}`} className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-semibold text-[rgb(var(--text))]">{row.band}</span>
                      <span className="font-mono text-[rgb(var(--muted))]">{row.total}</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-[rgb(var(--surface-3))] overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${row.submittedRate}%` }} />
                    </div>
                    <div className="mt-2 text-[11px] text-[rgb(var(--muted))]">
                      Submitted: <span className="font-mono">{row.submittedRate}%</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-[rgb(var(--muted))]">No band distribution data yet.</div>
              )}
            </div>
          </div>

          <div className="rt-panel-subtle p-5">
            <div className="rt-kicker">Cycle Health Mix</div>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={cycleHealthPieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={56}
                    outerRadius={92}
                    paddingAngle={2}
                  >
                    {cycleHealthPieData.map((entry) => (
                      <Cell key={`health:${entry.name}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "rgba(255,255,255,0.97)", border: "1px solid rgba(124,146,178,0.45)", borderRadius: "12px" }}
                    labelStyle={{ color: "rgb(16,35,61)", fontWeight: 700 }}
                  />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      <section className="rt-panel p-8">
        <div className="rt-section-header">
          <h3 className="rt-section-title">Department, Band, Manager Performance Intelligence</h3>
          <p className="rt-section-subtitle">Full granulation for department performance, band strength, manager ownership, and top performers.</p>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rt-panel-subtle p-4">
            <div className="rt-kicker">Best Department</div>
            <div className="mt-2 font-semibold text-[rgb(var(--text))]">
              {intelligenceHighlights.bestDepartment?.department || "—"}
            </div>
            <div className="mt-1 text-xs text-[rgb(var(--muted))]">
              Score {Number(intelligenceHighlights.bestDepartment?.avgScore || 0).toFixed(1)} • Submission {intelligenceHighlights.bestDepartment?.submissionRate || 0}%
            </div>
          </div>
          <div className="rt-panel-subtle p-4">
            <div className="rt-kicker">Strongest Band</div>
            <div className="mt-2 font-semibold text-[rgb(var(--text))]">
              {intelligenceHighlights.bestBand?.band || "—"}
            </div>
            <div className="mt-1 text-xs text-[rgb(var(--muted))]">
              Score {Number(intelligenceHighlights.bestBand?.avgScore || 0).toFixed(1)} • Submission {intelligenceHighlights.bestBand?.submissionRate || 0}%
            </div>
          </div>
          <div className="rt-panel-subtle p-4">
            <div className="rt-kicker">Strongest Manager Team</div>
            <div className="mt-2 font-semibold text-[rgb(var(--text))]">
              {intelligenceHighlights.strongestManager?.managerName || "—"}
            </div>
            <div className="mt-1 text-xs text-[rgb(var(--muted))]">
              Team {intelligenceHighlights.strongestManager?.teamSize || 0} • Avg {Number(intelligenceHighlights.strongestManager?.avgScore || 0).toFixed(1)}
            </div>
          </div>
          <div className="rt-panel-subtle p-4">
            <div className="rt-kicker">Highest Performer</div>
            <div className="mt-2 font-semibold text-[rgb(var(--text))]">
              {intelligenceHighlights.topPerformer?.name || "—"}
            </div>
            <div className="mt-1 text-xs text-[rgb(var(--muted))]">
              Score {Number(intelligenceHighlights.topPerformer?.performanceScore || 0).toFixed(1)} • {intelligenceHighlights.topPerformer?.band || "—"}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rt-panel-subtle p-5">
            <div className="rt-kicker">Department Performance</div>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departmentPerformanceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(91,120,160,0.2)" vertical={false} />
                  <XAxis dataKey="department" stroke="rgb(91,120,160)" tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" domain={[0, 5]} stroke="rgb(91,120,160)" tickLine={false} axisLine={false} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke="rgb(91,120,160)" tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "rgba(255,255,255,0.97)", border: "1px solid rgba(124,146,178,0.45)", borderRadius: "12px" }}
                    labelStyle={{ color: "rgb(16,35,61)", fontWeight: 700 }}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="avgScore" name="Avg Score" fill="#2563eb" radius={[8, 8, 0, 0]} />
                  <Bar yAxisId="right" dataKey="submissionRate" name="Submission %" fill="#0f766e" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rt-panel-subtle p-5">
            <div className="rt-kicker">Band Performance</div>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bandPerformanceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(91,120,160,0.2)" vertical={false} />
                  <XAxis dataKey="band" stroke="rgb(91,120,160)" tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" domain={[0, 5]} stroke="rgb(91,120,160)" tickLine={false} axisLine={false} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke="rgb(91,120,160)" tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "rgba(255,255,255,0.97)", border: "1px solid rgba(124,146,178,0.45)", borderRadius: "12px" }}
                    labelStyle={{ color: "rgb(16,35,61)", fontWeight: 700 }}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="avgScore" name="Avg Score" fill="#7c3aed" radius={[8, 8, 0, 0]} />
                  <Bar yAxisId="right" dataKey="submissionRate" name="Submission %" fill="#f59e0b" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rt-panel-subtle p-5">
            <div className="rt-kicker">Manager Team Ownership</div>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={managerOwnershipData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(91,120,160,0.2)" vertical={false} />
                  <XAxis dataKey="managerName" stroke="rgb(91,120,160)" tickLine={false} axisLine={false} />
                  <YAxis stroke="rgb(91,120,160)" tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "rgba(255,255,255,0.97)", border: "1px solid rgba(124,146,178,0.45)", borderRadius: "12px" }}
                    labelStyle={{ color: "rgb(16,35,61)", fontWeight: 700 }}
                  />
                  <Legend />
                  <Bar dataKey="submitted" stackId="a" name="Submitted" fill="#15803d" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="pending" stackId="a" name="Pending" fill="#ea580c" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rt-panel-subtle p-5">
            <div className="rt-kicker">Highest Performers</div>
            <div className="mt-4 space-y-3">
              {topPerformers.length ? (
                topPerformers.map((emp, idx) => (
                  <div key={`top:${emp.id}`} className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-black uppercase tracking-widest text-[rgb(var(--muted))]">
                          Rank #{idx + 1}
                        </div>
                        <div className="mt-1 font-semibold text-[rgb(var(--text))]">{emp.name}</div>
                        <div className="text-[11px] text-[rgb(var(--muted))]">
                          {getDepartmentLabel(emp)} • {String(emp?.band || "—")}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg rt-stat-value">{Number(emp?.performanceScore || 0).toFixed(1)}</div>
                        <div className="text-[11px] text-[rgb(var(--muted))]">
                          Rec {emp.recognitions} • Cert {emp.certCount}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-[rgb(var(--muted))]">No performance ranking data yet.</div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 rt-panel-subtle p-5">
          <div className="rt-kicker">Department Granularity</div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-[10px] uppercase tracking-[0.2em] text-[rgb(var(--muted))]">
                <tr>
                  <th className="py-2 pr-3">Department</th>
                  <th className="py-2 pr-3">Employees</th>
                  <th className="py-2 pr-3">Managers</th>
                  <th className="py-2 pr-3">Avg Score</th>
                  <th className="py-2 pr-3">Submission %</th>
                  <th className="py-2 pr-3">Top Employee</th>
                  <th className="py-2">Top Manager</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--border))] text-sm">
                {departmentGranularityRows.map((row) => (
                  <tr key={`dept-row:${row.department}`}>
                    <td className="py-3 pr-3 font-semibold text-[rgb(var(--text))]">{row.department}</td>
                    <td className="py-3 pr-3 font-mono text-[rgb(var(--muted))]">{row.headcount}</td>
                    <td className="py-3 pr-3 font-mono text-[rgb(var(--muted))]">{row.managerCount}</td>
                    <td className="py-3 pr-3 font-mono text-[rgb(var(--text))]">{row.avgScore.toFixed(1)}</td>
                    <td className="py-3 pr-3 font-mono text-[rgb(var(--muted))]">{row.submissionRate}%</td>
                    <td className="py-3 pr-3 text-[rgb(var(--text))]">{row.topEmployeeName}</td>
                    <td className="py-3 text-[rgb(var(--text))]">{row.topManagerName}</td>
                  </tr>
                ))}
                {!departmentGranularityRows.length ? (
                  <tr>
                    <td className="py-6 text-[rgb(var(--muted))]" colSpan={7}>
                      No department granularity data available.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      
      <section className="rt-panel overflow-hidden">
        <div className="p-8">
          <h3 className="rt-section-title">Employee Management</h3>
        </div>

        {employeesError ? (
          <div className="px-8 pb-6">
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-200">
              Failed to load employees: <span className="font-mono">{employeesError}</span>
            </div>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-[0.2em] text-slate-500 border-t border-b border-[rgb(var(--border))]">
              <tr>
                <th className="p-6 font-black">Employee</th>
                <th className="p-6 font-black">Role</th>
                <th className="p-6 font-black">Band</th>
                <th className="p-6 font-black">Submitted</th>
                <th className="p-6 text-right font-black px-8">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {employees.map(emp => (
                <tr key={emp.id} className="hover:bg-[rgb(var(--surface-2))] transition-colors">
                  <td className="p-6">
                    <div className="font-bold text-[rgb(var(--text))] tracking-tight">{emp.name}</div>
                    <div className="text-xs text-slate-500 font-mono mt-1">{emp.id}</div>
                  </td>
                  <td className="p-6">
                    <span className="text-[10px] font-black uppercase px-3 py-1 bg-[rgb(var(--surface-2))] text-[rgb(var(--text))] rounded-lg border border-[rgb(var(--border))]">
                      {emp.role}
                    </span>
                  </td>
                  <td className="p-6 font-mono text-blue-400">{emp.band}</td>
                  <td className="p-6">
                    <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-lg border ${
                      emp.submitted
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                        : "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20"
                    }`}>
                      {emp.submitted ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="p-6 text-right px-8">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => promoteEmployee(emp.id)}
                        disabled={employeesLoading || promotingId === emp.id}
                        className="p-2.5 bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white rounded-xl transition-all border border-blue-500/20"
                        title="Promote"
                      >
                        <ArrowUpCircle size={18} />
                      </button>
                      <button
                        onClick={() => {
                          removeEmployee(emp.id).catch(() => {});
                        }}
                        className="p-2.5 bg-red-500/10 text-red-700 dark:text-red-300 hover:bg-red-500 hover:text-white rounded-xl transition-all border border-red-500/20"
                        title="Remove"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
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
