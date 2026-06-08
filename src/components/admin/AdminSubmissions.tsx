import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, User, X, XCircle } from "lucide-react";
import {
  fetchAdminAllSubmissions,
  fetchSubmissionCycles,
  formatYearMonth,
  normalizeMonthlySubmission,
  resolveSubmissionKpiRatings,
  resolveSubmissionValueRatings,
  resolveManagerKpiRatings,
  resolveManagerValueRatings,
  fetchMonthlySubmissionScoreBreakdown,
  submitAdminReviewDecision,
  submitSuperAdminManagerSelfEval,
} from "../../api/monthly-submissions";
import { fetchKpiDefinitions, normalizeKpiDefinitions } from "../../api/kpi-definitions";
import { fetchValues, normalizeWebknotValuesList } from "../../api/webknotValueApi";
import {
  buildCycleMonthOptions,
  getCycleForMonth,
  isAssignedSuperAdminReviewer,
  normalizeYearMonth,
  resolveReviewingSuperAdminIds,
} from "../../utils/reviewCycles";
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
  SUBMISSION_PHASES,
  SUBMISSION_STATUS_FILTER_OPTIONS,
} from "../../utils/submissionStatus";
import { isHrPortalUser } from "../../utils/hrRatingsFilter";
import { isSuperAdminPortalUser } from "../../utils/portalAccess";
import { formatPerformanceRating, parseDecimalPerformanceRating } from "../../utils/ratingLabels";
import { DecimalPerformanceRatingInput } from "../shared/PerformanceRatingField";

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

function computeLocalScoreBreakdown(submission, raw, overrides = {}) {
  const source = { payload: submission, raw: raw ?? submission?.raw };
  return computeSubmissionScoreBreakdown({
    managerKpiRatings: overrides.managerKpiRatings ?? resolveManagerKpiRatings(source),
    managerWebknotValueRatings: overrides.managerWebknotValueRatings ?? resolveManagerValueRatings(source),
    certifications: submission?.certifications,
    recognitionsCount: submission?.recognitionsCount,
    techShowcase: submission?.techShowcase,
  });
}

function normalizeDecimalRatingsMap(input) {
  const out = {};
  for (const [key, value] of Object.entries(input || {})) {
    const id = String(key || "").trim();
    if (!id) continue;
    const parsed = parseDecimalPerformanceRating(value);
    if (parsed != null) out[id] = parsed;
  }
  return out;
}

function resolveReviewerDisplayName(token, employeeLookup) {
  const trimmed = String(token || "").trim();
  if (!trimmed) return null;
  const match = employeeLookup?.get(trimmed.toLowerCase());
  if (match?.name) return match.name;
  if (match?.email) return match.email;
  return trimmed;
}

function extractManagerReviewerTokens(submission, obj, payload) {
  let managerReview = submission?.managerReview ?? obj?.managerReview ?? payload?.managerReview;
  let managerEvaluation = submission?.managerEvaluation ?? obj?.managerEvaluation ?? payload?.managerEvaluation;

  const jsonRaw =
    submission?.managerReviewJson ??
    obj?.managerReviewJson ??
    submission?.raw?.managerReviewJson;
  if (jsonRaw && typeof jsonRaw === "string") {
    try {
      const parsed = JSON.parse(jsonRaw);
      managerReview = managerReview ?? parsed?.managerReview;
      managerEvaluation = managerEvaluation ?? parsed?.managerEvaluation;
    } catch {
      // ignore malformed JSON
    }
  } else if (jsonRaw && typeof jsonRaw === "object") {
    managerReview = managerReview ?? jsonRaw?.managerReview;
    managerEvaluation = managerEvaluation ?? jsonRaw?.managerEvaluation;
  }

  return [
    managerReview?.reviewedBy,
    managerEvaluation?.reviewedBy,
    managerReview?.reviewerName,
    managerEvaluation?.reviewerName,
    obj?.reviewedByManager,
    payload?.reviewedByManager,
  ]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
}

