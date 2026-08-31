// @ts-nocheck
import type { ApiOptions } from "../../types/api-options";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  UserCircle2,
  Award,
  Sparkles,
  CheckCircle2,
  ClipboardCheck,
  Target,
  Clock,
  ShieldAlert,
  Lock,
  FolderKanban,
  Star,
  RefreshCw,
  Search,
  Activity,
} from "lucide-react";
import Toast from "../shared/Toast";
import UserAvatar from "../shared/UserAvatar";
import ModalOverlay from "../shared/ModalOverlay";
import PortalUserMenu from "../shared/PortalUserMenu";
import PortalNotificationsBell, { resolveNotificationUserId } from "../shared/PortalNotificationsBell";
import AppShell from "../shared/AppShell";
import PortalSidebar from "../shared/PortalSidebar";
import UserProfilePage from "../shared/UserProfilePage";
import EmployeeSettingsPanel from "../shared/settings/EmployeeSettingsPanel";
import PortalPageHeader from "../shared/PortalPageHeader";
import SubmissionWindowClosed from "./SubmissionWindowClosed";
import { fetchSubmissionAccessForRole } from "../../api/submission-window";
import { computeSubmissionWindowOpen } from "../../utils/submissionWindow";

import { fetchMe, getAuth, notifyAuthChanged, setAuth } from "../../api/auth";
import { formatPortalRoleLabel, resolvePortalRoleLabel } from "../../utils/portalRole";
import { filterHrPeerReviewRows, isHrPortalUser } from "../../utils/hrRatingsFilter";
import ProjectSelectionPanel, { MAX_PROJECT_SELECTIONS } from "./ProjectSelectionPanel";
import { notifyProjectStakeholdersOnSubmit } from "../../api/project-submit-notifications";
import { fetchAllCertifications, normalizeCertifications } from "../../api/certifications";
import { normalizeKpiDefinitions } from "../../api/kpi-definitions";
import {
  fetchEmployeeSubmissionCycleSummary,
  fetchMyMonthlySubmission,
  formatYearMonth,
  normalizeMonthlySubmission,
  saveMonthlyDraft,
  submitMonthlySubmission,
} from "../../api/monthly-submissions";
import { fetchPortalEmployee } from "../../api/portal";
import {
  fetchEmployeePortalKpiDefinitions,
  fetchEmployeePortalWebknotValues,
  normalizeCursorPage,
  normalizeWebknotValues
} from "../../api/employee-portal";
import { fetchValues, normalizeWebknotValuesList } from "../../api/webknotValueApi";
import {
  fetchProjects,
  normalizeProjects,
  fetchMyProjects,
  fetchAvailableProjects,
  fetchSelectedProjects,
  updateSelectedProjects,
  updateMyProjects,
} from "../../api/projects";
import { listActiveProjectsForEmployees } from "../../utils/projectsCatalog";
import { getAdminSettings, getEmployeeSettings } from "../../utils/appSettings.js";
import {
  buildCycleMeta,
  buildCycleMonthOptions,
  getCycleForMonth,
  isResubmissionRequested,
  normalizeYearMonth,
  resolveResubmissionActor,
  resolveResubmissionActorLabel,
  resolveResubmissionComment,
} from "../../utils/reviewCycles.js";
import { formatPerformanceRating, performanceRatingLabel, performanceRatingScaleText, parseIntegerPerformanceRating } from "../../utils/ratingLabels";
import { IntegerPerformanceRatingSelect } from "../shared/PerformanceRatingField";
import { ensurePromotionPathsLoaded, extractWebtrakBandCode, getPromotionPreview } from "../../utils/careerPromotion";
import { buildCriteriaColorMap, paletteForCriteria } from "../../utils/evaluationCriteriaPalette";
import CycleReplayPanel from "../shared/CycleReplayPanel";
import EmployeePerformanceHistory from "./EmployeePerformanceHistory";
import { EMPLOYEE_NAV_GROUPS, EMPLOYEE_REVIEW_STEP_IDS, EMPLOYEE_TAB_COPY } from "../../config/portalNavigation";
import PortalStepper from "../shared/PortalStepper";
import PortalWorkflowActions from "../shared/PortalWorkflowActions";
import PortalWorkflowFrame from "../shared/PortalWorkflowFrame";

const DEFAULT_PAGE_LIMIT = 10;
const EMPLOYEE_SIDEBAR_PREF_KEY = "rt_tracking_employee_sidebar_open_v1";

function getEmployeeValuesPageSize() {
  const n = Number.parseInt(String(getAdminSettings()?.employeeValuesPageSize ?? DEFAULT_PAGE_LIMIT), 10);
  if (!Number.isFinite(n)) return DEFAULT_PAGE_LIMIT;
  return Math.min(100, Math.max(5, n));
}

function getDraftAutosaveDelayMs() {
  const n = Number.parseInt(String(getEmployeeSettings()?.draftAutosaveDelayMs ?? 900), 10);
  if (!Number.isFinite(n)) return 900;
  return Math.min(5000, Math.max(500, n));
}

