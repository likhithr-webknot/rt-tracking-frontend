// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, History, Loader2, Search } from "lucide-react";
import { fetchAdminAllSubmissions, normalizeMonthlySubmission } from "../../api/monthly-submissions";
import { fetchAvailableProjects, normalizeProjects } from "../../api/projects";
import AdminPageHeader, { AdminPageShell } from "./AdminPageHeader";
import EntityCsvToolbar from "../shared/EntityCsvToolbar";
import Toast from "../shared/Toast";
import {
  averageNumericScores,
  scoreFromMonthlySubmission,
} from "../../utils/employeePerformanceScore";
import { exportRatingsHistoryCsv } from "../../utils/entityCsvExport";
import {
  currentReviewCycleKey,
  formatCycleKeyLabel,
  normalizeYearMonth,
  resolveSubmissionCycleKey,
} from "../../utils/reviewCycles";

function isAbortError(err) {
  return err?.name === "AbortError" || String(err?.message || "").toLowerCase().includes("aborted");
}

function ScoreCell({ value }) {
  if (value == null) return <span className="text-[rgb(var(--muted))]">—</span>;
  return <span className="font-semibold tabular-nums">{Number(value).toFixed(1)}</span>;
}

function monthLabel(raw) {
  const s = normalizeYearMonth(raw);
  if (!s) {
    const text = String(raw ?? "").trim();
    return text ? formatCycleKeyLabel(text) : "Unknown cycle";
  }
  const [y, m] = s.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString(undefined, { month: "short", year: "numeric" });
}

function cycleLabel(raw, submissionMonth) {
  return formatCycleKeyLabel(resolveSubmissionCycleKey({ month: submissionMonth, cycleKey: raw }));
}