function resolveManagerReviewerLabels(submission, obj, payload, employeeLookup) {
  const candidates = extractManagerReviewerTokens(submission, obj, payload);
  const labels = [];
  const seen = new Set();
  for (const text of candidates) {
    for (const part of text.split(/[,\n]+/g)) {
      const cleaned = String(part || "").trim();
      const key = cleaned.toLowerCase();
      if (!cleaned || seen.has(key)) continue;
      seen.add(key);
      const label = resolveReviewerDisplayName(cleaned, employeeLookup);
      if (label) labels.push(label);
    }
  }
  return labels;
}

function resolveAdminReviewerLabel(auth) {
  return String(
    auth?.name ??
    auth?.employeeName ??
    auth?.claims?.name ??
    auth?.email ??
    auth?.employeeId ??
    auth?.empId ??
    ""
  ).trim() || null;
}

function isSubmissionClosedForAdmin(item) {
  const wf = resolveSubmissionWorkflow(item);
  if (wf.phase === SUBMISSION_PHASES.APPROVED || wf.phase === SUBMISSION_PHASES.LOCKED) return true;
  const adminAction = String(item?.adminAction || "").trim().toUpperCase();
  if (adminAction === "APPROVE") return true;
  const status = String(item?.status || "").trim().toUpperCase();
  const reviewStatus = String(item?.reviewStatus || "").trim().toUpperCase();
  return status === "APPROVED" || reviewStatus === "APPROVED";
}

function canAdminActOnSubmission(item) {
  if (isSubmissionClosedForAdmin(item)) return false;
  const wf = resolveSubmissionWorkflow(item);
  if (wf.phase === SUBMISSION_PHASES.MANAGER_DONE) return true;
  if (wf.phase === SUBMISSION_PHASES.RETURNED) return true;
  const isManagerSelf = String(item?.submissionType || item?.entryType || "").toUpperCase().includes("MANAGER_SELF");
  if (isManagerSelf) return true;
  if (item?.managerReady) return true;
  return false;
}

function defaultRejectTargetForItem(item) {
  const isManagerSelf = String(item?.submissionType || item?.entryType || "").toUpperCase().includes("MANAGER_SELF");
  if (isManagerSelf) return "manager";
  const wf = resolveSubmissionWorkflow(item);
  if (item?.managerReady && wf.phase === SUBMISSION_PHASES.MANAGER_DONE) return "manager";
  return "employee";
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
      const rawManagerReviewAction = String(
        submission?.managerReview?.action || obj?.managerReview?.action || payload?.managerReview?.action || ""
      ).trim().toUpperCase();
      const rawAdminReviewAction = String(
        submission?.adminReview?.action || obj?.adminReview?.action || payload?.adminReview?.action || ""
      ).trim().toUpperCase();
      /* After employee resubmits, reviewStatus becomes SUBMITTED but stale
         reject objects may linger — treat that as a fresh submission. */
      const isResubmitted =
        status === "SUBMITTED" &&
        rawReviewStatus === "SUBMITTED" &&
        (rawManagerReviewAction === "REJECT" || rawAdminReviewAction === "REJECT");
      const reviewStatus = isResubmitted ? "SUBMITTED" : rawReviewStatus;
      const staleManagerReject = isResubmitted && rawManagerReviewAction === "REJECT";
      const needsManagerRework = rawReviewStatus === "NEEDS_MANAGER_REVIEW";
      const hasManagerEvaluation = Boolean(
        submission?.managerEvaluation ||
        obj?.managerEvaluation ||
        payload?.managerEvaluation
      );
      const superAdminEvalReady = Boolean(
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
      const managerReady = needsManagerRework || staleManagerReject
        ? false
        : isManagerSelf
          ? managerSelfSubmitted || superAdminEvalReady
          : superAdminEvalReady;
      const rawAdminAction = String(submission?.adminReview?.action || payload?.adminReview?.action || "").trim().toUpperCase() || null;
      /* After resubmission the reviewStatus becomes "SUBMITTED" but the
         server may still carry the old adminReview.  Clear the stale badge. */
      const adminAction = (isResubmitted && rawAdminAction === "REJECT") ? null : rawAdminAction;
      const isManagerSelf = submissionType === "MANAGER_SELF_REVIEW";
      const managerSelfSubmitted = isManagerSelf && Boolean(
        submittedAt ||
        status === "SUBMITTED" ||
        reviewStatus === "SUBMITTED"
      );
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
        managerSelfSubmitted,
        entryType,
        submissionType,
        adminAction,
        managerReviewers: resolveManagerReviewerLabels(submission, obj, payload, employeeLookup),
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
        x.status === "APPROVED" ||
        rs === "MANAGER_SUBMITTED" ||
        rs === "NEEDS_MANAGER_REVIEW" ||
        rs === "APPROVED" ||
        x.managerReady ||
        x.managerSelfSubmitted
      );
    });
}

