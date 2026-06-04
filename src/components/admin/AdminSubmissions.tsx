import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, RefreshCw, User, X, XCircle } from "lucide-react";
import {
  fetchAdminAllSubmissions,
  fetchSubmissionCycles,
  formatYearMonth,
  normalizeMonthlySubmission,
  fetchMonthlySubmissionScoreBreakdown,
  submitAdminReviewDecision,
} from "../../api/monthly-submissions";
import { fetchKpiDefinitions, normalizeKpiDefinitions } from "../../api/kpi-definitions";
import { fetchValues, normalizeWebknotValuesList } from "../../api/webknotValueApi";
import { buildCycleMonthOptions, getCycleForMonth, normalizeYearMonth } from "../../utils/reviewCycles";
import { computeSubmissionScoreBreakdown } from "../../utils/submissionScoring";
import { formatWeightPercentLabel, getResolvedScoreWeights } from "../../utils/scoringSettings";
import ModalOverlay from "../shared/ModalOverlay";
import ResubmissionPlaybook from "../shared/ResubmissionPlaybook";
import CycleReplayPanel from "../shared/CycleReplayPanel";
import { captureRejectSnapshot } from "../../utils/resubmissionPlaybook";
import { isResubmissionRequested } from "../../utils/reviewCycles";
import AdminPageHeader, { AdminPageShell } from "./AdminPageHeader";
import SubmissionStatusBadge, { SubmissionLifecycleStrip } from "../shared/SubmissionStatusBadge";
import {
  resolveSubmissionWorkflow,
  submissionMatchesStatusFilter,
  SUBMISSION_STATUS_FILTER_OPTIONS,
} from "../../utils/submissionStatus";

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

