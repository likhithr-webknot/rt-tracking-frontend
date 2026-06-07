// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { History, Loader2 } from "lucide-react";
import {
  fetchMyMonthlySubmissionHistory,
  normalizeMonthlySubmission,
} from "../../api/monthly-submissions";
import {
  averageNumericScores,
  scoreFromMonthlySubmission,
} from "../../utils/employeePerformanceScore";
import { averageRatings } from "../../utils/submissionScoring";
import { formatCycleKeyLabel, normalizeYearMonth } from "../../utils/reviewCycles";

function isAbortError(err) {
  return err?.name === "AbortError" || String(err?.message || "").toLowerCase().includes("aborted");
}

function ScoreCell({ value }) {
  if (value == null || !Number.isFinite(Number(value))) {
    return <span className="text-[rgb(var(--muted))]">—</span>;
  }
  return <span className="font-semibold tabular-nums text-[rgb(var(--text))]">{Number(value).toFixed(1)}</span>;
}

function monthHeadline(raw) {
  const key = normalizeYearMonth(raw);
  if (!key) return String(raw || "—");
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(d);
  } catch {
    return key;
  }
}

function buildPerformanceViews(submissions) {
  const rows = [];
  for (const item of Array.isArray(submissions) ? submissions : []) {
    const sub = normalizeMonthlySubmission(item);
    if (!sub?.month) continue;
    const selfKpi = averageRatings(sub.kpiRatings);
    const selfValues = averageRatings(sub.webknotValueRatings);
    const managerScore = scoreFromMonthlySubmission(sub);
    rows.push({
      id: sub.id || `${sub.month}-${rows.length}`,
      month: normalizeYearMonth(sub.month),
      cycleKey: sub.cycleKey || null,
      cycleLabel: sub.cycleLabel || formatCycleKeyLabel(sub.cycleKey || sub.month),
      selfKpi,
      selfValues,
      managerScore,
      status: String(sub.reviewStatus ?? sub.status ?? "").trim() || "—",
      submittedAt: sub.submittedAt || null,
    });
  }
  rows.sort((a, b) => String(b.month).localeCompare(String(a.month)));

  const byCycle = new Map();
  for (const row of rows) {
    const key = row.cycleKey || row.cycleLabel || "unknown";
    const bucket =
      byCycle.get(key) ||
      {
        cycleKey: key,
        cycleLabel: row.cycleLabel || formatCycleKeyLabel(key),
        months: [],
        managerScores: [],
        selfKpiScores: [],
      };
    bucket.months.push(row);
    if (row.managerScore != null) bucket.managerScores.push(row.managerScore);
    if (row.selfKpi != null) bucket.selfKpiScores.push(row.selfKpi);
    byCycle.set(key, bucket);
  }

  const cycles = Array.from(byCycle.values())
    .map((cycle) => ({
      ...cycle,
      avgManager: averageNumericScores(cycle.managerScores),
      avgSelfKpi: averageNumericScores(cycle.selfKpiScores),
      monthCount: cycle.months.length,
    }))
    .sort((a, b) => String(b.cycleKey).localeCompare(String(a.cycleKey)));

  const managerScores = rows.map((row) => row.managerScore).filter((n) => n != null);
  const selfKpiScores = rows.map((row) => row.selfKpi).filter((n) => n != null);

  return {
    rows,
    cycles,
    allTimeManagerAvg: averageNumericScores(managerScores),
    allTimeSelfKpiAvg: averageNumericScores(selfKpiScores),
    reviewCount: rows.length,
  };
}