export default function AdminSubmissions({ onLogout, employees: employeesProp, auth = null }) {
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
  const [managerSelfEvalComments, setManagerSelfEvalComments] = useState("");
  const [managerSelfEvalBusy, setManagerSelfEvalBusy] = useState(false);
  const [managerSelfEvalError, setManagerSelfEvalError] = useState("");
  const [scoreBreakdown, setScoreBreakdown] = useState(null);
  const [scoreBreakdownLoading, setScoreBreakdownLoading] = useState(false);
  const [scoreBreakdownError, setScoreBreakdownError] = useState("");
  const [reviewEditableKpiRatings, setReviewEditableKpiRatings] = useState({});
  const [reviewEditableValueRatings, setReviewEditableValueRatings] = useState({});
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

  /* Build lookup map: id / empId / email (lowercase) → { name, email } */
  const employeeLookup = useMemo(() => {
    const map = new Map();
    if (Array.isArray(employeesProp)) {
      for (const emp of employeesProp) {
        const entry = {
          name: String(emp?.name ?? emp?.employeeName ?? "").trim() || null,
          email: String(emp?.email ?? emp?.employeeEmail ?? "").trim() || null,
        };
        for (const key of [emp?.id, emp?.employeeId, emp?.empId, entry.email]) {
          const id = String(key ?? "").trim().toLowerCase();
          if (!id) continue;
          map.set(id, entry);
        }
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
    const viewerId = String(auth?.employeeId ?? auth?.empId ?? auth?.id ?? "").trim();
    const restrictAssignedSelfReviews = isSuperAdminPortalUser(auth) && !isHrPortalUser(auth);
    return items.filter((it) => {
      if (onlyManagerSubmitted && !it.managerReady) return false;
      if (statusFilter !== "all" && !submissionMatchesStatusFilter(it, statusFilter)) return false;
      if (restrictAssignedSelfReviews) {
        const type = String(it.submissionType || it.entryType || "").toUpperCase();
        if (type.includes("MANAGER_SELF") && !isAssignedSuperAdminReviewer(it, viewerId)) return false;
      }
      return true;
    });
  }, [auth, items, onlyManagerSubmitted, statusFilter]);

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

  const reviewModalManagerReviewers = useMemo(() => {
    const entry = reviewModal?.item;
    if (!entry) return [];
    if (Array.isArray(entry.managerReviewers) && entry.managerReviewers.length) {
      return entry.managerReviewers;
    }
    const sub = entry.submission || {};
    const raw = sub?.raw && typeof sub.raw === "object" ? sub.raw : entry?.raw && typeof entry.raw === "object" ? entry.raw : {};
    const payload = sub?.raw?.payload && typeof sub.raw.payload === "object"
      ? sub.raw.payload
      : (raw?.payload && typeof raw.payload === "object" ? raw.payload : raw);
    return resolveManagerReviewerLabels(sub, raw, payload, employeeLookup);
  }, [reviewModal?.item, employeeLookup]);

  const reviewModalEmployeeKpiRatings = useMemo(() => {
    if (!reviewModal?.item) return {};
    return resolveSubmissionKpiRatings({
      payload: reviewModal.item.submission,
      raw: reviewModal.item.submission?.raw ?? reviewModal.item.raw,
    });
  }, [reviewModal?.item]);

  const reviewModalEmployeeValueRatings = useMemo(() => {
    if (!reviewModal?.item) return {};
    return resolveSubmissionValueRatings({
      payload: reviewModal.item.submission,
      raw: reviewModal.item.submission?.raw ?? reviewModal.item.raw,
    });
  }, [reviewModal?.item]);

  const reviewModalManagerKpiRatings = useMemo(() => {
    if (!reviewModal?.item) return {};
    return resolveManagerKpiRatings({
      payload: reviewModal.item.submission,
      raw: reviewModal.item.submission?.raw ?? reviewModal.item.raw,
    });
  }, [reviewModal?.item]);

  const reviewModalManagerValueRatings = useMemo(() => {
    if (!reviewModal?.item) return {};
    return resolveManagerValueRatings({
      payload: reviewModal.item.submission,
      raw: reviewModal.item.submission?.raw ?? reviewModal.item.raw,
    });
  }, [reviewModal?.item]);

  const reviewModalManagerComments = useMemo(() => {
    if (!reviewModal?.item) return "";
    const sub = reviewModal.item.submission ?? {};
    const raw = sub?.raw ?? reviewModal.item.raw ?? {};
    return String(
      sub?.managerReview?.comments ??
      raw?.managerSelfReviewEvalComments ??
      sub?.managerEvaluation?.comments ??
      ""
    ).trim();
  }, [reviewModal?.item]);

  const reviewModalSuperAdminEvalLocked = useMemo(() => {
    if (!reviewModalIsManagerSelf || !reviewModal?.item) return false;
    if (isSubmissionClosedForAdmin(reviewModal.item)) return true;
    const sub = reviewModal.item.submission ?? {};
    return Boolean(
      sub.managerSubmittedAt || String(reviewModalManagerComments || "").trim()
    );
  }, [reviewModal?.item, reviewModalIsManagerSelf, reviewModalManagerComments]);

  const reviewModalAssignedSuperAdmins = useMemo(() => {
    if (!reviewModal?.item) return [];
    const sub = reviewModal.item.submission ?? reviewModal.item.raw ?? {};
    return resolveReviewingSuperAdminIds(sub).map(
      (id) => resolveReviewerDisplayName(id, employeeLookup) || id
    );
  }, [employeeLookup, reviewModal?.item]);

  useEffect(() => {
    if (!reviewModal.open || !reviewModal.item) {
      setReviewEditableKpiRatings({});
      setReviewEditableValueRatings({});
      return;
    }
    if (reviewModalIsManagerSelf) {
      setReviewEditableKpiRatings(normalizeDecimalRatingsMap(reviewModalEmployeeKpiRatings));
      setReviewEditableValueRatings(normalizeDecimalRatingsMap(reviewModalEmployeeValueRatings));
      return;
    }
    setReviewEditableKpiRatings(normalizeDecimalRatingsMap(reviewModalManagerKpiRatings));
    setReviewEditableValueRatings(normalizeDecimalRatingsMap(reviewModalManagerValueRatings));
  }, [
    reviewModal.open,
    reviewModal.item,
    reviewModalIsManagerSelf,
    reviewModalEmployeeKpiRatings,
    reviewModalEmployeeValueRatings,
    reviewModalManagerKpiRatings,
    reviewModalManagerValueRatings,
  ]);

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
      kpiRatings: reviewEditableKpiRatings,
      webknotValueRatings: reviewEditableValueRatings,
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
        setScoreBreakdown(computeLocalScoreBreakdown(reviewModal.item.submission, reviewModal.item.raw));
      })
      .finally(() => {
        if (!controller.signal.aborted) setScoreBreakdownLoading(false);
      });

    return () => controller.abort();
  }, [reviewModal.open, reviewModal.item, reviewEditableKpiRatings, reviewEditableValueRatings]);

  const scoringBreakdown = useMemo(() => {
    if (!reviewModal.item?.submission) return null;
    const local = computeLocalScoreBreakdown(reviewModal.item.submission, reviewModal.item.raw, {
      managerKpiRatings: reviewEditableKpiRatings,
      managerWebknotValueRatings: reviewEditableValueRatings,
    });
    if (reviewModal.open && (Object.keys(reviewEditableKpiRatings).length || Object.keys(reviewEditableValueRatings).length)) {
      return local;
    }
    if (scoreBreakdown) return scoreBreakdown;
    return local;
  }, [
    reviewModal.item?.submission,
    reviewModal.item?.raw,
    reviewModal.open,
    reviewEditableKpiRatings,
    reviewEditableValueRatings,
    scoreBreakdown,
  ]);

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
    const sub = item?.submission ?? {};
    const raw = sub?.raw ?? item?.raw ?? {};
    setManagerSelfEvalComments(
      String(
        sub?.managerReview?.comments ??
        raw?.managerSelfReviewEvalComments ??
        ""
      ).trim()
    );
    setManagerSelfEvalError("");
    setReviewModal({ open: true, item });
  }

  function closeReview() {
    setReviewModal({ open: false, item: null });
    setTechShowcaseText("");
    setManagerSelfEvalComments("");
    setManagerSelfEvalError("");
    setReviewEditableKpiRatings({});
    setReviewEditableValueRatings({});
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
                <th className="p-6 font-semibold">Rated by</th>
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
                  <td className="p-6 whitespace-nowrap">
                    <span className="inline-flex text-[10px] font-semibold uppercase whitespace-nowrap px-3 py-1 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] text-[rgb(var(--text))]">
                      {it.entryType}
                    </span>
                    {String(it.submissionType || it.entryType || "").toUpperCase().includes("MANAGER_SELF") ? (
                      <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                        Super admin
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
                      compact
                    />
                    {it.adminAction ? (
                      <div className="mt-2 text-[10px] font-medium text-[rgb(var(--muted))]">
                        Admin action: {it.adminAction}
                      </div>
                    ) : null}
                  </td>
                  <td className="p-6">
                    {it.managerReviewers?.length ? (
                      <div className="space-y-1">
                        {it.managerReviewers.map((name) => (
                          <div
                            key={name}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--text))]"
                          >
                            <User size={12} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                            {name}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-[rgb(var(--muted))]">—</span>
                    )}
                  </td>
                  <td className="p-6 text-xs text-[rgb(var(--muted))] font-mono whitespace-nowrap">{it.whenLabel}</td>
                  <td className="p-6 px-8" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2 min-w-[5.5rem]">
                      {isSubmissionClosedForAdmin(it) ? (
                        <span className="text-[10px] font-medium uppercase tracking-wider text-[rgb(var(--muted))]">
                          Complete
                        </span>
                      ) : canAdminActOnSubmission(it) ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openReview(it)}
                            className="p-2 rounded-md text-[rgb(var(--muted))] hover:text-[rgb(var(--primary))] hover:bg-[rgb(var(--primary))]/10 transition-all"
                            title="Review and approve"
                          >
                            <CheckCircle2 size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectModal({
                                open: true,
                                item: it,
                                comment: "",
                                target: defaultRejectTargetForItem(it),
                              });
                              setRejectError("");
                            }}
                            className="p-2 rounded-md text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 transition-all"
                            title="Reject with comments"
                          >
                            <XCircle size={16} />
                          </button>
                        </>
                      ) : (
                        <span className="text-[10px] font-medium text-[rgb(var(--muted))]">
                          Awaiting manager
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && visibleItems.length === 0 ? (
                <tr>
                  <td className="p-10 text-center text-[rgb(var(--muted))]" colSpan={7}>
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
                    Super admin review
                  </span>
                ) : null}
                {!reviewModalIsManagerSelf && reviewModalManagerReviewers.length ? (
                  <span
                    className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                    title={reviewModalManagerReviewers.join(", ")}
                  >
                    <User size={11} /> {reviewModalManagerReviewers.length > 1 ? "Managers" : "Manager"}: {reviewModalManagerReviewers[0]}
                    {reviewModalManagerReviewers.length > 1 ? ` (+${reviewModalManagerReviewers.length - 1})` : ""}
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
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  {reviewModalIsManagerSelf ? "Manager submission (locked)" : "Submitted Content"}
                </div>
                <div className="mt-4 space-y-4 text-sm text-[rgb(var(--text))]">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-gray-500">Self Review</div>
                    <div className="mt-2 whitespace-pre-wrap">{String(reviewModal.item.submission?.selfReviewText || "—")}</div>
                  </div>
                  {Array.isArray(reviewModal.item.submission?.projectIds) &&
                  reviewModal.item.submission.projectIds.length ? (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-widest text-gray-500">Selected Projects</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {reviewModal.item.submission.projectIds.map((projectId) => (
                          <span
                            key={String(projectId)}
                            className="inline-flex rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-1 text-xs"
                          >
                            {String(projectId)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rt-panel-subtle rounded-md p-3 space-y-2">
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                        {reviewModalIsManagerSelf ? "Manager KPI self-ratings" : "Employee KPI Ratings"}
                      </div>
                      {Object.entries(reviewModalEmployeeKpiRatings).length ? (
                        Object.entries(reviewModalEmployeeKpiRatings).map(([kpiId, rating]) => (
                          <div key={kpiId} className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm truncate">{kpiLabel(kpiId)}</div>
                            </div>
                            <span className="font-mono text-sm">{formatPerformanceRating(rating)}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-[rgb(var(--muted))]">No employee KPI ratings recorded.</div>
                      )}
                    </div>
                    <div className="rt-panel-subtle rounded-md p-3 space-y-2">
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                        {reviewModalIsManagerSelf ? "Manager value self-ratings" : "Employee Values Ratings"}
                      </div>
                      {Object.entries(reviewModalEmployeeValueRatings).length ? (
                        Object.entries(reviewModalEmployeeValueRatings).map(([valueId, rating]) => (
                          <div key={valueId} className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm truncate">{valueLabel(valueId)}</div>
                            </div>
                            <span className="font-mono text-sm">{formatPerformanceRating(rating)}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-[rgb(var(--muted))]">No employee value ratings recorded.</div>
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
                    <div className="rt-panel-subtle rounded-lg p-4 space-y-4">
                      <div className="space-y-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Manager Self Review</div>
                        <p className="text-sm text-[rgb(var(--muted))]">
                          The manager&apos;s self review is locked for this month. Review their submitted ratings on the left, set final scores and comments below, then approve or reject.
                        </p>
                        <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                          Super admin review
                        </div>
                        {reviewModalAssignedSuperAdmins.length ? (
                          <div className="text-[11px] text-[rgb(var(--muted))]">
                            Assigned reviewers: {reviewModalAssignedSuperAdmins.join(", ")}
                          </div>
                        ) : null}
                        {reviewModalSuperAdminEvalLocked ? (
                          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
                            Your evaluation is saved. Approve to finalize, or reject to send back to the manager.
                          </div>
                        ) : null}
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">
                          Final KPI scores (decimals allowed)
                        </div>
                        <div className="mt-2 space-y-2">
                          {Object.entries(reviewEditableKpiRatings).length ? (
                            Object.entries(reviewEditableKpiRatings).map(([kpiId, rating]) => (
                              <div key={kpiId} className="flex items-center justify-between gap-3">
                                <div className="flex-1 min-w-0 truncate">{kpiLabel(kpiId)}</div>
                                <DecimalPerformanceRatingInput
                                  value={rating}
                                  disabled={reviewModalSuperAdminEvalLocked || managerSelfEvalBusy}
                                  onChange={(next) => {
                                    setReviewEditableKpiRatings((prev) => {
                                      const updated = { ...(prev || {}) };
                                      if (next == null) {
                                        delete updated[kpiId];
                                        return updated;
                                      }
                                      updated[kpiId] = next;
                                      return updated;
                                    });
                                  }}
                                />
                              </div>
                            ))
                          ) : (
                            <div className="text-xs text-[rgb(var(--muted))]">No KPI ratings to review.</div>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">
                          Final value scores (decimals allowed)
                        </div>
                        <div className="mt-2 space-y-2">
                          {Object.entries(reviewEditableValueRatings).length ? (
                            Object.entries(reviewEditableValueRatings).map(([valueId, rating]) => (
                              <div key={valueId} className="flex items-center justify-between gap-3">
                                <div className="flex-1 min-w-0 truncate">{valueLabel(valueId)}</div>
                                <DecimalPerformanceRatingInput
                                  value={rating}
                                  disabled={reviewModalSuperAdminEvalLocked || managerSelfEvalBusy}
                                  onChange={(next) => {
                                    setReviewEditableValueRatings((prev) => {
                                      const updated = { ...(prev || {}) };
                                      if (next == null) {
                                        delete updated[valueId];
                                        return updated;
                                      }
                                      updated[valueId] = next;
                                      return updated;
                                    });
                                  }}
                                />
                              </div>
                            ))
                          ) : (
                            <div className="text-xs text-[rgb(var(--muted))]">No value ratings to review.</div>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">
                          Super admin comments
                        </label>
                        <textarea
                          value={managerSelfEvalComments}
                          onChange={(e) => {
                            setManagerSelfEvalComments(e.target.value);
                            setManagerSelfEvalError("");
                          }}
                          className="rt-input w-full min-h-[100px] text-sm"
                          placeholder="Feedback on this manager self review (required before approve)…"
                          disabled={reviewModalSuperAdminEvalLocked || managerSelfEvalBusy || approveBusy}
                        />
                        {managerSelfEvalError ? (
                          <div className="text-xs text-red-600">{managerSelfEvalError}</div>
                        ) : null}
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              if (managerSelfEvalBusy || reviewModalSuperAdminEvalLocked) return;
                              const comment = String(managerSelfEvalComments || "").trim();
                              if (!comment) {
                                setManagerSelfEvalError("Add comments before saving your evaluation.");
                                return;
                              }
                              const submissionId = String(reviewModal.item?.id || "").trim();
                              if (!submissionId) {
                                setManagerSelfEvalError("Missing submission id.");
                                return;
                              }
                              setManagerSelfEvalBusy(true);
                              setManagerSelfEvalError("");
                              try {
                                await submitSuperAdminManagerSelfEval({
                                  submissionId,
                                  kpiRatings: reviewEditableKpiRatings,
                                  webknotValueRatings: reviewEditableValueRatings,
                                  comments: comment,
                                  reviewedBy: resolveAdminReviewerLabel(auth),
                                });
                                await reload();
                              } catch (err) {
                                if (err?.status === 401) {
                                  onLogout?.();
                                  return;
                                }
                                setManagerSelfEvalError(err?.message || "Failed to save evaluation.");
                              } finally {
                                setManagerSelfEvalBusy(false);
                              }
                            }}
                            className="bg-blue-600 text-white hover:bg-blue-500 rounded-md px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all disabled:opacity-70"
                            disabled={reviewModalSuperAdminEvalLocked || managerSelfEvalBusy || approveBusy}
                          >
                            {managerSelfEvalBusy ? "Saving…" : "Save evaluation"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rt-panel-subtle rounded-lg p-4">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Manager Ratings & Comments</div>
                      <p className="mt-2 text-[11px] text-[rgb(var(--muted))]">
                        Fine-tune manager scores with one decimal place before approval.
                      </p>
                      <div className="mt-3 space-y-3 text-sm text-[rgb(var(--text))]">
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">Manager KPI Ratings</div>
                          <div className="mt-2 space-y-2">
                            {Object.entries(reviewEditableKpiRatings).length ? (
                              Object.entries(reviewEditableKpiRatings).map(([kpiId, rating]) => (
                                <div key={kpiId} className="flex items-center justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="truncate">{kpiLabel(kpiId)}</div>
                                  </div>
                                  <DecimalPerformanceRatingInput
                                    value={rating}
                                    onChange={(next) => {
                                      setReviewEditableKpiRatings((prev) => {
                                        const updated = { ...(prev || {}) };
                                        if (next == null) {
                                          delete updated[kpiId];
                                          return updated;
                                        }
                                        updated[kpiId] = next;
                                        return updated;
                                      });
                                    }}
                                  />
                                </div>
                              ))
                            ) : (
                              <div className="text-xs text-[rgb(var(--muted))]">No manager KPI ratings.</div>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">Manager Value Ratings</div>
                          <div className="mt-2 space-y-2">
                            {Object.entries(reviewEditableValueRatings).length ? (
                              Object.entries(reviewEditableValueRatings).map(([valueId, rating]) => (
                                <div key={valueId} className="flex items-center justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="truncate">{valueLabel(valueId)}</div>
                                  </div>
                                  <DecimalPerformanceRatingInput
                                    value={rating}
                                    onChange={(next) => {
                                      setReviewEditableValueRatings((prev) => {
                                        const updated = { ...(prev || {}) };
                                        if (next == null) {
                                          delete updated[valueId];
                                          return updated;
                                        }
                                        updated[valueId] = next;
                                        return updated;
                                      });
                                    }}
                                  />
                                </div>
                              ))
                            ) : (
                              <div className="text-xs text-[rgb(var(--muted))]">No manager value ratings.</div>
                            )}
                          </div>
                        </div>
                        {reviewModalManagerComments ? (
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">Manager Comments</div>
                            <div className="mt-2 whitespace-pre-wrap">{reviewModalManagerComments}</div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {/* Scoring Breakdown */}
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
                          const adminComment = reviewModalIsManagerSelf
                            ? String(managerSelfEvalComments || "").trim()
                            : "";
                          if (reviewModalIsManagerSelf && !adminComment) {
                            setManagerSelfEvalError("Add super admin comments before approving.");
                            return;
                          }
                          setApproveBusy(true);
                          setManagerSelfEvalError("");
                          try {
                            if (reviewModalIsManagerSelf) {
                              const submissionId = String(reviewModal.item?.id || "").trim();
                              if (!submissionId) throw new Error("Missing submission id.");
                              await submitSuperAdminManagerSelfEval({
                                submissionId,
                                kpiRatings: reviewEditableKpiRatings,
                                webknotValueRatings: reviewEditableValueRatings,
                                comments: adminComment,
                                reviewedBy: resolveAdminReviewerLabel(auth),
                              });
                            }
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
                                comments: adminComment,
                                reviewedAt: new Date().toISOString(),
                                reviewedBy: resolveAdminReviewerLabel(auth),
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
                            if (reviewModalIsManagerSelf) {
                              setManagerSelfEvalError(err?.message || "Approve failed. Try again.");
                            }
                          } finally {
                            setApproveBusy(false);
                          }
                        }}
                        className="bg-emerald-600 text-white hover:bg-emerald-500 rounded-md px-5 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all disabled:opacity-70"
                        disabled={approveBusy || (reviewModalIsManagerSelf && reviewModalSuperAdminEvalLocked && isSubmissionClosedForAdmin(reviewModal.item))}
                      >
                        {approveBusy ? "Approving…" : reviewModalIsManagerSelf ? "Approve ratings" : "Approve"}
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
                        reviewedBy: resolveAdminReviewerLabel(auth),
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
