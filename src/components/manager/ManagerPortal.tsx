// @ts-nocheck
import type { ApiOptions } from "../../types/api-options";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  BellDot,
  Calendar,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Briefcase,
  Eye,
  FolderKanban,
  LogOut,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Star,
  UserCircle2,
  Users,
  X,
  XCircle,
  History,
  Activity,
} from "lucide-react";

import { fetchMe } from "../../api/auth";
import { fetchPortalManager } from "../../api/portal";
import {
  fetchAssignedManagerSelfReviews,
  fetchMyMonthlySubmission,
  fetchManagerTeamSubmissions,
  formatYearMonth,
  normalizeMonthlySubmission,
  resolveManagerKpiRatings,
  resolveManagerValueRatings,
  resolveSubmissionKpiRatings,
  resolveSubmissionValueRatings,
  resolveSubmissionIdFromRow,
  saveMonthlyDraft,
  submitMonthlySubmission,
} from "../../api/monthly-submissions";
import {
  fetchManagerReportees,
  fetchSuperAdminReviewers,
  normalizeEmployees,
} from "../../api/employees";
import { fetchEmployeePortalKpiDefinitions, normalizeCursorPage } from "../../api/employee-portal";
import { fetchKpiDefinitions, normalizeKpiDefinitions } from "../../api/kpi-definitions";
import { fetchValues, normalizeWebknotValuesList } from "../../api/webknotValueApi";
import { enhanceReviewText, fetchActiveAiAgent } from "../../api/ai-agents";
import { getManagerSettings } from "../../utils/appSettings";
import { resolveUsageGuideKey } from "../../utils/portalUsageGuide";
import { extractEmploymentDetails } from "../../utils/employmentProfile";
import {
  buildCycleMeta,
  getCycleForMonth,
  isDraftSaveBlockedByReviewStateMessage,
  isManagerSelfReviewLocked,
  isResubmissionRequested,
  normalizeYearMonth,
  resolveReviewingSuperAdminIds,
} from "../../utils/reviewCycles";
import { formatPerformanceRating, performanceRatingLabel, performanceRatingScaleText, parseIntegerPerformanceRating } from "../../utils/ratingLabels";
import { IntegerPerformanceRatingSelect } from "../shared/PerformanceRatingField";

import Toast from "../shared/Toast";
import CursorPagination from "../shared/CursorPagination";
import ModalOverlay from "../shared/ModalOverlay";
import PortalUserMenu from "../shared/PortalUserMenu";
import AppShell from "../shared/AppShell";
import PortalSidebar from "../shared/PortalSidebar";
import PortalUsageGuideModal from "../shared/PortalUsageGuideModal";
import UserProfilePage from "../shared/UserProfilePage";
import ManagerSettingsPanel from "../shared/settings/ManagerSettingsPanel";
import PortalPageHeader from "../shared/PortalPageHeader";
import PortalWorkflowFrame from "../shared/PortalWorkflowFrame";
import SubmissionWindowClosed from "../employee/SubmissionWindowClosed";
import CycleReplayPanel from "../shared/CycleReplayPanel";
import ResubmissionPlaybook from "../shared/ResubmissionPlaybook";
import { captureRejectSnapshot } from "../../utils/resubmissionPlaybook";
import { fetchSubmissionAccessForRole } from "../../api/submission-window";
import { computeSubmissionWindowOpen } from "../../utils/submissionWindow";
import { isHrPortalUser, shouldHideHrPeerRating } from "../../utils/hrRatingsFilter";
import { buildCycleMonthOptions } from "../../utils/reviewCycles";
import { playNotificationSound, unlockNotificationSound } from "../../utils/notificationSound";
import { safeJsonParse } from "../../utils/json";
import {
  fetchManagerNotifications,
  markAllManagerNotificationsRead,
  markManagerNotificationRead,
  normalizeManagerNotificationPage,
  resolveNotificationUserId,
  subscribeManagerNotificationsStream,
} from "../../api/notifications";
import { MANAGER_NAV_GROUPS, MANAGER_TAB_COPY } from "../../config/portalNavigation";

const MANAGER_REVIEW_DRAFT_KEY = "rt_tracking_manager_review_draft_v1";
const MANAGER_SIDEBAR_PREF_KEY = "rt_tracking_manager_sidebar_open_v1";

const TEAM_PAGE_SIZE = 12;
const MANAGER_NOTIFICATION_PAGE_SIZE = 25;
const MANAGER_NOTIFICATION_POLL_MS = 30_000;

function loadManagerReviewDrafts() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(MANAGER_REVIEW_DRAFT_KEY);
    const parsed = safeJsonParse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveManagerReviewDrafts(next) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MANAGER_REVIEW_DRAFT_KEY, JSON.stringify(next || {}));
  } catch {
    void 0;
  }
}

function isSubmittedStatus(status) {
  const s = String(status || "").trim().toUpperCase();
  return s === "SUBMITTED" || s === "APPROVED" || s === "COMPLETED" || s === "FINAL";
}

function resolveTeamRowReviewStatus(row) {
  return String(
    row?.reviewStatus ??
      row?.raw?.reviewStatus ??
      row?.payload?.reviewStatus ??
      row?.submission?.reviewStatus ??
      ""
  )
    .trim()
    .toUpperCase();
}

/** Employee resubmitted after reject — old managerReview.action may still be REJECT on the server. */
function isStaleManagerRejectTeamRow(row) {
  const status = String(row?.status || "").trim().toUpperCase();
  const reviewStatus = resolveTeamRowReviewStatus(row);
  const rawManagerAction = String(
    row?.raw?.managerReview?.action ??
      row?.payload?.managerReview?.action ??
      ""
  )
    .trim()
    .toUpperCase();
  return status === "SUBMITTED" && reviewStatus === "SUBMITTED" && rawManagerAction === "REJECT";
}

/** Manager sent submission back — waiting on employee, not on manager review. */
function isAwaitingEmployeeResubmission(row) {
  const reviewStatus = resolveTeamRowReviewStatus(row);
  if (reviewStatus === "NEEDS_REVIEW" || reviewStatus === "REJECT") return true;
  if (isStaleManagerRejectTeamRow(row)) return false;
  if (
    Boolean(
      row?.reopenedForResubmission ??
        row?.raw?.reopenedForResubmission ??
        row?.payload?.reopenedForResubmission
    )
  ) {
    return true;
  }
  const managerAction = String(
    row?.raw?.managerReview?.action ?? row?.payload?.managerReview?.action ?? ""
  )
    .trim()
    .toUpperCase();
  return managerAction === "REJECT";
}

function isPendingManagerReviewRow(row) {
  if (isAwaitingEmployeeResubmission(row)) return false;
  const reviewStatus = resolveTeamRowReviewStatus(row);
  if (reviewStatus === "NEEDS_MANAGER_REVIEW") return true;
  return isSubmittedStatus(row?.status) && !row?.managerSubmitted;
}

function isAdminReturnedManagerReviewRow(row) {
  return resolveTeamRowReviewStatus(row) === "NEEDS_MANAGER_REVIEW";
}

function parseAdminReviewFromRow(row) {
  const direct =
    row?.adminReview ??
    row?.submission?.adminReview ??
    row?.raw?.adminReview ??
    row?.payload?.adminReview ??
    null;
  if (direct && typeof direct === "object") return direct;

  const jsonRaw =
    row?.raw?.adminReviewJson ??
    row?.submission?.raw?.adminReviewJson ??
    row?.submission?.adminReviewJson;
  if (typeof jsonRaw === "string" && jsonRaw.trim()) {
    try {
      const parsed = JSON.parse(jsonRaw);
      return parsed?.adminReview && typeof parsed.adminReview === "object" ? parsed.adminReview : parsed;
    } catch {
      return null;
    }
  }
  if (jsonRaw && typeof jsonRaw === "object") {
    return jsonRaw?.adminReview && typeof jsonRaw.adminReview === "object" ? jsonRaw.adminReview : jsonRaw;
  }
  return null;
}

function resolveAdminReturnActor(row) {
  const adminReview = parseAdminReviewFromRow(row);
  return String(adminReview?.reviewedBy ?? adminReview?.reviewerName ?? "").trim() || null;
}

function resolveAdminReturnComment(row) {
  const adminReview = parseAdminReviewFromRow(row);
  return String(
    adminReview?.comments ??
    row?.raw?.adminComments ??
    row?.payload?.adminComments ??
    ""
  ).trim() || null;
}

function normalizeCertificationsForState(input) {
  const arr = Array.isArray(input) ? input : [];
  return arr
    .map((raw) => {
      if (typeof raw === "string") {
        const name = String(raw).trim();
        return name ? { name, proof: "" } : null;
      }
      if (!raw || typeof raw !== "object") return null;
      const name = String(raw.name ?? raw.certificationName ?? raw.title ?? "").trim();
      if (!name) return null;
      const proof = String(raw.proof ?? raw.url ?? raw.link ?? raw.credentialId ?? "").trim();
      return { name, proof };
    })
    .filter(Boolean);
}

function normalizeTeamSubmissions(data) {
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : [];
  return arr
    .map((raw) => {
      const obj = raw && typeof raw === "object" ? raw : null;
      if (!obj) return null;

      const submission = normalizeMonthlySubmission(obj) || null;
      const emp = obj.employee || obj.reportee || obj.user || obj.emp || null;
      const employeeId =
        emp?.employeeId ??
        emp?.empId ??
        emp?.id ??
        obj.employeeId ??
        obj.empId ??
        obj.userId ??
        null;
      const employeeName =
        emp?.employeeName ??
        emp?.name ??
        emp?.fullName ??
        obj.employeeName ??
        obj.userName ??
        null;
      const email = emp?.email ?? obj.email ?? obj.userEmail ?? null;
      const payloadObj =
        submission && typeof submission === "object"
          ? submission
          : {
              selfReviewText: String(obj?.selfReviewText ?? ""),
              certifications: [],
              kpiRatings: {},
              webknotValues: [],
              webknotValueRatings: {},
              recognitionsCount: 0,
              raw: obj,
            };
      /* After employee resubmission the status becomes "SUBMITTED" but the
         server may still carry the old managerReview with action:"REJECT".
         Treat that as stale so the row shows as "Pending" again.            */
      const currentStatus = String(
        submission?.status ?? obj?.status ?? ""
      ).trim().toUpperCase();
      const reviewStatusUpper = String(
        submission?.reviewStatus ?? obj?.reviewStatus ?? ""
      ).trim().toUpperCase();
      const rawManagerAction = String(
        obj?.managerReview?.action ||
        obj?.payload?.managerReview?.action ||
        submission?.managerReview?.action ||
        ""
      ).trim().toUpperCase();
      const staleManagerReject =
        currentStatus === "SUBMITTED" &&
        reviewStatusUpper === "SUBMITTED" &&
        rawManagerAction === "REJECT";
      const needsManagerRework = reviewStatusUpper === "NEEDS_MANAGER_REVIEW";

      const managerSubmittedFromSubmission =
        typeof submission?.managerSubmitted === "boolean" ? submission.managerSubmitted : null;
      const managerSubmitted = needsManagerRework
        ? false
        : staleManagerReject
          ? false
          : managerSubmittedFromSubmission != null
            ? managerSubmittedFromSubmission
            : Boolean(
                obj?.managerSubmittedAt ||
                obj?.managerReviewedAt ||
                obj?.reviewedByManager ||
                obj?.managerReview ||
                obj?.managerEvaluation ||
                obj?.payload?.managerSubmittedAt ||
                obj?.payload?.managerReviewedAt ||
                obj?.payload?.managerReview ||
                obj?.payload?.managerEvaluation
              );
      const managerSubmittedAt = String(
        obj?.managerSubmittedAt ??
        obj?.managerReviewedAt ??
        obj?.payload?.managerSubmittedAt ??
        obj?.payload?.managerReviewedAt ??
        ""
      ).trim() || null;

      return {
        submissionId: submission?.id ?? (obj.submissionId ? String(obj.submissionId) : null),
        month: submission?.month ?? (typeof obj.month === "string" ? obj.month : null),
        status: submission?.status ?? (typeof obj.status === "string" ? obj.status : null),
        reviewStatus:
          submission?.reviewStatus ??
          (typeof obj.reviewStatus === "string" ? obj.reviewStatus : null),
        reopenedForResubmission: Boolean(
          submission?.reopenedForResubmission ?? obj?.reopenedForResubmission
        ),
        updatedAt: submission?.updatedAt ?? (obj.updatedAt ? String(obj.updatedAt) : null),
        submittedAt: submission?.submittedAt ?? (obj.submittedAt ? String(obj.submittedAt) : null),
        managerSubmitted,
        managerSubmittedAt,
        adminReview: submission?.adminReview ?? null,
        employee: {
          id: employeeId == null ? "—" : String(employeeId),
          name: employeeName ? String(employeeName) : (email ? String(email) : "Unknown"),
          email: email ? String(email) : "",
        },
        payload: payloadObj,
        raw: obj,
      };
    })
    .filter(Boolean);
}

function normalizeCursorToken(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (typeof value === "bigint") {
    return String(value);
  }
  return null;
}

function normalizeTeamPage(data) {
  if (Array.isArray(data)) {
    return {
      items: normalizeTeamSubmissions(data),
      nextCursor: null,
      total: data.length,
      submittedCount: null,
      pendingManagerReviewCount: null,
    };
  }

  const root =
    data && typeof data === "object" && !Array.isArray(data) && data?.data && typeof data.data === "object"
      ? data.data
      : data && typeof data === "object" && !Array.isArray(data)
        ? data
        : {};

  if (Array.isArray(root)) {
    const wrapper =
      data && typeof data === "object" && !Array.isArray(data) ? data : {};
    return {
      items: normalizeTeamSubmissions(root),
      nextCursor: normalizeCursorToken(
        wrapper?.nextCursor ??
          wrapper?.next ??
          wrapper?.nextToken ??
          null
      ),
      total: root.length,
      submittedCount:
        typeof wrapper?.submittedCount === "number" && Number.isFinite(wrapper.submittedCount)
          ? wrapper.submittedCount
          : null,
      pendingManagerReviewCount:
        typeof wrapper?.pendingManagerReviewCount === "number" &&
        Number.isFinite(wrapper.pendingManagerReviewCount)
          ? wrapper.pendingManagerReviewCount
          : null,
    };
  }

  const itemsRaw =
    Array.isArray(root.items)
      ? root.items
      : Array.isArray(root.results)
        ? root.results
        : Array.isArray(root.content)
          ? root.content
          : Array.isArray(root.data)
            ? root.data
            : Array.isArray(data?.items)
              ? data.items
              : Array.isArray(data?.content)
                ? data.content
                : [];

  return {
    items: normalizeTeamSubmissions(itemsRaw),
    nextCursor: normalizeCursorToken(
      root?.nextCursor ??
      root?.next ??
      root?.nextToken ??
      root?.page?.nextCursor ??
      root?.pageInfo?.nextCursor ??
      null
    ),
    total:
      typeof root?.total === "number" && Number.isFinite(root.total)
        ? root.total
        : null,
    submittedCount:
      typeof root?.submittedCount === "number" && Number.isFinite(root.submittedCount)
        ? root.submittedCount
        : null,
    pendingManagerReviewCount:
      typeof root?.pendingManagerReviewCount === "number" && Number.isFinite(root.pendingManagerReviewCount)
        ? root.pendingManagerReviewCount
        : null,
  };
}

function normalizeReporteesAsPendingSubmissions(data, month) {
  const reportees = normalizeEmployees(data);
  const monthKey = String(month || "").trim();
  return reportees.map((emp) => ({
    submissionId: null,
    month: monthKey || null,
    status: "NOT_SUBMITTED",
    updatedAt: emp?.updatedAt || null,
    submittedAt: null,
    managerSubmitted: false,
    managerSubmittedAt: null,
    employee: {
      id: String(emp?.id || "—"),
      name: String(emp?.name || emp?.email || "Unknown"),
      email: String(emp?.email || ""),
    },
    payload: {
      selfReviewText: "",
      certifications: [],
      kpiRatings: {},
      webknotValues: [],
      webknotValueRatings: {},
      recognitionsCount: 0,
      raw: emp?.raw || emp || {},
    },
    raw: emp?.raw || emp || {},
  }));
}

function toSortEpoch(row) {
  const submitted = new Date(row?.submittedAt || "");
  if (!Number.isNaN(submitted.getTime())) return submitted.getTime();
  const updated = new Date(row?.updatedAt || "");
  if (!Number.isNaN(updated.getTime())) return updated.getTime();
  return 0;
}

function sortTeamRowsByLatest(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => toSortEpoch(b) - toSortEpoch(a));
}

