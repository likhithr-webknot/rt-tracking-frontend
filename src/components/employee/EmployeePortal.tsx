// @ts-nocheck
import type { ApiOptions } from "../../types/api-options";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  StickyNote,
  Cloud,
} from "lucide-react";
import PortalNotesWorkspace from "../shared/PortalNotesWorkspace";
import WebknotDrive from "../admin/WebknotDrive";
import Toast from "../shared/Toast";
import UserAvatar from "../shared/UserAvatar";
import ModalOverlay from "../shared/ModalOverlay";
import PortalUserMenu from "../shared/PortalUserMenu";
import AppShell from "../shared/AppShell";
import PortalSidebar from "../shared/PortalSidebar";
import UserProfilePage from "../shared/UserProfilePage";
import PortalSettingsModal from "../shared/PortalSettingsModal";
import PortalPageHeader from "../shared/PortalPageHeader";
import LeaveRequestsPage from "./LeaveRequestsPage";
import SubmissionWindowClosed from "./SubmissionWindowClosed";
import TimeLogTracker from "../shared/TimeLogTracker";
import { fetchSubmissionAccessForRole } from "../../api/submission-window";
import { computeSubmissionWindowOpen } from "../../utils/submissionWindow";

import { fetchMe, getAuth, notifyAuthChanged, setAuth } from "../../api/auth";
import { formatPortalRoleLabel, resolvePortalRoleLabel } from "../../utils/portalRole";
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
import { fetchPortalEmployee, updatePortalEmployee } from "../../api/portal";
import { fetchDesignations } from "../../api/designations";
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
  updateMyProjects,
  fetchMyProjectRatings,
  normalizeProjectRatings,
  fetchAvailableProjects,
  fetchSelectedProjects,
  updateSelectedProjects,
  fetchSelectedProjectRatings,
} from "../../api/projects";
import { listActiveProjectsForEmployees } from "../../utils/projectsCatalog";
import { getAppSettings } from "../../utils/appSettings.js";
import { buildCycleMeta, buildCycleMonthOptions, getCycleForMonth, isResubmissionRequested, normalizeYearMonth } from "../../utils/reviewCycles.js";
import ResubmissionPlaybook from "../shared/ResubmissionPlaybook";
import CycleReplayPanel from "../shared/CycleReplayPanel";

const DEFAULT_PAGE_LIMIT = 10;
const EMPLOYEE_SIDEBAR_PREF_KEY = "rt_tracking_employee_sidebar_open_v1";

const EMPLOYEE_NAV_ITEMS = [
  { id: "profile", icon: <UserCircle2 size={18} />, label: "Profile" },
  { id: "kpis", icon: <Target size={18} />, label: "KPIs" },
  { id: "values", icon: <Sparkles size={18} />, label: "Values" },
  { id: "certifications", icon: <Award size={18} />, label: "Certifications" },
  { id: "recognitions", icon: <Award size={18} />, label: "Recognitions" },
  { id: "review", icon: <ClipboardCheck size={18} />, label: "Review" },
  { id: "timelogs", icon: <Clock size={18} />, label: "Time Logs" },
  { id: "leave-requests", icon: <Calendar size={18} />, label: "Leave" },
  { id: "notes", icon: <StickyNote size={18} />, label: "Notes" },
  { id: "drive", icon: <Cloud size={18} />, label: "My Drive" },
];

const EMPLOYEE_TAB_COPY = {
  profile: { title: "Profile", subtitle: "Your employee record and contact details." },
  kpis: { title: "KPIs", subtitle: "Rate KPIs assigned to your band and department." },
  values: { title: "Webknot Values", subtitle: "Reflect on Webknot values for this review cycle." },
  certifications: { title: "Certifications", subtitle: "Select credentials that apply to you this cycle." },
  recognitions: { title: "Recognitions", subtitle: "Highlight peer and project recognitions." },
  review: { title: "Review", subtitle: "Write your self review and submit for manager evaluation." },
  timelogs: { title: "Time Logs", subtitle: "Log effort and hours against your projects." },
  "leave-requests": { title: "Leave", subtitle: "Request leave, WFH, or comp off." },
  notes: { title: "Notes", subtitle: "Private sections and pages — only you can see these." },
  drive: { title: "My Drive", subtitle: "Your personal files — not visible to other employees or managers." },
};

function getEmployeeValuesPageSize() {
  const n = Number.parseInt(String(getAppSettings()?.employeeValuesPageSize ?? DEFAULT_PAGE_LIMIT), 10);
  if (!Number.isFinite(n)) return DEFAULT_PAGE_LIMIT;
  return Math.min(100, Math.max(5, n));
}

