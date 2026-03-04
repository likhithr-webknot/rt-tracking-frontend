import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, User, X, XCircle } from "lucide-react";
import {
  fetchAdminAllSubmissions,
  formatYearMonth,
  normalizeMonthlySubmission,
  submitAdminReviewDecision,
} from "../../api/monthly-submissions.js";
import { fetchKpiDefinitions, normalizeKpiDefinitions } from "../../api/kpi-definitions.js";
import { fetchValues, normalizeWebknotValuesList } from "../../api/webknotValueApi.js";
import { buildCycleMonthOptions, getCycleForMonth, normalizeYearMonth } from "../../utils/reviewCycles.js";
import ModalOverlay from "../shared/ModalOverlay.jsx";

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

function normalizeAdminSubmissions(data, employeeLookup) {
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
      const rawEmployeeName =
        employee?.employeeName ?? employee?.name ?? employee?.fullName ?? obj.employeeName ?? null;
      const rawEmployeeId = employee?.employeeId ?? employee?.empId ?? employee?.id ?? obj.employeeId ?? payload?.employeeId ?? null;
      const rawEmail = employee?.email ?? obj.email ?? payload?.email ?? null;

      /* Resolve from authoritative employee directory if available */
      const empKey = rawEmployeeId != null ? String(rawEmployeeId).trim().toLowerCase() : null;
      const directoryMatch = empKey && employeeLookup ? employeeLookup.get(empKey) : null;
      const employeeName = directoryMatch?.name ?? rawEmployeeName;
      const employeeId = rawEmployeeId;
      const email = directoryMatch?.email ?? rawEmail;

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

export default function AdminSubmissions({ onLogout, employees: employeesProp }) {
  const [month, setMonth] = useState(() => formatYearMonth(new Date()));
  const status = null;
  const [onlyManagerSubmitted, setOnlyManagerSubmitted] = useState(false);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reviewModal, setReviewModal] = useState({ open: false, item: null });
  const [rejectModal, setRejectModal] = useState({ open: false, item: null, comment: "", target: "employee" });
  const [rejectBusy, setRejectBusy] = useState(false);
  const [rejectError, setRejectError] = useState("");
  const [kpiIndex, setKpiIndex] = useState({});
  const [valueIndex, setValueIndex] = useState({});

  /* Build lookup map: employeeId (lowercase) → { name, email } */
  const employeeLookup = useMemo(() => {
    const map = new Map();
    if (Array.isArray(employeesProp)) {
      for (const emp of employeesProp) {
        const id = String(emp?.id ?? emp?.employeeId ?? "").trim().toLowerCase();
        if (!id) continue;
        map.set(id, {
          name: String(emp?.name ?? emp?.employeeName ?? "").trim() || null,
          email: String(emp?.email ?? emp?.employeeEmail ?? "").trim() || null,
        });
      }
    }
    return map;
  }, [employeesProp]);

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
      setItems(normalizeAdminSubmissions(data, employeeLookup));
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
  }, [employeeLookup, onLogout, query.month, query.status]);

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

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Month</span>
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
            <span className="text-[10px] text-slate-500 dark:text-slate-400 hidden sm:inline whitespace-nowrap">
              {cycleInfo?.label || "May-Oct / Nov-Apr"}
            </span>
          </div>

          <label className="flex items-center gap-3 rt-panel-subtle px-4 py-2.5">
            <input
              type="checkbox"
              checked={onlyManagerSubmitted}
              onChange={(e) => setOnlyManagerSubmitted(e.target.checked)}
            />
            <span className="text-xs font-semibold uppercase tracking-widest text-[rgb(var(--text))]">
              Only manager-submitted
            </span>
          </label>

          <button
            onClick={() => reload()}
            disabled={loading}
            className={[
              "rt-btn-ghost transition-all",
              loading ? "opacity-60 cursor-not-allowed" : "",
            ].join("")}
            title="Refresh"
          >
            <RefreshCw size={18} /> {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-200">
          Failed to load submissions: <span className="font-mono">{error}</span>
        </div>
      ) : null}

      <section className="rt-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-slate-500 border-t border-b border-[rgb(var(--border))]">
              <tr>
                <th className="p-6 font-semibold">Employee</th>
                <th className="p-6 font-semibold whitespace-nowrap">Month</th>
                <th className="p-6 font-semibold">Type</th>
                <th className="p-6 font-semibold">Workflow</th>
                <th className="p-6 font-semibold whitespace-nowrap">Updated</th>
                <th className="p-6 text-right font-semibold px-8">Actions</th>
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
                    <span className="text-[10px] font-semibold uppercase px-3 py-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] text-[rgb(var(--text))]">
                      {it.entryType}
                    </span>
                  </td>
                  <td className="p-6 whitespace-nowrap">
                    <span
                      className={[
                        "text-[10px] font-semibold uppercase px-3 py-1 rounded-lg border",
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
                      <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                        Admin: {it.adminAction}
                      </div>
                    ) : it.managerReady ? (
                      <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                        Manager submitted
                      </div>
                    ) : (
                      <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
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
                        className="p-2.5 bg-blue-500/10 text-blue-700 dark:text-blue-300 hover:bg-blue-500 hover:text-white rounded-md transition-all border border-blue-500/20"
                        title="Review"
                      >
                        <CheckCircle2 size={18} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRejectModal({ open: true, item: it, comment: "", target: "employee" });
                          setRejectError("");
                        }}
                        className="p-2.5 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500 hover:text-white rounded-md transition-all border border-amber-500/20"
                        title="Reject with comments"
                      >
                        <XCircle size={18} />
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
        <ModalOverlay
          open={reviewModal.open}
          onClose={closeReview}
          maxWidth="max-w-5xl"
          zIndex={70}
          header={
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Admin Review</div>
              <div className="mt-2 text-2xl font-semibold tracking-tight text-[rgb(var(--text))]">
                {reviewModal.item.employee.name}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {reviewModal.item.month} • {reviewModal.item.entryType}
              </div>
              {/* Reviewer identity badges */}
              <div className="mt-3 flex flex-wrap gap-2">
                {reviewModal.item.submission?.managerReview?.reviewedBy ? (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                    <User size={11} /> Manager: {reviewModal.item.submission.managerReview.reviewedBy}
                  </span>
                ) : null}
                {reviewModal.item.submission?.adminReview?.reviewedBy ? (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                    <User size={11} /> Admin: {reviewModal.item.submission.adminReview.reviewedBy}
                  </span>
                ) : null}
                {reviewModal.item.submission?.adminReview?.action === "REJECT" ? (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20">
                    Rejected{reviewModal.item.submission.adminReview.reviewedBy ? ` by ${reviewModal.item.submission.adminReview.reviewedBy}` : ""}
                  </span>
                ) : null}
              </div>
            </div>
          }
        >

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rt-panel-subtle rounded-lg p-6">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Submitted Content</div>
                <div className="mt-4 space-y-4 text-sm text-[rgb(var(--text))]">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-gray-500">Self Review</div>
                    <div className="mt-2 whitespace-pre-wrap">{String(reviewModal.item.submission?.selfReviewText || "—")}</div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rt-panel-subtle rounded-md p-3 space-y-2">
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Employee KPI Ratings</div>
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
                    <div className="rt-panel-subtle rounded-md p-3 space-y-2">
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Employee Values Ratings</div>
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
                    <div className="rt-panel-subtle rounded-md p-3 space-y-2">
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Certifications</div>
                      {Array.isArray(reviewModal.item.submission?.certifications) && reviewModal.item.submission.certifications.length ? (
                        reviewModal.item.submission.certifications.map((cert, idx) => (
                          <div key={`${cert?.name || cert?.title || idx}:${idx}`} className="rounded-lg border border-[rgb(var(--border))] px-3 py-2">
                            <div className="font-semibold text-sm truncate">{cert?.name || cert?.title || "Certification"}</div>
                            {cert?.proof || cert?.url || cert?.link ? (
                              <a
                                className="text-[11px] text-blue-600 hover:underline break-all"
                                href={(cert?.proof || cert?.url || cert?.link) ?? "#"}
                                target="_blank"
                                rel="noreferrer noopener"
                              >
                                {cert?.proof || cert?.url || cert?.link}
                              </a>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-[rgb(var(--muted))]">No certifications provided.</div>
                      )}
                    </div>
                    <div className="rt-panel-subtle rounded-md p-3 space-y-2">
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Recognitions</div>
                      <div className="text-lg font-semibold">{Number(reviewModal.item.submission?.recognitionsCount || 0)}</div>
                    </div>
                  </div>
                  {String(reviewModal.item.submission?.adminReview?.comments || "").trim() ? (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-widest text-gray-500">Latest Admin Comments</div>
                      <div className="mt-2 whitespace-pre-wrap">{String(reviewModal.item.submission?.adminReview?.comments || "")}</div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rt-panel-subtle rounded-lg p-6">
                <div className="space-y-5">
                  <div className="rt-panel-subtle rounded-lg p-4">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Manager Ratings & Comments</div>
                    <div className="mt-3 space-y-3 text-sm text-[rgb(var(--text))]">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">Manager KPI Ratings</div>
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
                        <div className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">Manager Value Ratings</div>
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
                          <div className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">Manager Comments</div>
                          <div className="mt-2 whitespace-pre-wrap">{String(reviewModal.item.submission?.managerReview?.comments || "")}</div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
        </ModalOverlay>
      ) : null}

      {rejectModal.open && rejectModal.item ? (
        <ModalOverlay
          open={rejectModal.open}
          onClose={rejectBusy ? undefined : () => {
            setRejectModal({ open: false, item: null, comment: "", target: "employee" });
            setRejectError("");
          }}
          maxWidth="max-w-lg"
          zIndex={75}
          header={
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Admin Reject</div>
              <div className="mt-2 text-xl font-semibold text-[rgb(var(--text))]">{rejectModal.item.employee.name}</div>
              <div className="text-xs text-[rgb(var(--muted))] mt-1">{rejectModal.item.month} • {rejectModal.item.entryType}</div>
            </div>
          }
        >
            {/* Rejection target selector */}
            <div className="space-y-2 mb-4">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                What to reject
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRejectModal((prev) => ({ ...prev, target: "employee" }))}
                  className={[
                    "px-3 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider border transition-all text-center",
                    (rejectModal.target || "employee") === "employee"
                      ? "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30 ring-1 ring-red-500/20"
                      : "bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] border-[rgb(var(--border))] hover:border-[rgb(var(--muted))]",
                  ].join(" ")}
                  disabled={rejectBusy}
                >
                  Reject Employee Review
                </button>
                <button
                  type="button"
                  onClick={() => setRejectModal((prev) => ({ ...prev, target: "manager" }))}
                  className={[
                    "px-3 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider border transition-all text-center",
                    rejectModal.target === "manager"
                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 ring-1 ring-amber-500/20"
                      : "bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] border-[rgb(var(--border))] hover:border-[rgb(var(--muted))]",
                  ].join(" ")}
                  disabled={rejectBusy || !rejectModal.item.managerReady}
                  title={!rejectModal.item.managerReady ? "Manager has not submitted yet" : "Reject manager's review only"}
                >
                  Reject Manager Review
                </button>
              </div>
              <p className="text-[10px] text-[rgb(var(--muted))]">
                {(rejectModal.target || "employee") === "employee"
                  ? "The employee's submission will be sent back for resubmission."
                  : "Only the manager's review will be rejected; employee submission stays intact."}
              </p>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Rejection Comments
              </label>
              <textarea
                value={rejectModal.comment}
                onChange={(e) => {
                  setRejectModal((prev) => ({ ...prev, comment: e.target.value }));
                  setRejectError("");
                }}
                className="rt-input w-full min-h-[120px] text-sm"
                placeholder="Share why this submission was rejected and what to fix."
                disabled={rejectBusy}
              />
              {rejectError ? (
                <div className="text-xs text-red-600">{rejectError}</div>
              ) : null}
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (rejectBusy) return;
                  setRejectModal({ open: false, item: null, comment: "", target: "employee" });
                  setRejectError("");
                }}
                className="rt-btn-ghost transition-all"
                disabled={rejectBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (rejectBusy) return;
                  const comment = String(rejectModal.comment || "").trim();
                  if (!comment) {
                    setRejectError("Add a short explanation for the employee.");
                    return;
                  }
                  const target = rejectModal.target || "employee";
                  setRejectBusy(true);
                  try {
                    await submitAdminReviewDecision({
                      submissionId: rejectModal.item.id,
                      id: rejectModal.item.id,
                      month: rejectModal.item.month,
                      subjectEmployeeId: rejectModal.item.employee.id,
                      employeeId: rejectModal.item.employee.id,
                      submissionType: rejectModal.item.submission?.submissionType ?? rejectModal.item.submissionType,
                      adminReview: {
                        action: target === "manager" ? "REJECT_MANAGER" : "REJECT",
                        target,
                        comments: comment,
                        reviewedAt: new Date().toISOString(),
                      },
                      reviewStatus: target === "manager" ? "NEEDS_MANAGER_REVIEW" : "REJECT",
                      reopenedForResubmission: target === "employee",
                    });
                    setRejectModal({ open: false, item: null, comment: "", target: "employee" });
                    setRejectError("");
                    await reload();
                  } catch (err) {
                    if (err?.status === 401) {
                      onLogout?.();
                      return;
                    }
                    setRejectError(err?.message || "Reject failed. Try again.");
                  } finally {
                    setRejectBusy(false);
                  }
                }}
                className={[
                  "transition-all disabled:opacity-70 rounded-md px-4 py-2 text-xs font-medium uppercase tracking-wider",
                  (rejectModal.target || "employee") === "manager"
                    ? "bg-amber-600 text-white hover:bg-amber-500"
                    : "bg-red-600 text-white hover:bg-red-500",
                ].join(" ")}
                disabled={rejectBusy}
              >
                {rejectBusy
                  ? "Processing…"
                  : (rejectModal.target || "employee") === "manager"
                    ? "Reject Manager Review"
                    : "Reject & Notify Employee"}
              </button>
            </div>
        </ModalOverlay>
      ) : null}

    </div>
  );
}
