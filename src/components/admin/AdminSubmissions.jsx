import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, Trash2, X, XCircle } from "lucide-react";
import ConfirmDialog from "../shared/ConfirmDialog.jsx";

import {
  deleteAdminMonthlySubmission,
  fetchAdminAllSubmissions,
  formatYearMonth,
  normalizeMonthlySubmission,
  submitAdminReviewDecision,
} from "../../api/monthly-submissions.js";
import { buildCycleMeta, buildCycleMonthOptions, getCycleForMonth, normalizeYearMonth } from "../../utils/reviewCycles.js";

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
        when: updatedAt || submittedAt || "—",
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

function buildAdminReviewPayload(item, { action, notes }) {
  const submission = item?.submission || normalizeMonthlySubmission(item?.raw) || {};
  const month = normalizeYearMonth(item?.month || submission?.month) || null;
  const cycleMeta = buildCycleMeta(month);

  const kpiRatingsObj = submission?.kpiRatings && typeof submission.kpiRatings === "object" ? submission.kpiRatings : {};
  const kpiRatings = Object.entries(kpiRatingsObj).map(([kpiId, rating]) => ({
    kpiId: String(kpiId || "").trim(),
    rating,
  }));

  const valueRatingsObj =
    submission?.webknotValueRatings && typeof submission.webknotValueRatings === "object"
      ? submission.webknotValueRatings
      : {};
  const valueEntries = Object.entries(valueRatingsObj);

  const reviewedAt = new Date().toISOString();
  const normalizedAction = String(action || "").trim().toUpperCase();

  return {
    month,
    monthKey: month,
    cycleKey: submission?.cycleKey || cycleMeta.cycleKey,
    cycleLabel: submission?.cycleLabel || cycleMeta.cycleLabel,
    cycleShortLabel: submission?.cycleShortLabel || cycleMeta.cycleShortLabel,
    cycleStartMonth: submission?.cycleStartMonth || cycleMeta.cycleStartMonth,
    cycleEndMonth: submission?.cycleEndMonth || cycleMeta.cycleEndMonth,
    cycleMonth: cycleMeta.month,
    profileVerified: true,
    employeeId: String(item?.employee?.id || submission?.subjectEmployeeId || "").trim() || null,
    subjectEmployeeId: String(submission?.subjectEmployeeId || item?.employee?.id || "").trim() || null,
    submissionType: submission?.submissionType || item?.submissionType || "EMPLOYEE_MONTHLY_SUBMISSION",
    actorRole: "ADMIN",
    workflowStage: "ADMIN_REVIEW",
    targetRole: submission?.submissionType === "MANAGER_SELF_REVIEW" ? "MANAGER" : "EMPLOYEE",
    selfReviewText: String(submission?.selfReviewText || ""),
    certifications: Array.isArray(submission?.certifications) ? submission.certifications : [],
    kpiRatings,
    webknotValues: valueEntries.map(([valueId]) => String(valueId || "").trim()),
    webknotValueRatings: Object.fromEntries(valueEntries),
    webknotValueResponses: valueEntries.map(([valueId, rating]) => ({
      valueId: String(valueId || "").trim(),
      rating,
    })),
    recognitionsCount: Number(submission?.recognitionsCount || 0) || 0,
    managerEvaluation: submission?.managerEvaluation || null,
    managerReview: submission?.managerReview || null,
    managerSubmittedAt: submission?.managerSubmittedAt || null,
    adminReview: {
      action: normalizedAction,
      comments: String(notes || "").trim(),
      reviewedAt,
      reviewedBy: null,
    },
    adminSubmittedAt: normalizedAction === "APPROVE" ? reviewedAt : null,
    adminComments: String(notes || "").trim(),
    adminNotes: String(notes || "").trim(),
    reviewStatus: normalizedAction === "REJECT" ? "NEEDS_REVIEW" : "ADMIN_APPROVED",
    reopenedForResubmission: normalizedAction === "REJECT",
  };
}