function getDraftAutosaveDelayMs() {
  const n = Number.parseInt(String(getAppSettings()?.draftAutosaveDelayMs ?? 900), 10);
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

function kpiAppliesToEmployee(kpi, employee) {
  const empBand = normalizeBandKey(employee?.band);
  const empStream = normalizeStreamKey(employee?.stream);
  if (!empBand && !empStream) return true;

  const kpiBand = normalizeBandKey(kpi?.band);
  const kpiStream = normalizeStreamKey(kpi?.stream);

  const bandOk = isWildcardValue(kpiBand) || !kpiBand || !empBand || kpiBand === empBand;
  const streamOk = isWildcardValue(kpiStream) || !kpiStream || !empStream || kpiStream === empStream;

  return bandOk && streamOk;
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
  const band = String(obj.band ?? obj.level ?? "").trim() || null;
  const stream = String(obj.stream ?? obj.context ?? "").trim() || null;
  const managerId = String(obj.managerId ?? "").trim() || null;

  return {
    id: id || "—",
    name: name || (email || "Unknown"),
    email: email || "",
    role,
    designation,
    band,
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
    band: String(obj.band ?? "").trim() || null,
    stream: String(obj.stream ?? "").trim() || null,
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
      out[id] = Math.round(num * 10) / 10;
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
      out[id] = Math.round(num * 10) / 10;
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
    out[id] = rounded;
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

function buildMonthlySubmissionPayload({
  month,
  selfReviewText,
  selectedCertifications,
  kpiRatings,
  selectedValues,
  valueComments,
  recognitionsCount,
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

function SubmissionStepper({ activeTab, steps, onNavigate }) {
  const list = Array.isArray(steps) ? steps : [];
  const activeIdx = list.findIndex((s) => s.id === activeTab);
  return (
    <div className="max-w-4xl mx-auto w-full min-w-0 mb-8">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 px-1">
        {list.map((step, idx) => {
          const status = step?.status || "pending";
          const active = activeTab === step.id;
          const done = status === "done";
          const isPast = idx < activeIdx;
          return (
            <React.Fragment key={step.id}>
              {idx > 0 ? (
                <div className={`hidden sm:block h-[2px] w-6 flex-shrink-0 rounded-full transition-colors duration-300 ${done || isPast ? "bg-emerald-500/60" : "bg-[rgb(var(--border))]"}`} />
              ) : null}
              <motion.button
                type="button"
                onClick={() => onNavigate?.(step.id)}
                layout
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className={[
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap border",
                  active
                    ? "bg-[rgb(var(--primary))] text-white border-[rgb(var(--primary))] shadow-md shadow-[rgb(var(--primary)/.2)]"
                    : done
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                      : "bg-[rgb(var(--surface))] text-[rgb(var(--muted))] border-[rgb(var(--border))] hover:bg-[rgb(var(--surface-2))]",
                ].join(" ")}
                title={String(step?.label || "")}
              >
                <span className={`h-5 w-5 rounded-full text-[10px] font-bold flex items-center justify-center ${active ? "bg-white/20" : done ? "bg-emerald-500/20" : "bg-[rgb(var(--surface-2))]"}`}>
                  {done ? (
                    <motion.span
                      initial={{ scale: 0, rotate: -90 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 18 }}
                    >
                      <CheckCircle2 size={12} />
                    </motion.span>
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </span>
                <span className="hidden sm:inline">{step?.label}</span>
              </motion.button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

const MAX_PROJECT_SELECTIONS = 3;

function ProfileTab({ employee, auth, authEmail, onUpdateEmployee, projectsUnlocked = false, submissionMonth = null }) {
  const display = employee || null;
  const email = authEmail || display?.email || "—";

  /* ── designation selection state ── */
  const [designations, setDesignations] = useState([]);
  const [designationsLoading, setDesignationsLoading] = useState(false);
  const [isUpdatingDesignation, setIsUpdatingDesignation] = useState(false);
  const [designationError, setDesignationError] = useState("");

  const loadDesignations = useCallback(async () => {
    if (!display?.band || !display?.stream) return;
    setDesignationsLoading(true);
    setDesignationError("");
    try {
      const list = await fetchDesignations({
        bandId: display.band,
        department: normalizeStreamKey(display.stream),
      });
      setDesignations(Array.isArray(list) ? list : []);
    } catch (err) {
      setDesignationError(err?.message || "Failed to load designations.");
    } finally {
      setDesignationsLoading(false);
    }
  }, [display?.band, display?.stream]);

  const handleDesignationSelect = async (newDesignation) => {
    if (!newDesignation || newDesignation === display?.designation) {
      setIsUpdatingDesignation(false);
      return;
    }
    setDesignationsLoading(true);
    setDesignationError("");
    try {
      const updated = await updatePortalEmployee({ designation: newDesignation });
      if (onUpdateEmployee) {
        onUpdateEmployee({ ...display, designation: newDesignation });
      }
      setIsUpdatingDesignation(false);
    } catch (err) {
      setDesignationError(err?.message || "Failed to update designation.");
    } finally {
      setDesignationsLoading(false);
    }
  };

  /* ── project selection state ── */
  const [allProjects, setAllProjects] = useState([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState(new Set());
  const [originalProjectIds, setOriginalProjectIds] = useState(new Set());
  const [projectRatings, setProjectRatings] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsSaving, setProjectsSaving] = useState(false);
  const [projectsError, setProjectsError] = useState("");
  const [projectsSuccess, setProjectsSuccess] = useState("");
  const [projectSearch, setProjectSearch] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        /* prefer employee-portal profile aliases, fall back to legacy endpoints */
        const [allRaw, myRaw, ratingsRaw] = await Promise.all([
          fetchAvailableProjects().catch(() => fetchProjects().catch(() => ({}))),
          fetchSelectedProjects().catch(() => fetchMyProjects().catch(() => ({}))),
          fetchSelectedProjectRatings().catch(() => fetchMyProjectRatings().catch(() => ({}))),
        ]);
        if (!alive) return;
        const apiList = normalizeProjects(allRaw);
        const all = listActiveProjectsForEmployees(apiList);
        setAllProjects(all);

        const myData = myRaw && typeof myRaw === "object" ? myRaw : {};
        const myArr =
          (Array.isArray(myRaw) && myRaw) ||
          (Array.isArray(myData?.data) && myData.data) ||
          (Array.isArray(myData?.projectIds) && myData.projectIds) ||
          (Array.isArray(myData?.projects) && myData.projects) ||
          [];
        const myIds = new Set(myArr.map((x) => String(typeof x === "object" ? (x?.id ?? x?.projectId ?? "") : x).trim()).filter(Boolean));
        setSelectedProjectIds(myIds);
        setOriginalProjectIds(myIds);

        setProjectRatings(normalizeProjectRatings(ratingsRaw));
      } catch {
        /* silent */
      } finally {
        if (alive) setProjectsLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  function toggleProject(projectId) {
    if (!projectsUnlocked) return;
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
    setProjectsSuccess("");
  }

  const projectsDirty = useMemo(() => {
    if (selectedProjectIds.size !== originalProjectIds.size) return true;
    for (const id of selectedProjectIds) {
      if (!originalProjectIds.has(id)) return true;
    }
    return false;
  }, [selectedProjectIds, originalProjectIds]);

  async function saveProjects() {
    if (!projectsUnlocked) {
      setProjectsError("Submit your monthly self-rating before selecting projects.");
      return;
    }
    if (selectedProjectIds.size === 0) {
      setProjectsError("Select at least one project before saving.");
      setProjectsSuccess("");
      return;
    }
    if (selectedProjectIds.size > MAX_PROJECT_SELECTIONS) {
      setProjectsError(`Select at most ${MAX_PROJECT_SELECTIONS} projects.`);
      return;
    }
    setProjectsSaving(true);
    setProjectsError("");
    setProjectsSuccess("");
    try {
      await updateSelectedProjects([...selectedProjectIds], { month: submissionMonth }).catch(() =>
        updateMyProjects([...selectedProjectIds], { month: submissionMonth }),
      );
      setOriginalProjectIds(new Set(selectedProjectIds));
      setProjectsSuccess("Projects updated! Project managers have been notified.");
      /* refresh ratings */
      try {
        const ratingsRaw = await fetchSelectedProjectRatings().catch(() => fetchMyProjectRatings());
        setProjectRatings(normalizeProjectRatings(ratingsRaw));
      } catch { /* ignore */ }
    } catch (err) {
      setProjectsError(err?.message || "Failed to save projects.");
    } finally {
      setProjectsSaving(false);
    }
  }

  const ratingsMap = useMemo(() => {
    const m = new Map();
    for (const r of projectRatings) m.set(r.projectId, r);
    return m;
  }, [projectRatings]);

  const filteredAllProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return allProjects;
    return allProjects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.managerName || "").toLowerCase().includes(q),
    );
  }, [allProjects, projectSearch]);

  return (
    <div className="space-y-8 max-w-4xl mx-auto w-full min-w-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="rt-page-header">
        <h2 className="text-2xl font-bold tracking-tight text-[rgb(var(--text))]">Profile</h2>
        <p className="text-sm text-[rgb(var(--muted))] mt-1">
          If anything looks wrong, please contact support.
        </p>
      </header>

      <section className="rt-panel rounded-2xl overflow-hidden">
        {/* Profile hero */}
        <div className="relative px-6 sm:px-8 pt-8 pb-6 bg-[rgb(var(--primary)/.05)]">
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
          <InfoRow
            label="Designation"
            value={display?.designation || "—"}
            action={
              isUpdatingDesignation ? (
                <button
                  type="button"
                  onClick={() => setIsUpdatingDesignation(false)}
                  className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[rgb(var(--surface-2))] border border-[rgb(var(--border))] text-[rgb(var(--muted))] hover:text-[rgb(var(--text))]"
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsUpdatingDesignation(true);
                    loadDesignations();
                  }}
                  className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[rgb(var(--primary)/.1)] border border-[rgb(var(--primary)/.2)] text-[rgb(var(--primary))] hover:bg-[rgb(var(--primary)/.2)]"
                >
                  {display?.designation ? "Change" : "Select"}
                </button>
              )
            }
          />

          <AnimatePresence>
            {isUpdatingDesignation && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-2 pb-4 pt-2 px-4 rounded-xl bg-[rgb(var(--surface-2)/.5)] border border-[rgb(var(--border)/.5)]">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--muted))] mb-3">
                    Available Designations
                  </div>
                  {designationsLoading ? (
                    <div className="flex items-center gap-2 text-xs text-[rgb(var(--muted))] py-2">
                      <RefreshCw size={12} className="animate-spin" /> Loading…
                    </div>
                  ) : designationError ? (
                    <div className="text-xs text-red-500 py-2">{designationError}</div>
                  ) : !designations.length ? (
                    <div className="text-xs text-[rgb(var(--muted))] py-2 italic">
                      No designations found for your band ({display?.band}) and stream ({display?.stream}).
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {designations.map((d) => {
                        const dValue = typeof d === "string" ? d : d?.name || d?.title || d?.designation;
                        if (!dValue) return null;
                        const isCurrent = dValue === display?.designation;
                        return (
                          <button
                            key={dValue}
                            type="button"
                            disabled={isCurrent}
                            onClick={() => handleDesignationSelect(dValue)}
                            className={[
                              "px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                              isCurrent
                                ? "bg-[rgb(var(--primary)/.05)] border-[rgb(var(--primary)/.3)] text-[rgb(var(--primary))] opacity-60 cursor-default"
                                : "bg-[rgb(var(--surface))] border-[rgb(var(--border))] text-[rgb(var(--text))] hover:border-[rgb(var(--primary)/.4)] hover:shadow-sm"
                            ].join(" ")}
                          >
                            {dValue}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <InfoRow label="Stream" value={display?.stream || "—"} />
          <InfoRow label="Band" value={display?.band || "—"} />
        </div>
      </section>

      <section className="rt-panel rounded-2xl p-6 sm:p-8 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-[rgb(var(--text))]">Project preferences</h3>
          <p className="text-sm text-[rgb(var(--muted))] mt-1">
            {projectsUnlocked
              ? `Choose up to ${MAX_PROJECT_SELECTIONS} projects for this cycle (priority order).`
              : "Available after you submit your monthly self-rating."}
          </p>
        </div>
        {!projectsUnlocked ? (
          <div className="text-sm text-amber-700 dark:text-amber-300 rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3">
            Submit your self-rating on the Review tab to unlock project selection.
          </div>
        ) : null}
        {projectsError ? <div className="text-sm text-red-600">{projectsError}</div> : null}
        {projectsSuccess ? <div className="text-sm text-emerald-600">{projectsSuccess}</div> : null}
        {projectsUnlocked ? (
          <>
            <input
              type="search"
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              placeholder="Search projects…"
              className="rt-input w-full text-sm"
            />
            {projectsLoading ? (
              <div className="text-sm text-[rgb(var(--muted))] flex items-center gap-2">
                <RefreshCw size={14} className="animate-spin" /> Loading projects…
              </div>
            ) : (
              <div className="grid gap-2 max-h-64 overflow-y-auto">
                {filteredAllProjects.map((p) => {
                  const selected = selectedProjectIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={!projectsUnlocked}
                      onClick={() => toggleProject(p.id)}
                      className={[
                        "text-left rounded-lg border px-3 py-2 transition-all",
                        selected
                          ? "border-[rgb(var(--primary)/.5)] bg-[rgb(var(--primary)/.08)]"
                          : "border-[rgb(var(--border))] hover:border-[rgb(var(--primary)/.3)]",
                      ].join(" ")}
                    >
                      <div className="font-medium text-sm">{p.name || p.code}</div>
                      {p.managerName ? (
                        <div className="text-[10px] text-[rgb(var(--muted))]">PM: {p.managerName}</div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={saveProjects}
                disabled={projectsSaving || !projectsDirty}
                className="rt-btn-primary text-sm disabled:opacity-60"
              >
                {projectsSaving ? "Saving…" : "Save project preferences"}
              </button>
            </div>
          </>
        ) : null}
      </section>

    </div>
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

function KpisTab({
  pageKpis,
  allKpis,
  ratings,
  setRatings,
  onProceed,
  loading,
  error,
  fullyLoaded,
  prefetching,
  selfReviewText,
  setSelfReviewText,
  locked,
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
    <div className="space-y-8 max-w-4xl mx-auto w-full min-w-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="rt-page-header">
        <h2 className="text-2xl font-bold tracking-tight text-[rgb(var(--text))]">KPIs</h2>
        <p className="text-sm text-[rgb(var(--muted))] mt-1">
          Rate yourself from 1.0 to 5.0 (1 decimal allowed). Weightage is out of 100%.
        </p>
      </header>

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
                const display = typeof value === "number" && Number.isFinite(value) ? value : "";
                return (
                  <tr key={id} className="hover:bg-[rgb(var(--surface-2))] transition-colors">
                    <td className="p-6">
                      <div className="font-bold text-[rgb(var(--text))] tracking-tight">{title || id}</div>
                      {k?.stream ? (
                        <div className="text-xs text-[rgb(var(--muted))] mt-1">{String(k.stream)}</div>
                      ) : null}
                    </td>
                    <td className="p-6">
                      <span className="font-mono text-blue-200">{weight}%</span>
                    </td>
                    <td className="p-6">
                      <input
                        type="number"
                        min={1}
                        max={5}
                        step={0.1}
                        value={display}
                        onWheel={preventWheelInputChange}
                        onChange={(e) => {
                          if (locked) return;
                          const text = String(e.target.value ?? "").trim();
                          const parsed = text === "" ? null : Number.parseFloat(text);
                          setRatings((prev) => {
                            const next = { ...(prev || {}) };
                            if (parsed == null || !Number.isFinite(parsed)) {
                              delete next[id];
                              return next;
                            }
                            const rounded = Math.round(parsed * 10) / 10;
                            next[id] = rounded;
                            return next;
                          });
                        }}
                        disabled={locked}
                        className={[
                          "rt-input w-40 py-3 px-4 text-sm",
                          locked ? "opacity-75 cursor-not-allowed" : "focus:border-blue-500",
                        ].join(" ")}
                        placeholder="e.g., 4.2"
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

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="text-sm text-[rgb(var(--muted))]">
          Rated: <span className="font-mono text-[rgb(var(--text))]">{ratedCount}</span>
          /<span className="font-mono text-[rgb(var(--text))]">{all.length}</span>
          {locked ? " (locked)" : null}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={onProceed}
            disabled={proceedDisabled}
            className={[
              "rt-btn-primary transition-all",
              proceedDisabled
                ? "!bg-[rgb(var(--surface-2))] !text-[rgb(var(--muted))] !border-[rgb(var(--border))] cursor-not-allowed"
                : "",
            ].join(" ")}
            title={
              locked
                ? "Proceed"
                : !allRated
                ? "Rate all KPIs to proceed"
                : (!selfReviewOk ? "Write your self review to proceed" : "Proceed")
            }
          >
            Proceed
          </button>
        </div>
      </div>
    </div>
  );
}

function ValuesTab({
  items,
  loading,
  error,
  selectedValues,
  setSelectedValues,
  onProceed,
  locked,
  canProceed,
}) {
  const pillarPalette = useMemo(
    () => [
      { bg: "bg-blue-500/10", text: "text-blue-500", border: "border-blue-500/20" },
      { bg: "bg-emerald-500/10", text: "text-emerald-500", border: "border-emerald-500/20" },
      { bg: "bg-amber-500/10", text: "text-amber-600", border: "border-amber-500/30" },
      { bg: "bg-blue-500/10", text: "text-blue-500", border: "border-blue-500/20" },
      { bg: "bg-rose-500/10", text: "text-rose-500", border: "border-rose-500/20" },
      { bg: "bg-cyan-500/10", text: "text-cyan-500", border: "border-cyan-500/20" },
      { bg: "bg-blue-500/10", text: "text-blue-500", border: "border-blue-500/20" },
      { bg: "bg-teal-500/10", text: "text-teal-500", border: "border-teal-500/20" },
    ],
    []
  );

  const colorForPillar = useCallback(
    (pillar) => {
      const key = String(pillar || "").toLowerCase().trim();
      if (!key) return { bg: "bg-[rgb(var(--surface-2))]", text: "text-[rgb(var(--muted))]", border: "border-[rgb(var(--border))]" };
      let hash = 0;
      for (let i = 0; i < key.length; i++) {
        hash = (hash * 31 + key.charCodeAt(i)) | 0;
      }
      const idx = Math.abs(hash) % pillarPalette.length;
      return pillarPalette[idx];
    },
    [pillarPalette]
  );
  const valueRatings = useMemo(
    () => normalizeWebknotValueRatingsForState(selectedValues),
    [selectedValues]
  );
  const list = useMemo(() => (Array.isArray(items) ? items : []), [items]);
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

  return (
    <div className="space-y-8 max-w-4xl mx-auto w-full min-w-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="rt-page-header">
        <h2 className="text-2xl font-bold tracking-tight text-[rgb(var(--text))]">Webknot Values</h2>
        <p className="text-sm text-[rgb(var(--muted))] mt-1">
          Select the values you feel you demonstrated this cycle.
        </p>
      </header>

      {loading ? (
        <div className="rt-panel-subtle rounded-lg p-4 text-sm text-[rgb(var(--muted))]">
          Loading values…
        </div>
      ) : null}

      <section className="rt-panel rounded-2xl overflow-hidden shadow-sm">
        <div className="p-8 flex items-center justify-between gap-4 flex-wrap">
          <div className="rt-section-header">
            <h3 className="rt-section-title">Values</h3>
            <p className="rt-section-subtitle">
              Rated: <span className="font-mono">{ratedCount}</span> / {list.length}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-[rgb(var(--muted))] border-t border-b border-[rgb(var(--border))]">
              <tr>
                <th className="p-4 font-medium">Value</th>
                <th className="p-4 font-medium">Evaluation Criteria</th>
                <th className="p-4 font-medium">Your Rating (1-5)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {list.map((v) => {
                const id = String(v?.id || "");
                const value = valueRatings?.[id];
                const display = typeof value === "number" && Number.isFinite(value) ? value : "";
                const pillar = String(v?.pillar || "—");
                const isPillarMissing = !pillar || pillar === "—";
                const colors = colorForPillar(isPillarMissing ? "" : pillar);
                return (
                  <tr key={id} className="hover:bg-[rgb(var(--surface-2))] transition-colors">
                    <td className="p-6">
                      <div className="font-bold text-[rgb(var(--text))] tracking-tight">{String(v?.title || id)}</div>
                    </td>
                    <td className="p-6">
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
                    </td>
                    <td className="p-6">
                      <label className="inline-flex items-center gap-3 select-none">
                        <input
                          type="number"
                          min={1}
                          max={5}
                          step={0.1}
                          value={display}
                          disabled={locked}
                          onWheel={preventWheelInputChange}
                          onChange={(e) => {
                            if (locked) return;
                            const text = String(e.target.value ?? "").trim();
                            const parsed = text === "" ? null : Number.parseFloat(text);
                            setSelectedValues((prev) => {
                              const next = normalizeWebknotValueRatingsForState(prev);
                              if (parsed == null || !Number.isFinite(parsed)) {
                                delete next[id];
                                return next;
                              }
                              const rounded = Math.round(parsed * 10) / 10;
                              if (rounded < 1 || rounded > 5) {
                                delete next[id];
                                return next;
                              }
                              next[id] = rounded;
                              return next;
                            });
                          }}
                          className={[
                            "rt-input w-32 py-3 px-4 text-sm",
                            locked ? "opacity-75 cursor-not-allowed" : "focus:border-blue-500",
                          ].join(" ")}
                          placeholder="e.g., 4.2"
                        />
                      </label>
                    </td>
                  </tr>
                );
              })}

              {!loading && list.length === 0 ? (
                <tr>
                  <td className="p-10 text-center text-[rgb(var(--muted))]" colSpan={3}>
                    No values to show.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex items-center justify-end gap-3 flex-wrap">
        {!locked && !canProceed ? (
          <div className="text-xs text-[rgb(var(--muted))] mr-2">
            Rate at least one value to continue.
          </div>
        ) : null}
        <button
          type="button"
          onClick={onProceed}
          disabled={locked ? false : !canProceed}
          className={[
            "rt-btn-primary transition-all",
            locked || canProceed
              ? ""
              : "!bg-[rgb(var(--surface-2))] !text-[rgb(var(--muted))] !border-[rgb(var(--border))] cursor-not-allowed",
          ].join(" ")}
          title={locked || canProceed ? "Proceed" : "Rate at least one value to proceed"}
        >
          Proceed
        </button>
      </div>
    </div>
  );
}

function CertificationsTab({
  catalog,
  selectedCertifications,
  setSelectedCertifications,
  onProceed,
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
    <div className="space-y-8 max-w-4xl mx-auto w-full min-w-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="rt-page-header">
        <h2 className="text-2xl font-bold tracking-tight text-[rgb(var(--text))]">Certifications</h2>
        <p className="text-sm text-[rgb(var(--muted))] mt-1">
          Certifications listed by Admin appear here. If something looks wrong, please contact support.
        </p>
      </header>

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

        <div className="p-6 border-t border-[rgb(var(--border))] flex items-center justify-between gap-4 flex-wrap">
          <div className="text-sm text-[rgb(var(--muted))]">
            Selected: <span className="font-mono text-blue-200">{selectedKeySet.size}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {!locked && !canProceed ? (
              <div className="text-xs text-[rgb(var(--muted))]">
                Add proof for selected certifications.
              </div>
            ) : null}
            <button
              type="button"
              onClick={onProceed}
              disabled={locked ? false : !canProceed}
              className={[
                "rt-btn-primary transition-all",
                locked || canProceed
                  ? ""
                  : "!bg-[rgb(var(--surface-2))] !text-[rgb(var(--muted))] !border-[rgb(var(--border))] cursor-not-allowed",
              ].join(" ")}
              title={locked || canProceed ? "Proceed" : "Add proof for selected certifications"}
            >
              Proceed
            </button>
          </div>
        </div>
      </section>

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
    </div>
  );
}

function RecognitionsTab({ recognitionsCount, setRecognitionsCount, onProceed, locked, canProceed }) {
  return (
    <div className="space-y-8 max-w-4xl mx-auto w-full min-w-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="rt-page-header">
        <h2 className="text-2xl font-bold tracking-tight text-[rgb(var(--text))]">Recognitions</h2>
        <p className="text-sm text-[rgb(var(--muted))] mt-1">
          Report the number of awards received at All Hands.
        </p>
      </header>

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

        <div className="mt-8 flex items-center justify-end gap-3 flex-wrap">
          {!locked && !canProceed ? (
            <div className="text-xs text-[rgb(var(--muted))] mr-2">
              Enter a valid recognition count to continue.
            </div>
          ) : null}
          <button
            type="button"
            onClick={onProceed}
            disabled={locked ? false : !canProceed}
            className={[
              "rt-btn-primary transition-all",
              locked || canProceed
                ? ""
                : "!bg-[rgb(var(--surface-2))] !text-[rgb(var(--muted))] !border-[rgb(var(--border))] cursor-not-allowed",
            ].join(" ")}
          >
            Proceed
          </button>
        </div>
      </section>
    </div>
  );
}

function ReviewTab({
  employee,
  authEmail,
  role,
  submissionMeta,
  kpis,
  kpiRatings,
  selfReviewText,
  selectedValues,
  selectedCertifications,
  recognitionsCount,
  onSaveDraft,
  onFinalSubmit,
  canFinalSubmit,
  locked,
  valuesIndex,
}) {
  const [toast, setToast] = useState(null); // { title, message? }
  const [toastTimerId, setToastTimerId] = useState(null);

  function showToast(nextToast) {
    setToast(nextToast);
    if (toastTimerId) window.clearTimeout(toastTimerId);
    const id = window.setTimeout(() => setToast(null), 2200);
    setToastTimerId(id);
  }

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

  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);

  const reviewFeedback = useMemo(() => {
    const manager = submissionMeta?.managerReview && typeof submissionMeta.managerReview === "object"
      ? submissionMeta.managerReview
      : null;
    const admin = submissionMeta?.adminReview && typeof submissionMeta.adminReview === "object"
      ? submissionMeta.adminReview
      : null;
    const rows = [];

    const managerComment = String(manager?.comments || "").trim();
    if (managerComment) {
      rows.push({
        id: "manager",
        reviewer: "Manager",
        action: String(manager?.action || "").trim().toUpperCase(),
        comment: managerComment,
        reviewedAt: manager?.reviewedAt || submissionMeta?.managerSubmittedAt || null,
      });
    }

    const adminComment = String(admin?.comments || "").trim();
    if (adminComment) {
      rows.push({
        id: "admin",
        reviewer: "Admin",
        action: String(admin?.action || "").trim().toUpperCase(),
        comment: adminComment,
        reviewedAt: admin?.reviewedAt || submissionMeta?.adminSubmittedAt || null,
      });
    }

    const needsResubmission = Boolean(isResubmissionRequested(submissionMeta));
    return { rows, needsResubmission };
  }, [submissionMeta]);

  return (
    <div className="space-y-8 max-w-4xl mx-auto w-full min-w-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="rt-page-header">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[rgb(var(--text))]">Review</h2>
          <p className="text-sm text-[rgb(var(--muted))] mt-1">
            Review everything before final submit.
          </p>
        </div>
      </header>

      {reviewFeedback.needsResubmission && reviewFeedback.rows.length ? (
        <section className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-5 sm:p-6 space-y-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-900 dark:text-amber-100">
            Changes Requested
          </div>
          {reviewFeedback.rows.map((row) => {
            const isReject = row.action === "REJECT";
            return (
              <div key={row.id} className="rounded-lg border border-amber-400/30 bg-white/40 dark:bg-black/20 p-4 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-xs font-semibold uppercase tracking-wider text-amber-900 dark:text-amber-100">
                    {row.reviewer}
                  </div>
                  <div className={[
                    "text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-1 border",
                    isReject
                      ? "border-amber-500/40 text-amber-900 dark:text-amber-100 bg-amber-500/15"
                      : "border-[rgb(var(--border))] text-[rgb(var(--muted))] bg-[rgb(var(--surface-2))]",
                  ].join(" ")}>
                    {row.action || "COMMENTED"}
                  </div>
                </div>
                <div className="text-sm text-amber-950 dark:text-amber-50 whitespace-pre-wrap break-words">
                  {row.comment}
                </div>
                {row.reviewedAt ? (
                  <div className="text-[11px] text-amber-800/80 dark:text-amber-200/80 font-mono">
                    Reviewed at: {formatReviewTimestamp(row.reviewedAt)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      ) : null}

      {reviewFeedback.needsResubmission ? (
        <ResubmissionPlaybook
          submission={{
            submission: {
              selfReviewText,
              kpiRatings,
              webknotValueRatings: normalizeWebknotValueRatingsForState(selectedValues),
              reopenedForResubmission: true,
              managerReview: submissionMeta?.managerReview,
              adminReview: submissionMeta?.adminReview,
              updatedAt: submissionMeta?.updatedAt,
              raw: submissionMeta?.raw,
            },
          }}
          rejectComment={
            submissionMeta?.adminReview?.comments ||
            submissionMeta?.managerReview?.comments ||
            ""
          }
        />
      ) : null}

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
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
          KPI Ratings
        </div>
        {Array.isArray(kpis) && kpis.length ? (
          <div className="space-y-2">
            {kpis.map((k) => (
              <div key={k.id} className="flex items-center justify-between gap-4">
                <div className="text-sm text-[rgb(var(--text))]">{k.title}</div>
                <div className="text-sm font-mono text-blue-200">
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
          <div className="space-y-2">
            {valueRatings.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-4">
                <div className="text-sm text-[rgb(var(--text))]">{row.title}</div>
                <div className="text-sm font-mono text-blue-200">{row.rating.toFixed(1)}</div>
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
          Awards received at All Hands: <span className="font-mono text-blue-200">{Number(recognitionsCount || 0)}</span>
        </div>
      </section>

      <div className="flex items-center justify-end gap-3 flex-wrap">
        <button
          type="button"
          onClick={async () => {
            if (locked) return;
            try {
              await onSaveDraft?.();
              showToast({ title: "Draft saved", message: "Saved to server." });
            } catch (err) {
              showToast({ title: "Save failed", message: err?.message || "Please try again." });
            }
          }}
          disabled={locked}
          className="rt-btn-ghost transition-all"
        >
          Save draft
        </button>
        <button
          type="button"
          onClick={() => {
            if (locked || !canFinalSubmit) return;
            setConfirmSubmitOpen(true);
          }}
          disabled={locked || !canFinalSubmit}
          className={[
            "rt-btn-primary transition-all",
            locked || !canFinalSubmit
              ? "!bg-[rgb(var(--surface-2))] !text-[rgb(var(--muted))] !border-[rgb(var(--border))] cursor-not-allowed"
              : "",
          ].join(" ")}
          title={locked ? "This month's review is locked" : (!canFinalSubmit ? "Complete required fields first" : "Final submit")}
        >
          <CheckCircle2 size={18} /> Final submit
        </button>
      </div>

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
                <h3 className="font-semibold tracking-tight">Confirm Final Submission</h3>
                <p className="text-xs text-[rgb(var(--muted))] mt-0.5">This action cannot be undone</p>
              </div>
            </div>
          }
        >
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert size={18} className="text-amber-700 dark:text-amber-300 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
                  Once submitted, your self-review form will be <strong>locked for this month</strong>. 
                  You will not be able to edit your ratings, self-review text, or any other responses unless an admin reopens it for you.
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmSubmitOpen(false)}
                className="rt-btn-ghost"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={async () => {
                  setConfirmSubmitOpen(false);
                  try {
                    await onFinalSubmit?.();
                    showToast({ title: "Submitted", message: "Locked for manager review.", tone: "success" });
                  } catch (err) {
                    showToast({ title: "Submit failed", message: err?.message || "Please try again.", tone: "error" });
                  }
                }}
                className="rt-btn-primary bg-[rgb(var(--success))] text-white hover:opacity-90"
              >
                <Lock size={16} /> Yes, submit & lock
              </button>
            </div>
          </div>
        </ModalOverlay>
      ) : null}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
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
    <div className="rt-shell font-sans overflow-x-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-12 py-8 sm:py-12">
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
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.15, type: "spring", stiffness: 400, damping: 20 }}
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-200"
                >
                  <CheckCircle2 size={14} /> Submitted & Locked
                </motion.div>
                <h1 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-[rgb(var(--text))]">
                  {monthLabel} — Submission Review
                </h1>
                <p className="mt-1.5 text-sm text-[rgb(var(--muted))]">
                  {employee?.name || authEmail || "—"} &middot; Submitted {submittedLabel}
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-semibold text-[rgb(var(--muted))] uppercase tracking-wider">
                  <Lock size={11} /> Your form is locked for this month
                </div>
              </div>
              {typeof onLogout === "function" ? (
                <button type="button" onClick={onLogout} className="rt-btn-ghost" title="Logout">
                  <LogOut size={15} /> Logout
                </button>
              ) : null}
            </div>
          </div>
        </motion.div>

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
          className="mt-8 rounded-lg border border-amber-400/40 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10 p-5"
        >
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-200">
            <ShieldAlert size={14} /> Need Corrections?
          </div>
          <div className="mt-2 text-sm text-amber-800 dark:text-amber-100">
            If you find any mistake in your response, contact HR at <span className="font-mono">hr@webknot.in</span> to request reopening.
          </div>
        </motion.div>
      </div>
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
  /* ── Path-based routing: sync activeTab ↔ URL path ── */
  const EMP_VALID_TABS = useMemo(
    () => new Set(["profile", "account", "kpis", "values", "certifications", "recognitions", "review", "timelogs", "leave-requests", "notes", "drive"]),
    [],
  );

  const getEmpTabFromPath = useCallback(() => {
    const raw = window.location.pathname.replace(/^\//, "").split("/")[0];
    return EMP_VALID_TABS.has(raw) ? raw : "profile";
  }, [EMP_VALID_TABS]);

  const [activeTab, setActiveTabRaw] = useState(() => getEmpTabFromPath());

  const setActiveTab = useCallback((tab) => {
    setActiveTabRaw(tab);
    const path = tab === "profile" ? "/" : `/${tab}`;
    if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
  }, []);

  useEffect(() => {
    const onPathChange = () => setActiveTabRaw(getEmpTabFromPath());
    window.addEventListener("popstate", onPathChange);
    return () => {
      window.removeEventListener("popstate", onPathChange);
    };
  }, [getEmpTabFromPath]);

  const [employee, setEmployee] = useState(() =>
    normalizeEmployeeFromAuth(auth, {
      fallbackEmail: String(auth?.email || auth?.claims?.sub || "").trim(),
      fallbackRole: String(auth?.role || auth?.claims?.role || "").trim() || "Employee",
    })
  );

  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [certificationCatalog, setCertificationCatalog] = useState([]);
  const [certificationsLoading, setCertificationsLoading] = useState(false);
  const [certificationsError, setCertificationsError] = useState("");
  const [submissionMonth, setSubmissionMonth] = useState(() => formatYearMonth(new Date()));
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
  const cycleInfo = useMemo(
    () => getCycleForMonth(submissionMonth || new Date()),
    [submissionMonth]
  );
  const cycleMonthOptions = useMemo(
    () => buildCycleMonthOptions(submissionMonth || new Date()),
    [submissionMonth]
  );

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
    const key = "rt_tracking_employee_portal_tab_token_v1";
    const randomToken =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);

    try {
      const sessionToken = window.sessionStorage.getItem(key);
      const globalToken = window.localStorage.getItem(key);

      if (sessionToken && globalToken === sessionToken) {
        setActiveTab("profile");
        window.sessionStorage.setItem(key, randomToken);
        window.localStorage.setItem(key, randomToken);
        return;
      }

      if (!sessionToken) {
        window.sessionStorage.setItem(key, randomToken);
        window.localStorage.setItem(key, randomToken);
      }
    } catch { void 0; }
  }, [authEmail, onLogout, role, submissionMonth]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    (async () => {
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

        const submissionRaw =
          root?.monthlySubmission ?? root?.submission ?? root?.currentSubmission ?? null;
        const normalizedSubmission = normalizeMonthlySubmission(submissionRaw);
        if (normalizedSubmission && String(normalizedSubmission.month || "") === String(submissionMonth || "")) {
          const nextCerts = normalizeCertificationsForState(normalizedSubmission.certifications);
          const nextRatings = normalizeKpiRatingsForState(normalizedSubmission.kpiRatings);
          const nextValues = normalizeWebknotValueRatingsForState(
            normalizedSubmission.webknotValueRatings ?? normalizedSubmission.webknotValues
          );

          setSelfReviewText((prev) => (String(prev || "").trim() ? prev : normalizedSubmission.selfReviewText || ""));
          setSelectedCertifications((prev) => (Array.isArray(prev) && prev.length ? prev : nextCerts));
          setKpiRatings((prev) => (prev && Object.keys(prev).length ? prev : nextRatings));
          setSelectedValues((prev) => {
            const existing = normalizeWebknotValueRatingsForState(prev);
            return Object.keys(existing).length ? existing : nextValues;
          });
          setRecognitionsCount((prev) => (prev ? prev : (normalizedSubmission.recognitionsCount || 0)));
        }
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!mounted) return;
        if (err?.status === 401) {
          onLogout?.();
          return;
        }
        if (err?.status === 403) {
          // Some tenants block this alias for employees; continue with basic profile data instead of showing an error toast.
          setPortalBootstrapError("");
          return;
        }
        setPortalBootstrapError(err?.message || "Failed to load portal data.");
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [authEmail, onLogout, role, submissionMonth]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    async function run() {
      setCertificationsError("");
      setCertificationsLoading(true);
      try {
        const data = await fetchCertifications({ activeOnly: true, signal: controller.signal });
        const normalized = normalizeCertifications(data).filter((c) => Boolean(c?.listed));
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
      try {
        const data = await fetchEmployeePortalKpiDefinitions({
          limit: DEFAULT_PAGE_LIMIT,
          cursor: null,
          employeeId: employee?.id || null,
          band: employee?.band || null,
          stream: employee?.stream || null,
          signal: controller.signal,
        });
        const page = normalizeCursorPage(data);
        const normalized = normalizeKpiDefinitions(page.items);
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
  }, [employee?.band, employee?.id, employee?.stream, onLogout]);

  useEffect(() => {
    if (activeTab !== "kpis") return;
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
  }, [activeTab, employee?.band, employee?.id, employee?.stream, kpiPrefetching, kpisFullyLoaded, onLogout]);

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

        setSelfReviewText(normalized.selfReviewText || "");
        setSelectedCertifications(nextCerts);
        setKpiRatings(nextRatings);
        setSelectedValues(nextValues);
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

  const locked = useMemo(
    () => isAuthorSubmissionLocked(submissionMeta),
    [submissionMeta]
  );

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

  const canEnterSubmissionValues = Boolean(submissionAccess?.canEnterValues);

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
    if (!canEnterSubmissionValues) return;
    const payload = buildMonthlySubmissionPayload({
      month: submissionMonth,
      selfReviewText,
      selectedCertifications,
      kpiRatings,
      selectedValues,
      recognitionsCount,
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
        await saveMonthlyDraft(payload);
        lastSavedDraftHashRef.current = hash;
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
    hydratingSubmission,
    kpiRatings,
    locked,
    onLogout,
    recognitionsCount,
    selectedCertifications,
    selectedValues,
    selfReviewText,
    subjectEmployeeId,
    submissionMeta?.reviewStatus,
    submissionMeta?.reopenedForResubmission,
    submissionMonth,
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
      recognitionsCount,
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
      await saveMonthlyDraft(payload);
      lastSavedDraftHashRef.current = hash;
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
      submittedAt: new Date().toISOString(),
    };

    setDraftSaveError("");
    setDraftSaving(true);
    try {
      const res = await submitMonthlySubmission(payload);
      const normalized = normalizeMonthlySubmission(res);
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
    } catch (err) {
      if (err?.status === 401) {
        onLogout?.();
        return;
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
    return textOk && kpisOk && certsOk;
  }, [kpiRatings, kpisFullyLoaded, locked, selectedCertifications, selfReviewText, visibleKpis]);

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
    const total = Array.isArray(valuesPage?.items) ? valuesPage.items.length : 0;
    if (total === 0) return true;
    return valuesRatedCount > 0;
  }, [locked, valuesPage?.items, valuesRatedCount]);

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
    () => new Set(["kpis", "values", "certifications", "recognitions", "review"]),
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
  }, [auth, authEmail, onLogout, role]);

  const needsResubmission = useMemo(
    () => Boolean(isResubmissionRequested(submissionMeta)),
    [submissionMeta]
  );

  const resubmissionActor = useMemo(() => {
    if (!needsResubmission) return null;
    const reviewStatusUpper = String(submissionMeta?.reviewStatus || "").toUpperCase();
    const adminAction = String(submissionMeta?.adminReview?.action || "").toUpperCase();
    const managerAction = String(submissionMeta?.managerReview?.action || "").toUpperCase();
    if (adminAction.includes("REJECT") || reviewStatusUpper.includes("ADMIN")) return "ADMIN";
    if (managerAction.includes("REJECT") || reviewStatusUpper.includes("MANAGER")) return "MANAGER";
    return null;
  }, [needsResubmission, submissionMeta?.adminReview?.action, submissionMeta?.managerReview?.action, submissionMeta?.reviewStatus]);

  const latestReviewComment = useMemo(() => {
    const manager = String(submissionMeta?.managerReview?.comments || "").trim();
    const admin = String(submissionMeta?.adminReview?.comments || "").trim();
    if (resubmissionActor === "ADMIN") return admin || manager || "";
    if (resubmissionActor === "MANAGER") return manager || admin || "";
    return admin || manager || "";
  }, [resubmissionActor, submissionMeta?.adminReview?.comments, submissionMeta?.managerReview?.comments]);

  const stepItems = useMemo(() => ([
    { id: "profile", label: "Profile", status: "done" },
    { id: "kpis", label: "KPIs", status: kpisReadyForNext ? "done" : "pending" },
    { id: "values", label: "Values", status: valuesCanProceed ? "done" : "pending" },
    { id: "certifications", label: "Certifications", status: certificationsCanProceed ? "done" : "pending" },
    { id: "recognitions", label: "Recognitions", status: recognitionsCanProceed ? "done" : "pending" },
    { id: "review", label: "Review", status: canFinalSubmit || locked ? "done" : "pending" },
  ]), [
    canFinalSubmit,
    certificationsCanProceed,
    kpisReadyForNext,
    locked,
    recognitionsCanProceed,
    valuesCanProceed,
  ]);

  const main = (() => {
    if (activeTab === "leave-requests") {
      return <LeaveRequestsPage employee={employee} authEmail={authEmail} />;
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
            onUpdateEmployee={(upd) => setEmployee(upd)}
            projectsUnlocked={locked && !needsResubmission}
            submissionMonth={submissionMonth}
          />
        </>
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
          onProceed={() => goToTab("values")}
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
          locked={locked}
          canProceed={valuesCanProceed}
          onProceed={() => goToTab("certifications")}
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
        />
      );
    }
    if (activeTab === "timelogs") {
      return <TimeLogTracker employee={employee} authEmail={authEmail} />;
    }
    if (activeTab === "notes") {
      return (
        <PortalNotesWorkspace
          portal="employee"
          auth={auth}
          title="My notes"
          subtitle="Private to your account — managers and other employees cannot see these."
        />
      );
    }
    if (activeTab === "drive") {
      return <WebknotDrive auth={auth} portalLabel="your employee account" />;
    }
    if (activeTab === "review") {
      return (
        <ReviewTab
          employee={employee}
          authEmail={authEmail}
          role={role}
          submissionMeta={submissionMeta}
          kpis={visibleKpis}
          kpiRatings={kpiRatings}
          selfReviewText={selfReviewText}
          selectedValues={selectedValues}
          selectedCertifications={selectedCertifications}
          recognitionsCount={recognitionsCount}
          onSaveDraft={saveDraftNow}
          onFinalSubmit={finalSubmit}
          canFinalSubmit={canFinalSubmit}
          locked={locked}
          valuesIndex={valuesIndex}
        />
      );
    }
    return <Placeholder title="Profile" note="Employee profile." />;
  })();

  if (
    !portalWindowLoading &&
    !canEnterSubmissionValues &&
    !needsResubmission &&
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

  if (activeTab !== "leave-requests" && locked && !needsResubmission) {
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
      />
    );
  }

  return (
    <>
    <AppShell
      isSidebarOpen={isSidebarOpen}
      setIsSidebarOpen={setIsSidebarOpen}
      maxWidth={activeTab === "notes" || activeTab === "drive" ? "max-w-[1600px]" : "max-w-5xl"}
      sidebar={
        <PortalSidebar
          isOpen={isSidebarOpen}
          setIsOpen={setIsSidebarOpen}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          portalTag="Employee Workspace"
          navItems={EMPLOYEE_NAV_ITEMS}
          showThemeToggle
          onSettingsClick={() => setSettingsOpen(true)}
        />
      }
      topbar={
        <>
          <span className="rt-kicker pointer-events-auto max-w-[12rem] truncate sm:max-w-none">
            <Calendar size={14} className="shrink-0" />
            {cycleInfo?.label || "—"}
          </span>
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
        <PortalPageHeader
          title={EMPLOYEE_TAB_COPY[activeTab]?.title || "Employee"}
          subtitle={EMPLOYEE_TAB_COPY[activeTab]?.subtitle || ""}
        />

        {activeTab !== "leave-requests" && !locked && needsResubmission ? (
          <div className="max-w-4xl mx-auto w-full min-w-0 mb-6">
            <div className="relative overflow-hidden rounded-2xl border border-amber-500/45 bg-gradient-to-r from-amber-50 via-amber-50 to-white shadow-sm dark:from-amber-950/40 dark:via-amber-900/40 dark:to-transparent">
              <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-amber-500 to-orange-500" aria-hidden="true" />
              <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_10%_20%,rgba(251,191,36,0.12),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(253,186,116,0.15),transparent_30%)]" aria-hidden="true" />
              <div className="relative p-5 sm:p-6 flex items-start gap-4">
                <div className="h-11 w-11 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-200 flex items-center justify-center shadow-inner shadow-amber-500/20">
                  <ShieldAlert size={18} />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3 flex-wrap justify-between">
                    <div className="space-y-0.5">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-200">Changes Requested</div>
                      <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                        Returned by {resubmissionActor === "ADMIN" ? "Admin" : "Manager"}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-200">
                      {resubmissionActor === "ADMIN" ? "Admin review" : "Manager review"}
                    </span>
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                    {resubmissionActor === "ADMIN"
                      ? "An admin reviewed this cycle and returned it for changes. Please address the notes below and resubmit."
                      : "Your manager reviewed your submission and returned it with feedback. Please address the comments below and resubmit."}
                  </p>
                  {latestReviewComment ? (
                    <div className="rounded-xl border border-amber-500/25 bg-white/80 p-3 sm:p-4 shadow-inner shadow-amber-500/10 backdrop-blur-sm dark:border-amber-500/30 dark:bg-black/25">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-200">
                        {resubmissionActor === "ADMIN" ? "Admin comments" : "Manager comments"}
                      </div>
                      <div className="mt-1 text-sm text-amber-950 dark:text-amber-50 whitespace-pre-wrap leading-relaxed break-words">
                        {latestReviewComment}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            {needsResubmission ? (
              <div className="mt-4 max-w-4xl mx-auto w-full">
                <ResubmissionPlaybook
                  submission={{
                    submission: {
                      selfReviewText,
                      kpiRatings,
                      webknotValueRatings: normalizeWebknotValueRatingsForState(selectedValues),
                      reopenedForResubmission: true,
                      managerReview: submissionMeta?.managerReview,
                      adminReview: submissionMeta?.adminReview,
                      updatedAt: submissionMeta?.updatedAt,
                      raw: submissionMeta?.raw,
                    },
                  }}
                  rejectComment={latestReviewComment}
                />
              </div>
            ) : null}
          </div>
        ) : null}
        {activeTab !== "leave-requests" && activeTab !== "notes" && activeTab !== "drive" ? (
        <div className="max-w-4xl mx-auto w-full min-w-0 mb-6 flex items-end justify-between gap-4 flex-wrap">
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
            <span className={`h-2 w-2 rounded-full ${locked ? "bg-red-500" : draftSaving ? "bg-amber-500 animate-pulse" : draftSaveError ? "bg-red-500" : "bg-emerald-500"}`} />
            <span className="text-xs font-medium text-[rgb(var(--text))]">
              {locked
                ? "Locked"
                : hydratingSubmission
                ? "Loading…"
                : draftSaving
                  ? "Saving…"
                  : draftSaveError
                    ? "Not saved"
                    : "Draft saved"}
            </span>
          </div>
        </div>
        ) : null}

        {activeTab !== "leave-requests" && activeTab !== "notes" && activeTab !== "drive" ? (
          <SubmissionStepper activeTab={activeTab} steps={stepItems} onNavigate={goToTab} />
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
    <PortalSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

    <Toast toast={toast} onDismiss={() => setToast(null)} durationMs={2800} />
    </>
  );
}