function resolveHistoryLookupKeys(sub, item) {
  const raw = sub?.raw && typeof sub.raw === "object" ? sub.raw : item;
  return [
    sub?.empId,
    sub?.employeeId,
    sub?.subjectEmployeeId,
    raw?.empId,
    raw?.userId,
    item?.empId,
    item?.userId,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

function buildEmployeeHistory(submissions) {
  const byEmp = new Map();
  for (const item of Array.isArray(submissions) ? submissions : []) {
    const sub = normalizeMonthlySubmission(item?.submission ?? item) || item;
    const keys = resolveHistoryLookupKeys(sub, item);
    if (!keys.length) continue;
    const month = normalizeYearMonth(sub?.month ?? item?.month) || "";
    const score = scoreFromMonthlySubmission(sub);
    const status = String(sub?.reviewStatus ?? sub?.status ?? "").trim();
    const cycleKey = resolveSubmissionCycleKey({
      month,
      cycleKey: sub?.cycleKey ?? item?.cycleKey,
    });
    const entry = {
      month,
      cycleKey,
      score,
      status,
      projectIds: Array.isArray(sub?.projectIds) ? sub.projectIds : [],
      submittedAt: sub?.submittedAt ?? sub?.employeeSubmittedAt ?? null,
      managerSubmittedAt: sub?.managerSubmittedAt ?? null,
    };
    for (const empKey of keys) {
      const bucket = byEmp.get(empKey) || [];
      const duplicate = bucket.some(
        (row) => row.month === entry.month && row.cycleKey === entry.cycleKey,
      );
      if (!duplicate) bucket.push(entry);
      byEmp.set(empKey, bucket);
    }
  }
  for (const [, rows] of byEmp.entries()) {
    rows.sort((a, b) => String(a.month).localeCompare(String(b.month)));
  }
  return byEmp;
}

export default function RatingsHistoryWorkspace({
  employees: employeesProp = [],
  employeesLoading = false,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submissions, setSubmissions] = useState([]);
  const [historyByEmp, setHistoryByEmp] = useState(new Map());
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const [projectIndex, setProjectIndex] = useState({});
  const [toast, setToast] = useState(null);
  const requestIdRef = useRef(0);

  const employees = Array.isArray(employeesProp) ? employeesProp : [];
  const showToast = useCallback((next) => setToast(next), []);

  const loadSubmissions = useCallback(async ({ signal } = {}) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError("");
    try {
      const subs = await fetchAdminAllSubmissions({ signal });
      if (requestId !== requestIdRef.current || signal?.aborted) return;
      const subsList = Array.isArray(subs) ? subs : [];
      setSubmissions(subsList);
      setHistoryByEmp(buildEmployeeHistory(subsList));
    } catch (err) {
      if (isAbortError(err) || signal?.aborted) return;
      if (requestId !== requestIdRef.current) return;
      setError(err?.message || "Could not load ratings history.");
    } finally {
      if (requestId === requestIdRef.current && !signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadSubmissions({ signal: controller.signal });
    return () => {
      controller.abort();
      requestIdRef.current += 1;
    };
  }, [loadSubmissions]);

  useEffect(() => {
    let cancelled = false;
    fetchAvailableProjects()
      .then((data) => {
        if (cancelled) return;
        const index = {};
        for (const project of normalizeProjects(data)) {
          const id = String(project?.id ?? "").trim();
          if (!id) continue;
          index[id] = String(project?.name ?? project?.projectName ?? id);
        }
        setProjectIndex(index);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const projectLabel = useCallback(
    (projectId) => {
      const id = String(projectId ?? "").trim();
      if (!id) return "—";
      return projectIndex[id] || id;
    },
    [projectIndex],
  );

  const formatProjectList = useCallback(
    (projectIds) => {
      const ids = Array.isArray(projectIds) ? projectIds : [];
      if (!ids.length) return "—";
      return ids.map((id) => projectLabel(id)).join(", ");
    },
    [projectLabel],
  );

  const currentCycleKey = useMemo(() => currentReviewCycleKey(), []);
  const currentCycleLabel = useMemo(() => formatCycleKeyLabel(currentCycleKey), [currentCycleKey]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = employees.map((emp) => {
      const key = String(emp?.id ?? emp?.empId ?? "").trim();
      const altKey = String(emp?.empId ?? "").trim();
      const userKey = String(emp?.userId ?? "").trim();
      const months =
        historyByEmp.get(key) ||
        (altKey ? historyByEmp.get(altKey) : null) ||
        (userKey ? historyByEmp.get(userKey) : null) ||
        [];
      const scores = months.map((m) => m.score).filter((n) => Number.isFinite(n));
      const currentCycleScores = months
        .filter((row) => {
          const ck = row.cycleKey || resolveSubmissionCycleKey({ month: row.month }) || "";
          return ck === currentCycleKey;
        })
        .map((m) => m.score)
        .filter((n) => Number.isFinite(n));
      const cycleAvgs = new Map();
      for (const row of months) {
        const ck = row.cycleKey || resolveSubmissionCycleKey({ month: row.month }) || "unknown";
        const prev = cycleAvgs.get(ck) || [];
        if (row.score != null) prev.push(row.score);
        cycleAvgs.set(ck, prev);
      }
      const cycleSummaries = [...cycleAvgs.entries()].map(([cycle, vals]) => ({
        cycle,
        average: averageNumericScores(vals),
      }));
      return {
        ...emp,
        months,
        allTimeAverage: averageNumericScores(scores),
        currentCycleAverage: averageNumericScores(currentCycleScores),
        cycleSummaries,
      };
    });
    if (q) {
      list = list.filter(
        (e) =>
          e.name?.toLowerCase().includes(q) ||
          e.email?.toLowerCase().includes(q) ||
          String(e.id ?? "").toLowerCase().includes(q) ||
          String(e.empId ?? "").toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => {
      const av = a.allTimeAverage ?? -1;
      const bv = b.allTimeAverage ?? -1;
      if (bv !== av) return bv - av;
      return String(a.name).localeCompare(String(b.name));
    });
  }, [employees, historyByEmp, search, currentCycleKey]);

  function toggleExpanded(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const pageLoading = loading || (employeesLoading && !employees.length);

  return (
    <AdminPageShell>
      <AdminPageHeader
        title="Ratings history"
        subtitle={`Super Admin view — current cycle (${currentCycleLabel}), all-time averages, and full monthly history.`}
      >
        <EntityCsvToolbar
          entityKey="ratings-history"
          disabled={pageLoading}
          importLabel="Import"
          exportLabel="Export"
          showToast={showToast}
          onExport={() => exportRatingsHistoryCsv(employees, submissions)}
          onImportComplete={() => loadSubmissions()}
          confirmImportMessage="Import ratings history from CSV? Rows update existing monthly submissions matched by submission ID or employee + month."
        />
      </AdminPageHeader>

      {error ? (
        <div className="rt-panel border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="rt-panel p-4">
        <label className="relative block max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee…"
            className="rt-input w-full pl-9"
          />
        </label>
      </div>

      <div className="rt-panel overflow-hidden">
        {pageLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-[rgb(var(--muted))]">
            <Loader2 size={18} className="animate-spin" />
            Loading full ratings history…
          </div>
        ) : (
          <div className="divide-y divide-[rgb(var(--border))]">
            {rows.map((emp) => {
              const id = String(emp.id);
              const open = expanded.has(id);
              return (
                <div key={id}>
                  <button
                    type="button"
                    onClick={() => toggleExpanded(id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[rgb(var(--surface-2))]/70 transition-colors"
                  >
                    {open ? (
                      <ChevronDown size={18} className="shrink-0 text-[rgb(var(--muted))]" />
                    ) : (
                      <ChevronRight size={18} className="shrink-0 text-[rgb(var(--muted))]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[rgb(var(--text))] truncate">{emp.name}</div>
                      <div className="text-xs text-[rgb(var(--muted))] truncate">
                        {emp.empId || emp.id} · {emp.email}
                      </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-6 text-sm shrink-0">
                      <div className="text-center min-w-[4.5rem]">
                        <div className="text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">Current cycle</div>
                        <ScoreCell value={emp.currentCycleAverage} />
                      </div>
                      <div className="text-center min-w-[3.5rem]">
                        <div className="text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">All-time</div>
                        <ScoreCell value={emp.allTimeAverage} />
                      </div>
                    </div>
                  </button>
                  {open ? (
                    <div className="px-4 pb-4 pl-11 space-y-4">
                      {emp.cycleSummaries.length ? (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))] mb-2">
                            Per-cycle averages
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {emp.cycleSummaries.map((c) => (
                              <span
                                key={c.cycle}
                                className="inline-flex items-center gap-2 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-1 text-xs"
                              >
                                <span>{formatCycleKeyLabel(c.cycle)}</span>
                                <ScoreCell value={c.average} />
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full min-w-[680px] text-sm">
                          <thead className="text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">
                            <tr>
                              <th className="py-2 pr-4 text-left font-semibold">Month</th>
                              <th className="py-2 pr-4 text-left font-semibold">Review cycle</th>
                              <th className="py-2 pr-4 text-left font-semibold">Projects</th>
                              <th className="py-2 pr-4 text-left font-semibold">Status</th>
                              <th className="py-2 text-right font-semibold">Score</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[rgb(var(--border))]">
                            {emp.months.length ? (
                              emp.months.map((m, idx) => (
                                <tr key={`${m.month}-${m.cycleKey}-${idx}`}>
                                  <td className="py-2 pr-4">{monthLabel(m.month)}</td>
                                  <td className="py-2 pr-4 text-[rgb(var(--muted))]">
                                    {cycleLabel(m.cycleKey, m.month)}
                                  </td>
                                  <td className="py-2 pr-4 text-[rgb(var(--muted))] max-w-[16rem]">
                                    <span className="line-clamp-2">{formatProjectList(m.projectIds)}</span>
                                  </td>
                                  <td className="py-2 pr-4 text-[rgb(var(--muted))]">{m.status || "—"}</td>
                                  <td className="py-2 text-right">
                                    <ScoreCell value={m.score} />
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={5} className="py-4 text-[rgb(var(--muted))]">
                                  No scored monthly reviews yet.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {!rows.length ? (
              <div className="py-16 text-center text-sm text-[rgb(var(--muted))]">No employees found.</div>
            ) : null}
          </div>
        )}
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </AdminPageShell>
  );
}