function computeLocalScoreBreakdown(submission) {
  return computeSubmissionScoreBreakdown({
    managerKpiRatings: submission?.managerEvaluation?.kpiRatings,
    managerWebknotValueRatings: submission?.managerEvaluation?.webknotValueRatings,
    certifications: submission?.certifications,
    recognitionsCount: submission?.recognitionsCount,
    techShowcase: submission?.techShowcase,
  });
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
        employee?.employeeName ??
        employee?.name ??
        employee?.fullName ??
        obj.employeeName ??
        obj.userName ??
        null;
      const rawEmployeeId =
        employee?.employeeId ??
        employee?.empId ??
        employee?.id ??
        obj.employeeId ??
        obj.empId ??
        obj.userId ??
        payload?.employeeId ??
        payload?.subjectEmployeeId ??
        null;
      const rawEmail = employee?.email ?? obj.email ?? obj.userEmail ?? payload?.email ?? null;

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
      const rawReviewStatus = String(submission?.reviewStatus ?? payload?.reviewStatus ?? obj?.reviewStatus ?? status).trim().toUpperCase() || "—";
      /* After resubmission, stale rejection managerReview / adminReview
         objects may still be present in the server response.  We ignore
         them when reviewStatus has been reset to SUBMITTED.               */
      const isResubmitted = status === "SUBMITTED" && (rawReviewStatus.includes("REJECT") || rawReviewStatus.includes("NEEDS_REVIEW"));
      /* Show "SUBMITTED" instead of stale rejection status after resubmission */
      const reviewStatus = isResubmitted ? "SUBMITTED" : rawReviewStatus;
      const rawManagerReviewAction = String(
        submission?.managerReview?.action || obj?.managerReview?.action || payload?.managerReview?.action || ""
      ).trim().toUpperCase();
      const staleManagerReject = isResubmitted && rawManagerReviewAction === "REJECT";
      const hasManagerEvaluation = Boolean(
        submission?.managerEvaluation ||
        obj?.managerEvaluation ||
        payload?.managerEvaluation
      );
      const managerReady = staleManagerReject
        ? false
        : Boolean(
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
      const rawAdminAction = String(submission?.adminReview?.action || payload?.adminReview?.action || "").trim().toUpperCase() || null;
      /* After resubmission the reviewStatus becomes "SUBMITTED" but the
         server may still carry the old adminReview.  Clear the stale badge. */
      const adminAction = (isResubmitted && rawAdminAction === "REJECT") ? null : rawAdminAction;
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
    .filter((x) => {
      if (!x || !x.id) return false;
      const rs = String(x.reviewStatus || "").toUpperCase();
      return (
        x.status === "SUBMITTED" ||
        x.status === "MANAGER_REVIEWED" ||
        rs === "MANAGER_SUBMITTED" ||
        rs === "NEEDS_MANAGER_REVIEW" ||
        x.managerReady
      );
    });
}

export default function AdminSubmissions({ onLogout, employees: employeesProp }) {
  const [month, setMonth] = useState(() => formatYearMonth(new Date()));
  const [statusFilter, setStatusFilter] = useState("all");
  const [onlyManagerSubmitted, setOnlyManagerSubmitted] = useState(false);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inflightKeyRef = useRef(null);
  const [reviewModal, setReviewModal] = useState({ open: false, item: null });
  const [rejectModal, setRejectModal] = useState({ open: false, item: null, comment: "", target: "employee" });
  const [rejectBusy, setRejectBusy] = useState(false);
  const [rejectError, setRejectError] = useState("");
  const [techShowcaseText, setTechShowcaseText] = useState("");
  const [approveBusy, setApproveBusy] = useState(false);
  const [scoreBreakdown, setScoreBreakdown] = useState(null);
  const [scoreBreakdownLoading, setScoreBreakdownLoading] = useState(false);
  const [scoreBreakdownError, setScoreBreakdownError] = useState("");
  const [kpiIndex, setKpiIndex] = useState({});
  const [valueIndex, setValueIndex] = useState({});
  const [serverCycles, setServerCycles] = useState(null);

  /* Fetch available cycles from server */
  useEffect(() => {
    let cancelled = false;
    fetchSubmissionCycles()
      .then((data) => { if (!cancelled) setServerCycles(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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

  const cycleInfo = useMemo(() => {
    if (serverCycles?.currentCycle) return serverCycles.currentCycle;
    return getCycleForMonth(month || new Date());
  }, [month, serverCycles]);

  const cycleMonthOptions = useMemo(() => {
    if (Array.isArray(serverCycles?.months) && serverCycles.months.length) {
      return serverCycles.months.map((m) => ({
        value: normalizeYearMonth(m) || m,
        label: formatMonthLabel(m),
      }));
    }
    return buildCycleMonthOptions(month || new Date());
  }, [month, serverCycles]);

  useEffect(() => {
    if (!cycleMonthOptions.length) return;
    const current = normalizeYearMonth(month);
    if (current && cycleMonthOptions.some((opt) => opt.value === current)) return;
    setMonth(cycleMonthOptions[cycleMonthOptions.length - 1].value);
  }, [cycleMonthOptions, month]);

  const query = useMemo(() => {
    const m = String(month || "").trim();
    const sf = statusFilter === "all" ? null : statusFilter;
    return { month: m || null, status: sf };
  }, [month, statusFilter]);

  const visibleItems = useMemo(() => {
    return items.filter((it) => {
      if (onlyManagerSubmitted && !it.managerReady) return false;
      if (statusFilter !== "all" && !submissionMatchesStatusFilter(it, statusFilter)) return false;
      return true;
    });
  }, [items, onlyManagerSubmitted, statusFilter]);

  const statusStats = useMemo(() => {
    const counts = { submitted: 0, awaiting: 0, managerDone: 0, returned: 0, approved: 0 };
    for (const it of items) {
      const wf = resolveSubmissionWorkflow(it);
      if (wf.phase === "approved") counts.approved += 1;
      else if (wf.phase === "returned") counts.returned += 1;
      else if (wf.phase === "manager_done") counts.managerDone += 1;
      else if (wf.phase === "awaiting_manager") counts.awaiting += 1;
      else if (wf.phase === "submitted") counts.submitted += 1;
    }
    return counts;
  }, [items]);

  const reviewModalIsManagerSelf = useMemo(() => {
    const entry = reviewModal?.item;
    const type = String(entry?.submissionType || entry?.entryType || "").toUpperCase();
    return type.includes("MANAGER_SELF");
  }, [reviewModal?.item]);

  useEffect(() => {
    if (!reviewModal.open || !reviewModal.item?.submission) {
      setScoreBreakdown(null);
      setScoreBreakdownError("");
      setScoreBreakdownLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const payload = {
      month: reviewModal.item.month,
      cycleKey: reviewModal.item.submission?.cycleKey,
      submissionId: reviewModal.item.id,
      subjectEmployeeId: reviewModal.item.employee?.id,
      submissionType: reviewModal.item.submission?.submissionType ?? reviewModal.item.submissionType,
      targetRole: reviewModal.item.submission?.targetRole,
      certifications: reviewModal.item.submission?.certifications,
      kpiRatings: reviewModal.item.submission?.managerEvaluation?.kpiRatings,
      webknotValueRatings: reviewModal.item.submission?.managerEvaluation?.webknotValueRatings,
      recognitionsCount: reviewModal.item.submission?.recognitionsCount,
      techShowcase: reviewModal.item.submission?.techShowcase,
    };

    setScoreBreakdownLoading(true);
    setScoreBreakdownError("");
    fetchMonthlySubmissionScoreBreakdown(payload, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setScoreBreakdown(data);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setScoreBreakdownError(err?.message || "Failed to load score breakdown.");
        setScoreBreakdown(computeLocalScoreBreakdown(reviewModal.item.submission));
      })
      .finally(() => {
        if (!controller.signal.aborted) setScoreBreakdownLoading(false);
      });

    return () => controller.abort();
  }, [reviewModal.open, reviewModal.item]);

  const scoringBreakdown = useMemo(() => {
    if (scoreBreakdown) return scoreBreakdown;
    if (!reviewModal.item?.submission) return null;
    return computeLocalScoreBreakdown(reviewModal.item.submission);
  }, [reviewModal.item?.submission, scoreBreakdown]);

  const [scoreWeightPercents, setScoreWeightPercents] = useState(() => getResolvedScoreWeights().percents);

  useEffect(() => {
    const sync = () => setScoreWeightPercents(getResolvedScoreWeights().percents);
    sync();
    window.addEventListener("rt:app-settings-updated", sync);
    return () => window.removeEventListener("rt:app-settings-updated", sync);
  }, []);

  const rejectModalIsManagerSelf = useMemo(() => {
    const entry = rejectModal?.item;
    const type = String(entry?.submissionType || entry?.entryType || "").toUpperCase();
    return type.includes("MANAGER_SELF");
  }, [rejectModal?.item]);

  const reload = useCallback(async () => {
    setError("");
    const key = `${query.month || "all"}|${query.status || "all"}`;
    if (inflightKeyRef.current === key) return; // avoid duplicate fetches (StrictMode / rapid rerenders)
    inflightKeyRef.current = key;
    setLoading(true);
    const controller = new AbortController();
    try {
      const data = await fetchAdminAllSubmissions({
        month: query.month || undefined,
        status: query.status || undefined,
        signal: controller.signal,
      });
      setItems(normalizeAdminSubmissions(data, employeeLookup));
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (err?.status === 401) {
        onLogout?.();
        return;
      }
      const message = String(err?.message || "Failed to load submissions.").trim();
      const withStatus = err?.status && !message.toLowerCase().includes("request failed:")
        ? `${message} (HTTP ${err.status})`
        : message;
      setError(withStatus);
      setItems([]);
    } finally {
      inflightKeyRef.current = null;
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
    setTechShowcaseText(String(item?.submission?.techShowcase ?? "").trim());
    setReviewModal({ open: true, item });
  }

  function closeReview() {
    setReviewModal({ open: false, item: null });
    setTechShowcaseText("");
  }

  return (
    <AdminPageShell className="space-y-8">
      <AdminPageHeader
        title="Submissions"
        subtitle="Review employee and manager monthly submissions."
      >
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[rgb(var(--muted))]">Month</span>
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
            <span className="text-[10px] text-[rgb(var(--muted))] hidden sm:inline whitespace-nowrap">
              {cycleInfo?.label || "May-Oct / Nov-Apr"}
            </span>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rt-input text-sm min-w-[10rem]"
            aria-label="Filter by status"
          >
            {SUBMISSION_STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-3 rt-panel-subtle px-4 py-2.5">
            <input
              type="checkbox"
              checked={onlyManagerSubmitted}
              onChange={(e) => setOnlyManagerSubmitted(e.target.checked)}
            />
            <span className="text-xs font-semibold uppercase tracking-widest text-[rgb(var(--text))]">
              Manager submitted only
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
      </AdminPageHeader>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-200">
          Failed to load submissions: <span className="font-mono">{error}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Submitted", value: statusStats.submitted, tone: "primary" },
          { label: "With manager", value: statusStats.awaiting, tone: "primary" },
          { label: "Mgr. complete", value: statusStats.managerDone, tone: "primary" },
          { label: "Returned", value: statusStats.returned, tone: "warning" },
          { label: "Approved", value: statusStats.approved, tone: "success" },
        ].map((s) => (
          <div key={s.label} className="rt-stat">
            <div className="rt-field-label">{s.label}</div>
            <div className="mt-2 text-xl font-bold tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>

      <section className="rt-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-[rgb(var(--muted))] border-t border-b border-[rgb(var(--border))]">
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
                    <div className="text-xs text-[rgb(var(--muted))] mt-1 break-all">
                      {it.employee.email || "—"}
                    </div>
                  </td>
                  <td className="p-6 font-mono text-[rgb(var(--text))] whitespace-nowrap">{it.monthLabel}</td>
                  <td className="p-6">
                    <span className="text-[10px] font-semibold uppercase px-3 py-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] text-[rgb(var(--text))]">
                      {it.entryType}
                    </span>
                    {String(it.submissionType || it.entryType || "").toUpperCase().includes("MANAGER_SELF") ? (
                      <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                        Super manager
                      </div>
                    ) : null}
                  </td>
                  <td className="p-6 whitespace-nowrap">
                    <SubmissionStatusBadge
                      status={it.status}
                      reviewStatus={it.reviewStatus}
                      managerReady={it.managerReady}
                      adminAction={it.adminAction}
                      submissionType={it.submissionType}
                    />
                    {it.adminAction ? (
                      <div className="mt-2 text-[10px] font-medium text-[rgb(var(--muted))]">
                        Admin action: {it.adminAction}
                      </div>
                    ) : null}
                  </td>
                  <td className="p-6 text-xs text-[rgb(var(--muted))] font-mono whitespace-nowrap">{it.whenLabel}</td>
                  <td className="p-6 text-right px-8">
                    <div className="inline-flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openReview(it);
                        }}
                        className="p-2 rounded-md text-[rgb(var(--muted))] hover:text-[rgb(var(--primary))] hover:bg-[rgb(var(--primary))]/10 transition-all"
                        title="Review"
                      >
                        <CheckCircle2 size={16} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const isManagerSelf = String(it?.submissionType || it?.entryType || "").toUpperCase().includes("MANAGER_SELF");
                          setRejectModal({ open: true, item: it, comment: "", target: isManagerSelf ? "manager" : "employee" });
                          setRejectError("");
                        }}
                        className="p-2 rounded-md text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 transition-all"
                        title="Reject with comments"
                      >
                        <XCircle size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && visibleItems.length === 0 ? (
                <tr>
                  <td className="p-10 text-center text-[rgb(var(--muted))]" colSpan={6}>
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
                {reviewModalIsManagerSelf ? (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                    Super manager path
                  </span>
                ) : null}
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

            {isResubmissionRequested(reviewModal.item.submission) ? (
              <ResubmissionPlaybook
                submission={reviewModal.item}
                rejectComment={
                  reviewModal.item.submission?.adminReview?.comments ||
                  reviewModal.item.submission?.managerReview?.comments ||
                  ""
                }
                className="mb-6"
              />
            ) : null}

            <CycleReplayPanel
              currentSubmission={reviewModal.item}
              month={reviewModal.item.month}
              employeeId={reviewModal.item.employee?.id}
              className="mb-6"
            />

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
                            </div>
                            <span className="font-mono text-sm">{Number(rating).toFixed(1)}</span>
                          </div>
                        ))
                      ) : (
                        <div className="flex items-center justify-between gap-2 text-sm text-[rgb(var(--text))]">
                          <span className="truncate">Defaulted (no self rating)</span>
                          <span className="font-mono">2.0</span>
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
                            </div>
                            <span className="font-mono text-sm">{Number(rating).toFixed(1)}</span>
                          </div>
                        ))
                      ) : (
                        <div className="flex items-center justify-between gap-2 text-sm text-[rgb(var(--text))]">
                          <span className="truncate">Defaulted (no self rating)</span>
                          <span className="font-mono">2.0</span>
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
                  {String(reviewModal.item.submission?.techShowcase || "").trim() ? (
                    <div className="rt-panel-subtle rounded-md p-3 space-y-2">
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Tech Showcase</div>
                      <div className="text-sm whitespace-pre-wrap">{String(reviewModal.item.submission?.techShowcase || "")}</div>
                    </div>
                  ) : null}
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
                  {reviewModalIsManagerSelf ? (
                    <div className="rt-panel-subtle rounded-lg p-4 space-y-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Manager Self Review</div>
                      <p className="text-sm text-[rgb(var(--muted))]">
                        This entry is the manager&apos;s own self review. Admins review and approve directly; there is no separate manager evaluation layer.
                      </p>
                      <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                        Super manager path
                      </div>
                    </div>
                  ) : (
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
                                  </div>
                                  <span className="font-mono">{Number(rating).toFixed(1)}</span>
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
                                  </div>
                                  <span className="font-mono">{Number(rating).toFixed(1)}</span>
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
                  )}

                  {/* Scoring Breakdown */}
                  {!reviewModalIsManagerSelf ? (
                    <div className="rt-panel-subtle rounded-lg p-5 space-y-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Scoring Breakdown</div>
                        {scoreBreakdownLoading ? <div className="text-[10px] text-[rgb(var(--muted))]">Loading backend breakdown…</div> : null}
                      </div>
                      {scoreBreakdownError ? (
                        <div className="text-[10px] text-amber-600 dark:text-amber-400">{scoreBreakdownError}</div>
                      ) : null}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                        <div className="rt-panel-subtle rounded-md p-3">
                          <div className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">Manager KPI Avg</div>
                          <div className="text-xl font-bold mt-1">{scoringBreakdown?.managerKpiAverage != null ? scoringBreakdown.managerKpiAverage.toFixed(1) : "—"}</div>
                          <div className="text-[10px] text-[rgb(var(--muted))]">
                            {formatWeightPercentLabel(scoreWeightPercents.kpi)}
                          </div>
                        </div>
                        <div className="rt-panel-subtle rounded-md p-3">
                          <div className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">Manager Values Avg</div>
                          <div className="text-xl font-bold mt-1">{scoringBreakdown?.managerWebknotValueAverage != null ? scoringBreakdown.managerWebknotValueAverage.toFixed(1) : "—"}</div>
                          <div className="text-[10px] text-[rgb(var(--muted))]">
                            {formatWeightPercentLabel(scoreWeightPercents.values)}
                          </div>
                        </div>
                        <div className="rt-panel-subtle rounded-md p-3">
                          <div className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">Certs / Awards</div>
                          <div className="text-xl font-bold mt-1">{scoringBreakdown?.certificationAverage != null ? scoringBreakdown.certificationAverage.toFixed(1) : "—"}</div>
                          <div className="text-[10px] text-[rgb(var(--muted))]">
                            {formatWeightPercentLabel(scoreWeightPercents.certifications)}
                          </div>
                        </div>
                        <div className="rt-panel-subtle rounded-md p-3">
                          <div className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">Final Score</div>
                          <div className="text-xl font-bold mt-1 rt-stat-value">{scoringBreakdown?.weightedScore != null ? scoringBreakdown.weightedScore.toFixed(2) : "—"}</div>
                          <div className="text-[10px] text-[rgb(var(--muted))]">out of 5.0</div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Tech Showcase + Approve */}
                  <div className="rt-panel-subtle rounded-lg p-6 space-y-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Admin Evaluation</div>
                      {reviewModalIsManagerSelf ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                          Manager self review
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-widest text-[rgb(var(--muted))]">
                        Tech Showcase (Brownie Points)
                      </label>
                      <textarea
                        value={techShowcaseText}
                        onChange={(e) => setTechShowcaseText(e.target.value)}
                        className="rt-input w-full min-h-[80px] text-sm"
                        placeholder="Describe employee's tech showcase contribution (leave empty if none)…"
                        disabled={approveBusy}
                      />
                      <p className="text-[10px] text-[rgb(var(--muted))]">
                        If the employee presented a tech showcase, describe it here. This contributes to brownie points.
                      </p>
                    </div>
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={closeReview}
                        className="rt-btn-ghost transition-all"
                        disabled={approveBusy}
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (approveBusy) return;
                          setApproveBusy(true);
                          try {
                            await submitAdminReviewDecision({
                              submissionId: reviewModal.item.id,
                              id: reviewModal.item.id,
                              month: reviewModal.item.month,
                              subjectEmployeeId: reviewModal.item.employee.id,
                              employeeId: reviewModal.item.employee.id,
                              submissionType: reviewModal.item.submission?.submissionType ?? reviewModal.item.submissionType,
                              techShowcase: techShowcaseText.trim(),
                              adminReview: {
                                action: "APPROVE",
                                comments: "",
                                reviewedAt: new Date().toISOString(),
                              },
                              reviewStatus: "APPROVED",
                            });
                            closeReview();
                            await reload();
                          } catch (err) {
                            if (err?.status === 401) {
                              onLogout?.();
                              return;
                            }
                            // show inline error via showToast if available
                          } finally {
                            setApproveBusy(false);
                          }
                        }}
                        className="bg-emerald-600 text-white hover:bg-emerald-500 rounded-md px-5 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all disabled:opacity-70"
                        disabled={approveBusy}
                      >
                        {approveBusy ? "Approving…" : "Approve"}
                      </button>
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
              {rejectModalIsManagerSelf ? (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                  Manager self review
                </div>
              ) : null}
            </div>
          }
        >
            {/* Rejection target selector */}
            <div className="space-y-2 mb-4">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                What to reject
              </label>
              {rejectModalIsManagerSelf ? (
                <div className="rounded-lg border border-blue-500/25 bg-blue-500/5 p-3 text-[11px] text-[rgb(var(--muted))]">
                  This is a manager self review. Rejection will return it to the manager with your comments for resubmission.
                </div>
              ) : (
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
              )}
              <p className="text-[10px] text-[rgb(var(--muted))]">
                {rejectModalIsManagerSelf
                  ? "The manager will edit and resubmit their own review with your feedback."
                  : (rejectModal.target || "employee") === "employee"
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
                  const target = rejectModalIsManagerSelf ? "manager" : (rejectModal.target || "employee");
                  const submission = rejectModal.item.submission || rejectModal.item.raw || {};
                  const payload =
                    (submission.raw && submission.raw.payload && typeof submission.raw.payload === "object" ? submission.raw.payload : null) ||
                    (submission.payload && typeof submission.payload === "object" ? submission.payload : null) ||
                    (submission && typeof submission === "object" ? submission : {});
                  const selfReviewText = String(payload.selfReviewText ?? payload.selfReview ?? payload.reviewText ?? "").trim();
                  const certifications = Array.isArray(payload.certifications) ? payload.certifications : [];
                  const kpiRatings = payload.kpiRatings && typeof payload.kpiRatings === "object" ? payload.kpiRatings : {};
                  const webknotValueRatings = payload.webknotValueRatings && typeof payload.webknotValueRatings === "object" ? payload.webknotValueRatings : {};
                  const webknotValues = Array.isArray(payload.webknotValues) ? payload.webknotValues : Object.keys(webknotValueRatings);
                  const recognitionsCount = Number.isFinite(Number(payload.recognitionsCount)) ? Number(payload.recognitionsCount) : 0;
                  const rejectSnapshot = captureRejectSnapshot({ submission: payload, raw: submission.raw });
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
                        action: rejectModalIsManagerSelf ? "REJECT" : target === "manager" ? "REJECT_MANAGER" : "REJECT",
                        target,
                        comments: comment,
                        reviewedAt: new Date().toISOString(),
                      },
                      reviewStatus: rejectModalIsManagerSelf ? "REJECT" : target === "manager" ? "NEEDS_MANAGER_REVIEW" : "REJECT",
                      reopenedForResubmission: rejectModalIsManagerSelf || target === "employee",
                      selfReviewText,
                      certifications,
                      kpiRatings,
                      webknotValueRatings,
                      webknotValues,
                      recognitionsCount,
                      _rejectSnapshot: rejectSnapshot,
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

    </AdminPageShell>
  );
}