export default function EmployeePerformanceHistory({ compact = false, className = "" }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submissions, setSubmissions] = useState([]);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchMyMonthlySubmissionHistory({ signal: controller.signal })
      .then((rows) => {
        if (!alive) return;
        setSubmissions(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => {
        if (!alive || isAbortError(err)) return;
        setError(err?.message || "Could not load your ratings history.");
        setSubmissions([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  const view = useMemo(() => buildPerformanceViews(submissions), [submissions]);

  return (
    <section
      className={[
        "rt-panel overflow-hidden",
        compact ? "" : "rounded-2xl shadow-sm",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-start gap-3 border-b border-[rgb(var(--border))] px-4 sm:px-6 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600/15 text-emerald-700 dark:text-emerald-300">
          <History size={18} />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[rgb(var(--text))]">My performance history</h3>
          <p className="mt-0.5 text-xs text-[rgb(var(--muted))]">
            All-time averages plus month-by-month and cycle-by-cycle ratings from your submissions.
          </p>
        </div>
        {loading ? <Loader2 size={16} className="animate-spin ml-auto text-[rgb(var(--muted))]" /> : null}
      </div>

      {error ? (
        <p className="px-4 sm:px-6 py-4 text-sm text-red-700 dark:text-red-300">{error}</p>
      ) : null}

      {!loading && !error ? (
        <div className="px-4 sm:px-6 py-4 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]/60 px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                All-time manager avg
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-[rgb(var(--text))]">
                {view.allTimeManagerAvg != null ? view.allTimeManagerAvg.toFixed(1) : "—"}
              </div>
              <div className="mt-1 text-[11px] text-[rgb(var(--muted))]">
                {view.reviewCount} monthly review{view.reviewCount === 1 ? "" : "s"} on record
              </div>
            </div>
            <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]/60 px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                All-time self KPI avg
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-[rgb(var(--text))]">
                {view.allTimeSelfKpiAvg != null ? view.allTimeSelfKpiAvg.toFixed(1) : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-emerald-600/30 bg-emerald-600/10 px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-900 dark:text-emerald-100">
                Review cycles
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-950 dark:text-emerald-50">
                {view.cycles.length}
              </div>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-2">
              By review cycle
            </div>
            {view.cycles.length ? (
              <div className="overflow-x-auto rounded-xl border border-[rgb(var(--border))]">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Cycle</th>
                      <th className="px-4 py-3 font-medium">Months</th>
                      <th className="px-4 py-3 font-medium">Avg self KPI</th>
                      <th className="px-4 py-3 font-medium">Avg manager score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgb(var(--border))]">
                    {view.cycles.map((cycle) => (
                      <tr key={cycle.cycleKey} className="hover:bg-[rgb(var(--surface-2))]/50">
                        <td className="px-4 py-3 text-[rgb(var(--text))]">{cycle.cycleLabel}</td>
                        <td className="px-4 py-3 tabular-nums text-[rgb(var(--muted))]">{cycle.monthCount}</td>
                        <td className="px-4 py-3"><ScoreCell value={cycle.avgSelfKpi} /></td>
                        <td className="px-4 py-3"><ScoreCell value={cycle.avgManager} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-[rgb(var(--muted))]">No cycle history yet.</div>
            )}
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-2">
              By month
            </div>
            {view.rows.length ? (
              <div className="overflow-x-auto rounded-xl border border-[rgb(var(--border))]">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Month</th>
                      <th className="px-4 py-3 font-medium">Cycle</th>
                      <th className="px-4 py-3 font-medium">Self KPI</th>
                      <th className="px-4 py-3 font-medium">Manager score</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgb(var(--border))]">
                    {view.rows.map((row) => (
                      <tr key={row.id} className="hover:bg-[rgb(var(--surface-2))]/50">
                        <td className="px-4 py-3 text-[rgb(var(--text))]">{monthHeadline(row.month)}</td>
                        <td className="px-4 py-3 text-[rgb(var(--muted))]">{row.cycleLabel}</td>
                        <td className="px-4 py-3"><ScoreCell value={row.selfKpi} /></td>
                        <td className="px-4 py-3"><ScoreCell value={row.managerScore} /></td>
                        <td className="px-4 py-3 text-xs uppercase tracking-wide text-[rgb(var(--muted))]">
                          {row.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-[rgb(var(--muted))]">No monthly ratings yet.</div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