export default function AdminSubmissions({ onLogout }) {
  const [month, setMonth] = useState(() => formatYearMonth(new Date()));
  const status = "SUBMITTED";
  const [onlyManagerSubmitted, setOnlyManagerSubmitted] = useState(false);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingDeleteSubmissionId, setPendingDeleteSubmissionId] = useState(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState("");

  const [reviewModal, setReviewModal] = useState({ open: false, item: null });
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewActionError, setReviewActionError] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);

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

  async function reload() {
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
  }

  useEffect(() => {
    reload().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.month, query.status]);

  function openReview(item) {
    const existing = String(item?.submission?.adminReview?.comments || "").trim();
    setReviewNotes(existing);
    setReviewActionError("");
    setReviewModal({ open: true, item });
  }

  function closeReview() {
    setReviewModal({ open: false, item: null });
    setReviewNotes("");
    setReviewActionError("");
    setReviewSaving(false);
  }

  async function submitReview(action) {
    const item = reviewModal.item;
    if (!item) return;

    const normalizedAction = String(action || "").trim().toUpperCase();
    const notes = String(reviewNotes || "").trim();
    if (normalizedAction === "REJECT" && notes.length < 10) {
      setReviewActionError("Rejection comments must be at least 10 characters.");
      return;
    }

    const payload = buildAdminReviewPayload(item, { action: normalizedAction, notes });

    try {
      setReviewSaving(true);
      await submitAdminReviewDecision(payload);
      closeReview();
      await reload();
    } catch (err) {
      if (err?.status === 401) {
        onLogout?.();
        return;
      }
      setReviewActionError(err?.message || "Review submission failed.");
    } finally {
      setReviewSaving(false);
    }
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
              className="h-4 w-4 accent-purple-600"
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
                <th className="p-6 font-black">Month</th>
                <th className="p-6 font-black">Type</th>
                <th className="p-6 font-black">Workflow</th>
                <th className="p-6 font-black">Updated</th>
                <th className="p-6 text-right font-black px-8">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {visibleItems.map((it) => (
                <tr key={it.id} className="hover:bg-[rgb(var(--surface-2))] transition-colors">
                  <td className="p-6">
                    <div className="font-bold text-[rgb(var(--text))] tracking-tight">{it.employee.name}</div>
                    <div className="text-xs text-slate-500 font-mono mt-1">
                      {it.employee.id}{it.employee.email ? ` • ${it.employee.email}` : ""}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 mt-1">
                      {it.id}
                    </div>
                  </td>
                  <td className="p-6 font-mono text-[rgb(var(--text))]">{it.month}</td>
                  <td className="p-6">
                    <span className="text-[10px] font-black uppercase px-3 py-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] text-[rgb(var(--text))]">
                      {it.entryType}
                    </span>
                  </td>
                  <td className="p-6">
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
                  <td className="p-6 text-xs text-slate-500 font-mono">{it.when}</td>
                  <td className="p-6 text-right px-8">
                    <div className="inline-flex items-center gap-2">
                      <button
                        onClick={() => openReview(it)}
                        className="p-2.5 bg-blue-500/10 text-blue-700 dark:text-blue-300 hover:bg-blue-500 hover:text-white rounded-xl transition-all border border-blue-500/20"
                        title="Review"
                      >
                        <CheckCircle2 size={18} />
                      </button>
                      <button
                        onClick={() => setPendingDeleteSubmissionId(it.id)}
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
                <div className="mt-1 text-xs text-gray-500 font-mono">
                  {reviewModal.item.employee.id} • {reviewModal.item.month} • {reviewModal.item.entryType}
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
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rt-panel-subtle rounded-xl p-3">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-black">KPI Ratings</div>
                      <div className="mt-1 font-mono">{Object.keys(reviewModal.item.submission?.kpiRatings || {}).length}</div>
                    </div>
                    <div className="rt-panel-subtle rounded-xl p-3">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-black">Values Rated</div>
                      <div className="mt-1 font-mono">{Object.keys(reviewModal.item.submission?.webknotValueRatings || {}).length}</div>
                    </div>
                    <div className="rt-panel-subtle rounded-xl p-3">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-black">Certifications</div>
                      <div className="mt-1 font-mono">{Array.isArray(reviewModal.item.submission?.certifications) ? reviewModal.item.submission.certifications.length : 0}</div>
                    </div>
                    <div className="rt-panel-subtle rounded-xl p-3">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-black">Recognitions</div>
                      <div className="mt-1 font-mono">{Number(reviewModal.item.submission?.recognitionsCount || 0)}</div>
                    </div>
                  </div>

                  {String(reviewModal.item.submission?.managerReview?.comments || "").trim() ? (
                    <div>
                      <div className="text-xs font-black uppercase tracking-widest text-gray-500">Manager Comments</div>
                      <div className="mt-2 whitespace-pre-wrap">{String(reviewModal.item.submission?.managerReview?.comments || "")}</div>
                    </div>
                  ) : null}

                  {String(reviewModal.item.submission?.adminReview?.comments || "").trim() ? (
                    <div>
                      <div className="text-xs font-black uppercase tracking-widest text-gray-500">Latest Admin Comments</div>
                      <div className="mt-2 whitespace-pre-wrap">{String(reviewModal.item.submission?.adminReview?.comments || "")}</div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rt-panel-subtle rounded-[2rem] p-6">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Admin Decision</div>

                {reviewActionError ? (
                  <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-200">
                    {reviewActionError}
                  </div>
                ) : null}

                <div className="mt-4">
                  <div className="text-xs font-black uppercase tracking-widest text-gray-500">Comments</div>
                  <textarea
                    value={reviewNotes}
                    onChange={(e) => {
                      setReviewNotes(e.target.value);
                      setReviewActionError("");
                    }}
                    rows={8}
                    className="mt-2 rt-input p-4 text-sm resize-none"
                    placeholder="Write feedback for manager/employee. For reject, minimum 10 characters."
                  />
                </div>

                <div className="mt-6 flex justify-end gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => submitReview("REJECT")}
                    disabled={reviewSaving}
                    className={[
                      "rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest transition-all",
                      reviewSaving
                        ? "opacity-60 cursor-not-allowed border border-red-500/20 text-red-700 dark:text-red-300"
                        : "bg-amber-500/10 text-amber-800 dark:text-amber-200 border border-amber-500/30 hover:bg-amber-500 hover:text-white",
                    ].join(" ")}
                  >
                    <XCircle size={16} className="inline mr-1" /> Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => submitReview("APPROVE")}
                    disabled={reviewSaving}
                    className={[
                      "rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest transition-all",
                      reviewSaving
                        ? "opacity-60 cursor-not-allowed border border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                        : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-200 border border-emerald-500/30 hover:bg-emerald-500 hover:text-white",
                    ].join(" ")}
                  >
                    <CheckCircle2 size={16} className="inline mr-1" /> Approve
                  </button>
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