function toPercentNumber(weight) {
  const raw = String(weight ?? "").trim();
  if (!raw) return 0;
  const numText = raw.endsWith("%") ? raw.slice(0, -1).trim() : raw;
  const parsed = Number.parseFloat(numText);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatReviewTimestamp(value) {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString();
}

function formatMonthHeadline(monthKey) {
  const key = normalizeYearMonth(monthKey);
  if (!key) return "this month";
  const [yearText, monthText] = key.split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return key;
  const date = new Date(year, month - 1, 1);
  try {
    return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
  } catch {
    return key;
  }
}

function preventWheelInputChange(e) {
  e.currentTarget.blur();
}

function normalizeFilterKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeBandKey(value) {
  const code = extractWebtrakBandCode(value);
  if (code) return normalizeFilterKey(code).replace(/[^a-z0-9]/g, "");
  return normalizeFilterKey(value).replace(/[^a-z0-9]/g, "");
}

function extractBandFromProfile(raw) {
  if (raw == null) return null;
  if (typeof raw === "object") {
    const nested =
      raw.bandName ??
      raw.name ??
      raw.designation ??
      raw.code ??
      raw.bandCode ??
      raw.label;
    return extractWebtrakBandCode(nested) || (nested ? String(nested).trim() : null);
  }
  return extractWebtrakBandCode(raw) || String(raw).trim() || null;
}

function extractBandTypeFromProfile(raw, fallback = "BOTH") {
  const source = raw && typeof raw === "object" ? raw : null;
  const bandType = String(source?.bandType ?? source?.type ?? fallback).trim().toUpperCase();
  if (bandType === "TECH" || bandType === "NON_TECH" || bandType === "BOTH") return bandType;
  return fallback;
}

function extractStreamFromProfile(raw, ...fallbacks) {
  if (raw != null && typeof raw === "object") {
    const nested = raw.name ?? raw.department ?? raw.stream ?? raw.label;
    if (nested) return String(nested).trim() || null;
  }
  if (raw != null && String(raw).trim()) return String(raw).trim();
  for (const fallback of fallbacks) {
    if (fallback != null && String(fallback).trim()) return String(fallback).trim();
  }
  return null;
}

async function fetchAllEmployeePortalKpis({ employeeId, band, stream, signal }) {
  const merged = [];
  const seen = new Set();
  let cursor = null;
  for (let pageIndex = 0; pageIndex < 50; pageIndex += 1) {
    const data = await fetchEmployeePortalKpiDefinitions({
      limit: DEFAULT_PAGE_LIMIT,
      cursor,
      employeeId,
      band,
      stream,
      signal,
    });
    const page = normalizeCursorPage(data);
    for (const kpi of normalizeKpiDefinitions(page.items)) {
      const id = String(kpi?.id || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(kpi);
    }
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return merged;
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
  if (key === "development" || key === "dev" || key === "developer" || key === "developers" || key === "backend" || key === "frontend" || key === "mobile" || key === "fullstack" || key === "engineering") {
    return "development";
  }
  return key;
}

function isWildcardValue(key) {
  const normalized = normalizeFilterKey(key);
  return normalized === "" || normalized === "*" || normalized === "all" || normalized === "any" || normalized === "general" || normalized === "global";
}

function isPlaceholderValueTitle(value, id) {
  const t = String(value ?? "").trim().toLowerCase();
  const i = String(id ?? "").trim().toLowerCase();
  if (!t) return true;
  if (t === "[object object]") return true;
  if (/^value_?\d+$/.test(t)) return true;
  if (t === i && /^value_?\d+$/.test(i)) return true;
  return false;
}

function hasReadableValueItems(items) {
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.some((v) => !isPlaceholderValueTitle(v?.title, v?.id));
}

function employeeBandAndStream(employee) {
  const band = normalizeBandKey(employee?.band);
  const stream = normalizeStreamKey(employee?.stream ?? employee?.department);
  return { band, stream };
}

const KPI_DEPT_STREAM_KEYS = new Set([
  "development",
  "developer",
  "dev",
  "qualityassurance",
  "projectmanager",
  "accountmanager",
  "humanresources",
  "businessanalyst",
  "uiux",
  "deliverymanager",
  "executive",
  "aiml",
  "admin",
]);

function normalizeJobTitleKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isDepartmentStreamKey(streamKey) {
  return streamKey ? KPI_DEPT_STREAM_KEYS.has(streamKey) : false;
}

function kpiRoleKey(kpi) {
  const explicit = normalizeJobTitleKey(
    kpi?.role ?? kpi?.designation ?? kpi?.jobTitle ?? kpi?.job_title,
  );
  if (explicit) return explicit;
  const streamKey = normalizeStreamKey(kpi?.stream ?? kpi?.department);
  if (!streamKey || isDepartmentStreamKey(streamKey)) return "";
  return normalizeJobTitleKey(kpi?.stream ?? kpi?.department);
}

/** Employees only see KPIs that match band + job title (Role) or legacy band + department. */
function kpiAppliesToEmployee(kpi, employee, { bandOverride = null } = {}) {
  const { band: empBand, stream: empStream } = employeeBandAndStream(employee);
  const targetBand = normalizeBandKey(bandOverride ?? empBand);
  if (!targetBand) return false;

  const kpiBand = normalizeBandKey(kpi?.band ?? kpi?.bandName ?? kpi?.bandCode);
  if (!kpiBand || isWildcardValue(kpiBand)) return false;
  if (kpiBand !== targetBand) return false;

  const empRole = normalizeJobTitleKey(employee?.designation ?? employee?.title ?? employee?.jobTitle);
  const kpiRole = kpiRoleKey(kpi);
  if (kpiRole) {
    if (!empRole || kpiRole !== empRole) return false;
    const kpiStream = normalizeStreamKey(kpi?.stream ?? kpi?.department);
    if (kpiStream && isDepartmentStreamKey(kpiStream)) {
      if (!empStream) return false;
      return normalizeStreamKey(empStream) === kpiStream;
    }
    return true;
  }

  if (!empStream) return false;
  const kpiStream = normalizeStreamKey(kpi?.stream ?? kpi?.department);
  if (!kpiStream || isWildcardValue(kpiStream)) return false;
  return kpiStream === empStream;
}

function normalizeEmployeeFromMe(me, { fallbackEmail, fallbackRole } = {}) {
  const root = me && typeof me === "object" ? me : {};
  const obj =
    root?.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? root.data
      : root;

  const email = String(obj.email ?? obj.employeeEmail ?? obj.mail ?? fallbackEmail ?? "").trim() || null;
  const id = String(obj.employeeId ?? obj.empId ?? obj.id ?? "").trim() || null;
  const name = String(obj.employeeName ?? obj.name ?? obj.fullName ?? "").trim() || null;
  const role = resolvePortalRoleLabel(
    obj.role,
    obj.empRole,
    obj.userRole,
    fallbackRole,
  );
  const designation = String(obj.designation ?? obj.title ?? obj.jobTitle ?? "").trim() || null;
  const bandRaw = obj.band ?? obj.level ?? obj.bandCode ?? null;
  const band = extractBandFromProfile(bandRaw);
  const bandType = extractBandTypeFromProfile(typeof bandRaw === "object" ? bandRaw : null);
  const stream = extractStreamFromProfile(
    obj.stream ?? obj.department ?? obj.dept ?? obj.context ?? null,
  );
  const managerId = String(obj.managerId ?? "").trim() || null;

  return {
    id: id || "—",
    name: name || (email || "Unknown"),
    email: email || "",
    role,
    designation,
    band,
    bandType,
    stream,
    managerId,
  };
}

function normalizeEmployeeFromAuth(auth, { fallbackEmail, fallbackRole } = {}) {
  const obj = auth && typeof auth === "object" ? auth : {};
  return {
    id: String(obj.employeeId ?? "").trim() || "—",
    name: String(obj.employeeName ?? "").trim() || (fallbackEmail || "Unknown"),
    email: String(fallbackEmail || obj.email || "").trim(),
    role: resolvePortalRoleLabel(obj.role, obj.empRole, obj.userRole, fallbackRole),
    designation: String(obj.designation ?? "").trim() || null,
    band: extractBandFromProfile(obj.band ?? obj.level ?? null),
    bandType: extractBandTypeFromProfile(typeof obj.band === "object" ? obj.band : null),
    stream: extractStreamFromProfile(obj.stream ?? obj.department ?? null),
    department: extractStreamFromProfile(obj.department ?? obj.stream ?? null),
    managerId: String(obj.managerId ?? "").trim() || null,
  };
}

function normalizeCertificationsForState(input) {
  const arr = Array.isArray(input) ? input : [];
  return arr
    .map((raw) => {
      if (typeof raw === "string") return { name: raw, proof: "" };
      if (!raw || typeof raw !== "object") return null;
      const name = String(raw.name ?? raw.certificationName ?? raw.title ?? "").trim();
      if (!name) return null;
      const proof = String(raw.proof ?? raw.url ?? raw.link ?? raw.credentialId ?? "").trim();
      return { name, proof };
    })
    .filter(Boolean);
}

function normalizeKpiRatingsForState(input) {
  if (!input) return {};
  if (Array.isArray(input)) {
    const out = {};
    for (const item of input) {
      if (!item || typeof item !== "object") continue;
      const id = String(item.kpiDefinitionId ?? item.kpiId ?? item.id ?? "").trim();
      if (!id) continue;
      const num = Number.parseFloat(String(item.rating ?? item.value ?? item.score ?? ""));
      if (!Number.isFinite(num)) continue;
      const integer = parseIntegerPerformanceRating(Math.round(num));
      if (integer == null) continue;
      out[id] = integer;
    }
    return out;
  }
  if (typeof input === "object") {
    const out = {};
    for (const [k, v] of Object.entries(input)) {
      const id = String(k || "").trim();
      if (!id) continue;
      const num = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
      if (!Number.isFinite(num)) continue;
      const integer = parseIntegerPerformanceRating(Math.round(num));
      if (integer == null) continue;
      out[id] = integer;
    }
    return out;
  }
  return {};
}

function normalizeWebknotValueRatingsForState(input) {
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
    const rounded = Math.round(parsed * 10) / 10;
    if (rounded < 1 || rounded > 5) return;
    const integer = parseIntegerPerformanceRating(Math.round(rounded));
    if (integer == null) return;
    out[id] = integer;
  };

  if (Array.isArray(input)) {
    for (const item of input) {
      if (item && typeof item === "object") {
        const id = item.valueId ?? item.webknotValueId ?? item.id ?? item.code ?? item.key ?? item.value ?? item.title ?? item.name;
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

function normalizeValueCommentsForState(input) {
  if (!input) return {};
  const out = {};

  const assign = (idRaw, textRaw) => {
    const id = String(idRaw ?? "").trim();
    if (!id) return;
    const text = String(textRaw ?? "").trim();
    if (!text) return;
    out[id] = text;
  };

  if (Array.isArray(input)) {
    for (const item of input) {
      if (!item || typeof item !== "object") continue;
      const id =
        item.valueId ??
        item.webknotValueId ??
        item.id ??
        item.code ??
        item.key ??
        item.value ??
        item.title ??
        item.name;
      const comment = item.comment ?? item.valueComment ?? item.note ?? item.text ?? item.description;
      assign(id, comment);
    }
    return out;
  }

  if (typeof input === "object") {
    for (const [k, v] of Object.entries(input)) assign(k, v);
  }
  return out;
}

function valuesStepComplete(list, ratings, comments) {
  const rows = Array.isArray(list) ? list : [];
  if (!rows.length) return true;
  const normalizedComments = normalizeValueCommentsForState(comments);
  for (const row of rows) {
    const id = String(row?.id || "").trim();
    if (!id) continue;
    const rating = ratings?.[id];
    const hasRating = typeof rating === "number" && Number.isFinite(rating) && rating >= 1 && rating <= 5;
    if (!hasRating) return false;
    if (!String(normalizedComments?.[id] || "").trim()) return false;
  }
  return true;
}

function buildMonthlySubmissionPayload({
  month,
  selfReviewText,
  selectedCertifications,
  kpiRatings,
  selectedValues,
  valueComments,
  recognitionsCount,
  projectIds = null,
  submissionType = "EMPLOYEE_MONTHLY_SUBMISSION",
  actorRole = "EMPLOYEE",
  subjectEmployeeId = null,
  reviewStatus = null,
  reopenedForResubmission = null,
}) {
  const cycleMeta = buildCycleMeta(month);
  const certifications = normalizeCertificationsForState(selectedCertifications)
    .sort((a, b) =>
      String(a.name).localeCompare(String(b.name), undefined, { numeric: true })
    );

  const ratings = normalizeKpiRatingsForState(kpiRatings);
  const ratingEntries = Object.entries(ratings).sort(([a], [b]) =>
    String(a).localeCompare(String(b), undefined, { numeric: true })
  );
  const stableRatings = Object.fromEntries(ratingEntries);

  const valueRatings = normalizeWebknotValueRatingsForState(selectedValues);
  const normalizedValueComments = normalizeValueCommentsForState(valueComments);
  const valueRatingEntries = Object.entries(valueRatings).sort(([a], [b]) =>
    String(a).localeCompare(String(b), undefined, { numeric: true })
  );
  const stableValueRatings = Object.fromEntries(valueRatingEntries);
  const values = valueRatingEntries.map(([id]) => String(id));
  const webknotValueResponses = valueRatingEntries.map(([valueId, rating]) => ({
    valueId: String(valueId || "").trim(),
    webknotValueId: String(valueId || "").trim(),
    rating,
    comment: String(normalizedValueComments?.[valueId] || "").trim() || undefined,
  }));

  const next = {
    month: normalizeYearMonth(month) || String(month || "").trim() || null,
    monthKey: normalizeYearMonth(month) || String(month || "").trim() || null,
    cycleKey: cycleMeta.cycleKey,
    cycleLabel: cycleMeta.cycleLabel,
    cycleShortLabel: cycleMeta.cycleShortLabel,
    cycleStartMonth: cycleMeta.cycleStartMonth,
    cycleEndMonth: cycleMeta.cycleEndMonth,
    cycleMonth: cycleMeta.month,
    profileVerified: true,
    targetRole: "MANAGER",
    submissionType: String(submissionType || "").trim() || null,
    actorRole: String(actorRole || "").trim() || null,
    subjectEmployeeId: String(subjectEmployeeId || "").trim() || null,
    selfReviewText: String(selfReviewText || ""),
    certifications,
    kpiRatings: stableRatings,
    webknotValues: values,
    webknotValueRatings: stableValueRatings,
    webknotValueResponses,
    webknotValueComments: normalizedValueComments,
    recognitionsCount:
      typeof recognitionsCount === "number" && Number.isFinite(recognitionsCount)
        ? recognitionsCount
        : Number.parseInt(String(recognitionsCount || "0"), 10) || 0,
  };
  const normalizedProjectIds = projectIds instanceof Set
    ? [...projectIds].map((id) => String(id || "").trim()).filter(Boolean)
    : Array.isArray(projectIds)
      ? projectIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
  if (normalizedProjectIds.length) next.projectIds = normalizedProjectIds;
  if (reviewStatus != null) next.reviewStatus = String(reviewStatus || "").trim() || null;
  if (reopenedForResubmission != null) next.reopenedForResubmission = Boolean(reopenedForResubmission);
  return next;
}

function isFinalSubmissionStatus(status, meta) {
  const s = String(status || "").trim().toUpperCase();
  if (s === "SUBMITTED" || s === "APPROVED" || s === "COMPLETED" || s === "FINAL") return true;
  // Also check reviewStatus which the server may use instead of top-level status
  const rs = String(meta?.reviewStatus || "").trim().toUpperCase();
  if (rs === "SUBMITTED" || rs === "APPROVED" || rs === "COMPLETED" || rs === "FINAL") return true;
  if (meta?.submittedAt) return true;
  return false;
}

function isAuthorSubmissionLocked(meta) {
  if (!isFinalSubmissionStatus(meta?.status, meta)) return false;
  return !isResubmissionRequested(meta);
}

const LOCKED_NAV_HINT = "Submission is locked — use Next and Back to browse each step.";

function payloadHash(payload) {
  try {
    return JSON.stringify(payload ?? {});
  } catch {
    return String(Date.now());
  }
}

function InfoRow({ label, value, action }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5 border-b border-[rgb(var(--border)/.5)] last:border-b-0 group hover:bg-[rgb(var(--surface-2)/.3)] -mx-4 px-4 rounded-lg transition-colors">
      <div className="text-xs font-medium text-[rgb(var(--muted))] uppercase tracking-wider">
        {label}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-sm text-[rgb(var(--text))] font-medium text-right break-all">{value}</div>
        {action || null}
      </div>
    </div>
  );
}

function ProjectsTab({
  allProjects = [],
  selectedProjectIds = new Set(),
  onToggleProject,
  projectsLoading = false,
  projectsError = "",
  projectSearch = "",
  onProjectSearchChange,
  locked = false,
  onProceed,
  onBack,
  canProceed = false,
}) {
  return (
    <PortalWorkflowFrame>
      <ProjectSelectionPanel
        title="Select your active projects"
        subtitle="Choose up to 3 projects you contributed to this cycle. When you submit, we notify the PM — or the AM if no PM is listed."
        projects={allProjects}
        selectedProjectIds={selectedProjectIds}
        onToggleProject={onToggleProject}
        loading={projectsLoading}
        disabled={locked}
        search={projectSearch}
        onSearchChange={onProjectSearchChange}
        error={projectsError}
      />
      <PortalWorkflowActions
        onBack={onBack}
        onContinue={onProceed}
        continueLabel="Continue to KPIs"
        continueDisabled={!locked && !canProceed}
        hint={
          locked
            ? LOCKED_NAV_HINT
            : canProceed
              ? "Great — your project selection is saved as you go."
              : "Pick at least one active project to continue."
        }
      />
    </PortalWorkflowFrame>
  );
}

function ProfileTab({
  employee,
  auth,
  authEmail,
  locked = false,
  onProceed,
  canProceed = true,
}) {
  const display = employee || null;
  const email = authEmail || display?.email || "—";

  return (
    <PortalWorkflowFrame>
      <section className="rt-panel overflow-hidden">
        <div className="relative px-6 sm:px-8 pt-8 pb-6 bg-gradient-to-br from-[rgb(var(--accent))]/10 via-[rgb(var(--surface))] to-[rgb(var(--surface-2))]">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="flex items-center gap-4">
              <UserAvatar
                email={email}
                name={display?.name}
                auth={auth}
                size={56}
                ringClassName="rounded-2xl"
                className="shadow-lg shadow-[rgb(var(--primary)/.15)]"
              />
              <div>
                <div className="text-xl font-bold tracking-tight text-[rgb(var(--text))]">
                  {display?.name || email}
                </div>
                <div className="mt-0.5 text-xs text-[rgb(var(--muted))] font-mono">{display?.id || "—"}</div>
                <div className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[rgb(var(--primary)/.1)] border border-[rgb(var(--primary)/.2)] text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--primary))]">
                  {display?.role || "Employee"}
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-[rgb(var(--surface))] border border-[rgb(var(--border))] px-4 py-3 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                Support
              </div>
              <div className="mt-1 text-sm text-[rgb(var(--text))] font-mono">hr@webknot.in</div>
            </div>
          </div>
        </div>

        <div className="px-6 sm:px-8 py-6">
          <InfoRow label="Email" value={email} />
          <InfoRow label="Role" value={display?.role || "Employee"} />
          <InfoRow label="Designation" value={display?.designation || "—"} />
          <InfoRow label="Stream" value={display?.stream || "—"} />
          <InfoRow label="Band" value={display?.band || "—"} />
        </div>
      </section>

      <PortalWorkflowActions
        onContinue={onProceed}
        continueLabel="Continue to projects"
        continueDisabled={!locked && !canProceed}
        hint={locked ? LOCKED_NAV_HINT : "Review your profile details, then choose your active projects."}
      />
    </PortalWorkflowFrame>
  );
}

function Placeholder({ title, note }) {
  return (
    <div className="space-y-6 max-w-4xl mx-auto w-full min-w-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="rt-page-header">
        <h2 className="text-2xl font-bold tracking-tight text-[rgb(var(--text))]">{title}</h2>
        <p className="text-sm text-[rgb(var(--muted))] mt-1">{note}</p>
      </header>

      <section className="rt-panel rounded-2xl p-6 sm:p-8">
        <div className="text-[rgb(var(--muted))] text-sm">
          Coming soon.
        </div>
      </section>
    </div>
  );
}

function SelfReviewEditor({
  text,
  setText,
  showFinalSubmit,
  onFinalSubmit,
  canFinalSubmit,
  locked,
}) {
  const [toast, setToast] = useState(null); // { title, message? }
  const [toastTimerId, setToastTimerId] = useState(null);

  function showToast(nextToast) {
    setToast(nextToast);
    if (toastTimerId) window.clearTimeout(toastTimerId);
    const id = window.setTimeout(() => setToast(null), 2200);
    setToastTimerId(id);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
            Self Review
          </div>
          <div className="mt-2 text-sm text-[rgb(var(--muted))]">
            Summarize accomplishments, impact, collaboration, and goals for this cycle.
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {showFinalSubmit ? (
            <button
              type="button"
              onClick={async () => {
                try {
                  await onFinalSubmit?.();
                  showToast({ title: "Submitted", message: "Saved for manager review." });
                } catch (err) {
                  showToast({ title: "Submit failed", message: err?.message || "Please try again." });
                }
              }}
              disabled={locked || !canFinalSubmit}
              className={[
                "rt-btn-primary transition-all",
                locked || !canFinalSubmit
                  ? "!bg-[rgb(var(--surface-2))] !text-[rgb(var(--muted))] !border-[rgb(var(--border))] cursor-not-allowed"
                  : "bg-[rgb(var(--success))] text-white hover:opacity-90",
              ].join(" ")}
              title={locked ? "This month's review is locked" : (!canFinalSubmit ? "Complete required fields first" : "Submit your self review")}
            >
              <CheckCircle2 size={18} /> Final submit
            </button>
          ) : null}
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={locked}
        rows={10}
        className={[
          "rt-input resize-none p-4 text-sm",
          locked ? "opacity-75 cursor-not-allowed" : "focus:border-blue-500",
        ].join(" ")}
        placeholder="Write your self review here..."
      />
      <div className="text-xs text-[rgb(var(--muted))]">
        Tip: include accomplishments, impact, collaboration, and next goals.
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

function NextBandKpisPreview({
  currentBand,
  nextBand,
  kpis = [],
  loading = false,
  error = "",
  isMaxBand = false,
}) {
  if (isMaxBand) {
    return (
      <section className="pulse-callout pulse-callout--success">
        <Target size={18} className="shrink-0 mt-0.5 text-emerald-700 dark:text-emerald-300" />
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-900 dark:text-emerald-100">
            Career path
          </div>
          <p className="mt-1 text-sm text-[rgb(var(--text))]">
            You are at the top band on your ladder{currentBand ? ` (${currentBand})` : ""}. There is no next-band KPI preview.
          </p>
        </div>
      </section>
    );
  }

  if (!nextBand) return null;

  const items = Array.isArray(kpis) ? kpis : [];

  return (
    <section className="pulse-callout pulse-callout--success">
      <Target size={18} className="shrink-0 mt-0.5 text-emerald-700 dark:text-emerald-300" />
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-900 dark:text-emerald-100">
            Next band KPI preview · {currentBand || "—"} → {nextBand}
          </div>
          <p className="mt-1 text-sm text-[rgb(var(--text))] leading-relaxed">
            Read-only preview of KPI expectations at the next level. Use this to plan growth before your next promotion cycle.
          </p>
        </div>

        {loading ? (
          <div className="text-sm text-[rgb(var(--muted))] animate-pulse">Loading next-band KPIs…</div>
        ) : null}

        {!loading && error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
            {error}
          </div>
        ) : null}

        {!loading && !error && items.length ? (
          <div className="rounded-xl border border-emerald-500/25 bg-[rgb(var(--surface))]/80 overflow-hidden">
            <div className="divide-y divide-[rgb(var(--border))]">
              {items.map((k) => (
                <div key={k.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[rgb(var(--text))] truncate">{k.title || k.id}</div>
                    {k?.stream ? (
                      <div className="text-[11px] text-[rgb(var(--muted))] mt-0.5">{String(k.stream)}</div>
                    ) : null}
                  </div>
                  <div className="text-xs font-mono text-[rgb(var(--muted))] shrink-0">
                    {toPercentNumber(k?.weight) ? `${toPercentNumber(k.weight)}%` : "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {!loading && !error && !items.length ? (
          <div className="text-sm text-[rgb(var(--muted))]">
            No KPI definitions are published yet for {nextBand} in your department. Ask HR if you expected to see them here.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function KpisTab({
  pageKpis,
  allKpis,
  ratings,
  setRatings,
  onProceed,
  onBack,
  loading,
  error,
  fullyLoaded,
  prefetching,
  selfReviewText,
  setSelfReviewText,
  locked,
  nextBandPreview,
  nextBandKpis,
  nextBandKpisLoading,
  nextBandKpisError,
}) {
  const items = Array.isArray(pageKpis) ? pageKpis : [];
  const all = Array.isArray(allKpis) ? allKpis : [];
  const totalWeight = items.reduce((sum, k) => sum + toPercentNumber(k?.weight), 0);
  const allRated = all.length === 0
    ? true
    : all.every((k) => {
        const v = ratings?.[k.id];
        return typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 5;
      });
  const selfReviewOk = Boolean(String(selfReviewText || "").trim());
  const canProceed = fullyLoaded && allRated && selfReviewOk;
  const proceedDisabled = locked ? false : !canProceed;
  const ratedCount = useMemo(() => {
    const list = Array.isArray(allKpis) ? allKpis : [];
    if (list.length === 0) return 0;
    let count = 0;
    for (const k of list) {
      const v = ratings?.[k.id];
      if (typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 5) count += 1;
    }
    return count;
  }, [allKpis, ratings]);

  return (
    <PortalWorkflowFrame>
      {loading ? (
        <div className="rt-panel-subtle rounded-xl p-4 text-sm text-[rgb(var(--muted))] animate-pulse">
          Loading KPIs…
        </div>
      ) : null}
      {!fullyLoaded && (prefetching || loading) ? (
        <div className="rt-panel-subtle rounded-xl p-4 text-sm text-[rgb(var(--muted))] animate-pulse">
          Loading full KPI list for this month…
        </div>
      ) : null}

      <NextBandKpisPreview
        currentBand={nextBandPreview?.currentCode || null}
        nextBand={nextBandPreview?.nextBand || null}
        isMaxBand={Boolean(nextBandPreview?.isMaxBand)}
        kpis={nextBandKpis}
        loading={nextBandKpisLoading}
        error={nextBandKpisError}
      />

      <section className="rt-panel rounded-2xl overflow-hidden">
        <div className="px-6 sm:px-8 py-6 flex items-center justify-between gap-4 flex-wrap border-b border-[rgb(var(--border))]">
          <div>
            <h3 className="font-bold text-[rgb(var(--text))] tracking-tight">KPI Ratings</h3>
            <p className="text-xs text-[rgb(var(--muted))] mt-0.5">
              Total weightage: <span className="font-mono font-semibold">{Math.round(totalWeight * 10) / 10}%</span>
              {all.length > 0 ? <span className="ml-3">{ratedCount}/{all.length} rated</span> : null}
            </p>
          </div>
          {all.length > 0 ? (
            <div className="flex items-center gap-2">
              <div className="h-2 w-24 rounded-full bg-[rgb(var(--surface-2))] overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${all.length ? (ratedCount / all.length) * 100 : 0}%` }} />
              </div>
              <span className="text-[10px] font-mono text-[rgb(var(--muted))]">{all.length ? Math.round((ratedCount / all.length) * 100) : 0}%</span>
            </div>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <p className="px-4 pt-4 pb-2 text-[11px] text-[rgb(var(--muted))] leading-relaxed">
            Rating scale: {performanceRatingScaleText()}
          </p>
          <table className="w-full text-left">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-[rgb(var(--muted))] border-t border-b border-[rgb(var(--border))]">
              <tr>
                <th className="p-4 font-medium">KPI</th>
                <th className="p-4 font-medium">Weightage</th>
                <th className="p-4 font-medium">Your Rating (1-5)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {items.map((k) => {
                const id = String(k?.id || "");
                const title = String(k?.title || "");
                const weight = toPercentNumber(k?.weight);
                const value = ratings?.[id];
                return (
                  <tr key={id} className="hover:bg-[rgb(var(--surface-2))] transition-colors">
                    <td className="p-6">
                      <div className="font-bold text-[rgb(var(--text))] tracking-tight">{title || id}</div>
                      {k?.stream ? (
                        <div className="text-xs text-[rgb(var(--muted))] mt-1">{String(k.stream)}</div>
                      ) : null}
                    </td>
                    <td className="p-6">
                      <span className="font-mono text-[rgb(var(--text))]">{weight}%</span>
                    </td>
                    <td className="p-6">
                      <IntegerPerformanceRatingSelect
                        value={value}
                        disabled={locked}
                        onChange={(next) => {
                          if (locked) return;
                          setRatings((prev) => {
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
                    </td>
                  </tr>
                );
              })}

              {!loading && items.length === 0 ? (
                <tr>
                  <td className="p-10 text-center text-[rgb(var(--muted))]" colSpan={3}>
                    No KPIs to show.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rt-panel rounded-2xl p-6 sm:p-8 shadow-sm">
        <SelfReviewEditor
          text={selfReviewText}
          setText={setSelfReviewText}
          showFinalSubmit={false}
          locked={locked}
        />
      </section>

      <PortalWorkflowActions
        onBack={onBack}
        onContinue={onProceed}
        continueLabel="Continue to values"
        continueDisabled={proceedDisabled}
        hint={
          locked
            ? LOCKED_NAV_HINT
            : proceedDisabled
              ? !allRated
                ? "Rate every KPI from 1 to 5 to continue."
                : "Write your self-review notes before continuing."
              : `${ratedCount}/${all.length} KPIs rated — ready for the next step.`
        }
      />
    </PortalWorkflowFrame>
  );
}

function ValuesTab({
  items,
  loading,
  error,
  selectedValues,
  setSelectedValues,
  valueComments,
  setValueComments,
  onProceed,
  onBack,
  locked,
  canProceed,
}) {
  const list = useMemo(() => (Array.isArray(items) ? items : []), [items]);
  const criteriaColorMap = useMemo(
    () => buildCriteriaColorMap(list.map((v) => v?.pillar)),
    [list],
  );
  const colorForPillar = useCallback(
    (pillar) => {
      const palette = paletteForCriteria(pillar, criteriaColorMap);
      return { bg: palette.bg, text: palette.text, border: palette.border };
    },
    [criteriaColorMap],
  );
  const valueRatings = useMemo(
    () => normalizeWebknotValueRatingsForState(selectedValues),
    [selectedValues]
  );
  const normalizedComments = useMemo(
    () => normalizeValueCommentsForState(valueComments),
    [valueComments]
  );
  const ratedCount = useMemo(() => {
    if (!list.length) return 0;
    let count = 0;
    for (const v of list) {
      const id = String(v?.id || "").trim();
      if (!id) continue;
      const r = valueRatings?.[id];
      if (typeof r === "number" && Number.isFinite(r) && r >= 1 && r <= 5) count += 1;
    }
    return count;
  }, [list, valueRatings]);
  const commentedCount = useMemo(() => {
    if (!list.length) return 0;
    let count = 0;
    for (const v of list) {
      const id = String(v?.id || "").trim();
      if (!id) continue;
      if (String(normalizedComments?.[id] || "").trim()) count += 1;
    }
    return count;
  }, [list, normalizedComments]);

  return (
    <PortalWorkflowFrame>
      {loading ? (
        <div className="rt-panel-subtle rounded-lg p-4 text-sm text-[rgb(var(--muted))]">
          Loading values…
        </div>
      ) : null}

      <section className="rt-panel rounded-2xl overflow-hidden shadow-sm">
        <div className="p-8 flex items-center justify-between gap-4 flex-wrap border-b border-[rgb(var(--border))]">
          <div className="rt-section-header">
            <h3 className="rt-section-title">Values</h3>
            <p className="rt-section-subtitle">
              Rated: <span className="font-mono">{ratedCount}</span> / {list.length}
              {" · "}
              Commented: <span className="font-mono">{commentedCount}</span> / {list.length}
            </p>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          <p className="text-[11px] text-[rgb(var(--muted))] leading-relaxed">
            Rating scale: {performanceRatingScaleText()}
          </p>
        </div>

        <div className="divide-y divide-[rgb(var(--border))] border-t border-[rgb(var(--border))]">
          {list.map((v) => {
            const id = String(v?.id || "");
            const value = valueRatings?.[id];
            const pillar = String(v?.pillar || "—");
            const isPillarMissing = !pillar || pillar === "—";
            const colors = colorForPillar(isPillarMissing ? "" : pillar);
            const comment = normalizedComments?.[id] || "";
            return (
              <div key={id} className="p-6 space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_12rem] gap-4 items-start">
                  <div className="min-w-0 space-y-2">
                    <div className="font-bold text-[rgb(var(--text))] tracking-tight">{String(v?.title || id)}</div>
                    <span
                      className={[
                        "inline-flex text-[10px] font-semibold uppercase px-3 py-1 rounded-lg border",
                        isPillarMissing
                          ? "bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] border-[rgb(var(--border))]"
                          : `${colors.bg} ${colors.text} ${colors.border}`,
                      ].join(" ")}
                    >
                      {pillar || "—"}
                    </span>
                  </div>
                  <IntegerPerformanceRatingSelect
                    value={value}
                    disabled={locked}
                    className="rt-input w-full py-3 px-4 text-sm lg:justify-self-end"
                    onChange={(next) => {
                      if (locked) return;
                      setSelectedValues((prev) => {
                        const updated = normalizeWebknotValueRatingsForState(prev);
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
                <div>
                  <label
                    htmlFor={`value-comment-${id}`}
                    className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]"
                  >
                    Comments for this evaluation criteria
                  </label>
                  <textarea
                    id={`value-comment-${id}`}
                    value={comment}
                    onChange={(e) => {
                      if (locked) return;
                      const next = String(e.target.value || "");
                      setValueComments((prev) => {
                        const updated = { ...(prev || {}) };
                        if (!next.trim()) {
                          delete updated[id];
                          return updated;
                        }
                        updated[id] = next;
                        return updated;
                      });
                    }}
                    readOnly={locked}
                    rows={3}
                    className={[
                      "mt-2 rt-input p-3 text-sm w-full resize-y min-h-[4.5rem]",
                      locked ? "opacity-75 cursor-not-allowed" : "",
                    ].join(" ")}
                    placeholder="Describe how you demonstrated this value during the cycle"
                  />
                </div>
              </div>
            );
          })}

          {!loading && list.length === 0 ? (
            <div className="p-10 text-center text-[rgb(var(--muted))]">
              No values to show.
            </div>
          ) : null}
        </div>
      </section>

      <PortalWorkflowActions
        onBack={onBack}
        onContinue={onProceed}
        continueLabel="Continue to certifications"
        continueDisabled={!locked && !canProceed}
        hint={
          locked
            ? LOCKED_NAV_HINT
            : canProceed
              ? "Values saved — move on when ready."
              : ratedCount < list.length
                ? "Rate every value from 1 to 5 to continue."
                : "Add a comment for each evaluation criteria to continue."
        }
      />
    </PortalWorkflowFrame>
  );
}

function CertificationsTab({
  catalog,
  selectedCertifications,
  setSelectedCertifications,
  onProceed,
  onBack,
  loading,
  error,
  locked,
  canProceed,
}) {
  const [proofModal, setProofModal] = useState({ open: false, name: "" });
  const [proofDraft, setProofDraft] = useState("");
  const [proofError, setProofError] = useState("");

  const selectedKeySet = useMemo(() => {
    const set = new Set();
    for (const item of selectedCertifications || []) {
      const key = String(item?.name || "").trim().toLowerCase();
      if (key) set.add(key);
    }
    return set;
  }, [selectedCertifications]);

  const sorted = Array.isArray(catalog)
    ? catalog.slice().sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || ""), undefined, { numeric: true }))
    : [];

  function closeProofModal() {
    setProofModal({ open: false, name: "" });
    setProofDraft("");
    setProofError("");
  }

  return (
    <PortalWorkflowFrame>
      {loading ? (
        <div className="rt-panel-subtle rounded-lg p-4 text-sm text-[rgb(var(--muted))]">
          Loading certifications…
        </div>
      ) : null}

      <section className="rt-panel rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-[rgb(var(--muted))] border-t border-b border-[rgb(var(--border))]">
              <tr>
                <th className="p-4 font-medium">Certification</th>
                <th className="p-4 font-medium">Completed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {sorted.map((c) => {
                const name = String(c?.name || "");
                const key = name.toLowerCase();
                const checked = selectedKeySet.has(key);
                return (
                <tr key={key} className="hover:bg-[rgb(var(--surface-2))] transition-colors">
                  <td className="p-6">
                    <div className="font-bold text-[rgb(var(--text))] tracking-tight">{name}</div>
                    <div className="text-xs text-[rgb(var(--muted))] mt-1">
                      Select the certifications you have completed.
                    </div>
                  </td>
                  <td className="p-6">
                    <label className="inline-flex items-center gap-3 select-none">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (locked) return;
                          if (e.target.checked) {
                            setProofModal({ open: true, name });
                            setProofDraft("");
                            setProofError("");
                            return;
                          }
                          setSelectedCertifications((prev) => {
                            const list = Array.isArray(prev) ? prev : [];
                            return list.filter((x) => String(x?.name || "").trim().toLowerCase() !== key);
                          });
                        }}
                        disabled={locked}
                        className="h-4 w-4 accent-blue-500"
                      />
                    </label>
                  </td>
                </tr>
              )})}

              {sorted.length === 0 ? (
                <tr>
                  <td className="p-10 text-center text-[rgb(var(--muted))]" colSpan={2}>
                    No certifications to show.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="p-6 border-t border-[rgb(var(--border))]">
          <div className="text-sm text-[rgb(var(--muted))]">
            Selected: <span className="font-mono text-[rgb(var(--text))]">{selectedKeySet.size}</span>
          </div>
        </div>
      </section>

      <PortalWorkflowActions
        onBack={onBack}
        onContinue={onProceed}
        continueLabel="Continue to recognition"
        continueDisabled={!locked && !canProceed}
        hint={locked ? LOCKED_NAV_HINT : canProceed ? "Certifications look good — continue when ready." : "Add proof for each selected certification."}
      />

      {proofModal.open ? (
        <ModalOverlay
          open={proofModal.open}
          onClose={closeProofModal}
          maxWidth="max-w-lg"
          zIndex={60}
          header={
            <div>
              <h3 className="font-semibold uppercase tracking-tight">Proof of Certification</h3>
              <p className="text-[rgb(var(--muted))] text-sm mt-1">{proofModal.name}</p>
            </div>
          }
        >

            {proofError ? (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-200">
                {proofError}
              </div>
            ) : null}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (locked) {
                  closeProofModal();
                  return;
                }
                const proof = String(proofDraft || "").trim();
                if (!proof) {
                  setProofError("Proof is mandatory. Paste a certificate URL / credential ID.");
                  return;
                }

                const name = String(proofModal.name || "").trim();
                const key = name.toLowerCase();

                setSelectedCertifications((prev) => {
                  const list = Array.isArray(prev) ? prev : [];
                  const next = list.filter((x) => String(x?.name || "").trim().toLowerCase() !== key);
                  next.push({ name, proof });
                  return next;
                });

                closeProofModal();
              }}
              className="mt-6 space-y-4"
            >
              <div>
                <label className="text-[10px] font-semibold text-[rgb(var(--muted))] uppercase tracking-wider">
                  Proof *
                </label>
                <input
                  value={proofDraft}
                  onChange={(e) => {
                    if (locked) return;
                    setProofDraft(e.target.value);
                    setProofError("");
                  }}
                  disabled={locked}
                  className={[
                    "mt-2 rt-input py-3 px-4 text-sm",
                    locked ? "opacity-75 cursor-not-allowed" : "focus:border-blue-500",
                  ].join(" ")}
                  placeholder="Paste certificate URL / credential ID"
                />
                <div className="mt-2 text-xs text-[rgb(var(--muted))]">
                  Mandatory. We will validate this later.
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeProofModal}
                  className="rt-btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={locked}
                  className={[
                    "rt-btn-primary",
                    locked ? "!bg-[rgb(var(--surface-2))] !text-[rgb(var(--muted))] !border-[rgb(var(--border))] cursor-not-allowed" : "",
                  ].join(" ")}
                >
                  Save
                </button>
              </div>
            </form>
        </ModalOverlay>
      ) : null}
    </PortalWorkflowFrame>
  );
}

function RecognitionsTab({ recognitionsCount, setRecognitionsCount, onProceed, onBack, locked, canProceed }) {
  return (
    <PortalWorkflowFrame>
      <section className="rt-panel rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
          Awards Received
        </div>
        <div className="mt-4 flex items-center gap-4 flex-wrap">
          <input
            type="number"
            min={0}
            step={1}
            value={Number.isFinite(recognitionsCount) ? recognitionsCount : 0}
            onWheel={preventWheelInputChange}
            onChange={(e) => {
              if (locked) return;
              const parsed = Number.parseInt(String(e.target.value || "0"), 10);
              setRecognitionsCount(Number.isFinite(parsed) && parsed >= 0 ? parsed : 0);
            }}
            disabled={locked}
            className={[
              "rt-input w-40 py-3 px-4 text-sm",
              locked ? "opacity-75 cursor-not-allowed" : "focus:border-blue-500",
            ].join(" ")}
          />
          <div className="text-sm text-[rgb(var(--muted))]">
            Enter 0 if none.
          </div>
        </div>
      </section>

      <PortalWorkflowActions
        onBack={onBack}
        onContinue={onProceed}
        continueLabel="Continue to review"
        continueDisabled={!locked && !canProceed}
        hint={locked ? LOCKED_NAV_HINT : "Enter 0 if you did not receive any awards this cycle."}
      />
    </PortalWorkflowFrame>
  );
}

function ReviewTab({
  employee,
  auth,
  authEmail,
  role,
  submissionMeta,
  kpis,
  kpiRatings,
  selfReviewText,
  selectedValues,
  valueComments,
  selectedCertifications,
  recognitionsCount,
  onSaveDraft,
  onFinalSubmit,
  canFinalSubmit,
  locked,
  valuesIndex,
  allProjects = [],
  selectedProjectIds = new Set(),
  onEditProjects,
  onBack,
}) {
  const [toast, setToast] = useState(null); // { title, message? }
  const [toastTimerId, setToastTimerId] = useState(null);

  function showToast(nextToast) {
    setToast(nextToast);
    if (toastTimerId) window.clearTimeout(toastTimerId);
    const id = window.setTimeout(() => setToast(null), 2200);
    setToastTimerId(id);
  }

  const selectedProjects = useMemo(() => {
    const ids = selectedProjectIds instanceof Set ? selectedProjectIds : new Set(selectedProjectIds || []);
    const list = Array.isArray(allProjects) ? allProjects : [];
    return list.filter((p) => ids.has(String(p?.id || "")));
  }, [allProjects, selectedProjectIds]);

  const valueRatings = useMemo(() => {
    const idx = valuesIndex && typeof valuesIndex === "object" ? valuesIndex : {};
    const ratings = normalizeWebknotValueRatingsForState(selectedValues);
    const comments = normalizeValueCommentsForState(valueComments);
    const out = [];
    for (const [idRaw, ratingRaw] of Object.entries(ratings)) {
      const id = String(idRaw || "").trim();
      const rating = typeof ratingRaw === "number" && Number.isFinite(ratingRaw)
        ? Math.round(ratingRaw * 10) / 10
        : null;
      if (!id || rating == null) continue;
      const title = idx?.[id]?.title ? String(idx[id].title) : id;
      out.push({ id, title, rating, comment: String(comments?.[id] || "").trim() });
    }
    out.sort((a, b) => String(a.title).localeCompare(String(b.title), undefined, { numeric: true }));
    return out;
  }, [selectedValues, valueComments, valuesIndex]);

  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [confirmSubmitBusy, setConfirmSubmitBusy] = useState(false);
  const [confirmSubmitError, setConfirmSubmitError] = useState("");

  return (
    <PortalWorkflowFrame>
      <CycleReplayPanel
        currentSubmission={{
          submission: {
            selfReviewText,
            kpiRatings,
            webknotValueRatings: normalizeWebknotValueRatingsForState(selectedValues),
            month: submissionMeta?.month,
            managerReview: submissionMeta?.managerReview,
          },
        }}
        month={submissionMeta?.month}
      />

      <section className="rt-panel rounded-2xl p-6 sm:p-8 shadow-sm space-y-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
          Employee
        </div>
        <div className="text-sm text-[rgb(var(--text))]">
          {employee?.name || authEmail || "Unknown"}{" "}
          <span className="text-[rgb(var(--muted))] font-mono">({employee?.id || "—"})</span>
        </div>
        <div className="text-xs text-[rgb(var(--muted))] font-mono">{authEmail || "—"} • {role}</div>
      </section>

      <section className="rt-panel rounded-2xl p-6 sm:p-8 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
            Active Projects
          </div>
          {!locked && onEditProjects ? (
            <button
              type="button"
              onClick={onEditProjects}
              className="text-xs font-semibold text-[rgb(var(--primary))] hover:underline"
            >
              Edit selection
            </button>
          ) : null}
        </div>
        {selectedProjects.length ? (
          <div className="space-y-2">
            {selectedProjects.map((p) => (
              <div key={String(p?.id || "")} className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-[rgb(var(--text))]">
                    {String(p?.name || p?.title || p?.id || "Project")}
                  </div>
                  {p?.client ? (
                    <div className="text-xs text-[rgb(var(--muted))] mt-0.5">{String(p.client)}</div>
                  ) : null}
                </div>
                {p?.code ? (
                  <div className="text-xs font-mono text-[rgb(var(--muted))]">{String(p.code)}</div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-[rgb(var(--muted))]">No projects selected.</div>
        )}
      </section>

      <section className="rt-panel rounded-2xl p-6 sm:p-8 shadow-sm space-y-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
          KPI Ratings
        </div>
        {Array.isArray(kpis) && kpis.length ? (
          <div className="space-y-2">
            {kpis.map((k) => (
              <div key={k.id} className="flex items-center justify-between gap-4">
                <div className="text-sm text-[rgb(var(--text))]">{k.title}</div>
                <div className="text-sm font-mono text-[rgb(var(--text))]">
                  {String(kpiRatings?.[k.id] ?? "—")}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-[rgb(var(--muted))]">No KPIs.</div>
        )}
      </section>

      <section className="rt-panel rounded-2xl p-6 sm:p-8 shadow-sm space-y-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
          Self Review
        </div>
        <div className="text-sm text-[rgb(var(--text))] whitespace-pre-wrap">{String(selfReviewText || "")}</div>
      </section>

      <section className="rt-panel rounded-2xl p-6 sm:p-8 shadow-sm space-y-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
          Webknot Values
        </div>
        {valueRatings.length ? (
          <div className="space-y-4">
            {valueRatings.map((row) => (
              <div key={row.id} className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-4 space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-medium text-[rgb(var(--text))]">{row.title}</div>
                  <div className="text-sm font-mono text-[rgb(var(--text))]">{row.rating.toFixed(1)}</div>
                </div>
                {row.comment ? (
                  <div className="text-sm text-[rgb(var(--muted))] whitespace-pre-wrap break-words">{row.comment}</div>
                ) : (
                  <div className="text-sm text-[rgb(var(--muted))] italic">No comment provided.</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-[rgb(var(--muted))]">No value ratings.</div>
        )}
      </section>

      <section className="rt-panel rounded-2xl p-6 sm:p-8 shadow-sm space-y-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
          Certifications
        </div>
        {Array.isArray(selectedCertifications) && selectedCertifications.length ? (
          <div className="space-y-2">
            {selectedCertifications.map((c) => (
              <div key={String(c?.name || "")} className="flex items-start justify-between gap-4">
                <div className="text-sm text-[rgb(var(--text))]">{String(c?.name || "")}</div>
                <div className="text-xs text-[rgb(var(--muted))] font-mono break-all">{String(c?.proof || "")}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-[rgb(var(--muted))]">None selected.</div>
        )}
      </section>

      <section className="rt-panel rounded-2xl p-6 sm:p-8 shadow-sm space-y-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
          Recognitions
        </div>
        <div className="text-sm text-[rgb(var(--text))]">
          Awards received at All Hands: <span className="font-mono text-[rgb(var(--text))]">{Number(recognitionsCount || 0)}</span>
        </div>
      </section>

      {locked ? (
        <PortalWorkflowActions onBack={onBack} hint={LOCKED_NAV_HINT} />
      ) : (
        <div className="rt-workflow-actions flex-col sm:flex-row gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={onBack}
              className="rt-btn-ghost transition-all"
            >
              Back
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await onSaveDraft?.();
                  showToast({ title: "Draft saved", message: "Saved to server." });
                } catch (err) {
                  showToast({ title: "Save failed", message: err?.message || "Please try again." });
                }
              }}
              className="rt-btn-ghost transition-all"
            >
              Save draft
            </button>
          </div>
          <div className="flex flex-col items-stretch sm:items-end gap-2">
            <button
              type="button"
              onClick={() => {
                if (!canFinalSubmit) return;
                setConfirmSubmitError("");
                setConfirmSubmitOpen(true);
              }}
              disabled={!canFinalSubmit}
              className={[
                "rt-btn-primary transition-all",
                !canFinalSubmit
                  ? "!bg-[rgb(var(--surface-2))] !text-[rgb(var(--muted))] !border-[rgb(var(--border))] cursor-not-allowed"
                  : "",
              ].join(" ")}
              title={!canFinalSubmit ? "Complete required fields first" : "Final submit"}
            >
              <CheckCircle2 size={18} /> Final submit
            </button>
            {!canFinalSubmit ? (
              <p className="text-xs text-[rgb(var(--muted))]">
                Complete KPIs, values, certifications, and project selection before submitting.
              </p>
            ) : (
              <p className="text-xs text-[rgb(var(--muted))]">Everything looks ready — submit to lock this month.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Final submit confirmation ── */}
      {confirmSubmitOpen ? (
        <ModalOverlay
          open={confirmSubmitOpen}
          onClose={() => setConfirmSubmitOpen(false)}
          maxWidth="max-w-md"
          zIndex={60}
          header={
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[rgb(var(--primary))]/10 flex items-center justify-center">
                <Lock size={18} className="text-[rgb(var(--primary))]" />
              </div>
              <div>
                <h3 className="font-semibold tracking-tight text-[rgb(var(--text))]">Confirm Final Submission</h3>
                <p className="text-xs text-[rgb(var(--muted))] mt-0.5">This action cannot be undone</p>
              </div>
            </div>
          }
        >
          <div className="mt-4 space-y-4">
            <div className="pulse-callout pulse-callout--warn">
              <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" />
              <div className="leading-relaxed text-[rgb(var(--text))]">
                Once submitted, your self-review form will be <strong>locked for this month</strong>.
                You will not be able to edit your ratings, self-review text, or any other responses unless an admin reopens it for you.
                Selected projects will notify the project manager, account manager, or HR/admin if no PM/AM is assigned.
              </div>
            </div>

            {confirmSubmitError ? (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200">
                {confirmSubmitError}
              </div>
            ) : null}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (confirmSubmitBusy) return;
                  setConfirmSubmitError("");
                  setConfirmSubmitOpen(false);
                }}
                className="rt-btn-ghost"
                disabled={confirmSubmitBusy}
              >
                Go back
              </button>
              <button
                type="button"
                onClick={async () => {
                  setConfirmSubmitError("");
                  setConfirmSubmitBusy(true);
                  try {
                    await onFinalSubmit?.();
                    setConfirmSubmitOpen(false);
                    showToast({ title: "Submitted", message: "Locked for manager review.", tone: "success" });
                  } catch (err) {
                    setConfirmSubmitError(err?.message || "Submit failed. Please try again.");
                  } finally {
                    setConfirmSubmitBusy(false);
                  }
                }}
                disabled={confirmSubmitBusy}
                className="rt-btn-primary bg-[rgb(var(--success))] text-white hover:opacity-90 disabled:opacity-60"
              >
                <Lock size={16} /> {confirmSubmitBusy ? "Submitting…" : "Yes, submit & lock"}
              </button>
            </div>
          </div>
        </ModalOverlay>
      ) : null}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </PortalWorkflowFrame>
  );
}

function AlreadyRespondedScreen({
  month,
  submittedAt,
  onLogout,
  selfReviewText,
  kpis,
  kpiRatings,
  selectedValues,
  selectedCertifications,
  recognitionsCount,
  valuesIndex,
  submissionMeta,
  employee,
  authEmail,
  nextBandPreview,
  nextBandKpis,
  nextBandKpisLoading,
  nextBandKpisError,
}) {
  const monthLabel = formatMonthHeadline(month);
  const submittedLabel = submittedAt ? formatReviewTimestamp(submittedAt) : "—";

  const valueRatings = useMemo(() => {
    const idx = valuesIndex && typeof valuesIndex === "object" ? valuesIndex : {};
    const ratings = normalizeWebknotValueRatingsForState(selectedValues);
    const out = [];
    for (const [idRaw, ratingRaw] of Object.entries(ratings)) {
      const id = String(idRaw || "").trim();
      const rating = typeof ratingRaw === "number" && Number.isFinite(ratingRaw)
        ? Math.round(ratingRaw * 10) / 10
        : null;
      if (!id || rating == null) continue;
      const title = idx?.[id]?.title ? String(idx[id].title) : id;
      out.push({ id, title, rating });
    }
    out.sort((a, b) => String(a.title).localeCompare(String(b.title), undefined, { numeric: true }));
    return out;
  }, [selectedValues, valuesIndex]);

  const mgrEval = submissionMeta?.managerEvaluation || null;
  const mgrReview = submissionMeta?.managerReview || null;
  const hasManagerData = Boolean(
    mgrEval || (mgrReview && typeof mgrReview === "object" && String(mgrReview.comments || "").trim())
  );

  const mgrKpiRatings = mgrEval?.kpiRatings && typeof mgrEval.kpiRatings === "object" ? mgrEval.kpiRatings : {};
  const kpiLabel = (id) => {
    const match = Array.isArray(kpis) ? kpis.find((k) => String(k?.id) === String(id)) : null;
    return match?.title || String(id);
  };
  const mgrValueRatings = mgrEval?.webknotValueRatings && typeof mgrEval.webknotValueRatings === "object" ? mgrEval.webknotValueRatings : {};
  const mgrComments = String(mgrReview?.comments || mgrEval?.comments || "").trim();

  const mgrValueRows = useMemo(() => {
    const idx = valuesIndex && typeof valuesIndex === "object" ? valuesIndex : {};
    return Object.entries(mgrValueRatings).map(([id, rating]) => ({
      id,
      title: idx?.[id]?.title ? String(idx[id].title) : id,
      rating: Number(rating),
    })).sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
  }, [mgrValueRatings, valuesIndex]);

  return (
    <div className="w-full min-w-0 space-y-8">
        <div className="pulse-callout pulse-callout--success">
          <CheckCircle2 size={20} className="shrink-0 mt-0.5 text-emerald-700 dark:text-emerald-300" />
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-950 dark:text-emerald-50">
              Submitted & locked
            </div>
            <p className="mt-1 text-sm text-[rgb(var(--text))] leading-relaxed">
              Your {monthLabel} self-review is submitted. The form is locked for this month — you can still browse settings and your ratings history.
            </p>
          </div>
        </div>

        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="rt-panel relative overflow-hidden rounded-lg mb-8"
        >
          <div className="absolute inset-0 opacity-[0.06] bg-blue-500/10" />
          <div className="relative p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="rt-success-badge">
                  <CheckCircle2 size={14} strokeWidth={2.5} />
                  Submitted & locked
                </div>
                <h1 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-[rgb(var(--text))]">
                  {monthLabel} — submission review
                </h1>
                <p className="mt-1.5 text-sm text-[rgb(var(--muted))]">
                  {employee?.name || authEmail || "—"} · Submitted {submittedLabel}
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-semibold text-[rgb(var(--muted))] uppercase tracking-wider">
                  <Lock size={11} /> Your self-review form is locked for this month — the portal stays open to browse settings and your ratings history.
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <NextBandKpisPreview
          currentBand={nextBandPreview?.currentCode || employee?.band || null}
          nextBand={nextBandPreview?.nextBand || null}
          isMaxBand={Boolean(nextBandPreview?.isMaxBand)}
          kpis={nextBandKpis}
          loading={nextBandKpisLoading}
          error={nextBandKpisError}
        />

        <EmployeePerformanceHistory compact className="mb-2" />

        {/* ── Side-by-side content ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className={`grid grid-cols-1 ${hasManagerData ? "lg:grid-cols-2" : ""} gap-6`}
        >

          {/* ═══ LEFT: Employee Self Review ═══ */}
          <div className="space-y-5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--primary))]">
              Your Self Review
            </div>

            {/* Self Review Text */}
            <div className="rt-panel-subtle rounded-lg p-5 space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Self Review</div>
              <div className="text-sm text-[rgb(var(--text))] whitespace-pre-wrap">{String(selfReviewText || "—")}</div>
            </div>

            {/* Employee KPI Ratings */}
            <div className="rt-panel-subtle rounded-lg p-5 space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Your KPI Ratings</div>
              {Array.isArray(kpis) && kpis.length ? (
                <div className="space-y-1.5">
                  {kpis.map((k) => (
                    <div key={k.id} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-[rgb(var(--text))] truncate">{k.title}</span>
                      <span className="font-mono text-sm">{String(kpiRatings?.[k.id] ?? "—")}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-[rgb(var(--muted))]">No KPIs.</div>
              )}
            </div>

            {/* Employee Value Ratings */}
            <div className="rt-panel-subtle rounded-lg p-5 space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Your Value Ratings</div>
              {valueRatings.length ? (
                <div className="space-y-1.5">
                  {valueRatings.map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-[rgb(var(--text))] truncate">{row.title}</span>
                      <span className="font-mono text-sm">{row.rating.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-[rgb(var(--muted))]">No value ratings.</div>
              )}
            </div>

            {/* Certifications */}
            <div className="rt-panel-subtle rounded-lg p-5 space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Certifications</div>
              {Array.isArray(selectedCertifications) && selectedCertifications.length ? (
                <div className="space-y-2">
                  {selectedCertifications.map((c, idx) => (
                    <div key={`${c?.name || idx}`} className="rounded-lg border border-[rgb(var(--border))] px-3 py-2">
                      <div className="text-sm font-semibold truncate">{String(c?.name || "Certification")}</div>
                      {c?.proof ? (
                        <a className="text-[11px] text-blue-600 hover:underline break-all" href={c.proof} target="_blank" rel="noreferrer noopener">{c.proof}</a>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-[rgb(var(--muted))]">No certifications.</div>
              )}
            </div>

            {/* Recognitions */}
            <div className="rt-panel-subtle rounded-lg p-5 space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Recognitions</div>
              <div className="text-lg font-semibold">{Number(recognitionsCount || 0)}</div>
            </div>
          </div>

          {/* ═══ RIGHT: Manager Review ═══ */}
          {hasManagerData ? (
            <div className="space-y-5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Manager Review
              </div>

              {/* Manager Comments */}
              {mgrComments ? (
                <div className="rt-panel-subtle rounded-lg p-5 space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Manager Comments</div>
                  <div className="text-sm text-[rgb(var(--text))] whitespace-pre-wrap">{mgrComments}</div>
                  {submissionMeta?.managerSubmittedAt ? (
                    <div className="text-[10px] text-[rgb(var(--muted))] font-mono mt-2">
                      Reviewed: {formatReviewTimestamp(submissionMeta.managerSubmittedAt)}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Manager KPI Ratings */}
              <div className="rt-panel-subtle rounded-lg p-5 space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Manager KPI Ratings</div>
                {Object.entries(mgrKpiRatings).length ? (
                  <div className="space-y-1.5">
                    {Array.isArray(kpis) && kpis.length ? (
                      kpis.map((k) => {
                        const mgrRating = mgrKpiRatings[k.id];
                        return (
                          <div key={k.id} className="flex items-center justify-between gap-3">
                            <span className="text-sm text-[rgb(var(--text))] truncate">{k.title}</span>
                            <span className="font-mono text-sm">{mgrRating != null ? Number(mgrRating).toFixed(1) : "—"}</span>
                          </div>
                        );
                      })
                    ) : (
                      Object.entries(mgrKpiRatings).map(([kpiId, rating]) => (
                        <div key={kpiId} className="flex items-center justify-between gap-3">
                          <span className="text-sm text-[rgb(var(--text))] truncate">{kpiLabel(kpiId)}</span>
                          <span className="font-mono text-sm">{Number(rating).toFixed(1)}</span>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-[rgb(var(--muted))]">No manager KPI ratings yet.</div>
                )}
              </div>

              {/* Manager Value Ratings */}
              <div className="rt-panel-subtle rounded-lg p-5 space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Manager Value Ratings</div>
                {mgrValueRows.length ? (
                  <div className="space-y-1.5">
                    {mgrValueRows.map((row) => (
                      <div key={row.id} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-[rgb(var(--text))] truncate">{row.title}</span>
                        <span className="font-mono text-sm">{Number.isFinite(row.rating) ? row.rating.toFixed(1) : "—"}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-[rgb(var(--muted))]">No manager value ratings yet.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                Manager Review
              </div>
              <div className="rt-panel-subtle rounded-lg p-8 text-center">
                <Clock size={24} className="mx-auto text-[rgb(var(--muted))] mb-3" />
                <div className="text-sm font-semibold text-[rgb(var(--text))]">Pending Manager Review</div>
                <div className="text-xs text-[rgb(var(--muted))] mt-1.5">
                  Your manager hasn't submitted their review yet. Check back later.
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* ── Need correction info ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="mt-8 pulse-callout pulse-callout--warn"
        >
          <ShieldAlert size={18} className="shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--text))]">
              Need corrections?
            </div>
            <p className="mt-1.5 text-sm text-[rgb(var(--text))] leading-relaxed">
              If you find any mistake in your response, contact HR at{" "}
              <span className="font-mono font-medium">hr@webknot.in</span> to request reopening.
            </p>
          </div>
        </motion.div>
    </div>
  );
}

export default function EmployeePortal({ onLogout, auth }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const stored = window.localStorage.getItem(EMPLOYEE_SIDEBAR_PREF_KEY);
      if (stored === "0") return false;
      if (stored === "1") return true;
    } catch { void 0; }
    return window.innerWidth >= 1024;
  });
  const location = useLocation();
  const navigate = useNavigate();

  /* ── Path-based routing: sync activeTab ↔ URL path ── */
  const EMP_VALID_TABS = useMemo(
    () => new Set(["profile", "account", "projects", "kpis", "values", "certifications", "recognitions", "review", "performance", "settings"]),
    [],
  );

  const getEmpTabFromPath = useCallback(
    (pathname = location.pathname) => {
      const parts = String(pathname || "")
        .replace(/\/$/, "")
        .split("/")
        .filter(Boolean);
      if (parts[0] === "employee") {
        const tab = parts[1] || "profile";
        if (tab === "notes" || tab === "drive") return "profile";
        return EMP_VALID_TABS.has(tab) ? tab : "profile";
      }
      const legacy = parts[0] || "profile";
      return EMP_VALID_TABS.has(legacy) ? legacy : "profile";
    },
    [EMP_VALID_TABS, location.pathname],
  );

  const activeTab = useMemo(() => getEmpTabFromPath(), [getEmpTabFromPath]);

  const setActiveTab = useCallback(
    (tab) => {
      const path = tab === "profile" ? "/employee" : `/employee/${tab}`;
      if (location.pathname !== path) navigate(path);
    },
    [location.pathname, navigate],
  );

  useEffect(() => {
    const parts = location.pathname.replace(/\/$/, "").split("/").filter(Boolean);
    if (parts[0] === "employee" && (parts[1] === "notes" || parts[1] === "drive")) {
      navigate("/employee", { replace: true });
    }
  }, [location.pathname, navigate]);

  const [employee, setEmployee] = useState(() =>
    normalizeEmployeeFromAuth(auth, {
      fallbackEmail: String(auth?.email || auth?.claims?.sub || "").trim(),
      fallbackRole: String(auth?.role || auth?.claims?.role || "").trim() || "Employee",
    })
  );


  const [portalWindow, setPortalWindow] = useState(null);
  const [portalWindowLoading, setPortalWindowLoading] = useState(true);
  const [portalWindowError, setPortalWindowError] = useState("");
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const showToast = useCallback((nextToast) => {
    setToast(nextToast);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const [portalBootstrapError, setPortalBootstrapError] = useState("");
  const [portalBootstrapLoading, setPortalBootstrapLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [certificationCatalog, setCertificationCatalog] = useState([]);
  const [certificationsLoading, setCertificationsLoading] = useState(false);
  const [certificationsError, setCertificationsError] = useState("");
  const [submissionMonth, setSubmissionMonth] = useState(() => formatYearMonth(new Date()));
  const [allProjects, setAllProjects] = useState([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState(new Set());
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [hydratingSubmission, setHydratingSubmission] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState("");
  const lastSavedDraftHashRef = useRef("");
  const [submissionMeta, setSubmissionMeta] = useState(null); // { id, month, status, submittedAt, updatedAt }
  const [selfReviewText, setSelfReviewText] = useState("");
  const [selectedCertifications, setSelectedCertifications] = useState([]); // { name, proof }[]
  const [kpis, setKpis] = useState([]); // all loaded KPIs (union)
  const [, setKpiPage] = useState({ cursor: null, nextCursor: null, stack: [], items: [] });
  const [kpisFullyLoaded, setKpisFullyLoaded] = useState(false);
  const [kpiPageLoading, setKpiPageLoading] = useState(false);
  const [kpiPrefetching, setKpiPrefetching] = useState(false);
  const [kpisError, setKpisError] = useState("");
  const [kpiRatings, setKpiRatings] = useState({}); // { [kpiId]: number }
  const [nextBandKpis, setNextBandKpis] = useState([]);
  const [nextBandKpisLoading, setNextBandKpisLoading] = useState(false);
  const [nextBandKpisError, setNextBandKpisError] = useState("");
  const [valuesIndex, setValuesIndex] = useState({}); // { [id]: { title, pillar } }
  const [valuesPage, setValuesPage] = useState({ cursor: null, nextCursor: null, stack: [], items: [] });
  const [valuesLoading, setValuesLoading] = useState(false);
  const [valuesError, setValuesError] = useState("");
  const [selectedValues, setSelectedValues] = useState({}); // { [valueId]: rating }
  const [valueComments, setValueComments] = useState({}); // { [valueId]: comment }
  const [recognitionsCount, setRecognitionsCount] = useState(0);
  const [cycleSummary, setCycleSummary] = useState(null);
  const [cycleSummaryLoading, setCycleSummaryLoading] = useState(false);

  // Route all error states through toast
  useEffect(() => { if (portalBootstrapError) showToast({ title: "Portal Error", message: portalBootstrapError, tone: "error" }); }, [portalBootstrapError, showToast]);
  useEffect(() => { if (error) showToast({ title: "Profile Error", message: error, tone: "error" }); }, [error, showToast]);
  useEffect(() => { if (kpisError) showToast({ title: "KPI Error", message: kpisError, tone: "error" }); }, [kpisError, showToast]);
  useEffect(() => { if (valuesError) showToast({ title: "Values Error", message: valuesError, tone: "error" }); }, [valuesError, showToast]);
  useEffect(() => { if (certificationsError) showToast({ title: "Certifications Error", message: certificationsError, tone: "error" }); }, [certificationsError, showToast]);
  useEffect(() => { if (draftSaveError) showToast({ title: "Draft Save Failed", message: draftSaveError, tone: "error" }); }, [draftSaveError, showToast]);

  const authEmail = String(auth?.email || auth?.claims?.sub || "").trim();
  const role = useMemo(
    () =>
      resolvePortalRoleLabel(
        employee?.role,
        auth?.role,
        auth?.claims?.role,
        auth?.empRole,
        auth?.userRole,
      ),
    [auth?.claims?.role, auth?.empRole, auth?.role, auth?.userRole, employee?.role],
  );
  const isHrUser = useMemo(() => isHrPortalUser(auth), [auth]);
  const subjectEmployeeId = useMemo(
    () => String(
      employee?.id ??
      auth?.employeeId ??
      auth?.empId ??
      auth?.id ??
      auth?.claims?.employeeId ??
      ""
    ).trim(),
    [auth?.claims?.employeeId, auth?.empId, auth?.employeeId, auth?.id, employee?.id]
  );
  const notificationUserId = useMemo(
    () =>
      resolveNotificationUserId(
        auth?.userId,
        auth?.id,
        auth?.claims?.userId,
        employee?.userId,
        employee?.id,
      ),
    [auth?.claims?.userId, auth?.id, auth?.userId, employee?.id, employee?.userId]
  );
  const cycleInfo = useMemo(
    () => getCycleForMonth(submissionMonth || new Date()),
    [submissionMonth]
  );
  const cycleMonthOptions = useMemo(
    () => buildCycleMonthOptions(submissionMonth || new Date()),
    [submissionMonth]
  );

  const [promotionPathsRevision, setPromotionPathsRevision] = useState(0);
  useEffect(() => {
    const ac = new AbortController();
    ensurePromotionPathsLoaded({ signal: ac.signal })
      .then(() => setPromotionPathsRevision((n) => n + 1))
      .catch(() => {});
    const onPathsUpdated = () => setPromotionPathsRevision((n) => n + 1);
    window.addEventListener("rt:promotion-paths-updated", onPathsUpdated);
    return () => {
      ac.abort();
      window.removeEventListener("rt:promotion-paths-updated", onPathsUpdated);
    };
  }, []);

  const nextBandPreview = useMemo(() => {
    if (!employee?.band) return null;
    return getPromotionPreview(employee.band, employee?.bandType || "BOTH");
  }, [employee?.band, employee?.bandType, promotionPathsRevision]);

  const visibleNextBandKpis = useMemo(() => {
    if (!nextBandPreview?.nextBand) return [];
    return (Array.isArray(nextBandKpis) ? nextBandKpis : []).filter((k) =>
      kpiAppliesToEmployee(k, employee, { bandOverride: nextBandPreview.nextBand }),
    );
  }, [employee, nextBandKpis, nextBandPreview?.nextBand]);

  useEffect(() => {
    if (!nextBandPreview?.nextBand) {
      setNextBandKpis([]);
      setNextBandKpisError("");
      setNextBandKpisLoading(false);
      return;
    }
    const { stream: empStream } = employeeBandAndStream(employee);
    if (!empStream) return;

    let mounted = true;
    const controller = new AbortController();
    (async () => {
      setNextBandKpisLoading(true);
      setNextBandKpisError("");
      try {
        const rows = await fetchAllEmployeePortalKpis({
          employeeId: employee?.id || null,
          band: nextBandPreview.nextBand,
          stream: empStream,
          signal: controller.signal,
        });
        if (!mounted) return;
        setNextBandKpis(rows);
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!mounted) return;
        if (err?.status === 401) {
          onLogout?.();
          return;
        }
        setNextBandKpis([]);
        setNextBandKpisError(err?.message || "Failed to load next-band KPIs.");
      } finally {
        if (mounted) setNextBandKpisLoading(false);
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [employee?.band, employee?.id, employee?.stream, nextBandPreview?.nextBand, onLogout]);

  useEffect(() => {
    if (!subjectEmployeeId || !cycleInfo?.key) return;
    let mounted = true;
    const controller = new AbortController();
    setCycleSummaryLoading(true);
    fetchEmployeeSubmissionCycleSummary(
      { cycleKey: cycleInfo.key, employeeId: subjectEmployeeId },
      { signal: controller.signal }
    )
      .then((summary) => {
        if (mounted) setCycleSummary(summary);
      })
      .catch(() => {
        if (mounted) setCycleSummary(null);
      })
      .finally(() => {
        if (mounted) setCycleSummaryLoading(false);
      });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [cycleInfo?.key, subjectEmployeeId]);

  useEffect(() => {
    if (!cycleMonthOptions.length) return;
    const current = normalizeYearMonth(submissionMonth);
    if (current && cycleMonthOptions.some((opt) => opt.value === current)) return;
    setSubmissionMonth(cycleMonthOptions[cycleMonthOptions.length - 1].value);
  }, [cycleMonthOptions, submissionMonth]);

  useEffect(() => {
    try {
      window.localStorage.setItem(EMPLOYEE_SIDEBAR_PREF_KEY, isSidebarOpen ? "1" : "0");
    } catch { void 0; }
  }, [isSidebarOpen]);

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

  const kpiPrefetchCursorRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      setPortalBootstrapLoading(true);
      try {
        setPortalBootstrapError("");
        const portal = await fetchPortalEmployee({ signal: controller.signal });
        if (!mounted) return;
        const root =
          portal?.data && typeof portal.data === "object" && !Array.isArray(portal.data)
            ? portal.data
            : portal;

        const portalEmployee = root?.employee ?? root?.me ?? null;
        if (portalEmployee && typeof portalEmployee === "object") {
          const normalized = normalizeEmployeeFromMe(portalEmployee, {
            fallbackEmail: authEmail,
            fallbackRole: role,
          });
          setEmployee((prev) => ({
            ...(prev || {}),
            ...normalized,
            name: normalized.name || prev?.name,
            email: normalized.email || prev?.email,
            role: normalized.role || prev?.role,
            designation: normalized.designation ?? prev?.designation,
            band: normalized.band ?? prev?.band,
            stream: normalized.stream ?? prev?.stream,
            department: normalized.department ?? normalized.stream ?? prev?.department,
          }));
          const session = getAuth();
          const profileRole = formatPortalRoleLabel(
            portalEmployee?.role ?? portalEmployee?.empRole ?? portalEmployee?.userRole,
          );
          if (profileRole && profileRole !== session?.role) {
            setAuth({ ...session, role: profileRole, portal: profileRole });
            notifyAuthChanged();
          }
        }

        const certsRaw =
          root?.certifications ??
          root?.certificationCatalog ??
          root?.catalog ??
          root?.data?.certifications ??
          null;
        if (Array.isArray(certsRaw)) {
          const next = normalizeCertifications(certsRaw).filter((c) => Boolean(c?.listed));
          setCertificationCatalog((prev) => (Array.isArray(prev) && prev.length ? prev : next));
        }
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!mounted) return;
        if (err?.status === 401) {
          onLogout?.();
          return;
        }
        if (err?.status === 403) {
          setPortalBootstrapError("");
          return;
        }
        setPortalBootstrapError(err?.message || "Failed to load portal data.");
      } finally {
        if (mounted) setPortalBootstrapLoading(false);
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [authEmail, onLogout, role]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    async function run() {
      setCertificationsError("");
      setCertificationsLoading(true);
      try {
        const data = await fetchAllCertifications({ activeOnly: true, signal: controller.signal });
        const normalized = normalizeCertifications(data?.items || []).filter((c) => Boolean(c?.listed));
        if (!mounted) return;
        setCertificationCatalog(normalized);
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!mounted) return;
        if (err?.status === 401) {
          onLogout?.();
          return;
        }
        setCertificationsError(err?.message || "Failed to load certifications.");
        setCertificationCatalog([]);
      } finally {
        if (mounted) setCertificationsLoading(false);
      }
    }
    run();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [onLogout]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      setKpisError("");
      setKpiPageLoading(true);
      setKpisFullyLoaded(false);
      const { band: empBand, stream: empStream } = employeeBandAndStream(employee);
      if (!empBand || !empStream) {
        if (loading || portalBootstrapLoading) {
          setKpiPageLoading(true);
          setKpisError("");
          return;
        }
        setKpis([]);
        setKpiPage({ cursor: null, nextCursor: null, stack: [], items: [] });
        kpiPrefetchCursorRef.current = null;
        setKpisFullyLoaded(true);
        setKpisError(
          "Your profile is missing a band or department. Ask HR to update your record — KPIs are shown only for your level and team.",
        );
        setKpiPageLoading(false);
        return;
      }
      try {
        const data = await fetchEmployeePortalKpiDefinitions({
          limit: DEFAULT_PAGE_LIMIT,
          cursor: null,
          employeeId: employee?.id || null,
          band: empBand,
          stream: empStream,
          signal: controller.signal,
        });
        const page = normalizeCursorPage(data);
        const normalized = normalizeKpiDefinitions(page.items).filter((k) =>
          kpiAppliesToEmployee(k, employee),
        );
        if (!mounted) return;
        setKpiPage({ cursor: null, nextCursor: page.nextCursor, stack: [], items: normalized });
        kpiPrefetchCursorRef.current = page.nextCursor;
        setKpis((prev) => {
          const seen = new Set((prev || []).map((k) => String(k.id)));
          const out = Array.isArray(prev) ? prev.slice() : [];
          for (const k of normalized) {
            const id = String(k?.id || "");
            if (!id || seen.has(id)) continue;
            seen.add(id);
            out.push(k);
          }
          return out;
        });
        if (!page.nextCursor) setKpisFullyLoaded(true);
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!mounted) return;
        if (err?.status === 401) {
          onLogout?.();
          return;
        }
        setKpisError(err?.message || "Failed to load KPIs.");
        setKpiPage({ cursor: null, nextCursor: null, stack: [], items: [] });
        kpiPrefetchCursorRef.current = null;
        setKpis([]);
        setKpisFullyLoaded(true);
      } finally {
        if (mounted) setKpiPageLoading(false);
      }
    })();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [employee?.band, employee?.id, employee?.stream, loading, onLogout, portalBootstrapLoading]);

  useEffect(() => {
    if (kpisFullyLoaded) return;
    if (kpiPrefetching) return;
    const startCursor = kpiPrefetchCursorRef.current;
    if (!startCursor) {
      setKpisFullyLoaded(true);
      return;
    }

    let alive = true;
    const controller = new AbortController();

    (async () => {
      setKpiPrefetching(true);
      try {
        let cursor = startCursor;
        while (alive && cursor) {
          const data = await fetchEmployeePortalKpiDefinitions({
            limit: DEFAULT_PAGE_LIMIT,
            cursor,
            employeeId: employee?.id || null,
            band: employee?.band || null,
            stream: employee?.stream || null,
            signal: controller.signal,
          });
          const page = normalizeCursorPage(data);
          const normalized = normalizeKpiDefinitions(page.items);
          setKpis((prev) => {
            const seen = new Set((prev || []).map((k) => String(k.id)));
            const out = Array.isArray(prev) ? prev.slice() : [];
            for (const k of normalized) {
              const id = String(k?.id || "");
              if (!id || seen.has(id)) continue;
              seen.add(id);
              out.push(k);
            }
            return out;
          });
          cursor = page.nextCursor;
          kpiPrefetchCursorRef.current = cursor;
        }
        if (alive) setKpisFullyLoaded(true);
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!alive) return;
        if (err?.status === 401) {
          onLogout?.();
          return;
        }
        setKpisError(err?.message || "Failed to load KPIs.");
      } finally {
        if (alive) setKpiPrefetching(false);
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [employee?.band, employee?.id, employee?.stream, kpiPrefetching, kpisFullyLoaded, onLogout]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      setValuesError("");
      setValuesLoading(true);
      try {
        const limit = getEmployeeValuesPageSize();
        const allPortalValues = [];
        let cursor = null;
        for (let i = 0; i < 100; i += 1) {
          const data = await fetchEmployeePortalWebknotValues({
            limit,
            cursor,
            signal: controller.signal,
          });
          const page = normalizeCursorPage(data);
          allPortalValues.push(...normalizeWebknotValues(page.items));
          if (!page.nextCursor) break;
          cursor = page.nextCursor;
        }
        let normalized = allPortalValues;
        let nextCursor = null;

        if (!hasReadableValueItems(normalized)) {
          const fallbackValues = [];
          let fallbackCursor = null;
          for (let i = 0; i < 100; i += 1) {
            const fallbackRaw = await fetchValues(true, {
              limit: 100,
              cursor: fallbackCursor,
              signal: controller.signal,
            });
            const page = normalizeCursorPage(fallbackRaw);
            fallbackValues.push(...normalizeWebknotValuesList(page.items));
            if (!page.nextCursor) break;
            fallbackCursor = page.nextCursor;
          }
          normalized = fallbackValues.map((v) => ({
            id: String(v?.id || ""),
            title: String(v?.title || v?.id || ""),
            pillar: String(v?.pillar || "—"),
          }));
        }

        if (!mounted) return;
        const deduped = [];
        const seen = new Set();
        for (const v of normalized) {
          const id = String(v?.id || "").trim();
          if (!id || seen.has(id)) continue;
          seen.add(id);
          deduped.push(v);
        }
        setValuesPage({ cursor: null, nextCursor, stack: [], items: deduped });
        const idx = {};
        for (const v of deduped) idx[String(v.id)] = { title: v.title, pillar: v.pillar };
        setValuesIndex(idx);
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!mounted) return;
        if (err?.status === 401) {
          onLogout?.();
          return;
        }
        setValuesError(err?.message || "Failed to load values.");
        setValuesPage({ cursor: null, nextCursor: null, stack: [], items: [] });
        setValuesIndex({});
      } finally {
        if (mounted) setValuesLoading(false);
      }
    })();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [onLogout]);

  useEffect(() => {
    if (!String(submissionMonth || "").trim()) return;
    let mounted = true;
    const controller = new AbortController();

    async function run() {
      setHydratingSubmission(true);
      setDraftSaveError("");
      try {
        const data = await fetchMyMonthlySubmission({
          month: submissionMonth,
          employeeId: subjectEmployeeId,
          signal: controller.signal,
        });
        if (!mounted) return;

        const normalized = normalizeMonthlySubmission(data);
        if (!normalized) {
          setSubmissionMeta(null);
          setSelfReviewText("");
          setSelectedCertifications([]);
          setKpiRatings({});
          setSelectedValues({});
          setRecognitionsCount(0);
          const cleared = buildMonthlySubmissionPayload({
            month: submissionMonth,
            selfReviewText: "",
            selectedCertifications: [],
            kpiRatings: {},
            selectedValues: {},
            valueComments: {},
            recognitionsCount: 0,
            submissionType: "EMPLOYEE_MONTHLY_SUBMISSION",
            actorRole: "EMPLOYEE",
            subjectEmployeeId,
            reviewStatus: "DRAFT",
            reopenedForResubmission: false,
          });
          lastSavedDraftHashRef.current = payloadHash(cleared);
          return;
        }

        setSubmissionMeta({
          id: normalized.id,
          month: normalized.month || submissionMonth,
          status: normalized.status || null,
          submissionType: normalized.submissionType || null,
          cycleKey: normalized.cycleKey || null,
          cycleLabel: normalized.cycleLabel || null,
          reviewStatus: normalized.reviewStatus || null,
          managerReview: normalized.managerReview || null,
          managerEvaluation: normalized.managerEvaluation || null,
          managerSelfReviewEvalComments: String(
            normalized.raw?.managerSelfReviewEvalComments ??
              normalized.managerReview?.comments ??
              ""
          ).trim() || null,
          managerSubmittedAt: normalized.managerSubmittedAt || null,
          adminReview: normalized.adminReview || null,
          adminSubmittedAt: normalized.adminSubmittedAt || null,
          reopenedForResubmission: Boolean(normalized.reopenedForResubmission),
          resubmissionRequested: Boolean(normalized.resubmissionRequested),
          submittedAt: normalized.submittedAt || null,
          updatedAt: normalized.updatedAt || null,
        });

        const nextCerts = normalizeCertificationsForState(normalized.certifications);
        const nextRatings = normalizeKpiRatingsForState(normalized.kpiRatings);
        const nextValues = normalizeWebknotValueRatingsForState(
          normalized.webknotValueRatings ?? normalized.webknotValues
        );
        const nextValueComments = normalizeValueCommentsForState(
          normalized.webknotValueComments ??
          normalized.raw?.payload?.webknotValueComments ??
          normalized.raw?.payload?.webknotValueResponses
        );

        setSelfReviewText(normalized.selfReviewText || "");
        setSelectedCertifications(nextCerts);
        setKpiRatings(nextRatings);
        setSelectedValues(nextValues);
        setValueComments(nextValueComments);
        setRecognitionsCount(
          typeof normalized.recognitionsCount === "number" && Number.isFinite(normalized.recognitionsCount)
            ? normalized.recognitionsCount
            : 0
        );

        const loaded = buildMonthlySubmissionPayload({
          month: normalized.month || submissionMonth,
          selfReviewText: normalized.selfReviewText || "",
          selectedCertifications: nextCerts,
          kpiRatings: nextRatings,
          selectedValues: nextValues,
          valueComments: nextValueComments,
          recognitionsCount: normalized.recognitionsCount,
          submissionType: "EMPLOYEE_MONTHLY_SUBMISSION",
          actorRole: "EMPLOYEE",
          subjectEmployeeId,
          reviewStatus: normalized.reviewStatus || "DRAFT",
          reopenedForResubmission: normalized.reopenedForResubmission,
        });
        lastSavedDraftHashRef.current = payloadHash(loaded);
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!mounted) return;
        if (err?.status === 401) {
          onLogout?.();
          return;
        }
        setDraftSaveError(err?.message || "Failed to load your submission.");
      } finally {
        if (mounted) setHydratingSubmission(false);
      }
    }

    run();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [onLogout, subjectEmployeeId, submissionMonth]);

  const needsResubmission = useMemo(
    () => Boolean(isResubmissionRequested(submissionMeta)),
    [submissionMeta]
  );

  const locked = useMemo(
    () => (needsResubmission ? false : isAuthorSubmissionLocked(submissionMeta)),
    [needsResubmission, submissionMeta]
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      setProjectsLoading(true);
      setProjectsError("");
      try {
        const [allRaw, myRaw] = await Promise.all([
          fetchAvailableProjects().catch(() => fetchProjects().catch(() => ({}))),
          fetchSelectedProjects({ month: submissionMonth }).catch(() => fetchMyProjects().catch(() => ({}))),
        ]);
        if (!alive) return;
        const apiList = normalizeProjects(allRaw);
        setAllProjects(listActiveProjectsForEmployees(apiList));
        const myData = myRaw && typeof myRaw === "object" ? myRaw : {};
        const myArr =
          (Array.isArray(myRaw) && myRaw) ||
          (Array.isArray(myData?.data) && myData.data) ||
          (Array.isArray(myData?.projectIds) && myData.projectIds) ||
          (Array.isArray(myData?.projects) && myData.projects) ||
          [];
        const myIds = new Set(
          myArr
            .map((x) => String(typeof x === "object" ? (x?.id ?? x?.projectId ?? "") : x).trim())
            .filter(Boolean),
        );
        setSelectedProjectIds(myIds);
      } catch (err) {
        if (!alive) return;
        if (err?.status === 401) {
          onLogout?.();
          return;
        }
        setProjectsError(err?.message || "Failed to load projects.");
        setAllProjects([]);
        setSelectedProjectIds(new Set());
      } finally {
        if (alive) setProjectsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [onLogout, submissionMonth]);

  const toggleProject = useCallback((projectId) => {
    if (locked) return;
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else {
        if (next.size >= MAX_PROJECT_SELECTIONS) {
          setProjectsError(`You can select at most ${MAX_PROJECT_SELECTIONS} projects.`);
          return prev;
        }
        next.add(projectId);
      }
      setProjectsError("");
      return next;
    });
  }, [locked]);

  const submissionAccess = useMemo(
    () =>
      portalWindow?.canEnterValues != null
        ? portalWindow
        : {
            canEnterValues: computeSubmissionWindowOpen(portalWindow),
            displayWindow: portalWindow,
          },
    [portalWindow],
  );

  const canEnterSubmissionValues = Boolean(
    submissionAccess?.canEnterValues ??
      submissionAccess?.globalOpen ??
      submissionAccess?.roleOpen,
  );

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      setPortalWindowLoading(true);
      setPortalWindowError("");
      try {
        const access = await fetchSubmissionAccessForRole("employee", {
          employeeId: subjectEmployeeId,
          cycleKey: submissionMonth,
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
  }, [subjectEmployeeId, submissionMonth]);

  useEffect(() => {
    if (!String(submissionMonth || "").trim()) return;
    if (hydratingSubmission) return;
    if (locked) return;

    const canAutosaveDraft =
      canEnterSubmissionValues || Boolean(isResubmissionRequested(submissionMeta));
    if (!canAutosaveDraft) return;

    const payload = buildMonthlySubmissionPayload({
      month: submissionMonth,
      selfReviewText,
      selectedCertifications,
      kpiRatings,
      selectedValues,
      valueComments,
      recognitionsCount,
      projectIds: selectedProjectIds,
      submissionType: "EMPLOYEE_MONTHLY_SUBMISSION",
      actorRole: "EMPLOYEE",
      subjectEmployeeId,
      reviewStatus: submissionMeta?.reviewStatus || "DRAFT",
      reopenedForResubmission: submissionMeta?.reopenedForResubmission,
    });
    const hash = payloadHash(payload);
    if (hash === lastSavedDraftHashRef.current) return;

    const delayMs = getDraftAutosaveDelayMs();
    const id = window.setTimeout(async () => {
      setDraftSaveError("");
      setDraftSaving(true);
      try {
        const saved = await saveMonthlyDraft(payload);
        lastSavedDraftHashRef.current = hash;
        const normalized = normalizeMonthlySubmission(saved);
        if (normalized) {
          setSubmissionMeta((prev) => ({
            ...(prev || {}),
            id: normalized.id ?? prev?.id,
            month: normalized.month || submissionMonth,
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
        setDraftSaveError(err?.message || "Failed to save draft.");
      } finally {
        setDraftSaving(false);
      }
    }, delayMs);

    return () => window.clearTimeout(id);
  }, [
    canEnterSubmissionValues,
    hydratingSubmission,
    kpiRatings,
    locked,
    onLogout,
    recognitionsCount,
    selectedCertifications,
    selectedProjectIds,
    selectedValues,
    selfReviewText,
    subjectEmployeeId,
    submissionMeta,
    submissionMonth,
    valueComments,
  ]);

  async function saveDraftNow() {
    if (!String(submissionMonth || "").trim()) return;
    if (locked) throw new Error("This month's submission is locked.");
    const payload = buildMonthlySubmissionPayload({
      month: submissionMonth,
      selfReviewText,
      selectedCertifications,
      kpiRatings,
      selectedValues,
      valueComments,
      recognitionsCount,
      projectIds: selectedProjectIds,
      submissionType: "EMPLOYEE_MONTHLY_SUBMISSION",
      actorRole: "EMPLOYEE",
      subjectEmployeeId,
      reviewStatus: submissionMeta?.reviewStatus || "DRAFT",
      reopenedForResubmission: submissionMeta?.reopenedForResubmission,
    });
    const hash = payloadHash(payload);
    setDraftSaveError("");
    setDraftSaving(true);
    try {
      const saved = await saveMonthlyDraft(payload);
      lastSavedDraftHashRef.current = hash;
      const normalized = normalizeMonthlySubmission(saved);
      if (normalized) {
        setSubmissionMeta((prev) => ({
          ...(prev || {}),
          id: normalized.id ?? prev?.id,
          month: normalized.month || submissionMonth,
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
      setDraftSaveError(err?.message || "Failed to save draft.");
      throw err;
    } finally {
      setDraftSaving(false);
    }
  }

  async function finalSubmit() {
    if (locked) throw new Error("You already submitted this month.");
    if (!kpisFullyLoaded) throw new Error("Please wait for KPIs to finish loading, then submit.");
    const text = String(selfReviewText || "").trim();
    if (!text) throw new Error("Write your self review first.");

    const visible = Array.isArray(visibleKpis) ? visibleKpis : [];
    const kpisOk = visible.length === 0
      ? true
      : visible.every((k) => {
          const v = kpiRatings?.[k.id];
          return typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 5;
        });
    if (!kpisOk) throw new Error("Rate all KPIs first.");

    const certsOk = Array.isArray(selectedCertifications)
      ? selectedCertifications.every((c) => {
          const name = String(c?.name || "").trim();
          const proof = String(c?.proof || "").trim();
          return Boolean(name) && Boolean(proof);
        })
      : true;
    if (!certsOk) throw new Error("Add proof for all selected certifications.");
    if (selectedProjectIds.size === 0) {
      throw new Error("Select at least one active project on the Review tab before submitting.");
    }
    if (selectedProjectIds.size > MAX_PROJECT_SELECTIONS) {
      throw new Error(`Select at most ${MAX_PROJECT_SELECTIONS} projects.`);
    }

    const projectIds = [...selectedProjectIds];
    try {
      await updateSelectedProjects(projectIds, { month: submissionMonth });
    } catch {
      try {
        await updateMyProjects(projectIds, { month: submissionMonth });
      } catch {
        // Project preference sync is best-effort — do not block final submit.
      }
    }

    const payload = {
      ...buildMonthlySubmissionPayload({
        month: submissionMonth,
        selfReviewText: text,
        selectedCertifications,
        kpiRatings,
        selectedValues,
        recognitionsCount,
        submissionType: "EMPLOYEE_MONTHLY_SUBMISSION",
        actorRole: "EMPLOYEE",
        subjectEmployeeId,
        reviewStatus: "SUBMITTED",
        reopenedForResubmission: false,
      }),
      submissionId: submissionMeta?.id ?? null,
      employeeId: subjectEmployeeId,
      projectIds,
      submittedAt: new Date().toISOString(),
    };

    setDraftSaveError("");
    setDraftSaving(true);
    try {
      const res = await submitMonthlySubmission(payload);
      const normalized = normalizeMonthlySubmission(res);
      const notifyResult = await notifyProjectStakeholdersOnSubmit({
        projects: allProjects,
        projectIds,
        month: submissionMonth,
        employeeId: subjectEmployeeId,
        employeeName: employee?.name || employee?.employeeName || "",
        employeeEmail: authEmail,
      }).catch(() => null);
      const now = new Date().toISOString();
      setSubmissionMeta({
        id: normalized?.id ?? submissionMeta?.id ?? null,
        month: normalized?.month ?? submissionMonth,
        status: normalized?.status ?? "SUBMITTED",
        submissionType: normalized?.submissionType ?? "EMPLOYEE_MONTHLY_SUBMISSION",
        cycleKey: normalized?.cycleKey ?? buildCycleMeta(submissionMonth).cycleKey,
        cycleLabel: normalized?.cycleLabel ?? buildCycleMeta(submissionMonth).cycleLabel,
        reviewStatus: normalized?.reviewStatus ?? "SUBMITTED",
        managerReview: null,
        managerEvaluation: normalized?.managerEvaluation ?? null,
        managerSubmittedAt: normalized?.managerSubmittedAt ?? null,
        adminReview: null,
        adminSubmittedAt: normalized?.adminSubmittedAt ?? null,
        reopenedForResubmission: false,
        resubmissionRequested: false,
        submittedAt: normalized?.submittedAt ?? submissionMeta?.submittedAt ?? payload.submittedAt ?? now,
        updatedAt: normalized?.updatedAt ?? now,
      });
      lastSavedDraftHashRef.current = payloadHash(
        buildMonthlySubmissionPayload({
          month: submissionMonth,
          selfReviewText,
          selectedCertifications,
          kpiRatings,
          selectedValues,
          recognitionsCount,
          submissionType: "EMPLOYEE_MONTHLY_SUBMISSION",
          actorRole: "EMPLOYEE",
          subjectEmployeeId,
          reviewStatus: "SUBMITTED",
          reopenedForResubmission: false,
        })
      );
      if (notifyResult?.alerts?.length) {
        showToast({
          title: "Submitted",
          message: `Locked for review. ${notifyResult.alerts.length} project stakeholder alert(s) queued.`,
          tone: "success",
        });
      }
    } catch (err) {
      if (err?.status === 401) {
        onLogout?.();
        throw new Error("Your session expired. Please sign in again and retry submit.");
      }
      if (err?.status === 403) {
        throw new Error(
          err?.message ||
            "Submit was denied. Sign out, sign back in, and try again. If it persists, contact HR."
        );
      }
      throw err;
    } finally {
      setDraftSaving(false);
    }
  }

  const visibleKpis = useMemo(() => {
    const list = Array.isArray(kpis) ? kpis : [];
    return list.filter((k) => kpiAppliesToEmployee(k, employee));
  }, [employee, kpis]);

  const canFinalSubmit = useMemo(() => {
    if (locked) return false;
    if (!kpisFullyLoaded) return false;
    const textOk = Boolean(String(selfReviewText || "").trim());
    const visible = Array.isArray(visibleKpis) ? visibleKpis : [];
    const kpisOk = visible.length === 0
      ? true
      : visible.every((k) => {
          const v = kpiRatings?.[k.id];
          return typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 5;
        });
    const certsOk = Array.isArray(selectedCertifications)
      ? selectedCertifications.every((c) => {
          const name = String(c?.name || "").trim();
          const proof = String(c?.proof || "").trim();
          return Boolean(name) && Boolean(proof);
        })
      : true;
    const projectsOk = selectedProjectIds.size >= 1 && selectedProjectIds.size <= MAX_PROJECT_SELECTIONS;
    const valueList = Array.isArray(valuesPage?.items) ? valuesPage.items : [];
    const valuesOk = valuesStepComplete(
      valueList,
      normalizeWebknotValueRatingsForState(selectedValues),
      valueComments
    );
    return textOk && kpisOk && certsOk && projectsOk && valuesOk;
  }, [kpiRatings, kpisFullyLoaded, locked, selectedCertifications, selectedProjectIds, selectedValues, selfReviewText, valueComments, valuesPage?.items, visibleKpis]);

  const valuesRatedCount = useMemo(() => {
    const list = Array.isArray(valuesPage?.items) ? valuesPage.items : [];
    if (!list.length) return 0;
    const ratings = normalizeWebknotValueRatingsForState(selectedValues);
    let count = 0;
    for (const row of list) {
      const id = String(row?.id || "").trim();
      if (!id) continue;
      const value = ratings?.[id];
      if (typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 5) count += 1;
    }
    return count;
  }, [selectedValues, valuesPage?.items]);

  const valuesCanProceed = useMemo(() => {
    if (locked) return true;
    const list = Array.isArray(valuesPage?.items) ? valuesPage.items : [];
    if (!list.length) return true;
    return valuesStepComplete(
      list,
      normalizeWebknotValueRatingsForState(selectedValues),
      valueComments
    );
  }, [locked, selectedValues, valueComments, valuesPage?.items]);

  const certificationsCanProceed = useMemo(() => {
    if (locked) return true;
    return Array.isArray(selectedCertifications)
      ? selectedCertifications.every((c) => Boolean(String(c?.name || "").trim()) && Boolean(String(c?.proof || "").trim()))
      : true;
  }, [locked, selectedCertifications]);

  const recognitionsCanProceed = useMemo(() => {
    if (locked) return true;
    return Number.isFinite(Number(recognitionsCount)) && Number(recognitionsCount) >= 0;
  }, [locked, recognitionsCount]);

  const projectsCanProceed = useMemo(() => {
    if (locked) return true;
    return selectedProjectIds.size >= 1 && selectedProjectIds.size <= MAX_PROJECT_SELECTIONS;
  }, [locked, selectedProjectIds]);

  const kpisReadyForNext = useMemo(() => {
    if (locked) return true;
    if (!kpisFullyLoaded) return false;
    const textOk = Boolean(String(selfReviewText || "").trim());
    const visible = Array.isArray(visibleKpis) ? visibleKpis : [];
    const kpisOk = visible.length === 0
      ? true
      : visible.every((k) => {
          const v = kpiRatings?.[k.id];
          return typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 5;
        });
    return textOk && kpisOk;
  }, [kpiRatings, kpisFullyLoaded, locked, selfReviewText, visibleKpis]);

  function goToTab(nextTab) {
    setActiveTab(nextTab);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    }
  }

  const reviewTabs = useMemo(
    () => new Set(["projects", "kpis", "values", "certifications", "recognitions", "review"]),
    [],
  );

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    async function run() {
      setError("");
      setLoading(true);
      try {
        const me = await fetchMe({ signal: controller.signal });
        if (!mounted) return;
        if (!me) {
          setEmployee(
            normalizeEmployeeFromAuth(auth, { fallbackEmail: authEmail, fallbackRole: role })
          );
          return;
        }
        const normalized = normalizeEmployeeFromMe(me, { fallbackEmail: authEmail, fallbackRole: role });
        setEmployee(normalized);
        const profileRole = formatPortalRoleLabel(me?.role ?? me?.empRole ?? me?.userRole ?? normalized.role);
        if (profileRole) {
          const session = getAuth() || {};
          if (profileRole !== session.role) {
            setAuth({ ...session, role: profileRole, portal: profileRole });
            notifyAuthChanged();
          }
        }
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!mounted) return;
        if (err?.status === 401) {
          onLogout?.();
          return;
        }
        setError(err?.message || "Failed to load profile.");
        setEmployee(
          normalizeEmployeeFromAuth(auth, { fallbackEmail: authEmail, fallbackRole: role })
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }

    run();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [auth?.employeeId, auth?.empId, authEmail, onLogout, role]);

  const resubmissionActor = useMemo(
    () => (needsResubmission ? resolveResubmissionActor(submissionMeta) : null),
    [needsResubmission, submissionMeta]
  );

  const resubmissionActorLabel = useMemo(
    () => (needsResubmission ? resolveResubmissionActorLabel(submissionMeta, resubmissionActor) : null),
    [needsResubmission, resubmissionActor, submissionMeta]
  );

  const latestReviewComment = useMemo(
    () => (needsResubmission ? resolveResubmissionComment(submissionMeta, resubmissionActor) : ""),
    [needsResubmission, resubmissionActor, submissionMeta]
  );

  const stepItems = useMemo(() => ([
    { id: "profile", label: "Profile", status: "done" },
    { id: "projects", label: "Projects", status: projectsCanProceed ? "done" : "pending" },
    { id: "kpis", label: "KPIs", status: kpisReadyForNext ? "done" : "pending" },
    { id: "values", label: "Values", status: valuesCanProceed ? "done" : "pending" },
    { id: "certifications", label: "Certs", status: certificationsCanProceed ? "done" : "pending" },
    { id: "recognitions", label: "Awards", status: recognitionsCanProceed ? "done" : "pending" },
    { id: "review", label: "Review", status: canFinalSubmit || locked ? "done" : "pending" },
  ]), [
    canFinalSubmit,
    certificationsCanProceed,
    kpisReadyForNext,
    locked,
    projectsCanProceed,
    recognitionsCanProceed,
    valuesCanProceed,
  ]);

  const currentDraftHash = useMemo(
    () =>
      payloadHash(
        buildMonthlySubmissionPayload({
          month: submissionMonth,
          selfReviewText,
          selectedCertifications,
          kpiRatings,
          selectedValues,
          valueComments,
          recognitionsCount,
          projectIds: selectedProjectIds,
          submissionType: "EMPLOYEE_MONTHLY_SUBMISSION",
          actorRole: "EMPLOYEE",
          subjectEmployeeId,
          reviewStatus: submissionMeta?.reviewStatus || "DRAFT",
          reopenedForResubmission: submissionMeta?.reopenedForResubmission,
        }),
      ),
    [
      kpiRatings,
      recognitionsCount,
      selectedCertifications,
      selectedProjectIds,
      selectedValues,
      selfReviewText,
      subjectEmployeeId,
      submissionMeta?.reviewStatus,
      submissionMeta?.reopenedForResubmission,
      submissionMonth,
      valueComments,
    ],
  );

  const draftIsSynced = currentDraftHash === lastSavedDraftHashRef.current;

  const main = (() => {
    if (activeTab === "settings") {
      return <EmployeeSettingsPanel />;
    }
    if (activeTab === "account") {
      return (
        <UserProfilePage
          auth={auth}
          roleLabel={role}
          onBack={() => setActiveTab("profile")}
        />
      );
    }
    if (activeTab === "profile") {
      return (
        <>
          {loading ? (
            <div className="max-w-4xl mx-auto w-full min-w-0 mb-6 rt-panel-subtle rounded-lg p-4 text-sm text-[rgb(var(--muted))]">
              Loading profile…
            </div>
          ) : null}
          <ProfileTab
            employee={employee}
            auth={auth}
            authEmail={authEmail}
            locked={locked}
            onProceed={() => goToTab("projects")}
            canProceed={!loading}
          />
        </>
      );
    }
    if (activeTab === "projects") {
      return (
        <ProjectsTab
          allProjects={allProjects}
          selectedProjectIds={selectedProjectIds}
          onToggleProject={toggleProject}
          projectsLoading={projectsLoading}
          projectsError={projectsError}
          projectSearch={projectSearch}
          onProjectSearchChange={setProjectSearch}
          locked={locked}
          onProceed={() => goToTab("kpis")}
          onBack={() => goToTab("profile")}
          canProceed={projectsCanProceed}
        />
      );
    }
    if (activeTab === "kpis") {
      return (
        <KpisTab
          pageKpis={visibleKpis}
          allKpis={visibleKpis}
          ratings={kpiRatings}
          setRatings={setKpiRatings}
          loading={kpiPageLoading}
          error={kpisError}
          fullyLoaded={kpisFullyLoaded}
          prefetching={kpiPrefetching}
          selfReviewText={selfReviewText}
          setSelfReviewText={setSelfReviewText}
          locked={locked}
          nextBandPreview={nextBandPreview}
          nextBandKpis={visibleNextBandKpis}
          nextBandKpisLoading={nextBandKpisLoading}
          nextBandKpisError={nextBandKpisError}
          onProceed={() => goToTab("values")}
          onBack={() => goToTab("projects")}
        />
      );
    }
    if (activeTab === "values") {
      return (
        <ValuesTab
          items={valuesPage.items}
          loading={valuesLoading}
          error={valuesError}
          selectedValues={selectedValues}
          setSelectedValues={setSelectedValues}
          valueComments={valueComments}
          setValueComments={setValueComments}
          locked={locked}
          canProceed={valuesCanProceed}
          onProceed={() => goToTab("certifications")}
          onBack={() => goToTab("kpis")}
        />
      );
    }
    if (activeTab === "certifications") {
      return (
        <CertificationsTab
          catalog={certificationCatalog}
          selectedCertifications={selectedCertifications}
          setSelectedCertifications={setSelectedCertifications}
          canProceed={certificationsCanProceed}
          onProceed={() => goToTab("recognitions")}
          onBack={() => goToTab("values")}
          loading={certificationsLoading}
          error={certificationsError}
          locked={locked}
        />
      );
    }
    if (activeTab === "recognitions") {
      return (
        <RecognitionsTab
          recognitionsCount={recognitionsCount}
          setRecognitionsCount={setRecognitionsCount}
          locked={locked}
          canProceed={recognitionsCanProceed}
          onProceed={() => goToTab("review")}
          onBack={() => goToTab("certifications")}
        />
      );
    }
    if (activeTab === "performance") {
      return <EmployeePerformanceHistory />;
    }
    if (activeTab === "review") {
      if (locked && !needsResubmission) {
        return (
          <AlreadyRespondedScreen
            month={submissionMeta?.month || submissionMonth}
            submittedAt={submissionMeta?.submittedAt || submissionMeta?.updatedAt || null}
            onLogout={onLogout}
            selfReviewText={selfReviewText}
            kpis={visibleKpis}
            kpiRatings={kpiRatings}
            selectedValues={selectedValues}
            selectedCertifications={selectedCertifications}
            recognitionsCount={recognitionsCount}
            valuesIndex={valuesIndex}
            submissionMeta={submissionMeta}
            employee={employee}
            authEmail={authEmail}
            nextBandPreview={nextBandPreview}
            nextBandKpis={visibleNextBandKpis}
            nextBandKpisLoading={nextBandKpisLoading}
            nextBandKpisError={nextBandKpisError}
          />
        );
      }
      return (
        <ReviewTab
          employee={employee}
          auth={auth}
          authEmail={authEmail}
          role={role}
          submissionMeta={submissionMeta}
          kpis={visibleKpis}
          kpiRatings={kpiRatings}
          selfReviewText={selfReviewText}
          selectedValues={selectedValues}
          valueComments={valueComments}
          selectedCertifications={selectedCertifications}
          recognitionsCount={recognitionsCount}
          onSaveDraft={saveDraftNow}
          onFinalSubmit={finalSubmit}
          canFinalSubmit={canFinalSubmit}
          locked={locked}
          valuesIndex={valuesIndex}
          allProjects={allProjects}
          selectedProjectIds={selectedProjectIds}
          onEditProjects={() => goToTab("projects")}
          onBack={() => goToTab("recognitions")}
        />
      );
    }
    return <Placeholder title="Profile" note="Employee profile." />;
  })();

  if (
    !portalWindowLoading &&
    !canEnterSubmissionValues &&
    !needsResubmission &&
    !locked &&
    reviewTabs.has(activeTab)
  ) {
    return (
      <SubmissionWindowClosed
        portalWindow={submissionAccess?.displayWindow || portalWindow?.roleWindow}
        globalOpen={submissionAccess?.globalOpen}
        roleOpen={submissionAccess?.roleOpen}
        portalLabel="Employee portal"
        error={portalWindowError}
        onRetry={() => {
          setPortalWindowLoading(true);
          fetchSubmissionAccessForRole("employee", { employeeId: subjectEmployeeId, cycleKey: submissionMonth })
            .then(setPortalWindow)
            .catch((err) => setPortalWindowError(err?.message || "Failed to load window."))
            .finally(() => setPortalWindowLoading(false));
        }}
        onLogout={onLogout}
      />
    );
  }

  return (
    <>
    <AppShell
      isSidebarOpen={isSidebarOpen}
      setIsSidebarOpen={setIsSidebarOpen}
      maxWidth={
        activeTab === "settings"
          ? "max-w-3xl"
          : "max-w-5xl"
      }
      sidebar={
        <PortalSidebar
          isOpen={isSidebarOpen}
          setIsOpen={setIsSidebarOpen}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          portalTag="Your monthly review"
          navGroups={EMPLOYEE_NAV_GROUPS}
          showThemeToggle
          onSettingsClick={() => setActiveTab("settings")}
          settingsActive={activeTab === "settings"}
        />
      }
      topbar={
        <>
          <span className="rt-kicker pointer-events-auto max-w-[12rem] truncate sm:max-w-none">
            <Calendar size={14} className="shrink-0" />
            {cycleInfo?.label || "—"}
          </span>
          <PortalNotificationsBell
            portal="employee"
            userId={notificationUserId}
            onLogout={onLogout}
            onToast={showToast}
            ariaLabel="Employee notifications"
          />
          <PortalUserMenu
            auth={auth}
            roleLabel={role}
            onProfile={() => setActiveTab("account")}
            onLogout={onLogout}
          />
        </>
      }
    >
        <div className="w-full min-w-0">
        {activeTab !== "settings" ? (
        <PortalPageHeader
          title={EMPLOYEE_TAB_COPY[activeTab]?.title || "Employee"}
          subtitle={EMPLOYEE_TAB_COPY[activeTab]?.subtitle || ""}
        />
        ) : null}

        {activeTab !== "settings" && isHrUser ? (
          <div className="max-w-4xl mx-auto w-full min-w-0 mb-6 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-4 py-3 text-sm text-[rgb(var(--muted))]">
            HR workspace: complete your leadership self-review (band KPIs, all Webknot values, super admin reviewer) in the{" "}
            <a href="/manager/self-review" className="text-[rgb(var(--primary))] hover:underline">
              leadership self-review portal
            </a>
            .{" "}
            <a href="/admin" className="text-[rgb(var(--primary))] hover:underline">
              Open HR admin tools
            </a>
          </div>
        ) : null}

        {locked && !needsResubmission && activeTab !== "settings" && activeTab !== "review" ? (
          <div className="max-w-4xl mx-auto w-full min-w-0 mb-6 pulse-callout pulse-callout--success">
            <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-emerald-700 dark:text-emerald-300" />
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-950 dark:text-emerald-50">
                Submitted & locked
              </div>
              <p className="mt-1 text-sm text-[rgb(var(--text))] leading-relaxed">
                Your {formatMonthHeadline(submissionMonth)} self-review is submitted and locked. You can still browse this portal. Open{" "}
                <button
                  type="button"
                  onClick={() => setActiveTab("review")}
                  className="font-semibold text-emerald-800 underline underline-offset-2 hover:text-emerald-950 dark:text-emerald-200 dark:hover:text-emerald-50"
                >
                  Review
                </button>{" "}
                for submission details, or{" "}
                <button
                  type="button"
                  onClick={() => setActiveTab("performance")}
                  className="font-semibold text-emerald-800 underline underline-offset-2 hover:text-emerald-950 dark:text-emerald-200 dark:hover:text-emerald-50"
                >
                  My ratings
                </button>{" "}
                for all-time history.
              </p>
            </div>
          </div>
        ) : null}

        {!locked && needsResubmission && activeTab !== "settings" ? (
          <div className="max-w-4xl mx-auto w-full min-w-0 mb-6">
            <section className="rt-panel overflow-hidden">
              <div className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]/50 px-5 py-4 sm:px-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
                    <ShieldAlert size={18} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                          Changes requested
                        </p>
                        <h3 className="text-base font-semibold text-[rgb(var(--text))] mt-0.5">
                          Returned by {resubmissionActorLabel || (resubmissionActor === "ADMIN" ? "Admin" : "Manager")}
                        </h3>
                      </div>
                      <span className="rt-badge rt-badge--warning shrink-0">
                        {resubmissionActor === "ADMIN" ? "Admin review" : "Manager review"}
                      </span>
                    </div>
                    <p className="text-sm text-[rgb(var(--muted))] leading-relaxed pt-1">
                      {resubmissionActor === "ADMIN"
                        ? "An admin returned this submission for updates. Review the notes below, edit your responses, then resubmit."
                        : "Your manager returned this submission for updates. Review the notes below, edit your responses, then resubmit."}
                    </p>
                  </div>
                </div>
              </div>

              {latestReviewComment ? (
                <div className="px-5 py-4 sm:px-6 sm:py-5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                    {resubmissionActor === "ADMIN" ? "Admin comments" : "Manager comments"}
                  </p>
                  <blockquote className="mt-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-4 py-3.5 text-sm text-[rgb(var(--text))] whitespace-pre-wrap leading-relaxed break-words">
                    {latestReviewComment}
                  </blockquote>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}
        {EMPLOYEE_REVIEW_STEP_IDS.includes(activeTab) ? (
        <div className="rt-portal-hero mb-6">
          <div className="relative z-10 flex items-end justify-between gap-4 flex-wrap">
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
              Month
            </label>
            <div className="relative">
              <select
                value={submissionMonth}
                disabled
                className="rt-input appearance-none py-2.5 px-4 pr-9 text-sm rounded-xl cursor-not-allowed opacity-75"
                aria-label="Submission month"
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
            {cycleSummaryLoading ? (
              <div className="text-[10px] text-[rgb(var(--muted))] mt-1">Loading cycle summary…</div>
            ) : cycleSummary ? (
              <div className="text-[10px] text-[rgb(var(--muted))] mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                <span>
                  {cycleSummary.submissionCount} submission{cycleSummary.submissionCount === 1 ? "" : "s"} in cycle
                </span>
                {cycleSummary.averageEmployeeScore != null &&
                Number.isFinite(Number(cycleSummary.averageEmployeeScore)) ? (
                  <span>Avg self {Number(cycleSummary.averageEmployeeScore).toFixed(1)}</span>
                ) : null}
                {cycleSummary.averageManagerScore != null &&
                Number.isFinite(Number(cycleSummary.averageManagerScore)) ? (
                  <span>Avg manager {Number(cycleSummary.averageManagerScore).toFixed(1)}</span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
            <span className={`h-2 w-2 rounded-full ${needsResubmission ? "bg-amber-500" : locked ? "bg-red-500" : draftSaving ? "bg-amber-500 animate-pulse" : draftSaveError ? "bg-red-500" : "bg-emerald-500"}`} />
            <span className="text-xs font-medium text-[rgb(var(--text))]">
              {needsResubmission
                ? "Changes requested — you can edit"
                : locked
                ? "Locked"
                : hydratingSubmission
                ? "Loading…"
                : draftSaving
                  ? "Saving…"
                  : draftSaveError
                    ? "Not saved"
                    : draftIsSynced
                      ? "Draft saved"
                      : "Unsaved changes"}
            </span>
          </div>
        </div>
        </div>
        ) : null}

        {EMPLOYEE_REVIEW_STEP_IDS.includes(activeTab) ? (
          <PortalStepper activeTab={activeTab} steps={stepItems} onNavigate={goToTab} />
        ) : null}

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {main}
          </motion.div>
        </AnimatePresence>
        </div>
    </AppShell>

    <Toast toast={toast} onDismiss={() => setToast(null)} durationMs={2800} />
    </>
  );
}