function dedupeTeamRows(rows, fallbackMonth = "") {
  const list = Array.isArray(rows) ? rows : [];
  const month = String(fallbackMonth || "").trim();
  const byKey = new Map();
  let anonIdx = 0;
  for (const row of list) {
    const submissionId = String(row?.submissionId ?? row?.id ?? "").trim();
    const employeeId = String(row?.employee?.id ?? row?.employeeId ?? "").trim();
    const monthKey = String(row?.month ?? month).trim();
    const key = submissionId || (employeeId ? `${employeeId}:${monthKey}` : `anon:${anonIdx++}`);
    const prev = byKey.get(key);
    if (!prev || toSortEpoch(row) >= toSortEpoch(prev)) {
      byKey.set(key, row);
    }
  }
  return Array.from(byKey.values());
}

function normalizeSelfKpiRatings(input) {
  if (!input || typeof input !== "object") return {};
  const out = {};
  for (const [idRaw, valueRaw] of Object.entries(input)) {
    const id = String(idRaw || "").trim();
    if (!id) continue;
    const parsed =
      typeof valueRaw === "number" ? valueRaw : Number.parseFloat(String(valueRaw ?? ""));
    if (!Number.isFinite(parsed)) continue;
    const integer = parseIntegerPerformanceRating(Math.round(parsed));
    if (integer == null) continue;
    out[id] = integer;
  }
  return out;
}

function normalizeFilterKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeBandKey(value) {
  return normalizeFilterKey(value).replace(/[^a-z0-9]/g, "");
}

function normalizeStreamKey(value) {
  const key = normalizeFilterKey(value).replace(/[^a-z0-9]/g, "");
  if (!key) return "";
  if (key === "*" || key === "all" || key === "any" || key === "general" || key === "global") {
    return key;
  }
  if (key === "qa" || key === "qualityassurance" || key === "qualityengineering") return "qa";
  if (key === "devops" || key === "devsecops" || key === "sre" || key === "ops" || key === "operations") return "devops";
  if (key === "data" || key === "datascience" || key === "analytics" || key === "aiml" || key === "ai" || key === "ml") return "data";
  if (key === "uiux" || key === "uxui" || key === "ui" || key === "ux" || key === "design" || key === "uidesign" || key === "uxdesign") {
    return "uiux";
  }
  if (key === "development" || key === "dev" || key === "backend" || key === "frontend" || key === "mobile" || key === "fullstack" || key === "engineering") {
    return "development";
  }
  return key;
}

function isWildcardValue(key) {
  const normalized = normalizeFilterKey(key);
  return normalized === "" || normalized === "*" || normalized === "all" || normalized === "any" || normalized === "general" || normalized === "global";
}

function kpiAppliesToManager(kpi, managerProfile) {
  const managerBand = normalizeBandKey(managerProfile?.band);
  const managerStream = normalizeStreamKey(managerProfile?.stream);

  if (!managerBand && !managerStream) return true;

  const kpiBand = normalizeBandKey(kpi?.band);
  const kpiStream = normalizeStreamKey(kpi?.stream);

  const bandOk = isWildcardValue(kpiBand) || !kpiBand || !managerBand || kpiBand === managerBand;
  const streamOk =
    isWildcardValue(kpiStream) ||
    !kpiStream ||
    !managerStream ||
    kpiStream === managerStream;

  return bandOk && streamOk;
}

function formatOneDecimalDisplay(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return (Math.round(value * 10) / 10).toFixed(1);
}

function normalizeSelfValueRatings(input) {
  if (!input) return {};
  const out = {};

  const assign = (idRaw, ratingRaw, fallback = null) => {
    const id = String(idRaw ?? "").trim();
    if (!id) return;
    const parsed =
      ratingRaw == null || ratingRaw === ""
        ? fallback
        : typeof ratingRaw === "number"
          ? ratingRaw
          : Number.parseFloat(String(ratingRaw));
    if (!Number.isFinite(parsed)) return;
    const integer = parseIntegerPerformanceRating(Math.round(parsed));
    if (integer == null) return;
    out[id] = integer;
  };

  if (Array.isArray(input)) {
    for (const item of input) {
      if (item && typeof item === "object") {
        const id =
          item.valueId ?? item.webknotValueId ?? item.id ?? item.code ?? item.key ?? item.value ?? item.title ?? item.name;
        const rating = item.rating ?? item.valueRating ?? item.score ?? item.value;
        assign(id, rating, 1);
        continue;
      }
      assign(item, null, 1);
    }
    return out;
  }

  if (typeof input === "object") {
    for (const [k, v] of Object.entries(input)) assign(k, v);
  }

  return out;
}

function resolveSelfReviewReviewersFromSubmission(normalized, options = []) {
  const ids = resolveReviewingSuperAdminIds(normalized);
  const optionById = new Map(
    (Array.isArray(options) ? options : [])
      .map((row) => [String(row?.id || "").trim(), row])
      .filter(([id]) => id)
  );
  const payload =
    normalized?.payload && typeof normalized.payload === "object"
      ? normalized.payload
      : normalized?.raw?.payload && typeof normalized.raw.payload === "object"
        ? normalized.raw.payload
        : normalized && typeof normalized === "object"
          ? normalized
          : {};
  const fromPayload = Array.isArray(payload.reviewingManagers) ? payload.reviewingManagers : [];
  return ids.map((id) => {
    const fromOption = optionById.get(id);
    const fromSaved = fromPayload.find((row) => String(row?.id || "").trim() === id);
    return {
      id,
      name: String(fromOption?.name ?? fromSaved?.name ?? payload.reviewingManagerName ?? "").trim(),
      email: String(fromOption?.email ?? fromSaved?.email ?? payload.reviewingManagerEmail ?? "").trim(),
    };
  });
}

function buildManagerSelfSubmissionPayload({
  month,
  selfReviewText,
  kpiRatings,
  selectedValues,
  valueComments,
  allowedKpiIds,
  managerId,
  reviewingManagers = [],
  reviewingManagerId = null,
  reviewingManagerName = null,
  reviewingManagerEmail = null,
  reviewStatus = null,
  reopenedForResubmission = null,
}) {
  const cycleMeta = buildCycleMeta(month);
  const normalizedKpisRaw = normalizeSelfKpiRatings(kpiRatings);
  const allowedSet = new Set(
    Array.isArray(allowedKpiIds) ? allowedKpiIds.map((id) => String(id || "").trim()).filter(Boolean) : []
  );
  const normalizedKpis =
    allowedSet.size > 0
      ? Object.fromEntries(
          Object.entries(normalizedKpisRaw).filter(([id]) => allowedSet.has(String(id || "").trim()))
        )
      : normalizedKpisRaw;
  const kpiEntries = Object.entries(normalizedKpis).sort(([a], [b]) =>
    String(a).localeCompare(String(b), undefined, { numeric: true })
  );
  const kpiRatingsArray = kpiEntries.map(([kpiId, rating]) => ({
    kpiId: String(kpiId || "").trim(),
    rating,
  }));

  const normalizedValues = normalizeSelfValueRatings(selectedValues);
  const normalizedValueComments = valueComments && typeof valueComments === "object" ? valueComments : {};
  const valueEntries = Object.entries(normalizedValues).sort(([a], [b]) =>
    String(a).localeCompare(String(b), undefined, { numeric: true })
  );
  const stableValueRatings = Object.fromEntries(valueEntries);
  const webknotValueResponses = valueEntries.map(([valueId, rating]) => ({
    valueId: String(valueId || "").trim(),
    rating,
    comment: String(normalizedValueComments?.[valueId] || "").trim() || undefined,
  }));
  const webknotValues = valueEntries.map(([id]) => String(id));
  const monthKey = normalizeYearMonth(month) || String(month || "").trim() || null;
  const reviewerRows = (Array.isArray(reviewingManagers) ? reviewingManagers : [])
    .map((row) => ({
      id: String(row?.id || "").trim(),
      name: String(row?.name || "").trim() || null,
      email: String(row?.email || "").trim() || null,
    }))
    .filter((row) => row.id);
  const reviewingManagerIds = reviewerRows.map((row) => row.id);
  const primaryReviewer = reviewerRows[0] || {
    id: String(reviewingManagerId || "").trim(),
    name: String(reviewingManagerName || "").trim() || null,
    email: String(reviewingManagerEmail || "").trim() || null,
  };

  const next = {
    month: monthKey,
    monthKey,
    cycleKey: cycleMeta.cycleKey,
    cycleLabel: cycleMeta.cycleLabel,
    cycleShortLabel: cycleMeta.cycleShortLabel,
    cycleStartMonth: cycleMeta.cycleStartMonth,
    cycleEndMonth: cycleMeta.cycleEndMonth,
    cycleMonth: cycleMeta.month,
    profileVerified: true,
    submissionType: "MANAGER_SELF_REVIEW",
    actorRole: "MANAGER",
    targetRole: "MANAGER",
    subjectEmployeeId: String(managerId || "").trim() || null,
    reviewingManagerIds,
    reviewingManagers: reviewerRows,
    reviewingManagerId: primaryReviewer.id || null,
    reviewingManagerName: primaryReviewer.name || null,
    reviewingManagerEmail: primaryReviewer.email || null,
    managerId: String(managerId || "").trim() || null,
    selfReviewText: String(selfReviewText || ""),
    kpiRatings: kpiRatingsArray,
    webknotValues,
    webknotValueRatings: stableValueRatings,
    webknotValueResponses,
    webknotValueComments: normalizedValueComments,
    recognitionsCount: 0,
  };
  if (reviewStatus != null) next.reviewStatus = String(reviewStatus || "").trim() || null;
  if (reopenedForResubmission != null) next.reopenedForResubmission = Boolean(reopenedForResubmission);
  return next;
}

function formatReviewTimestamp(value) {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString();
}

function isFinalSubmissionStatus(status, meta) {
  const s = String(status || "").trim().toUpperCase();
  if (s === "SUBMITTED" || s === "APPROVED" || s === "COMPLETED" || s === "FINAL") return true;
  if (meta?.submittedAt) return true;
  return false;
}

function payloadHash(payload) {
  try {
    return JSON.stringify(payload ?? {});
  } catch {
    return String(Date.now());
  }
}

function getDraftAutosaveDelayMs() {
  const n = Number.parseInt(String(getManagerSettings()?.draftAutosaveDelayMs ?? 900), 10);
  if (!Number.isFinite(n)) return 900;
  return Math.min(5000, Math.max(500, n));
}

function preventWheelInputChange(e) {
  e.currentTarget.blur();
}

