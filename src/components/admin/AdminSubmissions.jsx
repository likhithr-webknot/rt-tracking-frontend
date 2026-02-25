import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, Trash2, X, XCircle } from "lucide-react";
import ConfirmDialog from "../shared/ConfirmDialog.jsx";

import {
  deleteAdminMonthlySubmission,
  fetchAdminAllSubmissions,
  formatYearMonth,
  normalizeMonthlySubmission,
} from "../../api/monthly-submissions.js";
import { fetchKpiDefinitions, normalizeKpiDefinitions } from "../../api/kpi-definitions.js";
import { fetchValues, normalizeWebknotValuesList } from "../../api/webknotValueApi.js";
import { buildCycleMonthOptions, getCycleForMonth, normalizeYearMonth } from "../../utils/reviewCycles.js";

function formatMonthLabel(monthKey) {
  const m = normalizeYearMonth(monthKey);
  if (!m) return "—";
  const [yearStr, monthStr] = m.split("-");
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return m;
  const d = new Date(year, month - 1, 1);
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(d);
  } catch {
    return m;
  }
}

function formatDateTimeLabel(raw) {
  const value = String(raw || "").trim();
  if (!value || value === "—") return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return value;
  }
}

function normalizeAdminSubmissions(data) {
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : [];

  return arr
    .map((raw, i) => {
      const obj = raw && typeof raw === "object" ? raw : null;
      if (!obj) return null;

      const submission = normalizeMonthlySubmission(obj) || null;
      const payload = submission?.raw?.payload && typeof submission.raw.payload === "object"
        ? submission.raw.payload
        : (obj.payload && typeof obj.payload === "object" ? obj.payload : obj);

      const employee = obj.employee || obj.user || obj.emp || obj.employeeDetails || payload?.employee || null;
      const employeeName =
        employee?.employeeName ?? employee?.name ?? employee?.fullName ?? obj.employeeName ?? null;
      const employeeId = employee?.employeeId ?? employee?.empId ?? employee?.id ?? obj.employeeId ?? payload?.employeeId ?? null;
      const email = employee?.email ?? obj.email ?? payload?.email ?? null;

      const id = submission?.id ?? (obj.submissionId ?? obj.id ?? `SUB_${i}`);
      const month = submission?.month ?? normalizeYearMonth(obj.month ?? payload?.month) ?? null;
      const status = String(submission?.status ?? obj.status ?? "").trim().toUpperCase() || "—";
      const updatedAt = submission?.updatedAt ?? (obj.updatedAt ? String(obj.updatedAt) : null);
      const submittedAt = submission?.submittedAt ?? (obj.submittedAt ? String(obj.submittedAt) : null);

      const submissionType = String(
        submission?.submissionType ??
        payload?.submissionType ??
        obj?.submissionType ??
        ""
      ).trim().toUpperCase();
      const hasManagerEvaluation = Boolean(
        submission?.managerEvaluation ||
        obj?.managerEvaluation ||
        payload?.managerEvaluation
      );
      const managerReady = Boolean(
        hasManagerEvaluation ||
        submission?.managerSubmittedAt ||
        obj?.managerSubmittedAt ||
        obj?.managerReviewedAt ||
        obj?.reviewedByManager ||
        obj?.managerReview ||
        payload?.managerSubmittedAt ||
        payload?.managerReviewedAt ||
        payload?.managerReview
      );
      const adminAction = String(submission?.adminReview?.action || payload?.adminReview?.action || "").trim().toUpperCase() || null;
      const reviewStatus = String(submission?.reviewStatus ?? payload?.reviewStatus ?? obj?.reviewStatus ?? status).trim().toUpperCase() || "—";
      const isManagerSelf = submissionType === "MANAGER_SELF_REVIEW";
      const entryType = isManagerSelf
        ? "Manager Self Review"
        : hasManagerEvaluation
          ? "Manager Review"
          : "Employee Submission";

      return {
        id: id == null ? null : String(id),
        month: month ? String(month) : "—",
        status,
        reviewStatus,
        employee: {
          id: employeeId == null ? "—" : String(employeeId),
          name: employeeName ? String(employeeName) : (email ? String(email) : "Unknown"),
          email: email ? String(email) : "",
        },
        monthLabel: formatMonthLabel(month),
        when: updatedAt || submittedAt || "—",
        whenLabel: formatDateTimeLabel(updatedAt || submittedAt || "—"),
        managerReady,
        entryType,
        submissionType,
        adminAction,
        submission,
        raw: obj,
      };
    })
    .filter((x) => x && x.id && x.status === "SUBMITTED");
}

