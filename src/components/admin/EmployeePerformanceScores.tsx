// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { BarChart3, Loader2, Search, TrendingUp } from "lucide-react";
import { fetchEmployees, normalizeEmployees } from "../../api/employees";
import { fetchAdminAllSubmissions, normalizeMonthlySubmission } from "../../api/monthly-submissions";
import AdminPageHeader, { AdminPageShell } from "./AdminPageHeader";
import {
  buildSubmissionScoreIndex,
  computeEmployeePerformanceScore,
} from "../../utils/employeePerformanceScore";

function ScorePill({ score }) {
  if (score == null) {
    return <span className="text-sm text-[rgb(var(--muted))]">—</span>;
  }
  const n = Number(score);
  const tone =
    n >= 4.2
      ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/25"
      : n >= 3.3
        ? "bg-blue-500/15 text-blue-800 dark:text-blue-200 border-blue-500/25"
        : "bg-amber-500/15 text-amber-900 dark:text-amber-100 border-amber-500/25";
  return (
    <span className={`inline-flex min-w-[2.75rem] justify-center rounded-full border px-2.5 py-0.5 text-sm font-semibold tabular-nums ${tone}`}>
      {n.toFixed(1)}
    </span>
  );
}

function statusLabel(status) {
  const st = String(status ?? "").trim().toUpperCase();
  if (!st || st === "ACTIVE") return null;
  return st.replace(/_/g, " ");
}

export default function EmployeePerformanceScores() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [employees, setEmployees] = useState([]);
  const [submissionIndex, setSubmissionIndex] = useState(new Map());
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("avgDesc");

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [empRes, subs] = await Promise.all([
          fetchEmployees({ limit: 2000, cursor: 0, signal: controller.signal }),
          fetchAdminAllSubmissions({ signal: controller.signal }),
        ]);
        if (!mounted) return;
        const normalizedSubs = (Array.isArray(subs) ? subs : []).map((row) => {
          const sub = normalizeMonthlySubmission(row?.submission ?? row);
          return sub ? { ...row, submission: sub, ...sub } : row;
        });
        setEmployees(normalizeEmployees(empRes));
        setSubmissionIndex(buildSubmissionScoreIndex(normalizedSubs));
      } catch (err) {
        if (!mounted) return;
        setError(err?.message || "Could not load performance data.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  const rows = useMemo(() => {
    const list = Array.isArray(employees) ? employees : [];
    return list.map((emp) => {
      const key = String(emp?.id ?? emp?.empId ?? "").trim();
      const hist = submissionIndex.get(key) || submissionIndex.get(String(emp?.empId ?? "")) || null;
      const latestExtras = hist
        ? {
            managerKpiRatings: null,
            managerWebknotValueRatings: null,
            recognitions: emp?.recognitions,
            certifications: emp?.certifications,
            submissionAbility: hist.latestScore ?? emp?.submissionAbility,
            abilityScore: hist.latestScore ?? emp?.abilityScore,
          }
        : emp;
      const profileScore = computeEmployeePerformanceScore(latestExtras);
      return {
        ...emp,
        reviewCount: hist?.reviewCount ?? 0,
        allTimeAverage: hist?.averageScore ?? null,
        latestCycleScore: hist?.latestScore ?? profileScore,
        profileScore,
      };
    });
  }, [employees, submissionIndex]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter(
        (e) =>
          e.name?.toLowerCase().includes(q) ||
          e.email?.toLowerCase().includes(q) ||
          String(e.id ?? "").toLowerCase().includes(q) ||
          String(e.empId ?? "").toLowerCase().includes(q),
      );
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortKey === "name") return String(a.name).localeCompare(String(b.name));
      if (sortKey === "avgAsc") {
        return (a.allTimeAverage ?? -1) - (b.allTimeAverage ?? -1);
      }
      const av = a.allTimeAverage ?? -1;
      const bv = b.allTimeAverage ?? -1;
      if (bv !== av) return bv - av;
      return String(a.name).localeCompare(String(b.name));
    });
    return sorted;
  }, [rows, search, sortKey]);

  const summary = useMemo(() => {
    const scored = rows.filter((r) => r.allTimeAverage != null);
    const orgAvg =
      scored.length > 0
        ? Math.round((scored.reduce((s, r) => s + r.allTimeAverage, 0) / scored.length) * 10) / 10
        : null;
    return {
      total: rows.length,
      withReviews: scored.length,
      orgAverage: orgAvg,
    };
  }, [rows]);

  return (
    <AdminPageShell>
      <AdminPageHeader
        icon={BarChart3}
        title="Performance scores"
        subtitle="All-time average across monthly reviews with manager ratings (1–5 scale)."
      />

      {error ? (
        <div className="rt-panel border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rt-panel p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--muted))]">Employees</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{summary.total}</p>
        </div>
        <div className="rt-panel p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--muted))]">With review scores</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{summary.withReviews}</p>
        </div>
        <div className="rt-panel p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--muted))]">Org average</p>
          <p className="mt-1 text-2xl font-bold tabular-nums flex items-center gap-2">
            <TrendingUp size={20} className="text-[rgb(var(--primary))]" />
            {summary.orgAverage != null ? summary.orgAverage.toFixed(1) : "—"}
          </p>
        </div>
      </div>

      <div className="rt-panel p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, or emp ID…"
            className="rt-input w-full pl-9"
          />
        </label>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="rt-input w-full sm:w-48">
          <option value="avgDesc">Highest average first</option>
          <option value="avgAsc">Lowest average first</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      <div className="rt-panel overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-[rgb(var(--muted))]">
            <Loader2 size={18} className="animate-spin" />
            Loading performance data…
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-[rgb(var(--muted))] border-b border-[rgb(var(--border))]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Employee</th>
                  <th className="px-4 py-3 font-semibold">Emp ID</th>
                  <th className="px-4 py-3 font-semibold">Department</th>
                  <th className="px-4 py-3 font-semibold text-center">Reviews</th>
                  <th className="px-4 py-3 font-semibold text-center">Latest cycle</th>
                  <th className="px-4 py-3 font-semibold text-center">All-time avg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--border))]">
                {filtered.map((emp) => {
                  const st = statusLabel(emp.status);
                  return (
                    <tr key={String(emp.id)} className="hover:bg-[rgb(var(--surface-2))]/60">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[rgb(var(--text))]">{emp.name}</div>
                        <div className="text-xs text-[rgb(var(--muted))] truncate max-w-[14rem]">{emp.email}</div>
                        {st ? (
                          <span className="mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100">
                            {st}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums">{emp.empId || emp.id}</td>
                      <td className="px-4 py-3 text-[rgb(var(--muted))]">{emp.stream || "—"}</td>
                      <td className="px-4 py-3 text-center tabular-nums">{emp.reviewCount}</td>
                      <td className="px-4 py-3 text-center">
                        <ScorePill score={emp.latestCycleScore} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ScorePill score={emp.allTimeAverage} />
                      </td>
                    </tr>
                  );
                })}
                {!filtered.length ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-[rgb(var(--muted))]">
                      No employees match your search.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-[rgb(var(--muted))] max-w-3xl">
        All-time average is the mean of weighted scores from every monthly submission that has manager KPI or value
        ratings. Employees without completed manager reviews show — until data exists.
      </p>
    </AdminPageShell>
  );
}