function formatSubmittedAt(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "—") return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatNotificationTimestamp(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "Now";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "Now";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function mergeNotifications(existing, incoming) {
  const next = [];
  const seen = new Set();
  const pushUnique = (row) => {
    if (!row || typeof row !== "object") return;
    const key = String(row.id ?? `${row.type}:${row.createdAt}:${row.message ?? row.title ?? ""}`);
    if (seen.has(key)) return;
    seen.add(key);
    next.push(row);
  };
  (Array.isArray(incoming) ? incoming : []).forEach(pushUnique);
  (Array.isArray(existing) ? existing : []).forEach(pushUnique);
  return next.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export default function ManagerPortal({ onLogout, auth }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const stored = window.localStorage.getItem(MANAGER_SIDEBAR_PREF_KEY);
      if (stored === "0") return false;
      if (stored === "1") return true;
    } catch { void 0; }
    return window.innerWidth >= 1024;
  });
  const [month, setMonth] = useState(() => formatYearMonth(new Date()));
  const [portalWindow, setPortalWindow] = useState(null);
  const [portalWindowLoading, setPortalWindowLoading] = useState(true);
  const [portalWindowError, setPortalWindowError] = useState("");
  const [managerId, setManagerId] = useState(() => String(auth?.employeeId || "").trim() || "");
  const [managerBand, setManagerBand] = useState(() => String(auth?.band || "").trim());
  const [managerStream, setManagerStream] = useState(() => String(auth?.stream || "").trim());
  const [managerProfileReady, setManagerProfileReady] = useState(false);
  const [filter, setFilter] = useState("PENDING_MANAGER_REVIEW"); // SUBMITTED | ALL | PENDING_MANAGER_REVIEW
  const [teamSearch, setTeamSearch] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  /* ── Path-based routing: sync activeTab ↔ URL path ── */
  const MGR_VALID_TABS = useMemo(() => new Set(["team", "self-review", "account", "settings"]), []);

  const getMgrTabFromPath = useCallback(
    (pathname = location.pathname) => {
      const parts = String(pathname || "")
        .replace(/\/$/, "")
        .split("/")
        .filter(Boolean);
      if (parts[0] === "manager") {
        const tab = parts[1] || "team";
        if (tab === "notes" || tab === "drive") return "team";
        return MGR_VALID_TABS.has(tab) ? tab : "team";
      }
      const legacy = parts[0] || "team";
      return MGR_VALID_TABS.has(legacy) ? legacy : "team";
    },
    [MGR_VALID_TABS, location.pathname],
  );

  const activeTab = useMemo(() => getMgrTabFromPath(), [getMgrTabFromPath]);

  const setActiveTab = useCallback(
    (tab) => {
      const path = tab === "team" ? "/manager" : `/manager/${tab}`;
      if (location.pathname !== path) navigate(path);
    },
    [location.pathname, navigate],
  );

  useEffect(() => {
    const parts = location.pathname.replace(/\/$/, "").split("/").filter(Boolean);
    if (parts[0] === "manager" && (parts[1] === "notes" || parts[1] === "drive")) {
      navigate("/manager", { replace: true });
    }
  }, [location.pathname, navigate]);
  const [managerSelfReviewText, setManagerSelfReviewText] = useState("");
  const [managerSelfKpiRatings, setManagerSelfKpiRatings] = useState({});
  const [managerSelfValueRatings, setManagerSelfValueRatings] = useState({});
  const [managerSelfValueComments, setManagerSelfValueComments] = useState({});
  const [savingSelfReview, setSavingSelfReview] = useState(false);
  const [managerDraftSaving, setManagerDraftSaving] = useState(false);
  const [managerDraftError, setManagerDraftError] = useState("");
  const [selfRatingValidationError, setSelfRatingValidationError] = useState("");
  const [hydratingSelfSubmission, setHydratingSelfSubmission] = useState(false);
  const [selfSubmissionMeta, setSelfSubmissionMeta] = useState(null);
  const [selfReviewingManagerIds, setSelfReviewingManagerIds] = useState([]);
  const [superAdminReviewersLoading, setSuperAdminReviewersLoading] = useState(false);
  const [superAdminReviewerOptions, setSuperAdminReviewerOptions] = useState([]);

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [notificationsNextCursor, setNotificationsNextCursor] = useState(null);
  const notificationsPanelRef = useRef(null);
  const notificationsLoadedRef = useRef(false);
  const notifiedEventKeysRef = useRef(new Set());
  const lastSavedSelfDraftHashRef = useRef("");
  const selfDraftSaveGenerationRef = useRef(0);

  const [reviewModal, setReviewModal] = useState({ open: false, row: null });

  const [rejectArmed, setRejectArmed] = useState(false);
  const managerNotesRef = useRef(null);

  /* ── project ratings state ── */
  const [mgrProjects, setMgrProjects] = useState([]);
  const [mgrProjectsLoading, setMgrProjectsLoading] = useState(false);
  const [mgrProjectsError, setMgrProjectsError] = useState("");
  const [prSelectedProject, setPrSelectedProject] = useState(null);
  const [prSelectedEmployee, setPrSelectedEmployee] = useState(null);
  const [prRating, setPrRating] = useState(0);
  const [prComments, setPrComments] = useState("");
  const [prSubmitting, setPrSubmitting] = useState(false);
  const [prSuccess, setPrSuccess] = useState("");
  const [prError, setPrError] = useState("");
  const [prSearch, setPrSearch] = useState("");

  const [kpiIndex, setKpiIndex] = useState({}); // { [id]: { title, weight } }
  const [selfKpis, setSelfKpis] = useState([]);
  const [selfKpisLoading, setSelfKpisLoading] = useState(false);
  const [selfValues, setSelfValues] = useState([]);
  const [selfValuesLoading, setSelfValuesLoading] = useState(false);
  const valueLabelIndex = useMemo(() => {
    const map = {};
    for (const v of selfValues) {
      const key = String(v?.id || "").trim();
      if (!key) continue;
      map[key] = String(v?.title || v?.name || key);
    }
    // Include any values present in the selected submission payload so labels render even if manager catalog differs
    const payloadValues = Array.isArray(reviewModal?.row?.payload?.webknotValues)
      ? reviewModal.row.payload.webknotValues
      : [];
    const payloadValueRatings = reviewModal?.row?.payload?.webknotValueRatings;
    const payloadKeys = [
      ...payloadValues.map((v) => String(v || "").trim()),
      ...(payloadValueRatings && typeof payloadValueRatings === "object"
        ? Object.keys(payloadValueRatings).map((k) => String(k || "").trim())
        : []),
    ].filter(Boolean);
    for (const key of payloadKeys) {
      if (!map[key]) map[key] = key;
    }
    return map;
  }, [reviewModal?.row?.payload?.webknotValueRatings, reviewModal?.row?.payload?.webknotValues, selfValues]);
  const selfValuesByPillar = useMemo(() => {
    const groups = new Map();
    for (const valueItem of selfValues) {
      const pillar = String(valueItem?.pillar || "—").trim() || "—";
      if (!groups.has(pillar)) groups.set(pillar, []);
      groups.get(pillar).push(valueItem);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => String(a).localeCompare(String(b), undefined, { numeric: true }))
      .map(([pillar, items]) => ({
        pillar,
        items: items
          .slice()
          .sort((a, b) => String(a?.title || a?.id || "").localeCompare(String(b?.title || b?.id || ""), undefined, { numeric: true })),
      }));
  }, [selfValues]);
  const filteredSelfKpis = useMemo(
    () => selfKpis.filter((k) => kpiAppliesToManager(k, { band: managerBand, stream: managerStream })),
    [managerBand, managerStream, selfKpis]
  );
  const filteredSelfKpiIds = useMemo(
    () => filteredSelfKpis.map((k) => String(k?.id || "").trim()).filter(Boolean),
    [filteredSelfKpis]
  );

  const [teamSubs, setTeamSubs] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState("");
  const [teamCursor, setTeamCursor] = useState(null);
  const [teamNextCursor, setTeamNextCursor] = useState(null);
  const [teamCursorStack, setTeamCursorStack] = useState([]);
  const [teamTotals, setTeamTotals] = useState({
    total: null,
    submittedCount: null,
    pendingManagerReviewCount: null,
  });
  const [teamInsightsRows, setTeamInsightsRows] = useState([]);
  const [teamInsightsLoading, setTeamInsightsLoading] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const usageGuideKey = useMemo(
    () => resolveUsageGuideKey({ portalShell: "manager", auth }),
    [auth],
  );
  const teamCursorRef = useRef(null);
  const [reviewDrafts, setReviewDrafts] = useState(() => loadManagerReviewDrafts());
  const [managerRatings, setManagerRatings] = useState({});
  const [managerValueRatings, setManagerValueRatings] = useState({});
  const [managerNotes, setManagerNotes] = useState("");
  const [savingReview, setSavingReview] = useState(false);
  const cycleInfo = useMemo(() => getCycleForMonth(month || new Date()), [month]);
  const cycleMonthOptions = useMemo(() => buildCycleMonthOptions(month || new Date()), [month]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MANAGER_SIDEBAR_PREF_KEY, isSidebarOpen ? "1" : "0");
    } catch { void 0; }
  }, [isSidebarOpen]);

  useEffect(() => {
    teamCursorRef.current = teamCursor;
  }, [teamCursor]);

  useEffect(() => {
    function onKeyDown(e) {
      const key = String(e.key || "").toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === "b") {
        e.preventDefault();
        setIsSidebarOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const showToast = useCallback((next) => {
    setToast(next);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  useEffect(() => { if (notificationsError) showToast({ title: "Notifications Error", message: notificationsError, tone: "error" }); }, [notificationsError, showToast]);
  useEffect(() => { if (teamError) showToast({ title: "Team Load Failed", message: teamError, tone: "error" }); }, [teamError, showToast]);
  useEffect(() => { if (managerDraftError) showToast({ title: "Draft Error", message: managerDraftError, tone: "error" }); }, [managerDraftError, showToast]);
  useEffect(() => { if (selfRatingValidationError) showToast({ title: "Validation", message: selfRatingValidationError, tone: "error" }); }, [selfRatingValidationError, showToast]);

  /* ── load projects for manager project rating tab ── */
  const loadMgrProjects = useCallback(async (opts = {}) => {
    setMgrProjectsLoading(true);
    setMgrProjectsError("");
    try {
      const raw = await fetchProjects(opts);
      const all = normalizeProjects(raw).filter((p) => p.active !== false);
      setMgrProjects(all);
    } catch (err) {
      if (err?.name === "AbortError") return;
      setMgrProjectsError(err?.message || "Failed to load projects.");
    } finally {
      setMgrProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "project-ratings") return;
    const controller = new AbortController();
    loadMgrProjects({ signal: controller.signal });
    return () => controller.abort();
  }, [activeTab, loadMgrProjects]);

  /* projects assigned to this manager */
  const myManagedProjects = useMemo(() => {
    if (!managerId) return mgrProjects;
    const managed = mgrProjects.filter(
      (p) => p.managerId === managerId || !p.managerId,
    );
    /* if no projects explicitly assigned to this manager, show all so they can still rate */
    return managed.length > 0 ? managed : mgrProjects;
  }, [mgrProjects, managerId]);

  /* filtered for search */
  const filteredMgrProjects = useMemo(() => {
    const q = prSearch.trim().toLowerCase();
    if (!q) return myManagedProjects;
    return myManagedProjects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
    );
  }, [myManagedProjects, prSearch]);

  /* submit a project rating */
  async function handleSubmitProjectRating() {
    if (!prSelectedProject || !prSelectedEmployee || !prRating) return;
    setPrSubmitting(true);
    setPrError("");
    setPrSuccess("");
    try {
      await submitProjectRating(prSelectedProject, {
        employeeId: prSelectedEmployee,
        rating: prRating,
        comments: prComments.trim(),
      });
      setPrSuccess("Rating submitted successfully!");
      setPrRating(0);
      setPrComments("");
      setPrSelectedEmployee(null);
      showToast({ title: "Rating Submitted", message: "Project rating saved.", tone: "success" });
    } catch (err) {
      setPrError(err?.message || "Failed to submit rating.");
      showToast({ title: "Rating Failed", message: err?.message || "Please try again.", tone: "error" });
    } finally {
      setPrSubmitting(false);
    }
  }

  const unreadNotificationsCount = useMemo(
    () => notifications.reduce((count, item) => (item?.read ? count : count + 1), 0),
    [notifications]
  );
  const notificationUserId = useMemo(
    () => resolveNotificationUserId(
      auth?.id,
      auth?.userId,
      auth?.claims?.userId,
      auth?.claims?.uid,
      managerId,
      auth?.employeeId,
      auth?.empId,
      auth?.claims?.sub,
    ),
    [
      managerId,
      auth?.claims?.sub,
      auth?.claims?.uid,
      auth?.claims?.userId,
      auth?.empId,
      auth?.employeeId,
      auth?.id,
      auth?.userId,
    ],
  );

  const reloadNotifications = useCallback(async ({
    signal,
    cursor = null,
    append = false,
    silent = false,
  } = {}) => {
    if (!notificationUserId) {
      setNotifications([]);
      setNotificationsNextCursor(null);
      setNotificationsError("");
      notificationsLoadedRef.current = false;
      return { items: [], nextCursor: null, unreadCount: 0 };
    }
    if (!silent || !notificationsLoadedRef.current) {
      setNotificationsLoading(true);
    }
    setNotificationsError("");
    try {
      const data = await fetchManagerNotifications({
        userId: notificationUserId,
        limit: MANAGER_NOTIFICATION_PAGE_SIZE,
        cursor,
        unreadOnly: false,
        signal,
      });
      const page = normalizeManagerNotificationPage(data);
      setNotifications((prev) => {
        const prevById = new Map(prev.map((n) => [String(n.id), n]));
        const merged = append ? mergeNotifications(prev, page.items) : page.items;
        return merged.map((item) => {
          const previous = prevById.get(String(item.id));
          return previous?.read ? { ...item, read: true } : item;
        });
      });
      setNotificationsNextCursor(page.nextCursor);
      notificationsLoadedRef.current = true;
      return page;
    } catch (err) {
      if (err?.name === "AbortError") return null;
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again.", tone: "error" });
        onLogout?.();
        return null;
      }
      setNotificationsError(err?.message || "Failed to load notifications.");
      return null;
    } finally {
      setNotificationsLoading(false);
    }
  }, [notificationUserId, onLogout, showToast]);

  const pushIncomingNotification = useCallback((incoming) => {
    if (!incoming) return;
    const eventKey = String(incoming?.id ?? `${incoming?.type}:${incoming?.createdAt}:${incoming?.message ?? incoming?.title ?? ""}`);
    setNotifications((prev) => mergeNotifications(prev, [incoming]).slice(0, MANAGER_NOTIFICATION_PAGE_SIZE * 3));
    if (notifiedEventKeysRef.current.has(eventKey)) return;
    notifiedEventKeysRef.current.add(eventKey);
    if (notifiedEventKeysRef.current.size > 500) {
      notifiedEventKeysRef.current = new Set(Array.from(notifiedEventKeysRef.current).slice(-250));
    }
    const soundEnabled = Boolean(getManagerSettings()?.enableSoundAlerts ?? true);
    playNotificationSound({ enabled: soundEnabled }).catch(() => {});
    showToast({
      title: incoming.title || "New employee submission",
      message: incoming.message || "",
    });
  }, [showToast]);

  const markNotificationRead = useCallback(async (notificationId) => {
    const id = String(notificationId ?? "").trim();
    if (!id) return;
    try {
      await markManagerNotificationRead(id);
      setNotifications((prev) => prev.map((item) => (
        String(item?.id) === id ? { ...item, read: true } : item
      )));
    } catch (err) {
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again." });
        onLogout?.();
        return;
      }
      showToast({ title: "Unable to mark read", message: err?.message || "Please try again.", tone: "error" });
    }
  }, [onLogout, showToast]);

  const markEveryNotificationRead = useCallback(async () => {
    try {
      await markAllManagerNotificationsRead({ notifications });
      setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
    } catch (err) {
      if (err?.status === 401) {
        showToast({ title: "Session expired", message: "Please login again.", tone: "error" });
        onLogout?.();
        return;
      }
      showToast({ title: "Unable to mark all read", message: err?.message || "Please try again.", tone: "error" });
    }
  }, [notifications, onLogout, showToast]);

  useEffect(() => {
    if (!notificationUserId) return;
    const controller = new AbortController();
    reloadNotifications({ signal: controller.signal }).catch(() => {});

    const timer = window.setInterval(() => {
      reloadNotifications({ silent: true }).catch(() => {});
    }, MANAGER_NOTIFICATION_POLL_MS);

    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [notificationUserId, reloadNotifications]);

  useEffect(() => {
    if (!notificationUserId) return;
    const unsubscribe = subscribeManagerNotificationsStream({
      userId: notificationUserId,
      onNotification: (item) => {
        pushIncomingNotification(item);
      },
      onError: () => {
        reloadNotifications({ silent: true }).catch(() => {});
      },
    });
    return () => unsubscribe?.();
  }, [notificationUserId, pushIncomingNotification, reloadNotifications]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const onPointerDown = (event) => {
      const target = event?.target;
      if (!notificationsPanelRef.current || !target) return;
      if (!notificationsPanelRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [notificationsOpen]);

  useEffect(() => {
    if (!cycleMonthOptions.length) return;
    const current = normalizeYearMonth(month);
    if (current && cycleMonthOptions.some((opt) => opt.value === current)) return;
    setMonth(cycleMonthOptions[cycleMonthOptions.length - 1].value);
  }, [cycleMonthOptions, month]);

  function handleSelfRatingChange(kind, id, rawValue) {
    if (selfReviewLocked) return;

    if (rawValue == null || rawValue === "") {
      setSelfRatingValidationError("");
      if (kind === "kpi") {
        setManagerSelfKpiRatings((prev) => {
          const next = { ...(prev || {}) };
          delete next[id];
          return next;
        });
      } else {
        setManagerSelfValueRatings((prev) => {
          const next = { ...(prev || {}) };
          delete next[id];
          return next;
        });
      }
      return;
    }

    const parsed = parseIntegerPerformanceRating(rawValue);
    if (parsed == null) {
      setSelfRatingValidationError("Choose a rating from 1 to 5.");
      return;
    }

    setSelfRatingValidationError("");
    if (kind === "kpi") {
      setManagerSelfKpiRatings((prev) => ({
        ...(prev || {}),
        [id]: parsed,
      }));
    } else {
      setManagerSelfValueRatings((prev) => ({
        ...(prev || {}),
        [id]: parsed,
      }));
    }
  }

  function closeReviewModal() {
    setReviewModal({ open: false, row: null });
    setManagerRatings({});
    setManagerValueRatings({});
    setManagerNotes("");
    setSavingReview(false);
    setRejectArmed(false);
  }

  const selectedRow = reviewModal.open ? reviewModal.row : null;
  const selectedKey = selectedRow ? `${selectedRow.employee.id}:${String(selectedRow.month || month)}` : "";
  const selectedEmployeeKpiRatings = useMemo(
    () => (selectedRow ? resolveSubmissionKpiRatings(selectedRow) : {}),
    [selectedRow]
  );
  const selectedEmployeeValueRatings = useMemo(
    () => (selectedRow ? resolveSubmissionValueRatings(selectedRow) : {}),
    [selectedRow]
  );
  const selectedReviewKpiIds = useMemo(
    () => Object.keys(selectedEmployeeKpiRatings || {}),
    [selectedEmployeeKpiRatings]
  );
  const selectedReviewValueIds = useMemo(() => {
    if (!selectedRow) return [];
    return Array.from(
      new Set([
        ...Object.keys(selectedEmployeeValueRatings || {}),
        ...(Array.isArray(selectedRow?.payload?.webknotValues)
          ? selectedRow.payload.webknotValues.map((x) => String(x || "").trim())
          : []),
      ].filter(Boolean))
    );
  }, [selectedEmployeeValueRatings, selectedRow]);
  const selectedValueComments = useMemo(() => {
    if (!selectedRow) return {};
    const payload = selectedRow.payload || {};
    const out = {};
    if (payload.webknotValueComments && typeof payload.webknotValueComments === "object") {
      for (const [id, comment] of Object.entries(payload.webknotValueComments)) {
        const key = String(id || "").trim();
        if (!key) continue;
        const text = String(comment || "").trim();
        if (text) out[key] = text;
      }
    }
    if (Array.isArray(payload.webknotValueResponses)) {
      for (const entry of payload.webknotValueResponses) {
        const key = String(entry?.valueId || entry?.id || "").trim();
        if (!key) continue;
        const text = String(entry?.comment || "").trim();
        if (text) out[key] = text;
      }
    }
    return out;
  }, [selectedRow]);

  useEffect(() => {
    if (!reviewModal.open || !selectedRow) return;
    const existing = selectedKey ? reviewDrafts?.[selectedKey] : null;
    const managerEval =
      selectedRow?.raw?.managerEvaluation && typeof selectedRow.raw.managerEvaluation === "object"
        ? selectedRow.raw.managerEvaluation
        : selectedRow?.raw?.payload?.managerEvaluation && typeof selectedRow.raw.payload.managerEvaluation === "object"
          ? selectedRow.raw.payload.managerEvaluation
          : selectedRow?.payload?.managerEvaluation && typeof selectedRow.payload.managerEvaluation === "object"
            ? selectedRow.payload.managerEvaluation
            : {};
    const savedManagerKpis = resolveManagerKpiRatings(selectedRow);
    const employeeKpis = resolveSubmissionKpiRatings(selectedRow);
    const baseRatings = normalizeSelfKpiRatings(
      Object.keys(savedManagerKpis).length
        ? savedManagerKpis
        : Object.keys(employeeKpis).length
          ? employeeKpis
          : managerEval?.kpiRatings && typeof managerEval.kpiRatings === "object"
            ? managerEval.kpiRatings
            : {}
    );
    const initialRatings =
      existing?.kpiRatings && typeof existing.kpiRatings === "object"
        ? existing.kpiRatings
        : baseRatings;
    const savedManagerValues = resolveManagerValueRatings(selectedRow);
    const employeeValues = resolveSubmissionValueRatings(selectedRow);
    const baseValueRatings = normalizeSelfValueRatings(
      Object.keys(savedManagerValues).length
        ? savedManagerValues
        : Object.keys(employeeValues).length
          ? employeeValues
          : managerEval?.webknotValueRatings ??
            managerEval?.webknotValues ??
            selectedRow?.payload?.webknotValueRatings ??
            selectedRow?.payload?.webknotValues
    );
    const initialValueRatings =
      existing?.valueRatings && typeof existing.valueRatings === "object"
        ? normalizeSelfValueRatings(existing.valueRatings)
        : baseValueRatings;
    setManagerRatings({ ...(initialRatings || {}) });
    setManagerValueRatings({ ...(initialValueRatings || {}) });
    setManagerNotes(String(existing?.notes ?? managerEval?.comments ?? "").trim());
  }, [reviewDrafts, reviewModal.open, selectedKey, selectedRow]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    const applyManagerProfile = (profile) => {
      if (!profile || typeof profile !== "object") return;
      const root =
        profile?.data && typeof profile.data === "object" && !Array.isArray(profile.data)
          ? profile.data
          : profile;
      const details = extractEmploymentDetails({ profile: root, auth });
      if (details.empId) {
        setManagerId((prev) => prev || details.empId);
      }
      if (details.band) {
        setManagerBand((prev) => prev || details.band);
      }
      if (details.stream) {
        setManagerStream((prev) => prev || details.stream);
      }
    };

    (async () => {
      setManagerProfileReady(false);
      try {
        const portal = await fetchPortalManager({ signal: controller.signal });
        if (!mounted) return;
        applyManagerProfile(portal?.data?.manager ?? portal?.data?.me ?? portal?.data ?? null);
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!mounted) return;
        if (err?.status === 401) onLogout?.();
      }

      try {
        const me = await fetchMe({ signal: controller.signal });
        if (!mounted) return;
        applyManagerProfile(me);
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!mounted) return;
        if (err?.status === 401) onLogout?.();
      } finally {
        if (mounted) setManagerProfileReady(true);
      }
    })();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [auth, onLogout]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      setSelfKpisLoading(true);
      try {
        const data = await fetchKpiDefinitions({ signal: controller.signal });
        if (!mounted) return;
        const list = normalizeKpiDefinitions(data);
        const map = {};
        for (const k of list) map[String(k.id)] = { title: k.title, weight: k.weight };
        setKpiIndex(map);
        setSelfKpis(list);
      } catch (err) {
        if (err?.name !== "AbortError" && mounted) showToast({ title: "KPI Load Failed", message: err?.message || "Failed to load KPI definitions.", tone: "error" });
      } finally {
        if (mounted) setSelfKpisLoading(false);
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      setSelfValuesLoading(true);
      try {
        const rows = [];
        let cursor = null;
        for (let i = 0; i < 100; i += 1) {
          const data = await fetchValues(true, {
            limit: 100,
            cursor,
            signal: controller.signal,
          });
          const page = normalizeCursorPage(data);
          rows.push(...normalizeWebknotValuesList(page.items));
          if (!page.nextCursor) break;
          cursor = page.nextCursor;
        }

        const list = rows
          .map((v) => ({
            id: String(v?.id || "").trim(),
            title: String(v?.title || v?.id || "").trim(),
            pillar: String(v?.pillar || "—").trim() || "—",
          }))
          .filter((v) => Boolean(v.id));
        const deduped = [];
        const seen = new Set();
        for (const item of list) {
          const id = String(item.id || "").trim();
          if (!id || seen.has(id)) continue;
          seen.add(id);
          deduped.push(item);
        }
        if (!mounted) return;
        setSelfValues(deduped);
      } catch (err) {
        if (!mounted) return;
        setSelfValues([]);
        if (err?.name !== "AbortError") showToast({ title: "Values Load Failed", message: err?.message || "Failed to load values.", tone: "error" });
      } finally {
        if (mounted) setSelfValuesLoading(false);
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "self-review") return;
    let mounted = true;
    const controller = new AbortController();
    setSuperAdminReviewersLoading(true);
    (async () => {
      try {
        const data = await fetchSuperAdminReviewers({ signal: controller.signal });
        if (!mounted) return;
        const selfKey = String(managerId || auth?.employeeId || "").trim();
        const options = (Array.isArray(data) ? data : [])
          .filter((row) => String(row?.id || "").trim() && String(row.id).trim() !== selfKey)
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        setSuperAdminReviewerOptions(options);
      } catch (err) {
        if (err?.name === "AbortError" || !mounted) return;
        setSuperAdminReviewerOptions([]);
      } finally {
        if (mounted) setSuperAdminReviewersLoading(false);
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [activeTab, auth?.employeeId, managerId]);

  const selfReviewerFields = useMemo(() => {
    const selected = selfReviewingManagerIds
      .map((id) => superAdminReviewerOptions.find((m) => String(m.id) === String(id || "").trim()))
      .filter(Boolean);
    const reviewingManagers = selected.map((row) => ({
      id: String(row.id || "").trim(),
      name: String(row.name || "").trim() || null,
      email: String(row.email || "").trim() || null,
    }));
    const primary = reviewingManagers[0] || null;
    return {
      reviewingManagers,
      reviewingManagerId: primary?.id || null,
      reviewingManagerName: primary?.name || null,
      reviewingManagerEmail: primary?.email || null,
    };
  }, [selfReviewingManagerIds, superAdminReviewerOptions]);

  const reloadTeam = useCallback(
    async ({ signal, cursor, pageAction = "stay", fromCursor = null } = {}) => {
      const resolvedCursor = cursor === undefined ? (teamCursorRef.current ?? null) : (cursor ?? null);
      setTeamError("");
      setTeamLoading(true);
      try {
        const data = await fetchManagerTeamSubmissions({
          month,
          limit: TEAM_PAGE_SIZE,
          cursor: resolvedCursor,
          signal,
        });
        const page = normalizeTeamPage(data);
        let rows = Array.isArray(page.items) ? page.items : [];
        let nextCursor = page.nextCursor ?? null;
        let total = page.total;
        let submitted = page.submittedCount;
        let pendingReview = page.pendingManagerReviewCount;

        if (rows.length === 0 && !nextCursor) {
          const managerKey = String(managerId || auth?.employeeId || "").trim();
          if (managerKey) {
            const reporteeData = await fetchManagerReportees(managerKey, { signal });
            const fallbackRows = normalizeReporteesAsPendingSubmissions(reporteeData, month)
              .sort((a, b) =>
                String(b?.submittedAt || b?.updatedAt || "").localeCompare(String(a?.submittedAt || a?.updatedAt || ""))
              );
            const offset = Number.parseInt(String(resolvedCursor ?? "0"), 10);
            const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;
            const end = Math.min(safeOffset + TEAM_PAGE_SIZE, fallbackRows.length);
            rows = fallbackRows.slice(safeOffset, end);
            nextCursor = end < fallbackRows.length ? String(end) : null;
            total = fallbackRows.length;
            submitted = fallbackRows.filter((s) => isSubmittedStatus(s.status)).length;
            pendingReview = fallbackRows.filter((s) => isPendingManagerReviewRow(s)).length;
          }
        }

        let assignedSelfRows = [];
        try {
          const assigned = await fetchAssignedManagerSelfReviews(month, managerId, { signal });
          assignedSelfRows = normalizeTeamSubmissions(assigned);
        } catch {
          assignedSelfRows = [];
        }
        const sorted = sortTeamRowsByLatest(
          dedupeTeamRows([...rows, ...assignedSelfRows], month)
        );
        setTeamSubs(sorted);
        setTeamNextCursor(nextCursor);
        setTeamCursor(resolvedCursor);
        teamCursorRef.current = resolvedCursor;
        setTeamTotals({
          total: Number.isFinite(total) ? total : null,
          submittedCount: Number.isFinite(submitted) ? submitted : null,
          pendingManagerReviewCount: Number.isFinite(pendingReview) ? pendingReview : null,
        });
        setTeamCursorStack((prev) => {
          if (pageAction === "next") return [...prev, (fromCursor ?? teamCursorRef.current ?? null)];
          if (pageAction === "prev") return prev.slice(0, -1);
          if (pageAction === "reset") return [];
          return prev;
        });
      } catch (err) {
        if (err?.status === 401) {
          onLogout?.();
          return;
        }
        setTeamError(err?.message || "Failed to load team submissions.");
        setTeamSubs([]);
        setTeamNextCursor(null);
        setTeamTotals({
          total: null,
          submittedCount: null,
          pendingManagerReviewCount: null,
        });
      } finally {
        setTeamLoading(false);
      }
    },
    [auth?.employeeId, managerId, month, onLogout]
  );

  const reloadTeamInsights = useCallback(
    async ({ signal } = {}) => {
      if (!String(month || "").trim()) {
        setTeamInsightsRows([]);
        return;
      }

      setTeamInsightsLoading(true);
      try {
        const rows = [];
        let cursor = null;

        for (let i = 0; i < 200; i += 1) {
          const data = await fetchManagerTeamSubmissions({
            month,
            limit: 100,
            cursor,
            signal,
          });
          const page = normalizeTeamPage(data);
          if (Array.isArray(page.items) && page.items.length) {
            rows.push(...page.items);
          }
          if (!page.nextCursor) break;
          cursor = page.nextCursor;
        }

        if (rows.length === 0) {
          const managerKey = String(managerId || auth?.employeeId || "").trim();
          if (managerKey) {
            const reporteeData = await fetchManagerReportees(managerKey, { signal });
            rows.push(...normalizeReporteesAsPendingSubmissions(reporteeData, month));
          }
        }

        let assignedSelfRows = [];
        try {
          const assigned = await fetchAssignedManagerSelfReviews(month, managerId, { signal });
          assignedSelfRows = normalizeTeamSubmissions(assigned);
        } catch {
          assignedSelfRows = [];
        }
        setTeamInsightsRows(
          sortTeamRowsByLatest(dedupeTeamRows([...rows, ...assignedSelfRows], month))
        );
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (err?.status === 401) {
          onLogout?.();
          return;
        }
        setTeamInsightsRows([]);
        showToast({ title: "Team Insights Failed", message: err?.message || "Failed to load team insights.", tone: "error" });
      } finally {
        setTeamInsightsLoading(false);
      }
    },
    [auth?.employeeId, managerId, month, onLogout]
  );

  useEffect(() => {
    if (!managerProfileReady) return;
    if (!String(month || "").trim()) return;
    reloadTeam({ cursor: null, pageAction: "reset" }).catch(() => {});
  }, [managerProfileReady, managerId, month, reloadTeam]);

  useEffect(() => {
    if (!managerProfileReady) return;
    if (!String(month || "").trim()) return;
    const controller = new AbortController();
    reloadTeamInsights({ signal: controller.signal }).catch(() => {});
    return () => controller.abort();
  }, [managerProfileReady, managerId, month, reloadTeamInsights]);

  useEffect(() => {
    if (!String(month || "").trim()) return;
    let mounted = true;
    const controller = new AbortController();

    async function run() {
      setHydratingSelfSubmission(true);
      setManagerDraftError("");
      try {
        const data = await fetchMyMonthlySubmission({
          month,
          employeeId: String(managerId || auth?.employeeId || "").trim(),
          signal: controller.signal,
        });
        if (!mounted) return;

        const normalized = normalizeMonthlySubmission(data);
        if (!normalized) {
          setSelfSubmissionMeta(null);
          setManagerSelfReviewText("");
          setManagerSelfKpiRatings({});
          setManagerSelfValueRatings({});
          setManagerSelfValueComments({});
          setSelfReviewingManagerIds([]);
          const cleared = buildManagerSelfSubmissionPayload({
            month,
            selfReviewText: "",
            kpiRatings: {},
            selectedValues: {},
            valueComments: {},
            allowedKpiIds: filteredSelfKpiIds,
            managerId,
            ...selfReviewerFields,
            reviewStatus: "DRAFT",
            reopenedForResubmission: false,
          });
          lastSavedSelfDraftHashRef.current = payloadHash(cleared);
          return;
        }

        const nextKpis = normalizeSelfKpiRatings(normalized.kpiRatings);
        const nextValues = normalizeSelfValueRatings(
          normalized.webknotValueRatings ?? normalized.webknotValues
        );

        setSelfSubmissionMeta({
          id: normalized.id,
          month: normalized.month || month,
          status: normalized.status || null,
          submissionType: normalized.submissionType || "MANAGER_SELF_REVIEW",
          cycleKey: normalized.cycleKey || null,
          cycleLabel: normalized.cycleLabel || null,
          reviewStatus: normalized.reviewStatus || null,
          managerReview: normalized.managerReview || null,
          managerSubmittedAt: normalized.managerSubmittedAt || null,
          managerSelfReviewEvalComments:
            normalized.raw?.managerSelfReviewEvalComments ?? normalized.managerReview?.comments ?? null,
          adminReview: normalized.adminReview || null,
          adminSubmittedAt: normalized.adminSubmittedAt || null,
          reopenedForResubmission: Boolean(normalized.reopenedForResubmission),
          resubmissionRequested: Boolean(normalized.resubmissionRequested),
          submittedAt: normalized.submittedAt || null,
          updatedAt: normalized.updatedAt || null,
          raw: normalized.raw ?? null,
        });
        setManagerSelfReviewText(normalized.selfReviewText || "");
        setManagerSelfKpiRatings(nextKpis);
        setManagerSelfValueRatings(nextValues);
        const nextValueComments = (normalized.webknotValueComments && typeof normalized.webknotValueComments === "object")
          ? normalized.webknotValueComments
          : Array.isArray(normalized.webknotValueResponses)
            ? Object.fromEntries(
                normalized.webknotValueResponses
                  .map((entry) => [String(entry?.valueId || entry?.id || ""), String(entry?.comment || "").trim()])
                  .filter(([id, comment]) => id)
              )
            : {};
        setManagerSelfValueComments(nextValueComments);
        const reviewers = resolveSelfReviewReviewersFromSubmission(normalized, superAdminReviewerOptions);
        setSelfReviewingManagerIds(reviewers.map((row) => row.id).filter(Boolean));

        const loaded = buildManagerSelfSubmissionPayload({
          month: normalized.month || month,
          selfReviewText: normalized.selfReviewText || "",
          kpiRatings: nextKpis,
          selectedValues: nextValues,
          valueComments: nextValueComments,
          allowedKpiIds: filteredSelfKpiIds,
          managerId,
          reviewingManagers: reviewers,
          reviewStatus: normalized.reviewStatus || "DRAFT",
          reopenedForResubmission: normalized.reopenedForResubmission,
        });
        lastSavedSelfDraftHashRef.current = payloadHash(loaded);
        if (isManagerSelfReviewLocked({
          reviewStatus: normalized.reviewStatus,
          status: normalized.status,
          submittedAt: normalized.submittedAt,
          reopenedForResubmission: normalized.reopenedForResubmission,
          resubmissionRequested: normalized.resubmissionRequested,
          adminReview: normalized.adminReview,
        })) {
          selfDraftSaveGenerationRef.current += 1;
        }
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!mounted) return;
        if (err?.status === 401) {
          onLogout?.();
          return;
        }
        setManagerDraftError(err?.message || "Failed to load self review.");
      } finally {
        if (mounted) setHydratingSelfSubmission(false);
      }
    }

    run();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [filteredSelfKpiIds, managerId, month, onLogout]);

  const selfReviewLocked = useMemo(
    () => isManagerSelfReviewLocked(selfSubmissionMeta),
    [selfSubmissionMeta]
  );
  const selfNeedsResubmission = useMemo(
    () => Boolean(isResubmissionRequested(selfSubmissionMeta)),
    [selfSubmissionMeta]
  );
  const canEnterManagerValues = Boolean(
    portalWindow?.canEnterValues ??
      portalWindow?.globalOpen ??
      portalWindow?.roleOpen ??
      computeSubmissionWindowOpen(portalWindow),
  );

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      setPortalWindowLoading(true);
      setPortalWindowError("");
      try {
        const access = await fetchSubmissionAccessForRole("manager", {
          employeeId: managerId,
          cycleKey: month,
          signal: controller.signal,
        });
        if (!mounted) return;
        setPortalWindow(access);
      } catch (err) {
        if (!mounted || err?.name === "AbortError") return;
        setPortalWindowError(err?.message || "Failed to load submission window.");
      } finally {
        if (mounted) setPortalWindowLoading(false);
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [managerId, month]);

  const selfLatestReviewComment = useMemo(() => {
    const managerReview = selfSubmissionMeta?.managerReview;
    const adminReview = selfSubmissionMeta?.adminReview;
    if (
      managerReview &&
      !shouldHideHrPeerRating(auth, { ...managerReview, reviewer: "Manager", reviewerRole: managerReview?.reviewedByRole })
    ) {
      const manager = String(managerReview?.comments || "").trim();
      if (manager) return manager;
    }
    if (
      adminReview &&
      !shouldHideHrPeerRating(auth, { ...adminReview, reviewer: "Admin", reviewerRole: adminReview?.reviewedByRole })
    ) {
      return String(adminReview?.comments || "").trim();
    }
    return "";
  }, [auth, selfSubmissionMeta?.adminReview, selfSubmissionMeta?.managerReview]);
  const selfStatusSummary = useMemo(() => {
    const reviewStatus = String(selfSubmissionMeta?.reviewStatus || "DRAFT").trim().toUpperCase();
    const adminAction = String(selfSubmissionMeta?.adminReview?.action || "").trim().toUpperCase();
    const submittedAt = selfSubmissionMeta?.submittedAt || selfSubmissionMeta?.updatedAt || null;
    const reviewerNames = selfReviewingManagerIds
      .map((id) => superAdminReviewerOptions.find((m) => String(m.id) === String(id))?.name || id)
      .filter(Boolean);
    const actor =
      selfSubmissionMeta?.adminReview?.reviewedBy ||
      selfSubmissionMeta?.managerReview?.reviewedBy ||
      (reviewerNames.length ? reviewerNames.join(", ") : "Super Admin");
    const needsChanges = Boolean(isResubmissionRequested(selfSubmissionMeta));
    if (needsChanges) {
      return {
        chip: "Changes requested",
        chipClass: "bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/30",
        title: "Super admin returned your self review",
        detail: "Address the feedback and resubmit. Your assigned super admin reviews you in Admin Submissions.",
        timestamp: formatReviewTimestamp(selfSubmissionMeta?.adminReview?.reviewedAt || submittedAt),
      };
    }
    if (reviewStatus.includes("APPROVED") || adminAction === "APPROVE") {
      return {
        chip: "Approved",
        chipClass: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/30",
        title: "Approved by super admin",
        detail: actor ? `${actor} approved this self review.` : "Your super admin approved this self review.",
        timestamp: formatReviewTimestamp(selfSubmissionMeta?.adminReview?.reviewedAt || submittedAt),
      };
    }
    if (isManagerSelfReviewLocked(selfSubmissionMeta)) {
      return {
        chip: reviewStatus.includes("APPROVED") || adminAction === "APPROVE" ? "Approved" : "Submitted",
        chipClass:
          reviewStatus.includes("APPROVED") || adminAction === "APPROVE"
            ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/30"
            : "bg-blue-500/15 text-blue-800 dark:text-blue-200 border-blue-500/30",
        title:
          reviewStatus.includes("APPROVED") || adminAction === "APPROVE"
            ? "Approved by super admin"
            : "Submitted — locked for this month",
        detail:
          reviewStatus.includes("APPROVED") || adminAction === "APPROVE"
            ? actor
              ? `${actor} approved your self review.`
              : "Your super admin approved this self review."
            : "Your self review is locked for this month. Your selected super admin will review and approve in Admin Submissions.",
        timestamp: formatReviewTimestamp(
          selfSubmissionMeta?.adminReview?.reviewedAt || submittedAt
        ),
      };
    }
    return {
      chip: "Draft",
      chipClass: "bg-slate-500/10 text-slate-700 dark:text-slate-200 border-slate-500/20",
      title: "Draft in progress",
      detail: "Choose one or more super admin reviewers, complete band KPIs and Webknot values, then submit.",
      timestamp: submittedAt ? formatReviewTimestamp(submittedAt) : "—",
    };
  }, [selfSubmissionMeta, selfReviewingManagerIds, superAdminReviewerOptions]);

  useEffect(() => {
    if (!String(month || "").trim()) return;
    if (hydratingSelfSubmission) return;
    if (selfReviewLocked) return;

    const canAutosaveDraft =
      canEnterManagerValues || Boolean(isResubmissionRequested(selfSubmissionMeta));
    if (!canAutosaveDraft) return;

    const payload = buildManagerSelfSubmissionPayload({
      month,
      selfReviewText: managerSelfReviewText,
      kpiRatings: managerSelfKpiRatings,
      selectedValues: managerSelfValueRatings,
      valueComments: managerSelfValueComments,
      allowedKpiIds: filteredSelfKpiIds,
      managerId,
      ...selfReviewerFields,
      reviewStatus: selfSubmissionMeta?.reviewStatus || "DRAFT",
      reopenedForResubmission: selfSubmissionMeta?.reopenedForResubmission,
    });

    const hash = payloadHash(payload);
    if (hash === lastSavedSelfDraftHashRef.current) return;

    const delayMs = getDraftAutosaveDelayMs();
    const saveGeneration = selfDraftSaveGenerationRef.current;
    const id = window.setTimeout(async () => {
      if (saveGeneration !== selfDraftSaveGenerationRef.current) return;
      if (isManagerSelfReviewLocked(selfSubmissionMeta)) return;

      if (saveGeneration !== selfDraftSaveGenerationRef.current) return;

      setManagerDraftError("");
      setManagerDraftSaving(true);
      try {
        if (saveGeneration !== selfDraftSaveGenerationRef.current) return;
        const saved = await saveMonthlyDraft(payload);
        if (saveGeneration !== selfDraftSaveGenerationRef.current) return;
        lastSavedSelfDraftHashRef.current = hash;
        const normalized = normalizeMonthlySubmission(saved);
        if (normalized) {
          setSelfSubmissionMeta((prev) => ({
            ...(prev || {}),
            id: normalized.id ?? prev?.id,
            month: normalized.month || month,
            status: normalized.status || prev?.status || "DRAFT",
            reviewStatus: normalized.reviewStatus || prev?.reviewStatus || "DRAFT",
            updatedAt: normalized.updatedAt || new Date().toISOString(),
          }));
        }
      } catch (err) {
        if (err?.status === 401) {
          onLogout?.();
          return;
        }
        const message = err?.message || "Failed to save draft.";
        if (isDraftSaveBlockedByReviewStateMessage(message)) {
          lastSavedSelfDraftHashRef.current = hash;
          return;
        }
        setManagerDraftError(message);
      } finally {
        setManagerDraftSaving(false);
      }
    }, delayMs);

    return () => window.clearTimeout(id);
  }, [
    canEnterManagerValues,
    hydratingSelfSubmission,
    managerSelfKpiRatings,
    managerSelfReviewText,
    managerSelfValueRatings,
    managerSelfValueComments,
    managerId,
    month,
    onLogout,
    filteredSelfKpiIds,
    selfSubmissionMeta,
    selfReviewLocked,
    selfReviewerFields,
  ]);

  const currentSelfDraftHash = useMemo(
    () =>
      payloadHash(
        buildManagerSelfSubmissionPayload({
          month,
          selfReviewText: managerSelfReviewText,
          kpiRatings: managerSelfKpiRatings,
          selectedValues: managerSelfValueRatings,
          valueComments: managerSelfValueComments,
          allowedKpiIds: filteredSelfKpiIds,
          managerId,
          ...selfReviewerFields,
          reviewStatus: selfSubmissionMeta?.reviewStatus || "DRAFT",
          reopenedForResubmission: selfSubmissionMeta?.reopenedForResubmission,
        }),
      ),
    [
      filteredSelfKpiIds,
      managerId,
      managerSelfKpiRatings,
      managerSelfReviewText,
      managerSelfValueComments,
      managerSelfValueRatings,
      month,
      selfReviewerFields,
      selfSubmissionMeta?.reviewStatus,
      selfSubmissionMeta?.reopenedForResubmission,
    ],
  );

  const selfDraftIsSynced = currentSelfDraftHash === lastSavedSelfDraftHashRef.current;

  const teamInsightSourceRows = useMemo(
    () => (teamInsightsRows.length ? teamInsightsRows : teamSubs),
    [teamInsightsRows, teamSubs]
  );
  const hasFullInsights = teamInsightsRows.length > 0;

  const reporteeCount = useMemo(() => {
    if (hasFullInsights) {
      const ids = new Set(
        teamInsightsRows
          .map((s) => String(s?.employee?.id || "").trim())
          .filter((id) => id && id !== "—")
      );
      return ids.size;
    }
    if (Number.isFinite(teamTotals.total)) return Number(teamTotals.total);
    const ids = new Set(
      teamInsightSourceRows
        .map((s) => String(s?.employee?.id || "").trim())
        .filter((id) => id && id !== "—")
    );
    return ids.size;
  }, [hasFullInsights, teamInsightSourceRows, teamInsightsRows, teamTotals.total]);
  const submittedCount = useMemo(() => {
    if (hasFullInsights) {
      return teamInsightsRows.filter((s) => isSubmittedStatus(s.status)).length;
    }
    if (Number.isFinite(teamTotals.submittedCount)) return Number(teamTotals.submittedCount);
    return teamInsightSourceRows.filter((s) => isSubmittedStatus(s.status)).length;
  }, [hasFullInsights, teamInsightSourceRows, teamInsightsRows, teamTotals.submittedCount]);
  const pendingManagerReviewCount = useMemo(() => {
    if (hasFullInsights) {
      return teamInsightsRows.filter((s) => isPendingManagerReviewRow(s)).length;
    }
    if (Number.isFinite(teamTotals.pendingManagerReviewCount)) return Number(teamTotals.pendingManagerReviewCount);
    return teamInsightSourceRows.filter((s) => isPendingManagerReviewRow(s)).length;
  }, [hasFullInsights, teamInsightSourceRows, teamInsightsRows, teamTotals.pendingManagerReviewCount]);

  /* ── employee list for review queue popover ── */
  const queueEmployeeList = useMemo(() => {
    const rows = teamInsightSourceRows.length ? teamInsightSourceRows : teamSubs;
    const seen = new Map();
    for (const s of rows) {
      const empId = String(s?.employee?.id || "").trim();
      if (!empId || empId === "—") continue;
      if (seen.has(empId)) continue;
      const status = String(s.status || "").trim().toUpperCase();
      const submitted = isSubmittedStatus(status);
      const pendingReview = isPendingManagerReviewRow(s);
      const awaitingEmployee = isAwaitingEmployeeResubmission(s);
      seen.set(empId, {
        id: empId,
        name: s.employee?.name || s.employee?.email || empId,
        email: s.employee?.email || "—",
        submitted,
        pendingReview,
        awaitingEmployee,
        managerSubmitted: Boolean(s.managerSubmitted),
        status,
      });
    }
    return Array.from(seen.values());
  }, [teamInsightSourceRows, teamSubs]);

  const sidebarQueueEmployees = useMemo(() => {
    const mode = String(filter || "").toUpperCase();
    let list = queueEmployeeList;
    if (mode === "EMPLOYEE_SUBMITTED") list = list.filter((e) => e.submitted);
    else if (mode === "MANAGER_REVIEWED" || mode === "SUBMITTED") list = list.filter((e) => e.managerSubmitted);
    else if (mode === "PENDING_MANAGER_REVIEW") list = list.filter((e) => e.pendingReview);
    const q = String(teamSearch || "").trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q)
    );
  }, [filter, queueEmployeeList, teamSearch]);

  const filteredTeamSubs = useMemo(() => {
    const mode = String(filter || "").toUpperCase();
    const managerReviewed = teamSubs.filter((s) => s.managerSubmitted);
    const pendingManagerReview = teamSubs.filter((s) => isPendingManagerReviewRow(s));
    const employeeSubmitted = teamSubs.filter((s) => isSubmittedStatus(s.status));

    const matchesSearch = (row) => {
      const q = String(teamSearch || "").trim().toLowerCase();
      if (!q) return true;
      const name = String(row?.employee?.name || "").toLowerCase();
      const email = String(row?.employee?.email || "").toLowerCase();
      const id = String(row?.employee?.id || "").toLowerCase();
      return name.includes(q) || email.includes(q) || id.includes(q);
    };

    let base = pendingManagerReview;
    if (mode === "ALL") base = teamSubs;
    if (mode === "EMPLOYEE_SUBMITTED") base = employeeSubmitted;
    if (mode === "SUBMITTED" || mode === "MANAGER_REVIEWED") base = managerReviewed;

    return base.filter(matchesSearch);
  }, [filter, teamSearch, teamSubs]);

  const teamPager = useMemo(
    () => ({
      canPrev: teamCursorStack.length > 0,
      canNext: Boolean(teamNextCursor),
      onReset: () => {
        reloadTeam({ cursor: null, pageAction: "reset" }).catch(() => {});
      },
      onPrev: () => {
        const prevCursor = teamCursorStack[teamCursorStack.length - 1] ?? null;
        reloadTeam({ cursor: prevCursor, pageAction: "prev" }).catch(() => {});
      },
      onNext: () => {
        if (!teamNextCursor) return;
        reloadTeam({ cursor: teamNextCursor, pageAction: "next", fromCursor: teamCursor }).catch(() => {});
      },
      loading: teamLoading,
      label: `Page ${teamCursorStack.length + 1}`,
    }),
    [reloadTeam, teamCursor, teamCursorStack, teamLoading, teamNextCursor]
  );

  const account = useMemo(() => {
    const name =
      String(auth?.employeeName || "").trim() ||
      String(auth?.name || "").trim() ||
      String(auth?.email || auth?.claims?.sub || "").trim() ||
      "Unknown";
    const email = String(auth?.email || auth?.claims?.sub || "").trim() || null;
    const role = isHrPortalUser(auth) ? "HR" : "Manager";
    const subtitle = [managerStream, managerBand].filter(Boolean).join(" • ") || null;
    return { name, email, role, subtitle };
  }, [auth, managerBand, managerStream]);

  const isHrUser = useMemo(() => isHrPortalUser(auth), [auth]);

  const handleSidebarTabChange = (nextTab) => {
    setActiveTab(nextTab);
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsSidebarOpen((open) => (open ? false : open));
    }
  };

  async function saveManagerSelfReviewDraft() {
    if (selfReviewLocked) {
      showToast({ title: "Locked", message: "You already submitted this month's self review." });
      return;
    }
    const payload = buildManagerSelfSubmissionPayload({
      month,
      selfReviewText: managerSelfReviewText,
      kpiRatings: managerSelfKpiRatings,
      selectedValues: managerSelfValueRatings,
      valueComments: managerSelfValueComments,
      allowedKpiIds: filteredSelfKpiIds,
      managerId,
      ...selfReviewerFields,
      reviewStatus: selfSubmissionMeta?.reviewStatus || "DRAFT",
      reopenedForResubmission: selfSubmissionMeta?.reopenedForResubmission,
    });
    setSavingSelfReview(true);
    setManagerDraftError("");
    try {
      const saved = await saveMonthlyDraft(payload);
      lastSavedSelfDraftHashRef.current = payloadHash(payload);
      const normalized = normalizeMonthlySubmission(saved);
      if (normalized) {
        setSelfSubmissionMeta((prev) => ({
          ...(prev || {}),
          id: normalized.id ?? prev?.id,
          month: normalized.month || month,
          status: normalized.status || prev?.status || "DRAFT",
          reviewStatus: normalized.reviewStatus || prev?.reviewStatus || "DRAFT",
          updatedAt: normalized.updatedAt || new Date().toISOString(),
        }));
      }
      showToast({ title: "Draft saved", message: "Manager self review saved." });
    } catch (err) {
      const message = err?.message || "Please try again.";
      if (isDraftSaveBlockedByReviewStateMessage(message)) return;
      setManagerDraftError(message);
      showToast({ title: "Save failed", message, tone: "error" });
    } finally {
      setSavingSelfReview(false);
    }
  }

  async function submitManagerSelfReview() {
    if (selfReviewLocked) {
      showToast({ title: "Already submitted", message: "Manager self review can be submitted once per month." });
      return;
    }
    const text = String(managerSelfReviewText || "").trim();
    if (!text) {
      showToast({ title: "Missing self review", message: "Write your self review before submitting." });
      return;
    }
    if (!selfReviewingManagerIds.length) {
      showToast({
        title: "Select reviewer(s)",
        message: "Choose at least one super admin who will review your self review.",
        tone: "error",
      });
      return;
    }
    const payload = {
      ...buildManagerSelfSubmissionPayload({
        month,
        selfReviewText: text,
        kpiRatings: managerSelfKpiRatings,
        selectedValues: managerSelfValueRatings,
        valueComments: managerSelfValueComments,
        allowedKpiIds: filteredSelfKpiIds,
        managerId,
        ...selfReviewerFields,
        reviewStatus: "SUBMITTED",
        reopenedForResubmission: false,
      }),
      submittedAt: new Date().toISOString(),
    };
    selfDraftSaveGenerationRef.current += 1;
    setSavingSelfReview(true);
    try {
      const res = await submitMonthlySubmission(payload);
      const normalized = normalizeMonthlySubmission(res);
      const now = new Date().toISOString();
      setSelfSubmissionMeta({
        id: normalized?.id ?? selfSubmissionMeta?.id ?? null,
        month: normalized?.month ?? month,
        status: normalized?.status ?? "SUBMITTED",
        submissionType: normalized?.submissionType ?? "MANAGER_SELF_REVIEW",
        cycleKey: normalized?.cycleKey ?? buildCycleMeta(month).cycleKey,
        cycleLabel: normalized?.cycleLabel ?? buildCycleMeta(month).cycleLabel,
        reviewStatus: normalized?.reviewStatus ?? "SUBMITTED",
        managerReview: normalized?.managerReview ?? null,
        managerSubmittedAt: normalized?.managerSubmittedAt ?? null,
        managerSelfReviewEvalComments:
          normalized?.raw?.managerSelfReviewEvalComments ?? normalized?.managerReview?.comments ?? null,
        adminReview: normalized?.adminReview ?? null,
        adminSubmittedAt: normalized?.adminSubmittedAt ?? null,
        reopenedForResubmission: Boolean(normalized?.reopenedForResubmission),
        resubmissionRequested: Boolean(normalized?.resubmissionRequested),
        submittedAt: normalized?.submittedAt ?? payload.submittedAt ?? now,
        updatedAt: normalized?.updatedAt ?? now,
        raw: normalized?.raw ?? selfSubmissionMeta?.raw ?? null,
      });
      const normalizedValueComments = (normalized?.webknotValueComments && typeof normalized.webknotValueComments === "object")
        ? normalized.webknotValueComments
        : Array.isArray(normalized?.webknotValueResponses)
          ? Object.fromEntries(
              normalized.webknotValueResponses
                .map((entry) => [String(entry?.valueId || entry?.id || ""), String(entry?.comment || "").trim()])
                .filter(([id, comment]) => id)
            )
          : managerSelfValueComments;
      setManagerSelfValueComments(normalizedValueComments);
      lastSavedSelfDraftHashRef.current = payloadHash(
        buildManagerSelfSubmissionPayload({
          month,
          selfReviewText: managerSelfReviewText,
          kpiRatings: managerSelfKpiRatings,
          selectedValues: managerSelfValueRatings,
          valueComments: normalizedValueComments,
          allowedKpiIds: filteredSelfKpiIds,
          managerId,
          ...selfReviewerFields,
          reviewStatus: "SUBMITTED",
          reopenedForResubmission: false,
        })
      );
      showToast({ title: "Submitted", message: "Self review sent to your selected super admin for review." });
    } catch (err) {
      showToast({ title: "Submit failed", message: err?.message || "Please try again.", tone: "error" });
    } finally {
      setSavingSelfReview(false);
    }
  }

  function validateManagerReview(action) {
    if (!selectedRow) return { ok: false, message: "No submission selected." };
    const reviewAction = String(action || "").trim().toUpperCase();
    const expectedIds = selectedReviewKpiIds;
    const normalizedRatings = {};
    const expectedValueIds = selectedReviewValueIds;
    const normalizedValueRatings = {};

    for (const id of expectedIds) {
      const raw = managerRatings?.[id];
      if (reviewAction === "SUBMIT" && (raw == null || raw === "")) {
        return { ok: false, message: "Rate all KPIs before submitting review." };
      }
      if (raw == null || raw === "") continue;
      const parsed = typeof raw === "number" ? raw : Number.parseFloat(String(raw));
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) {
        return { ok: false, message: "Manager KPI ratings must be between 1 and 5." };
      }
      normalizedRatings[id] = Math.round(parsed * 10) / 10;
    }

    for (const id of expectedValueIds) {
      const raw = managerValueRatings?.[id];
      if (reviewAction === "SUBMIT" && (raw == null || raw === "")) {
        return { ok: false, message: "Rate all Webknot values before submitting review." };
      }
      if (raw == null || raw === "") continue;
      const parsed = typeof raw === "number" ? raw : Number.parseFloat(String(raw));
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) {
        return { ok: false, message: "Manager Webknot value ratings must be between 1 and 5." };
      }
      normalizedValueRatings[id] = Math.round(parsed * 10) / 10;
    }

    const notes = String(managerNotes || "").trim();
    if (reviewAction === "REJECT" && notes.length < 10) {
      return { ok: false, message: "Rejection comments must be at least 10 characters." };
    }

    return {
      ok: true,
      notes,
      normalizedRatings,
      normalizedValueRatings,
    };
  }

  async function submitManagerReviewDecision(action) {
    if (!selectedRow) return;

    const check = validateManagerReview(action);
    if (!check.ok) {
      showToast({ title: "Validation failed", message: check.message || "Please review the input.", tone: "error" });
      return;
    }

    const reviewAction = String(action || "").trim().toUpperCase();
    const empId = String(selectedRow.employee.id || "").trim();
    const m = String(selectedRow.month || month || "").trim();
    if (!empId || !m) {
      showToast({ title: "Missing data", message: "Employee id or month is missing." });
      return;
    }

    const employeePayload = selectedRow.payload || {};
    const reviewedAt = new Date().toISOString();
    const employeeKpiRatings = resolveSubmissionKpiRatings(selectedRow);
    const employeeValueRatings = resolveSubmissionValueRatings(selectedRow);
    const employeeValueEntries = Object.entries(employeeValueRatings);
    const employeeCertifications = normalizeCertificationsForState(employeePayload.certifications);
    const cycleMeta = buildCycleMeta(m);
    const rejectSnapshot =
      reviewAction === "REJECT"
        ? captureRejectSnapshot({ submission: employeePayload, raw: selectedRow?.raw })
        : null;
    const submissionId = resolveSubmissionIdFromRow(selectedRow);
    if ((reviewAction === "SUBMIT" || reviewAction === "REJECT") && !submissionId) {
      showToast({
        title: "Missing submission",
        message: "Could not resolve submission id. Refresh the team list and try again.",
        tone: "error",
      });
      return;
    }
    const payload = {
      submissionId,
      month: m,
      monthKey: m,
      cycleKey: cycleMeta.cycleKey,
      cycleLabel: cycleMeta.cycleLabel,
      cycleShortLabel: cycleMeta.cycleShortLabel,
      cycleStartMonth: cycleMeta.cycleStartMonth,
      cycleEndMonth: cycleMeta.cycleEndMonth,
      cycleMonth: cycleMeta.month,
      submissionType: selectedRow?.submissionType || "EMPLOYEE_MONTHLY_SUBMISSION",
      actorRole: "MANAGER",
      targetRole: "EMPLOYEE",
      workflowStage: "MANAGER_REVIEW",
      subjectEmployeeId: empId,
      profileVerified: true,
      employeeId: empId,
      selfReviewText: String(employeePayload.selfReviewText || ""),
      certifications: employeeCertifications,
      webknotValues: employeeValueEntries.map(([valueId]) => String(valueId || "").trim()),
      webknotValueRatings: Object.fromEntries(employeeValueEntries),
      webknotValueResponses: employeeValueEntries.map(([valueId, rating]) => ({
        valueId: String(valueId || "").trim(),
        rating,
      })),
      recognitionsCount: Number(employeePayload.recognitionsCount || 0) || 0,
      kpiRatings: Object.entries(employeeKpiRatings || {}).map(([kpiId, rating]) => ({
        kpiId: String(kpiId || "").trim(),
        rating,
      })),
      managerEvaluation: {
        kpiRatings: check.normalizedRatings,
        webknotValueRatings: check.normalizedValueRatings,
        comments: check.notes,
        reviewedAt,
        reviewedBy: managerId || null,
      },
      managerReview: {
        action: reviewAction,
        comments: check.notes,
        reviewedAt,
        reviewedBy: managerId || null,
      },
      managerSubmittedAt: reviewAction === "SUBMIT" ? reviewedAt : null,
      managerComments: check.notes,
      managerNotes: check.notes,
      reviewStatus: reviewAction === "REJECT" ? "NEEDS_REVIEW" : "MANAGER_SUBMITTED",
      reopenedForResubmission: reviewAction === "REJECT",
      ...(rejectSnapshot ? { _rejectSnapshot: rejectSnapshot } : {}),
    };

    try {
      setSavingReview(true);
      if (reviewAction === "SUBMIT" || reviewAction === "REJECT") {
        await submitMonthlySubmission(payload);
        if (reviewAction === "SUBMIT") {
          showToast({ title: "Submitted", message: "Manager review submitted." });
          // Remove from local list so manager can no longer access it
          setTeamSubs((prev) =>
            prev.filter((s) => {
              const sameEmp = String(s?.employee?.id || "") === empId;
              const sameMonth = String(s?.month || "") === m;
              return !(sameEmp && sameMonth);
            })
          );
        } else {
          showToast({ title: "Rejected", message: "Sent back with comments for resubmission." });
        }
      } else {
        await saveMonthlyDraft(payload);
      }
      if (reviewAction === "REJECT") {
        setTeamSubs((prev) =>
          prev.map((s) => {
            const sameEmp = String(s?.employee?.id || "") === empId;
            const sameMonth = String(s?.month || "") === m;
            if (!sameEmp || !sameMonth) return s;
            return {
              ...s,
              status: "SUBMITTED",
              reviewStatus: "NEEDS_REVIEW",
              reopenedForResubmission: true,
              updatedAt: reviewedAt,
              managerSubmitted: false,
              raw: {
                ...(s.raw && typeof s.raw === "object" ? s.raw : {}),
                status: "SUBMITTED",
                managerReview: payload.managerReview,
                managerEvaluation: payload.managerEvaluation,
                reviewStatus: "NEEDS_REVIEW",
                reopenedForResubmission: true,
                _rejectSnapshot: rejectSnapshot,
              },
            };
          })
        );
      }

      closeReviewModal();
      await reloadTeam();
      await reloadTeamInsights();
    } catch (err) {
      showToast({ title: `${reviewAction === "REJECT" ? "Reject" : "Submit"} failed`, message: err?.message || "Please try again.", tone: "error" });
    } finally {
      setSavingReview(false);
    }
  }

  return (
    <>
    <AppShell
      isSidebarOpen={isSidebarOpen}
      setIsSidebarOpen={setIsSidebarOpen}
      maxWidth={
        activeTab === "settings"
          ? "max-w-3xl"
          : "max-w-7xl"
      }
      sidebar={
        <PortalSidebar
          isOpen={isSidebarOpen}
          setIsOpen={setIsSidebarOpen}
          activeTab={activeTab}
          setActiveTab={handleSidebarTabChange}
          portalTag="Lead your team's reviews"
          navGroups={MANAGER_NAV_GROUPS}
          showThemeToggle
          onSettingsClick={() => setActiveTab("settings")}
          settingsActive={activeTab === "settings"}
          onGuideClick={() => setGuideOpen(true)}
        />
      }
      topbar={
        <>
          <span className="rt-kicker pointer-events-auto max-w-[12rem] truncate sm:max-w-none">
            <Calendar size={14} className="shrink-0" />
            {cycleInfo?.label || "—"}
          </span>
          <div className="relative pointer-events-auto" ref={notificationsPanelRef}>
        <button
          type="button"
          onClick={() => {
              unlockNotificationSound();
              const nextOpen = !notificationsOpen;
              setNotificationsOpen(nextOpen);
              if (nextOpen) reloadNotifications({ silent: true }).catch(() => {});
            }}
            className={[
              "relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-[rgb(var(--border))]",
              "bg-[rgb(var(--surface))] text-[rgb(var(--text))]",
              "transition-all duration-200 hover:bg-[rgb(var(--surface-2))]",
              unreadNotificationsCount > 0 ? "" : "",
            ].join(" ")}
            aria-label="Manager notifications"
            title="Manager notifications"
          >
            {unreadNotificationsCount > 0 ? <BellDot size={16} /> : <Bell size={16} />}
            {unreadNotificationsCount > 0 ? (
              <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-red-600 px-1 py-0.5 text-center text-[9px] font-semibold text-white">
                {unreadNotificationsCount > 99 ? "99+" : unreadNotificationsCount}
              </span>
            ) : null}
          </button>

          {notificationsOpen ? (
            <div className="absolute right-0 z-[100] mt-3 w-[min(92vw,420px)] rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] shadow-lg">
              <div className="flex items-center justify-between border-b border-[rgb(var(--border))] px-4 py-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                    Manager Alerts
                  </div>
                  <div className="mt-1 text-sm font-medium text-[rgb(var(--text))]">
                    {unreadNotificationsCount} unread
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => reloadNotifications().catch(() => {})}
                    className="rounded-md border border-[rgb(var(--border))] px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => markEveryNotificationRead().catch(() => {})}
                    className="inline-flex items-center gap-1 rounded-md border border-[rgb(var(--border))] px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
                  >
                    <CheckCheck size={13} />
                    Mark all
                  </button>
                </div>
              </div>

              <div className="max-h-[400px] overflow-y-auto p-3">
                {!notificationsError && notificationsLoading && notifications.length === 0 ? (
                  <div className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-3 text-xs text-[rgb(var(--muted))]">
                    Loading alerts...
                  </div>
                ) : null}
                {!notificationsError && !notificationsLoading && notifications.length === 0 ? (
                  <div className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-3 text-xs text-[rgb(var(--muted))]">
                    No manager alerts yet.
                  </div>
                ) : null}
                <div className="space-y-2">
                  {notifications.map((item) => (
                    <button
                      key={String(item.id)}
                      type="button"
                      onClick={() => markNotificationRead(item.id)}
                      className={[
                        "w-full rounded-md border px-3 py-2.5 text-left transition",
                        item.read
                          ? "border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] opacity-90"
                          : "border-blue-500/35 bg-blue-500/10",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                            {String(item.type || "").toUpperCase() === "MONTHLY_MANAGER_REVIEW_SUBMITTED"
                              && String(item.title || "").toLowerCase().includes("return")
                              ? "Review returned"
                              : String(item.type || "").toUpperCase() === "MONTHLY_SELF_REVIEW_SUBMITTED"
                                ? "Employee submission"
                                : "Manager alert"}
                          </div>
                          <div className="mt-1 text-sm font-bold text-[rgb(var(--text))] break-words">{item.title}</div>
                          {item.senderName &&
                          String(item.type || "").toUpperCase() === "MONTHLY_MANAGER_REVIEW_SUBMITTED" &&
                          String(item.title || item.message || "").toLowerCase().includes("return") ? (
                            <div className="mt-1 text-xs text-[rgb(var(--muted))]">
                              Returned by{" "}
                              <span className="font-medium text-[rgb(var(--text))]">{item.senderName}</span>
                            </div>
                          ) : null}
                          {item.message ? (
                            <div className="mt-1 text-xs text-[rgb(var(--muted))] break-words">{item.message}</div>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--muted))]">
                          {formatNotificationTimestamp(item.createdAt)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {notificationsNextCursor ? (
                  <button
                    type="button"
                    onClick={() => reloadNotifications({ cursor: notificationsNextCursor, append: true }).catch(() => {})}
                    className="mt-3 w-full rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-2 text-xs font-bold uppercase tracking-wider text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
                  >
                    Load more
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
          <PortalUserMenu
            auth={auth}
            roleLabel={account.role}
            onProfile={() => setActiveTab("account")}
            onLogout={onLogout}
          />
        </>
      }
    >
        <div className="w-full min-w-0">
        {activeTab === "account" ? (
          <UserProfilePage auth={auth} roleLabel={account.role} onBack={() => setActiveTab("team")} />
        ) : activeTab === "settings" ? (
          <ManagerSettingsPanel />
        ) : (
        <>
        <PortalPageHeader
          title={MANAGER_TAB_COPY[activeTab]?.title || "Manager"}
          subtitle={MANAGER_TAB_COPY[activeTab]?.subtitle || ""}
        >
          <div className="flex items-end gap-3 flex-wrap md:justify-end">
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Month</label>
              <div className="relative">
                <select
                  value={month}
                  disabled
                  className="rt-input appearance-none py-2.5 px-4 pr-9 text-sm rounded-xl cursor-not-allowed opacity-75"
                  title="Month is locked to the current period"
                >
                  {cycleMonthOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" />
              </div>
              <div className="text-[10px] text-[rgb(var(--muted))]">
                Cycle: {cycleInfo?.label || "May-Oct / Nov-Apr"}
              </div>
            </div>

            {activeTab === "team" ? (
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Filter</label>
                  <div className="relative">
                    <select
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      className="rt-input appearance-none py-2.5 px-4 pr-9 text-sm rounded-xl"
                      title="Filter"
                    >
                      <option value="PENDING_MANAGER_REVIEW">Pending manager review</option>
                      <option value="EMPLOYEE_SUBMITTED">Employee submitted</option>
                      <option value="MANAGER_REVIEWED">Manager reviewed</option>
                      <option value="ALL">All reportees</option>
                    </select>
                    <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" />
                  </div>
                </div>
                <div className="space-y-1.5 w-full md:w-56">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Search</label>
                  <input
                    value={teamSearch}
                    onChange={(e) => setTeamSearch(e.target.value)}
                    className="rt-input py-2.5 px-4 text-sm rounded-xl"
                    placeholder="Search name, email, or ID"
                    aria-label="Search team submissions"
                  />
                </div>
              </div>
            ) : null}

            <button
              onClick={() => {
                reloadTeam({ cursor: teamCursor ?? null, pageAction: "stay" }).catch(() => {});
                reloadTeamInsights().catch(() => {});
              }}
              disabled={teamLoading}
              className={[
                "rt-btn-ghost transition-all",
                teamLoading ? "opacity-60 cursor-not-allowed" : "",
              ].join("")}
              title="Refresh"
            >
              <RefreshCw size={18} /> {teamLoading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </PortalPageHeader>

        {isHrUser ? (
          <div className="mb-6 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-4 py-3 text-sm text-[rgb(var(--muted))]">
            HR workspace: lead team reviews here. Complete your own monthly review in the{" "}
            <a href="/employee" className="text-[rgb(var(--primary))] hover:underline">
              employee portal
            </a>
            {" "}or open{" "}
            <a href="/admin" className="text-[rgb(var(--primary))] hover:underline">
              admin tools
            </a>
            .
          </div>
        ) : null}

        {activeTab === "self-review" ? (
          <div className="rt-portal-hero mb-6">
            <div className="relative z-10">
              <div className="rt-kicker mb-2">Leadership self-review</div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[rgb(var(--text))]">
                Your monthly submission
              </h2>
              <p className="mt-1 text-sm text-[rgb(var(--muted))] max-w-2xl">
                Complete your band and department KPIs, rate all Webknot values, choose a super admin reviewer, then submit.
              </p>
            </div>
          </div>
        ) : null}

      <AnimatePresence mode="wait">
      {activeTab === "team" ? (
        <motion.section
          key="team-tab"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
        <PortalWorkflowFrame>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {(teamLoading || !managerProfileReady) && teamSubs.length === 0 ? (
            <div className="xl:col-span-3 rt-panel-subtle rounded-lg p-6 text-sm text-[rgb(var(--muted))] animate-pulse">
              Loading team submissions…
            </div>
          ) : null}
          <section className="xl:col-span-2 rt-panel overflow-hidden order-1">
            <div className="p-8 flex items-center justify-between gap-4 flex-wrap">
              <div className="rt-section-header">
                <h2 className="rt-section-title">Team Submissions</h2>
                <p className="rt-section-subtitle">
                  Review employee submissions for {month}.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-[rgb(var(--muted))] border-t border-b border-[rgb(var(--border))]">
                  <tr>
                    <th className="p-6 font-semibold">Employee</th>
                    <th className="p-6 font-semibold">Status</th>
                    <th className="p-6 font-semibold">Submitted At</th>
                    <th className="p-6 font-semibold">Manager Review</th>
                    <th className="p-6 text-right font-semibold px-8">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgb(var(--border))]">
                  {filteredTeamSubs.map((s) => {
                    const status = String(s.status || "—").toUpperCase();
                    const isSubmitted = isSubmittedStatus(status);
                    const awaitingEmployee = isAwaitingEmployeeResubmission(s);
                    const adminReturned = isAdminReturnedManagerReviewRow(s);
                    const returnedByAdmin = resolveAdminReturnActor(s);
                    const pendingManager = isPendingManagerReviewRow(s);
                    const submittedWhen = s.submittedAt || s.updatedAt || "—";
                    return (
                      <motion.tr
                        key={`${s.employee.email || s.employee.name}:${s.submissionId || submittedWhen}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.25 }}
                        className="hover:bg-[rgb(var(--surface-2))] transition-colors group"
                      >
                        <td className="p-6">
                          <button
                            type="button"
                            onClick={() => setReviewModal({ open: true, row: s })}
                            className="font-bold text-[rgb(var(--text))] tracking-tight hover:text-blue-500 transition-colors text-left"
                            title="Open submission review"
                          >
                            {s.employee.name}
                          </button>
                          <div className="text-xs text-[rgb(var(--muted))] mt-1 font-mono">
                            {s.employee.id || "—"}
                          </div>
                        </td>
                        <td className="p-6">
                          <span
                            className={[
                              "text-[10px] font-semibold uppercase px-3 py-1 rounded-lg border",
                              isSubmitted
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                                : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
                            ].join(" ")}
                          >
                            {status}
                          </span>
                        </td>
                        <td className="p-6 text-xs text-[rgb(var(--muted))]">
                          {formatSubmittedAt(submittedWhen)}
                        </td>
                        <td className="p-6">
                          {adminReturned ? (
                            <div className="space-y-1">
                              <span className="inline-flex text-[10px] font-semibold uppercase whitespace-nowrap px-3 py-1 rounded-lg border bg-amber-500/10 text-amber-800 dark:text-amber-200 border-amber-500/30">
                                Returned by admin
                              </span>
                              {returnedByAdmin ? (
                                <div className="text-xs text-[rgb(var(--muted))]">{returnedByAdmin}</div>
                              ) : null}
                            </div>
                          ) : s.managerSubmitted ? (
                            <span className="text-[10px] font-semibold uppercase px-3 py-1 rounded-lg border bg-blue-500/10 text-blue-600 dark:text-blue-300 border-blue-500/20">
                              Submitted
                            </span>
                          ) : awaitingEmployee ? (
                            <span className="text-[10px] font-semibold uppercase px-3 py-1 rounded-lg border bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20">
                              Returned
                            </span>
                          ) : pendingManager ? (
                            <span className="text-[10px] font-semibold uppercase px-3 py-1 rounded-lg border bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20">
                              Pending
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold uppercase px-3 py-1 rounded-lg border bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] border-[rgb(var(--border))]">
                              —
                            </span>
                          )}
                        </td>
                        <td className="p-6 text-right px-8">
                          <div className="inline-flex items-center gap-2">
                            {pendingManager ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setReviewModal({ open: true, row: s })}
                                  className="rt-btn-ghost transition-all text-xs gap-1.5"
                                  title="Review submission"
                                >
                                  <Eye size={13} /> Review
                                </button>
                              </>
                            ) : awaitingEmployee ? (
                              <span className="text-[10px] text-[rgb(var(--muted))]">Awaiting employee</span>
                            ) : s.managerSubmitted ? (
                              <span className="text-[10px] text-[rgb(var(--muted))]">Review complete</span>
                            ) : null}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}

                  {!teamLoading && filteredTeamSubs.length === 0 ? (
                    <tr>
                      <td className="p-10 text-center text-[rgb(var(--muted))]" colSpan={5}>
                        No submissions to show.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="px-8 py-5 border-t border-[rgb(var(--border))]">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={teamPager.onReset}
                  disabled={Boolean(teamPager.loading)}
                  className={[
                    "rt-btn-ghost",
                    teamPager.loading ? "opacity-50 cursor-not-allowed" : "",
                  ].join("")}
                >
                  First Page
                </button>
                <CursorPagination
                  canPrev={Boolean(teamPager.canPrev)}
                  canNext={Boolean(teamPager.canNext)}
                  onPrev={teamPager.onPrev}
                  onNext={teamPager.onNext}
                  loading={Boolean(teamPager.loading)}
                  label={teamPager.label}
                />
              </div>
            </div>
          </section>

          <section className="xl:col-span-1 rt-panel p-6 sm:p-7 order-2">
            <h2 className="rt-section-title">Review Queue</h2>
            <p className="rt-section-subtitle mt-1">
              Filter the table or open a review directly — nothing is hidden behind another page.
            </p>

            <div className="mt-5 flex flex-col gap-2">
              {[
                { key: "ALL", label: "All reportees", count: reporteeCount, icon: <Users size={16} className="text-blue-500" /> },
                { key: "EMPLOYEE_SUBMITTED", label: "Employee submitted", count: submittedCount, icon: <CheckCircle2 size={16} className="text-emerald-500" /> },
                { key: "PENDING_MANAGER_REVIEW", label: "Pending your review", count: pendingManagerReviewCount, icon: <Clock size={16} className="text-amber-500" /> },
              ].map((card) => {
                const active = String(filter || "").toUpperCase() === card.key;
                return (
                  <button
                    key={card.key}
                    type="button"
                    onClick={() => setFilter(card.key)}
                    className={[
                      "w-full rounded-xl border px-4 py-3 text-left transition-all",
                      active
                        ? "border-[rgb(var(--accent))]/40 bg-[rgb(var(--accent-soft))] shadow-sm"
                        : "border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:border-[rgb(var(--border-strong))] hover:bg-[rgb(var(--surface-2))]/60",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {card.icon}
                        <span className="text-sm font-medium text-[rgb(var(--text))] truncate">{card.label}</span>
                      </div>
                      <span className="text-xl font-bold tabular-nums text-[rgb(var(--text))] shrink-0">{card.count}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 border-t border-[rgb(var(--border))] pt-5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                Quick access
              </div>
              <div className="mt-3 space-y-2 max-h-[min(420px,52vh)] overflow-y-auto pr-1">
                {sidebarQueueEmployees.length ? sidebarQueueEmployees.map((emp) => {
                  const matchRow = teamSubs.find((s) => String(s?.employee?.id || "") === emp.id);
                  return (
                    <div
                      key={emp.id}
                      className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[rgb(var(--text))] truncate">{emp.name}</div>
                          <div className="text-[11px] text-[rgb(var(--muted))] truncate mt-0.5">
                            <span className="font-mono">{emp.id}</span>
                            {emp.email ? ` · ${emp.email}` : ""}
                          </div>
                        </div>
                        <span className={[
                          "shrink-0 text-[10px] font-semibold uppercase px-2 py-1 rounded-full border",
                          emp.managerSubmitted
                            ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20"
                            : emp.awaitingEmployee
                              ? "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20"
                            : emp.pendingReview
                              ? "bg-amber-500/10 text-amber-800 dark:text-amber-200 border-amber-500/25"
                            : emp.submitted
                              ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border-emerald-500/25"
                              : "bg-amber-500/10 text-amber-800 dark:text-amber-200 border-amber-500/25",
                        ].join(" ")}>
                          {emp.managerSubmitted
                            ? "Reviewed"
                            : emp.awaitingEmployee
                              ? "Returned"
                              : emp.pendingReview
                                ? "Pending"
                                : emp.submitted
                                  ? "Submitted"
                                  : "Pending"}
                        </span>
                      </div>
                      {matchRow && isPendingManagerReviewRow(matchRow) ? (
                        <button
                          type="button"
                          onClick={() => setReviewModal({ open: true, row: matchRow })}
                          className="mt-3 rt-btn-ghost text-xs gap-1.5 w-full justify-center"
                        >
                          <Eye size={13} /> Review submission
                        </button>
                      ) : null}
                    </div>
                  );
                }) : (
                  <div className="text-sm text-[rgb(var(--muted))] py-4 text-center">No employees in this filter.</div>
                )}
              </div>
            </div>
          </section>
          </div>
        </PortalWorkflowFrame>
        </motion.section>
      ) : null}

      {activeTab === "self-review" ? (
        !portalWindowLoading && !canEnterManagerValues && !selfNeedsResubmission ? (
          <SubmissionWindowClosed
            portalWindow={portalWindow?.displayWindow || portalWindow?.roleWindow}
            globalOpen={portalWindow?.globalOpen}
            roleOpen={portalWindow?.roleOpen}
            portalLabel="Manager portal"
            error={portalWindowError}
            onRetry={() => {
              setPortalWindowLoading(true);
              fetchSubmissionAccessForRole("manager", { employeeId: managerId, cycleKey: month })
                .then(setPortalWindow)
                .catch((err) => setPortalWindowError(err?.message || "Failed to load window."))
                .finally(() => setPortalWindowLoading(false));
            }}
            onLogout={onLogout}
          />
        ) : (
        <motion.section
          key="self-review-tab"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <PortalWorkflowFrame>
          <section className="rt-panel p-8 max-w-4xl">
            <div className="rounded-2xl border border-[rgb(var(--border))] bg-gradient-to-r from-[rgb(var(--surface))] via-[rgb(var(--surface-2)/.6)] to-white/60 dark:from-[rgb(var(--surface-2))] dark:via-[rgb(var(--surface-2))] dark:to-transparent shadow-sm p-5 sm:p-6 relative overflow-hidden">
              <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-blue-500 via-blue-500 to-cyan-500" aria-hidden="true" />
              <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_15%_20%,rgba(59,130,246,0.08),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(99,102,241,0.08),transparent_28%)]" aria-hidden="true" />
              <div className="relative flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Super admin review</div>
                    <div className="text-sm font-semibold text-[rgb(var(--text))]">Your selected super admin reviews this in Admin Submissions.</div>
                  </div>
                  <span className={[
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider",
                    selfStatusSummary.chipClass,
                  ].join(" ")}>{selfStatusSummary.chip}</span>
                </div>
                <p className="text-xs text-[rgb(var(--muted))] leading-relaxed">{selfStatusSummary.detail}</p>
                <div className="text-[11px] text-[rgb(var(--muted))]">Last update: {selfStatusSummary.timestamp}</div>
              </div>
            </div>

            {selfReviewLocked && !selfNeedsResubmission ? (
              <div className="mt-5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-200">
                This month&apos;s self review is submitted and locked. Your super admin will review your ratings in Admin Submissions.
                To edit again, they must reject and send it back with comments.
              </div>
            ) : null}
            {!selfReviewLocked && selfNeedsResubmission ? (
              <div className="mt-5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
                Your super admin requested changes. Please update your self review and submit again.
                {selfLatestReviewComment ? (
                  <div className="mt-2 text-xs font-mono text-amber-900 dark:text-amber-100 break-words">
                    Feedback: {selfLatestReviewComment}
                  </div>
                ) : null}
              </div>
            ) : null}

            {(hydratingSelfSubmission || selfKpisLoading || selfValuesLoading) ? (
              <div className="mt-5 rt-panel-subtle rounded-lg p-4 text-sm text-[rgb(var(--muted))] animate-pulse">
                Loading your self review template (KPIs and Webknot values)…
              </div>
            ) : null}

            <div className="mt-5 text-xs text-[rgb(var(--muted))]">
              Draft:{" "}
              {selfReviewLocked
                ? "Locked"
                : hydratingSelfSubmission
                  ? "Loading…"
                  : managerDraftSaving
                    ? "Saving…"
                    : managerDraftError
                      ? "Not saved"
                      : selfDraftIsSynced
                        ? "Saved"
                        : "Unsaved changes"}
            </div>

            <div className="mt-6 rt-panel-subtle rounded-lg p-4">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                Super admin reviewers
              </label>
              <p className="mt-1 text-xs text-[rgb(var(--muted))] leading-relaxed">
                Select one or more super admins for this cycle. Each selected reviewer sees your submission in Admin Submissions.
                Once any of them saves their manager review, your self review locks until they reject and send it back.
              </p>
              <div className="mt-3 space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {superAdminReviewersLoading ? (
                  <div className="text-xs text-[rgb(var(--muted))]">Loading super admins…</div>
                ) : superAdminReviewerOptions.length ? (
                  superAdminReviewerOptions.map((m) => {
                    const id = String(m.id || "").trim();
                    const checked = selfReviewingManagerIds.includes(id);
                    return (
                      <label
                        key={id}
                        className={[
                          "flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
                          checked
                            ? "border-blue-500/40 bg-blue-500/5"
                            : "border-[rgb(var(--border))] hover:border-[rgb(var(--muted))]",
                          selfReviewLocked ? "opacity-70 cursor-not-allowed" : "",
                        ].join(" ")}
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checked}
                          disabled={selfReviewLocked || superAdminReviewersLoading}
                          onChange={() => {
                            if (selfReviewLocked) return;
                            setSelfReviewingManagerIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(id)) next.delete(id);
                              else next.add(id);
                              return [...next];
                            });
                          }}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-[rgb(var(--text))]">{m.name || id}</span>
                          {m.email ? (
                            <span className="block text-[11px] text-[rgb(var(--muted))] truncate">{m.email}</span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })
                ) : (
                  <p className="text-xs text-amber-700 dark:text-amber-200">
                    No super admin reviewers found. Ask HR to register Super Admin portal roles in the employee directory.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <textarea
                value={managerSelfReviewText}
                onChange={(e) => setManagerSelfReviewText(e.target.value)}
                readOnly={selfReviewLocked}
                rows={10}
                className={[
                  "rt-input p-4 text-sm resize-none",
                  selfReviewLocked ? "opacity-75 cursor-not-allowed" : "",
                ].join(" ")}
                placeholder="Write your self review for this month..."
              />

              <div className="rt-panel-subtle rounded-lg p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">KPI Ratings (1-5)</div>
                <div className="mt-3 space-y-3 max-h-[260px] overflow-y-auto pr-1">
                  {filteredSelfKpis.map((k) => {
                    const id = String(k?.id || "").trim();
                    const value = managerSelfKpiRatings?.[id];
                    return (
                      <div key={id} className="grid grid-cols-[minmax(0,1fr)_12rem] items-center gap-3">
                        <div className="min-w-0 pr-2">
                          <div className="text-sm text-[rgb(var(--text))] truncate">{String(k?.title || id)}</div>
                          <div className="text-[10px] text-[rgb(var(--muted))] font-mono mt-1">
                            {String(k?.weight || "—")}
                          </div>
                        </div>
                        <IntegerPerformanceRatingSelect
                          value={value}
                          disabled={selfReviewLocked}
                          className="rt-input w-full py-2 px-3 text-sm justify-self-end"
                          onChange={(next) => handleSelfRatingChange("kpi", id, next)}
                        />
                      </div>
                    );
                  })}
                  {!selfKpisLoading && filteredSelfKpis.length === 0 ? (
                    <div className="text-sm text-[rgb(var(--muted))]">No KPIs available.</div>
                  ) : null}
                </div>
              </div>

              <div className="rt-panel-subtle rounded-lg p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Webknot Values Ratings (1-5)</div>
                <div className="mt-3 space-y-4 max-h-[320px] overflow-y-auto pr-1">
                  {selfValuesByPillar.map((group) => (
                    <div key={group.pillar} className="space-y-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">{group.pillar}</div>
                      {group.items.map((valueItem) => {
                        const id = String(valueItem?.id || "").trim();
                        const value = managerSelfValueRatings?.[id];
                        const comment = managerSelfValueComments?.[id] || "";
                        return (
                          <div key={id} className="space-y-2 rounded-md border border-[rgb(var(--border))] p-3 bg-[rgb(var(--surface-1))]">
                            <div className="grid grid-cols-[minmax(0,1fr)_12rem] items-center gap-3">
                              <div className="min-w-0 pr-2">
                                <div className="text-sm text-[rgb(var(--text))] truncate">{String(valueItem?.title || id)}</div>
                                <div className="text-[10px] text-[rgb(var(--muted))] mt-1">{String(valueItem?.pillar || group.pillar || "—")}</div>
                              </div>
                              <IntegerPerformanceRatingSelect
                                value={value}
                                disabled={selfReviewLocked}
                                className="rt-input w-full py-2 px-3 text-sm justify-self-end"
                                onChange={(next) => handleSelfRatingChange("value", id, next)}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Self comments</label>
                              <textarea
                                value={comment}
                                onChange={(e) => setManagerSelfValueComments((prev) => ({ ...prev, [id]: e.target.value }))}
                                readOnly={selfReviewLocked}
                                rows={2}
                                className={[
                                  "mt-2 rt-input p-2 text-sm w-full resize-none",
                                  selfReviewLocked ? "opacity-75 cursor-not-allowed" : "",
                                ].join(" ")}
                                placeholder="Add a short note for this evaluation criteria"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {!selfValuesLoading && selfValues.length === 0 ? (
                    <div className="text-sm text-[rgb(var(--muted))]">No values available.</div>
                  ) : null}
                </div>
              </div>

              <div className="text-[10px] text-[rgb(var(--muted))]">
                Showing KPIs for your profile{managerBand ? ` • Band: ${managerBand}` : ""}{managerStream ? ` • Stream: ${managerStream}` : ""}.
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={saveManagerSelfReviewDraft}
                  disabled={savingSelfReview || selfReviewLocked}
                  className="rt-btn-ghost disabled:opacity-60"
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  onClick={submitManagerSelfReview}
                  disabled={savingSelfReview || selfReviewLocked}
                  className="rt-btn-primary disabled:opacity-60"
                >
                  {selfReviewLocked ? "Submitted" : "Submit Self Review"}
                </button>
              </div>
            </div>
          </section>
          </PortalWorkflowFrame>
        </motion.section>
        )
      ) : null}
      </AnimatePresence>
        </>
        )}
        </div>

      {reviewModal.open && selectedRow ? (
        <ModalOverlay
          open={reviewModal.open}
          onClose={closeReviewModal}
          maxWidth="max-w-6xl"
          zIndex={70}
          header={
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                Manager Review
              </div>
              <div className="mt-2 text-2xl font-semibold tracking-tight text-[rgb(var(--text))]">
                {selectedRow.employee.name}
              </div>
              <div className="mt-1 text-xs text-[rgb(var(--muted))]">
                {String(selectedRow.month || month)}
              </div>
              {isAdminReturnedManagerReviewRow(selectedRow) ? (
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-200">
                  Returned by {resolveAdminReturnActor(selectedRow) || "Admin"}
                </div>
              ) : null}
            </div>
          }
        >

            {isAdminReturnedManagerReviewRow(selectedRow) ? (
              <section className="rt-panel overflow-hidden mb-6">
                <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]/50 px-5 py-4 sm:px-6">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                    Admin feedback
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-[rgb(var(--text))]">
                    Returned by {resolveAdminReturnActor(selectedRow) || "Admin"}
                  </h3>
                  <p className="mt-1 text-sm text-[rgb(var(--muted))]">
                    Update your manager ratings and comments, then submit again.
                  </p>
                </div>
                {resolveAdminReturnComment(selectedRow) ? (
                  <div className="px-5 py-4 sm:px-6 sm:py-5">
                    <blockquote className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-4 py-3.5 text-sm text-[rgb(var(--text))] whitespace-pre-wrap leading-relaxed break-words">
                      {resolveAdminReturnComment(selectedRow)}
                    </blockquote>
                  </div>
                ) : null}
              </section>
            ) : null}

            {String(selectedRow?.status || "").toUpperCase().includes("NEEDS_REVIEW") ||
            selectedRow?.raw?.reopenedForResubmission ? (
              <ResubmissionPlaybook
                submission={{
                  submission: {
                    ...selectedRow.payload,
                    ...selectedRow.raw,
                    month: selectedRow.month,
                    reopenedForResubmission: true,
                    managerReview: selectedRow.raw?.managerReview,
                  },
                }}
                rejectComment={
                  selectedRow.raw?.managerReview?.comments ||
                  selectedRow.payload?.managerReview?.comments ||
                  ""
                }
                className="mb-6"
              />
            ) : null}

            <CycleReplayPanel
              currentSubmission={{ submission: { ...selectedRow.payload, month: selectedRow.month } }}
              month={selectedRow.month}
              employeeId={selectedRow.employee?.id}
              className="mb-6"
            />

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rt-panel-subtle rounded-2xl p-6">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                  Employee Submitted
                </div>
                <div className="mt-4 space-y-5">
                  <div className="grid grid-cols-2 gap-3 text-xs text-[rgb(var(--muted))] font-mono">
                    <div>
                      <div className="uppercase tracking-wider text-[rgb(var(--muted))]">Employee</div>
                      <div className="mt-1 text-[rgb(var(--text))] font-semibold">{selectedRow.employee.name}</div>
                      <div className="mt-0.5">{selectedRow.employee.email || "—"}</div>
                    </div>
                    <div className="text-right">
                      <div className="uppercase tracking-wider text-[rgb(var(--muted))]">Month</div>
                      <div className="mt-1 text-[rgb(var(--text))] font-semibold">{String(selectedRow.month || month)}</div>
                      {selectedRow.cycleLabel ? (
                        <div className="mt-0.5">{String(selectedRow.cycleLabel)}</div>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-[rgb(var(--muted))]">Self Review</div>
                    <div className="mt-2 text-sm text-[rgb(var(--text))] whitespace-pre-wrap">
                      {String(selectedRow.payload?.selfReviewText || "—")}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-[rgb(var(--muted))]">KPI Ratings (Employee)</div>
                    <div className="mt-2 space-y-2">
                      {selectedReviewKpiIds.length ? (
                        Object.entries(selectedEmployeeKpiRatings).map(([id, v]) => (
                          <div key={id} className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm text-[rgb(var(--text))] truncate">{kpiIndex?.[id]?.title || id}</div>
                              {kpiIndex?.[id]?.weight ? (
                                <div className="text-[10px] text-[rgb(var(--muted))] font-mono">Weight: {kpiIndex[id].weight}</div>
                              ) : null}
                            </div>
                            <div className="text-sm font-mono text-[rgb(var(--text))] text-right">
                              <div>{formatPerformanceRating(v)}</div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-[rgb(var(--muted))]">No employee KPI ratings recorded.</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-[rgb(var(--muted))]">Webknot Values (Employee)</div>
                    <div className="mt-2 space-y-2">
                      {Object.keys(selectedEmployeeValueRatings).length ? (
                        Object.entries(selectedEmployeeValueRatings)
                          .sort(([a], [b]) => String(a).localeCompare(String(b), undefined, { numeric: true }))
                          .map(([id, rating]) => (
                            <div key={String(id || "")} className="flex items-center justify-between gap-4">
                              <div className="text-sm text-[rgb(var(--text))] truncate">{valueLabelIndex[String(id)] || String(id || "")}</div>
                              <div className="text-sm font-mono text-[rgb(var(--text))] text-right">{formatPerformanceRating(rating)}</div>
                            </div>
                          ))
                      ) : Array.isArray(selectedRow.payload?.webknotValues) && selectedRow.payload.webknotValues.length ? (
                        selectedRow.payload.webknotValues.map((v) => (
                          <div key={String(v || "")} className="text-sm text-[rgb(var(--text))]">
                            {valueLabelIndex[String(v)] || String(v || "")}
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-[rgb(var(--muted))]">No employee value ratings recorded.</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-[rgb(var(--muted))]">Certifications</div>
                    <div className="mt-2 space-y-2">
                      {normalizeCertificationsForState(selectedRow.payload?.certifications).length ? (
                        normalizeCertificationsForState(selectedRow.payload?.certifications).map((cert, idx) => (
                          <div key={`${cert.name}:${idx}`} className="rt-panel-subtle rounded-md px-3 py-2 text-sm">
                            <div className="font-semibold text-[rgb(var(--text))]">{cert.name}</div>
                            <div className="text-[11px] text-[rgb(var(--muted))] break-words">{cert.proof || "No proof provided"}</div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-[rgb(var(--muted))]">No certifications added.</div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rt-panel-subtle rounded-md px-3 py-3">
                      <div className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">Recognitions</div>
                      <div className="mt-1 text-lg font-semibold text-[rgb(var(--text))]">
                        {Number(selectedRow.payload?.recognitionsCount || 0)}
                      </div>
                    </div>
                    <div className="rt-panel-subtle rounded-md px-3 py-3">
                      <div className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">Status</div>
                      <div className="mt-1 text-sm font-bold text-[rgb(var(--text))]">
                        {String(selectedRow.status || selectedRow.reviewStatus || "SUBMITTED")}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rt-panel-subtle rounded-2xl p-6">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                  Manager Evaluation
                </div>
                <div className="mt-4 space-y-5">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-[rgb(var(--muted))]">KPI Ratings (Manager)</div>
                    <p className="mt-2 text-[11px] text-[rgb(var(--muted))] leading-relaxed">
                      Rating scale: {performanceRatingScaleText()}
                    </p>
                    <div className="mt-2 space-y-3">
                      {selectedReviewKpiIds.length ? (
                        selectedReviewKpiIds.map((id) => {
                          const current = managerRatings?.[id];
                          return (
                            <div key={id} className="flex items-center justify-between gap-3">
                              <div className="text-sm text-[rgb(var(--text))]">
                                {kpiIndex?.[id]?.title || id}
                              </div>
                              <IntegerPerformanceRatingSelect
                                value={current}
                                className="rt-input w-56 py-2 px-3 text-sm"
                                onChange={(next) => {
                                  setManagerRatings((prev) => {
                                    const updated = { ...(prev || {}) };
                                    if (next == null) {
                                      delete updated[id];
                                      return updated;
                                    }
                                    updated[id] = next;
                                    return updated;
                                  });
                                }}
                              />
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-sm text-[rgb(var(--muted))]">No KPIs.</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-[rgb(var(--muted))]">Webknot Value Ratings (Manager)</div>
                    <div className="mt-2 space-y-3">
                      {selectedReviewValueIds.length ? (
                        selectedReviewValueIds
                          .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))
                          .map((id) => {
                            const current = managerValueRatings?.[id];
                            const valueLabel = valueLabelIndex[String(id)] || id;
                            const selfComment = selectedValueComments?.[String(id)] || "";
                            return (
                              <div key={id} className="space-y-2 rounded-md border border-[rgb(var(--border))] p-3 bg-[rgb(var(--surface-1))]">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="text-sm text-[rgb(var(--text))] leading-tight">{String(valueLabel)}</div>
                                  <IntegerPerformanceRatingSelect
                                    value={current}
                                    className="rt-input w-56 py-2 px-3 text-sm"
                                    onChange={(next) => {
                                      setManagerValueRatings((prev) => {
                                        const updated = { ...(prev || {}) };
                                        if (next == null) {
                                          delete updated[id];
                                          return updated;
                                        }
                                        updated[id] = next;
                                        return updated;
                                      });
                                    }}
                                  />
                                </div>
                                {selfComment ? (
                                  <div className="text-xs text-[rgb(var(--muted))] leading-snug">
                                    Self comment: <span className="text-[rgb(var(--text))]">{selfComment}</span>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })
                      ) : (
                        <div className="text-sm text-[rgb(var(--muted))]">No Webknot values.</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-[rgb(var(--muted))]">
                      Manager Comments
                    </div>
                    {rejectArmed || String(managerNotes || "").trim().length > 0 ? (
                      <textarea
                        ref={managerNotesRef}
                        value={managerNotes}
                        onChange={(e) => setManagerNotes(e.target.value)}
                        rows={6}
                        className="mt-2 rt-input p-4 text-sm resize-none"
                        placeholder="Add rejection comments (min 10 characters)."
                      />
                    ) : (
                      <button
                        type="button"
                        className="mt-2 w-full rounded-xl border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface-1))] px-4 py-3 text-left text-sm text-[rgb(var(--muted))] hover:bg-[rgb(var(--surface-2))] transition-colors"
                        onClick={() => {
                          setRejectArmed(true);
                          window.setTimeout(() => managerNotesRef.current?.focus?.(), 0);
                        }}
                      >
                        Add a comment (required to reject)
                      </button>
                    )}
                  </div>

                  <div className="flex justify-end gap-3 flex-wrap pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedKey) return;
                        const next = {
                          ...reviewDrafts,
                          [selectedKey]: {
                            kpiRatings: managerRatings,
                            valueRatings: managerValueRatings,
                            notes: managerNotes,
                            updatedAt: Date.now(),
                          },
                        };
                        setReviewDrafts(next);
                        saveManagerReviewDrafts(next);
                        showToast({ title: "Saved", message: "Manager draft saved locally." });
                      }}
                      className="rt-btn-ghost transition-all"
                    >
                      Save draft
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (savingReview) return;
                        if (!rejectArmed) {
                          setRejectArmed(true);
                          showToast({ title: "Add comments", message: "Enter rejection comments (min 10 characters) to reject." });
                          window.setTimeout(() => managerNotesRef.current?.focus?.(), 0);
                          return;
                        }
                        if (String(managerNotes || "").trim().length < 10) {
                          showToast({ title: "Too short", message: "Rejection comments must be at least 10 characters." });
                          window.setTimeout(() => managerNotesRef.current?.focus?.(), 0);
                          return;
                        }
                        submitManagerReviewDecision("REJECT");
                      }}
                      disabled={savingReview}
                      className={[
                        "rt-btn-danger transition-all",
                        savingReview
                          ? "opacity-50 cursor-not-allowed"
                          : "",
                      ].join(" ")}
                    >
                      {savingReview ? "Rejecting…" : "Reject"}
                    </button>
                    <button
                      type="button"
                      onClick={() => submitManagerReviewDecision("SUBMIT")}
                      disabled={savingReview}
                      className={[
                        "rt-btn-primary transition-all",
                        savingReview
                          ? "!bg-[rgb(var(--surface-2))] !text-[rgb(var(--muted))] !border-[rgb(var(--border))] cursor-not-allowed"
                          : "",
                      ].join(" ")}
                    >
                      {savingReview ? "Submitting…" : "Submit review"}
                    </button>
                  </div>
                  <div className="text-[10px] text-[rgb(var(--muted))]">
                    Validation: submit requires KPI/value ratings (1-5). Reject requires comments (min 10 characters).
                  </div>
                  <div className="text-[11px] text-[rgb(var(--muted))]">
                    Manager ratings and comments are the scores forwarded to admins.
                  </div>
                </div>
              </div>
            </div>
        </ModalOverlay>
      ) : null}

    </AppShell>

    <Toast toast={toast} onDismiss={() => setToast(null)} durationMs={2800} />
    <PortalUsageGuideModal
      open={guideOpen}
      onClose={() => setGuideOpen(false)}
      guideKey={usageGuideKey}
    />
    </>
  );
}