export default function AdminSubmissions({ onLogout }) {
  const [month, setMonth] = useState(() => formatYearMonth(new Date()));
  const status = null;
  const [onlyManagerSubmitted, setOnlyManagerSubmitted] = useState(false);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingDeleteSubmissionId, setPendingDeleteSubmissionId] = useState(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState("");
  const [reviewModal, setReviewModal] = useState({ open: false, item: null });
  const [kpiIndex, setKpiIndex] = useState({});
  const [valueIndex, setValueIndex] = useState({});

  const cycleInfo = useMemo(() => getCycleForMonth(month || new Date()), [month]);
  const cycleMonthOptions = useMemo(() => buildCycleMonthOptions(month || new Date()), [month]);

  useEffect(() => {
    if (!cycleMonthOptions.length) return;
    const current = normalizeYearMonth(month);
    if (current && cycleMonthOptions.some((opt) => opt.value === current)) return;
    setMonth(cycleMonthOptions[cycleMonthOptions.length - 1].value);
  }, [cycleMonthOptions, month]);

  const query = useMemo(() => {
    const m = String(month || "").trim();
    return { month: m || null, status };
  }, [month, status]);

  const visibleItems = useMemo(
    () => items.filter((it) => (onlyManagerSubmitted ? Boolean(it.managerReady) : true)),
    [items, onlyManagerSubmitted]
  );

  const reload = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const data = await fetchAdminAllSubmissions({
        month: query.month || undefined,
        status: query.status || undefined,
      });
      setItems(normalizeAdminSubmissions(data));
    } catch (err) {
      if (err?.status === 401) {
        onLogout?.();
        return;
      }
      setError(err?.message || "Failed to load submissions.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [onLogout, query.month, query.status]);

  useEffect(() => {
    reload().catch(() => { void 0; });
  }, [reload]);

  useEffect(() => {
    let active = true;

    async function loadLookups() {
      try {
        const [kpiRes, valueRes] = await Promise.all([fetchKpiDefinitions(), fetchValues(true)]);
        if (!active) return;

        const kpiMap = {};
        (normalizeKpiDefinitions(kpiRes) || []).forEach((k) => {
          const key = String(k?.id ?? "").trim();
          if (!key) return;
          kpiMap[key] = k?.title || key;
        });

        const valueMap = {};
        (normalizeWebknotValuesList(valueRes) || []).forEach((v) => {
          const key = String(v?.id ?? "").trim();
          if (!key) return;
          valueMap[key] = v?.title || key;
        });

        setKpiIndex(kpiMap);
        setValueIndex(valueMap);
      } catch (err) {
        console.error("Failed to load KPI/value labels", err);
      }
    }

    loadLookups();

    return () => {
      active = false;
    };
  }, []);

  const kpiLabel = useCallback(
    (id) => {
      const key = String(id ?? "").trim();
      if (!key) return "—";
      return kpiIndex[key] || key;
    },
    [kpiIndex]
  );

  const valueLabel = useCallback(
    (id) => {
      const key = String(id ?? "").trim();
      if (!key) return "—";
      return valueIndex[key] || key;
    },
    [valueIndex]
  );

  function openReview(item) {
    setReviewModal({ open: true, item });
  }

  function closeReview() {
    setReviewModal({ open: false, item: null });
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="rt-title">
            Monthly Submissions
          </h2>
          <p className="text-slate-500 text-sm mt-2">
            Admin review queue for submitted employee and manager entries.
          </p>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="rt-kicker">
              Month
            </div>
            <select
              value={month}
              onChange={(e) => {
                const next = normalizeYearMonth(e.target.value);
                if (!next) return;
                setMonth(next);
              }}
              className="rt-input text-sm"
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

          <label className="flex items-center gap-3 rt-panel-subtle px-4 py-3">
            <input
              type="checkbox"
              checked={onlyManagerSubmitted}
              onChange={(e) => setOnlyManagerSubmitted(e.target.checked)}
            />
            <span className="text-xs font-black uppercase tracking-widest text-[rgb(var(--text))]">
              Only manager-submitted
            </span>
          </label>

          <button
            onClick={() => reload()}
            disabled={loading}
            className={[
              "rt-btn-ghost inline-flex items-center gap-2 text-xs uppercase tracking-widest transition-all",
              loading ? "opacity-60 cursor-not-allowed" : "",
            ].join(" ")}
            title="Refresh"
          >
            <RefreshCw size={18} /> {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-200">
          Failed to load submissions: <span className="font-mono">{error}</span>
        </div>
      ) : null}

      <section className="rt-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-[0.2em] text-slate-500 border-t border-b border-[rgb(var(--border))]">
              <tr>
                <th className="p-6 font-black">Employee</th>
                <th className="p-6 font-black whitespace-nowrap">Month</th>
                <th className="p-6 font-black">Type</th>
                <th className="p-6 font-black">Workflow</th>
                <th className="p-6 font-black whitespace-nowrap">Updated</th>
                <th className="p-6 text-right font-black px-8">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {visibleItems.map((it) => (
                <tr
                  key={it.id}
                  className="hover:bg-[rgb(var(--surface-2))] transition-colors cursor-pointer"
                  onClick={() => openReview(it)}
                  onKeyDown={(e) => {
                    const key = String(e.key || "").toLowerCase();
                    if (key === "enter" || key === " ") {
                      e.preventDefault();
                      openReview(it);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Review submission for ${it.employee.name}`}
                >
                  <td className="p-6">
                    <div className="font-bold text-[rgb(var(--text))] tracking-tight">{it.employee.name}</div>
                    <div className="text-xs text-slate-500 mt-1 break-all">
                      {it.employee.email || "—"}
                    </div>
                  </td>
                  <td className="p-6 font-mono text-[rgb(var(--text))] whitespace-nowrap">{it.monthLabel}</td>
                  <td className="p-6">
                    <span className="text-[10px] font-black uppercase px-3 py-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] text-[rgb(var(--text))]">
                      {it.entryType}
                    </span>
                  </td>
                  <td className="p-6 whitespace-nowrap">
                    <span
                      className={[
                        "text-[10px] font-black uppercase px-3 py-1 rounded-lg border",
                        it.reviewStatus.includes("APPROVED")
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                          : it.reviewStatus.includes("NEEDS_REVIEW") || it.reviewStatus.includes("REJECT")
                            ? "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20"
                            : "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
                      ].join(" ")}
                    >
                      {it.reviewStatus || it.status}
                    </span>
                    {it.adminAction ? (
                      <div className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">
                        Admin: {it.adminAction}
                      </div>
                    ) : it.managerReady ? (
                      <div className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
                        Manager submitted
                      </div>
                    ) : (
                      <div className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                        Awaiting manager
                      </div>
                    )}
                  </td>
                  <td className="p-6 text-xs text-slate-500 font-mono whitespace-nowrap">{it.whenLabel}</td>
                  <td className="p-6 text-right px-8">
                    <div className="inline-flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openReview(it);
                        }}
                        className="p-2.5 bg-blue-500/10 text-blue-700 dark:text-blue-300 hover:bg-blue-500 hover:text-white rounded-xl transition-all border border-blue-500/20"
                        title="Review"
                      >
                        <CheckCircle2 size={18} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDeleteSubmissionId(it.id);
                        }}
                        className="p-2.5 bg-red-500/10 text-red-700 dark:text-red-300 hover:bg-red-500 hover:text-white rounded-xl transition-all border border-red-500/20"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && visibleItems.length === 0 ? (
                <tr>
                  <td className="p-10 text-center text-slate-500" colSpan={6}>
                    No submissions to show.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {reviewModal.open && reviewModal.item ? (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 z-[70] overflow-y-auto">
          <div className="w-full max-w-5xl rt-panel rounded-3xl p-4 sm:p-6 my-4 sm:my-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Admin Review</div>
                <div className="mt-2 text-2xl font-black tracking-tight text-[rgb(var(--text))]">
                  {reviewModal.item.employee.name}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {reviewModal.item.month} • {reviewModal.item.entryType}
                </div>
              </div>
              <button
                type="button"
                onClick={closeReview}
                className="p-2 rounded-xl hover:bg-[rgb(var(--surface-2))]"
                aria-label="Close"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rt-panel-subtle rounded-[2rem] p-6">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Submitted Content</div>
                <div className="mt-4 space-y-4 text-sm text-[rgb(var(--text))]">
                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-gray-500">Self Review</div>
                    <div className="mt-2 whitespace-pre-wrap">{String(reviewModal.item.submission?.selfReviewText || "—")}</div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rt-panel-subtle rounded-xl p-3 space-y-2">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-black">Employee KPI Ratings</div>
                      {Object.entries(reviewModal.item.submission?.kpiRatings || {}).length ? (
                        Object.entries(reviewModal.item.submission.kpiRatings).map(([kpiId, rating]) => (
                          <div key={kpiId} className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm truncate">{kpiLabel(kpiId)}</div>
                              {kpiLabel(kpiId) !== String(kpiId) ? (
                                <div className="text-[10px] text-[rgb(var(--muted))] font-mono truncate">{String(kpiId)}</div>
                              ) : null}
                            </div>
                            <span className="font-mono text-sm">{String(rating)}</span>
                          </div>
                        ))
                      ) : (
                        <div className="flex items-center justify-between gap-2 text-sm text-[rgb(var(--text))]">
                          <span className="truncate">Defaulted (no self rating)</span>
                          <span className="font-mono">2</span>
                        </div>
                      )}
                    </div>
                    <div className="rt-panel-subtle rounded-xl p-3 space-y-2">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-black">Employee Values Ratings</div>
                      {Object.entries(reviewModal.item.submission?.webknotValueRatings || {}).length ? (
                        Object.entries(reviewModal.item.submission.webknotValueRatings).map(([valueId, rating]) => (
                          <div key={valueId} className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm truncate">{valueLabel(valueId)}</div>
                              {valueLabel(valueId) !== String(valueId) ? (
                                <div className="text-[10px] text-[rgb(var(--muted))] font-mono truncate">{String(valueId)}</div>
                              ) : null}
                            </div>
                            <span className="font-mono text-sm">{String(rating)}</span>
                          </div>
                        ))
                      ) : (
                        <div className="flex items-center justify-between gap-2 text-sm text-[rgb(var(--text))]">
                          <span className="truncate">Defaulted (no self rating)</span>
                          <span className="font-mono">2</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rt-panel-subtle rounded-xl p-3 space-y-2">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-black">Certifications</div>
                      {Array.isArray(reviewModal.item.submission?.certifications) && reviewModal.item.submission.certifications.length ? (
                        reviewModal.item.submission.certifications.map((cert, idx) => (
                          <div key={`${cert?.name || cert?.title || idx}:${idx}`} className="rounded-lg border border-[rgb(var(--border))] px-3 py-2">
                            <div className="font-semibold text-sm truncate">{cert?.name || cert?.title || "Certification"}</div>
                            {cert?.proof || cert?.url || cert?.link ? (
                              <div className="text-[11px] text-[rgb(var(--muted))] break-all">{cert?.proof || cert?.url || cert?.link}</div>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-[rgb(var(--muted))]">No certifications provided.</div>
                      )}
                    </div>
                    <div className="rt-panel-subtle rounded-xl p-3 space-y-2">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-black">Recognitions</div>
                      <div className="text-lg font-black">{Number(reviewModal.item.submission?.recognitionsCount || 0)}</div>
                    </div>
                  </div>
                  {String(reviewModal.item.submission?.adminReview?.comments || "").trim() ? (
                    <div>
                      <div className="text-xs font-black uppercase tracking-widest text-gray-500">Latest Admin Comments</div>
                      <div className="mt-2 whitespace-pre-wrap">{String(reviewModal.item.submission?.adminReview?.comments || "")}</div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rt-panel-subtle rounded-[2rem] p-6">
                <div className="space-y-5">
                  <div className="rt-panel-subtle rounded-2xl p-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Manager Ratings & Comments</div>
                    <div className="mt-3 space-y-3 text-sm text-[rgb(var(--text))]">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.2em] text-[rgb(var(--muted))]">Manager KPI Ratings</div>
                        <div className="mt-2 space-y-1">
                          {Object.entries(reviewModal.item.submission?.managerEvaluation?.kpiRatings || {}).length ? (
                            Object.entries(reviewModal.item.submission.managerEvaluation.kpiRatings).map(([kpiId, rating]) => (
                              <div key={kpiId} className="flex items-center justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="truncate">{kpiLabel(kpiId)}</div>
                                  {kpiLabel(kpiId) !== String(kpiId) ? (
                                    <div className="text-[10px] text-[rgb(var(--muted))] font-mono truncate">{String(kpiId)}</div>
                                  ) : null}
                                </div>
                                <span className="font-mono">{String(rating)}</span>
                              </div>
                            ))
                          ) : (
                            <div className="text-xs text-[rgb(var(--muted))]">No manager KPI ratings.</div>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.2em] text-[rgb(var(--muted))]">Manager Value Ratings</div>
                        <div className="mt-2 space-y-1">
                          {Object.entries(reviewModal.item.submission?.managerEvaluation?.webknotValueRatings || {}).length ? (
                            Object.entries(reviewModal.item.submission.managerEvaluation.webknotValueRatings).map(([valueId, rating]) => (
                              <div key={valueId} className="flex items-center justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="truncate">{valueLabel(valueId)}</div>
                                  {valueLabel(valueId) !== String(valueId) ? (
                                    <div className="text-[10px] text-[rgb(var(--muted))] font-mono truncate">{String(valueId)}</div>
                                  ) : null}
                                </div>
                                <span className="font-mono">{String(rating)}</span>
                              </div>
                            ))
                          ) : (
                            <div className="text-xs text-[rgb(var(--muted))]">No manager value ratings.</div>
                          )}
                        </div>
                      </div>
                      {String(reviewModal.item.submission?.managerReview?.comments || "").trim() ? (
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.2em] text-[rgb(var(--muted))]">Manager Comments</div>
                          <div className="mt-2 whitespace-pre-wrap">{String(reviewModal.item.submission?.managerReview?.comments || "")}</div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingDeleteSubmissionId)}
        title="Delete Submission"
        message={`Delete submission ${String(pendingDeleteSubmissionId ?? "")}?`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        onCancel={() => setPendingDeleteSubmissionId(null)}
        onConfirm={async () => {
          const id = pendingDeleteSubmissionId;
          if (!id) return;
          try {
            await deleteAdminMonthlySubmission(id);
            setPendingDeleteSubmissionId(null);
            await reload();
          } catch (err) {
            if (err?.status === 401) {
              onLogout?.();
              return;
            }
            setPendingDeleteSubmissionId(null);
            setDeleteErrorMessage(err?.message || "Delete failed.");
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteErrorMessage)}
        title="Delete Failed"
        message={String(deleteErrorMessage || "Delete failed.")}
        confirmText="OK"
        confirmVariant="primary"
        showCancel={false}
        onCancel={() => setDeleteErrorMessage("")}
        onConfirm={() => setDeleteErrorMessage("")}
      />
    </div>
  );
}
