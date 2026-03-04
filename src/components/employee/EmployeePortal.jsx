import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
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
  X,
} from "lucide-react";
import Toast from "../shared/Toast.jsx";
import ThemeToggle from "../shared/ThemeToggle.jsx";
import ModalOverlay from "../shared/ModalOverlay.jsx";

import { fetchMe } from "../../api/auth.js";
import { fetchCertifications, normalizeCertifications } from "../../api/certifications.js";
import { normalizeKpiDefinitions } from "../../api/kpi-definitions.js";
import {
  fetchMyMonthlySubmission,
  formatYearMonth,
  normalizeMonthlySubmission,
  saveMonthlyDraft,
  submitMonthlySubmission
} from "../../api/monthly-submissions.js";
import { fetchPortalEmployee } from "../../api/portal.js";
import {
  fetchEmployeePortalKpiDefinitions,
  fetchEmployeePortalWebknotValues,
  normalizeCursorPage,
  normalizeWebknotValues
} from "../../api/employee-portal.js";
import { fetchValues, normalizeWebknotValuesList } from "../../api/webknotValueApi.js";
import { enhanceReviewText, fetchActiveAiAgent } from "../../api/ai-agents.js";
import { getAppSettings } from "../../utils/appSettings.js";
import { buildCycleMeta, buildCycleMonthOptions, getCycleForMonth, isResubmissionRequested, normalizeYearMonth } from "../../utils/reviewCycles.js";

const DEFAULT_PAGE_LIMIT = 10;
const EMPLOYEE_SIDEBAR_PREF_KEY = "rt_tracking_employee_sidebar_open_v1";

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
  const role = String(obj.role ?? obj.empRole ?? obj.userRole ?? fallbackRole ?? "").trim() || "Employee";
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
    role: String(obj.role || fallbackRole || "Employee").trim() || "Employee",
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

function buildMonthlySubmissionPayload({
  month,
  selfReviewText,
  selectedCertifications,
  kpiRatings,
  selectedValues,
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
  const valueRatingEntries = Object.entries(valueRatings).sort(([a], [b]) =>
    String(a).localeCompare(String(b), undefined, { numeric: true })
  );
  const stableValueRatings = Object.fromEntries(valueRatingEntries);
  const values = valueRatingEntries.map(([id]) => String(id));

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

function isAiEnhancementConfigured(raw) {
  const obj = raw && typeof raw === "object" ? raw : {};
  if (typeof obj.configured === "boolean") return obj.configured;
  return Boolean(String(obj.provider ?? "").trim());
}

async function enhanceSelfReviewText({ agent, text, signal }) {
  if (!agent) throw new Error("AI agent is not configured.");
  const input = String(text || "").trim();
  if (!input) throw new Error("Write your self review first.");
  return enhanceReviewText({ text: input, mode: "self_review", signal });
}

const Sidebar = ({ isOpen, setIsOpen, activeTab, setActiveTab, onLogout, account }) => {
  const navItems = [
    { id: "profile", icon: <UserCircle2 size={20} />, label: "Profile" },
    { id: "kpis", icon: <Target size={20} />, label: "KPIs" },
    { id: "values", icon: <Sparkles size={20} />, label: "Webknot Values" },
    { id: "certifications", icon: <Award size={20} />, label: "Certifications" },
    { id: "recognitions", icon: <Award size={20} />, label: "Recognitions" },
    { id: "review", icon: <ClipboardCheck size={20} />, label: "Review" },
  ];

  return (
    <aside
      className={[
        "rt-sidebar fixed left-0 top-0 h-full transition-all duration-300 z-50",
        "flex flex-col",
        "md:translate-x-0",
        isOpen ? "translate-x-0 w-64" : "-translate-x-full md:translate-x-0 md:w-[72px]",
      ].join(" ")}
    >
      <div className="p-5 flex items-center justify-between">
        {isOpen ? (
          <div className="flex items-center gap-2.5">
            <img
              src="/unnamed.webp"
              alt="Webknot Technologies logo"
              className="h-8 w-8 rounded-md object-cover bg-white"
            />
            <span className="font-semibold tracking-tight text-[rgb(var(--sidebar-text))]">
              Webknot
            </span>
          </div>
        ) : null}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-1.5 hover:bg-[rgb(var(--sidebar-hover))] rounded-md text-[rgb(var(--sidebar-muted))] transition-colors"
          aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {isOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>

      <nav className="mt-4 px-3 space-y-0.5 flex-1 overflow-y-auto pb-6">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={[
                "rt-sidebar-nav-item",
                isOpen ? "justify-start gap-3" : "justify-center",
                isActive ? "rt-sidebar-nav-item--active" : "",
              ].join(" ")}
              title={!isOpen ? item.label : undefined}
            >
              <span className="w-5 grid place-items-center shrink-0">
                {item.icon}
              </span>
              {isOpen ? (
                <span className="text-sm font-medium whitespace-nowrap">
                  {item.label}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto w-full px-3 pb-5 space-y-2">
        <div
          className={[
            "rounded-md bg-[rgb(var(--sidebar-hover))] border border-[rgb(var(--sidebar-border))] p-3",
            isOpen ? "" : "hidden",
          ].join(" ")}
        >
          <div className="font-medium text-[rgb(var(--sidebar-text))] truncate text-sm">
            {account?.name || account?.email || "Unknown"}
          </div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--sidebar-muted))] truncate">
            {account?.role || "Employee"}
          </div>
          <div className="mt-1 text-xs text-[rgb(var(--sidebar-muted))] truncate">{account?.designation || "—"}</div>
        </div>
        {isOpen ? (
          <ThemeToggle />
        ) : (
          <div className="grid place-items-center">
            <ThemeToggle compact />
          </div>
        )}

        <button
          onClick={onLogout}
          className={[
            "w-full rounded-md transition-colors font-medium group text-[rgb(var(--sidebar-muted))]",
            isOpen ? "flex items-center justify-start gap-3 px-3 py-2.5" : "flex items-center justify-center p-2.5",
            "hover:text-red-400 hover:bg-[rgb(var(--sidebar-hover))]",
          ].join(" ")}
          title={!isOpen ? "Logout" : undefined}
        >
          <span className="w-5 grid place-items-center shrink-0">
            <LogOut size={18} />
          </span>
          {isOpen ? <span className="text-sm">Logout</span> : null}
        </button>
      </div>
    </aside>
  );
};

function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-6 py-3 border-b border-[rgb(var(--border))] last:border-b-0">
      <div className="text-[10px] font-medium text-[rgb(var(--muted))] uppercase tracking-wider">
        {label}
      </div>
      <div className="text-sm text-[rgb(var(--text))] font-mono text-right break-all">{value}</div>
    </div>
  );
}

function SubmissionStepper({ activeTab, steps, onNavigate }) {
  const list = Array.isArray(steps) ? steps : [];
  return (
    <div className="rt-stepper max-w-4xl mx-auto mb-6">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {list.map((step, idx) => {
          const status = step?.status || "pending";
          const active = activeTab === step.id;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onNavigate?.(step.id)}
              className={[
                "rt-step-chip transition-all",
                active ? "rt-step-chip--active" : "",
                status === "done" ? "rt-step-chip--done" : "",
              ].join(" ")}
              title={String(step?.label || "")}
            >
              <span className="font-mono">{String(idx + 1).padStart(2, "0")}</span>
              <span>{step?.label}</span>
              {status === "done" ? <CheckCircle2 size={13} /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProfileTab({ employee, authEmail }) {
  const display = employee || null;
  const email = authEmail || display?.email || "—";

  return (
    <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="rt-page-header">
        <h2 className="rt-page-title">Profile</h2>
        <p className="rt-page-subtitle">
          If anything looks wrong, please contact support.
        </p>
      </header>

      <section className="rt-panel rounded-[2.5rem] p-6 sm:p-8 shadow-2xl">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Employee Details
            </div>
            <div className="mt-3 text-2xl font-semibold tracking-tight text-[rgb(var(--text))]">
              {display?.name || email}
            </div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-300 font-mono">{display?.id || "—"}</div>
          </div>
          <div className="rt-panel-subtle rounded-lg px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Support
            </div>
            <div className="mt-1 text-sm text-[rgb(var(--text))] font-mono">hr@webknot.in</div>
          </div>
        </div>

        <div className="mt-6">
          <InfoRow label="Email" value={email} />
          <InfoRow label="Role" value={display?.role || "Employee"} />
          <InfoRow label="Designation" value={display?.designation || "—"} />
          <InfoRow label="Stream" value={display?.stream || "—"} />
          <InfoRow label="Band" value={display?.band || "—"} />
        </div>
      </section>
    </div>
  );
}

function Placeholder({ title, note }) {
  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="rt-page-header">
        <h2 className="rt-page-title">{title}</h2>
        <p className="rt-page-subtitle">{note}</p>
      </header>

      <section className="rt-panel rounded-[2.5rem] p-6 sm:p-8 shadow-2xl">
        <div className="text-[rgb(var(--text))]">
          Coming soon.
        </div>
      </section>
    </div>
  );
}

function SelfReviewEditor({
  aiAgent,
  text,
  setText,
  showFinalSubmit,
  onFinalSubmit,
  canFinalSubmit,
  locked,
}) {
  const [enhancing, setEnhancing] = useState(false);
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
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Self Review
          </div>
          <div className="mt-2 text-sm text-[rgb(var(--muted))]">
            Write your self review. Use AI Enhance only when you want to improve clarity.
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={async () => {
              const controller = new AbortController();
              setEnhancing(true);
              try {
                const enhanced = await enhanceSelfReviewText({
                  agent: aiAgent,
                  text,
                  signal: controller.signal,
                });
                setText(enhanced);
                showToast({ title: "Enhanced", message: "Updated your self review text." });
              } catch (err) {
                showToast({ title: "AI failed", message: err?.message || "Please try again." });
              } finally {
                setEnhancing(false);
              }
            }}
            disabled={locked || enhancing || !String(text || "").trim() || !aiAgent}
            className={[
              "rt-btn-primary transition-all",
              locked || enhancing || !String(text || "").trim() || !aiAgent
                ? "!bg-[rgb(var(--surface-2))] !text-[rgb(var(--muted))] !border-[rgb(var(--border))] cursor-not-allowed"
                : "",
            ].join(" ")}
            title={!aiAgent ? "AI Agent is not configured" : "Enhance text using AI"}
          >
            <Sparkles size={18} /> {enhancing ? "Enhancing…" : "AI Enhance"}
          </button>

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
              disabled={locked || !canFinalSubmit || enhancing}
              className={[
                "rt-btn-primary transition-all",
                locked || !canFinalSubmit || enhancing
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

      {!aiAgent ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
          AI Enhance is not configured. Please contact support/admin.
        </div>
      ) : null}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={locked}
        rows={10}
        className={[
          "rt-input resize-none p-4 text-sm",
          locked ? "opacity-75 cursor-not-allowed" : "focus:border-purple-500",
        ].join(" ")}
        placeholder="Write your self review here..."
      />
      <div className="text-xs text-gray-500">
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
  aiAgent,
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
    <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="rt-page-header">
        <h2 className="rt-page-title">KPIs</h2>
        <p className="rt-page-subtitle">
          Rate yourself from 1.0 to 5.0 (1 decimal allowed). Weightage is out of 100%.
        </p>
      </header>

      {loading ? (
        <div className="rt-panel-subtle rounded-lg p-4 text-sm text-[rgb(var(--muted))]">
          Loading KPIs…
        </div>
      ) : null}
      {!fullyLoaded && (prefetching || loading) ? (
        <div className="rt-panel-subtle rounded-lg p-4 text-sm text-[rgb(var(--muted))]">
          Loading full KPI list for this month…
        </div>
      ) : null}

      <section className="rt-panel rounded-[2.5rem] overflow-hidden shadow-2xl">
        <div className="p-8 flex items-center justify-between gap-4 flex-wrap">
          <div className="rt-section-header">
            <h3 className="rt-section-title">KPI Ratings</h3>
            <p className="rt-section-subtitle">
              Total weightage: <span className="font-mono">{Math.round(totalWeight * 10) / 10}%</span>
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-gray-500 border-t border-b border-[rgb(var(--border))]">
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
                        <div className="text-xs text-gray-500 mt-1">{String(k.stream)}</div>
                      ) : null}
                    </td>
                    <td className="p-6">
                      <span className="font-mono text-purple-200">{weight}%</span>
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
                          locked ? "opacity-75 cursor-not-allowed" : "focus:border-purple-500",
                        ].join(" ")}
                        placeholder="e.g., 4.2"
                      />
                    </td>
                  </tr>
                );
              })}

              {!loading && items.length === 0 ? (
                <tr>
                  <td className="p-10 text-center text-gray-500" colSpan={3}>
                    No KPIs to show.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rt-panel rounded-[2.5rem] p-6 sm:p-8 shadow-2xl">
        <SelfReviewEditor
          aiAgent={aiAgent}
          text={selfReviewText}
          setText={setSelfReviewText}
          showFinalSubmit={false}
          locked={locked}
        />
      </section>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="text-sm text-gray-500">
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
    <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="rt-page-header">
        <h2 className="rt-page-title">Webknot Values</h2>
        <p className="rt-page-subtitle">
          Select the values you feel you demonstrated this cycle.
        </p>
      </header>

      {loading ? (
        <div className="rt-panel-subtle rounded-lg p-4 text-sm text-[rgb(var(--muted))]">
          Loading values…
        </div>
      ) : null}

      <section className="rt-panel rounded-[2.5rem] overflow-hidden shadow-2xl">
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
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-gray-500 border-t border-b border-[rgb(var(--border))]">
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
                return (
                  <tr key={id} className="hover:bg-[rgb(var(--surface-2))] transition-colors">
                    <td className="p-6">
                      <div className="font-bold text-[rgb(var(--text))] tracking-tight">{String(v?.title || id)}</div>
                      <div className="text-[10px] text-gray-500 font-bold uppercase mt-1 font-mono">{id}</div>
                    </td>
                    <td className="p-6">
                      <span
                        className={[
                          "inline-flex text-[10px] font-semibold uppercase px-3 py-1 rounded-lg border",
                          isPillarMissing
                            ? "bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] border-[rgb(var(--border))]"
                            : "bg-blue-500/10 text-blue-400 border-blue-500/20",
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
                            locked ? "opacity-75 cursor-not-allowed" : "focus:border-purple-500",
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
                  <td className="p-10 text-center text-gray-500" colSpan={3}>
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
    <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="rt-page-header">
        <h2 className="rt-page-title">Certifications</h2>
        <p className="rt-page-subtitle">
          Certifications listed by Admin appear here. If something looks wrong, please contact support.
        </p>
      </header>

      {loading ? (
        <div className="rt-panel-subtle rounded-lg p-4 text-sm text-[rgb(var(--muted))]">
          Loading certifications…
        </div>
      ) : null}

      <section className="rt-panel rounded-[2.5rem] overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-gray-500 border-t border-b border-[rgb(var(--border))]">
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
                    <div className="text-xs text-gray-500 mt-1">
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
                        className="h-4 w-4 accent-purple-500"
                      />
                    </label>
                  </td>
                </tr>
              )})}

              {sorted.length === 0 ? (
                <tr>
                  <td className="p-10 text-center text-gray-500" colSpan={2}>
                    No certifications to show.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="p-6 border-t border-[rgb(var(--border))] flex items-center justify-between gap-4 flex-wrap">
          <div className="text-sm text-gray-400">
            Selected: <span className="font-mono text-purple-200">{selectedKeySet.size}</span>
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
              <p className="text-gray-500 text-sm mt-1">{proofModal.name}</p>
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
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
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
                    locked ? "opacity-75 cursor-not-allowed" : "focus:border-purple-500",
                  ].join(" ")}
                  placeholder="Paste certificate URL / credential ID"
                />
                <div className="mt-2 text-xs text-gray-500">
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
    <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="rt-page-header">
        <h2 className="rt-page-title">Recognitions</h2>
        <p className="rt-page-subtitle">
          Report the number of awards received at All Hands.
        </p>
      </header>

      <section className="rt-panel rounded-[2.5rem] p-6 sm:p-8 shadow-2xl">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
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
              locked ? "opacity-75 cursor-not-allowed" : "focus:border-purple-500",
            ].join(" ")}
          />
          <div className="text-sm text-gray-400">
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
    <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="rt-page-header">
        <div>
          <h2 className="rt-page-title">Review</h2>
          <p className="rt-page-subtitle">
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

      <section className="rt-panel rounded-[2.5rem] p-6 sm:p-8 shadow-2xl space-y-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Employee
        </div>
        <div className="text-sm text-[rgb(var(--text))]">
          {employee?.name || authEmail || "Unknown"}{" "}
          <span className="text-gray-500 font-mono">({employee?.id || "—"})</span>
        </div>
        <div className="text-xs text-gray-500 font-mono">{authEmail || "—"} • {role}</div>
      </section>

      <section className="rt-panel rounded-[2.5rem] p-6 sm:p-8 shadow-2xl space-y-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          KPI Ratings
        </div>
        {Array.isArray(kpis) && kpis.length ? (
          <div className="space-y-2">
            {kpis.map((k) => (
              <div key={k.id} className="flex items-center justify-between gap-4">
                <div className="text-sm text-[rgb(var(--text))]">{k.title}</div>
                <div className="text-sm font-mono text-purple-200">
                  {String(kpiRatings?.[k.id] ?? "—")}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500">No KPIs.</div>
        )}
      </section>

      <section className="rt-panel rounded-[2.5rem] p-6 sm:p-8 shadow-2xl space-y-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Self Review
        </div>
        <div className="text-sm text-[rgb(var(--text))] whitespace-pre-wrap">{String(selfReviewText || "")}</div>
      </section>

      <section className="rt-panel rounded-[2.5rem] p-6 sm:p-8 shadow-2xl space-y-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Webknot Values
        </div>
        {valueRatings.length ? (
          <div className="space-y-2">
            {valueRatings.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-4">
                <div className="text-sm text-[rgb(var(--text))]">{row.title}</div>
                <div className="text-sm font-mono text-purple-200">{row.rating.toFixed(1)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500">No value ratings.</div>
        )}
      </section>

      <section className="rt-panel rounded-[2.5rem] p-6 sm:p-8 shadow-2xl space-y-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Certifications
        </div>
        {Array.isArray(selectedCertifications) && selectedCertifications.length ? (
          <div className="space-y-2">
            {selectedCertifications.map((c) => (
              <div key={String(c?.name || "")} className="flex items-start justify-between gap-4">
                <div className="text-sm text-[rgb(var(--text))]">{String(c?.name || "")}</div>
                <div className="text-xs text-gray-500 font-mono break-all">{String(c?.proof || "")}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500">None selected.</div>
        )}
      </section>

      <section className="rt-panel rounded-[2.5rem] p-6 sm:p-8 shadow-2xl space-y-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Recognitions
        </div>
        <div className="text-sm text-[rgb(var(--text))]">
          Awards received at All Hands: <span className="font-mono text-purple-200">{Number(recognitionsCount || 0)}</span>
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
          onClick={async () => {
            if (locked) return;
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
              : "",
          ].join(" ")}
          title={locked ? "This month's review is locked" : (!canFinalSubmit ? "Complete required fields first" : "Final submit")}
        >
          <CheckCircle2 size={18} /> Final submit
        </button>
      </div>

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
        <div className="rt-panel relative overflow-hidden rounded-lg mb-8">
          <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, #3b82f6 0, transparent 55%), radial-gradient(circle at 90% 30%, #22c55e 0, transparent 60%)" }} />
          <div className="relative p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-200">
                  <CheckCircle2 size={14} /> Submitted
                </div>
                <h1 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-[rgb(var(--text))]">
                  {monthLabel} — Submission Review
                </h1>
                <p className="mt-1.5 text-sm text-[rgb(var(--muted))]">
                  {employee?.name || authEmail || "—"} &middot; Submitted {submittedLabel}
                </p>
              </div>
              {typeof onLogout === "function" ? (
                <button type="button" onClick={onLogout} className="rt-btn-ghost" title="Logout">
                  <LogOut size={15} /> Logout
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* ── Side-by-side content ── */}
        <div className={`grid grid-cols-1 ${hasManagerData ? "lg:grid-cols-2" : ""} gap-6`}>

          {/* ═══ LEFT: Employee Self Review ═══ */}
          <div className="space-y-5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--primary))]">
              Your Self Review
            </div>

            {/* Self Review Text */}
            <div className="rt-panel-subtle rounded-lg p-5 space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Self Review</div>
              <div className="text-sm text-[rgb(var(--text))] whitespace-pre-wrap">{String(selfReviewText || "—")}</div>
            </div>

            {/* Employee KPI Ratings */}
            <div className="rt-panel-subtle rounded-lg p-5 space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Your KPI Ratings</div>
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
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Your Value Ratings</div>
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
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Certifications</div>
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
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Recognitions</div>
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
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Manager Comments</div>
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
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Manager KPI Ratings</div>
                {Object.entries(mgrKpiRatings).length ? (
                  <div className="space-y-1.5">
                    {Array.isArray(kpis) && kpis.length ? (
                      kpis.map((k) => {
                        const mgrRating = mgrKpiRatings[k.id];
                        return (
                          <div key={k.id} className="flex items-center justify-between gap-3">
                            <span className="text-sm text-[rgb(var(--text))] truncate">{k.title}</span>
                            <span className="font-mono text-sm">{mgrRating != null ? String(mgrRating) : "—"}</span>
                          </div>
                        );
                      })
                    ) : (
                      Object.entries(mgrKpiRatings).map(([kpiId, rating]) => (
                        <div key={kpiId} className="flex items-center justify-between gap-3">
                          <span className="text-sm text-[rgb(var(--text))] truncate">{kpiId}</span>
                          <span className="font-mono text-sm">{String(rating)}</span>
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
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Manager Value Ratings</div>
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
        </div>

        {/* ── Need correction info ── */}
        <div className="mt-8 rounded-lg border border-amber-400/40 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10 p-5">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-200">
            <ShieldAlert size={14} /> Need Corrections?
          </div>
          <div className="mt-2 text-sm text-amber-800 dark:text-amber-100">
            If you find any mistake in your response, contact HR at <span className="font-mono">hr@webknot.in</span> to request reopening.
          </div>
        </div>
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
  const EMP_VALID_TABS = useMemo(() => new Set(["profile", "kpis", "values", "certifications", "recognitions", "review"]), []);

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
  const [aiAgent, setAiAgent] = useState(null);
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
  const [recognitionsCount, setRecognitionsCount] = useState(0);

  // Route all error states through toast
  useEffect(() => { if (portalBootstrapError) showToast({ title: "Portal Error", message: portalBootstrapError, tone: "error" }); }, [portalBootstrapError, showToast]);
  useEffect(() => { if (error) showToast({ title: "Profile Error", message: error, tone: "error" }); }, [error, showToast]);
  useEffect(() => { if (kpisError) showToast({ title: "KPI Error", message: kpisError, tone: "error" }); }, [kpisError, showToast]);
  useEffect(() => { if (valuesError) showToast({ title: "Values Error", message: valuesError, tone: "error" }); }, [valuesError, showToast]);
  useEffect(() => { if (certificationsError) showToast({ title: "Certifications Error", message: certificationsError, tone: "error" }); }, [certificationsError, showToast]);
  useEffect(() => { if (draftSaveError) showToast({ title: "Draft Save Failed", message: draftSaveError, tone: "error" }); }, [draftSaveError, showToast]);

  const authEmail = String(auth?.email || auth?.claims?.sub || "").trim();
  const role = String(auth?.role || auth?.claims?.role || "").trim() || "Employee";
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
        if (!mounted) return;
        const data = await fetchActiveAiAgent({ signal: controller.signal });
        const provider = String(data?.provider || "").trim();
        setAiAgent(isAiEnhancementConfigured(data) ? { provider: provider || "openai" } : null);
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!mounted) return;
        setAiAgent(null);
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
          setEmployee((prev) => (prev?.name || prev?.email ? prev : normalized));
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

  useEffect(() => {
    if (!String(submissionMonth || "").trim()) return;
    if (hydratingSubmission) return;
    if (locked) return;
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
        status: normalized?.status ?? submissionMeta?.status ?? null,
        submissionType: normalized?.submissionType ?? "EMPLOYEE_MONTHLY_SUBMISSION",
        cycleKey: normalized?.cycleKey ?? buildCycleMeta(submissionMonth).cycleKey,
        cycleLabel: normalized?.cycleLabel ?? buildCycleMeta(submissionMonth).cycleLabel,
        reviewStatus: normalized?.reviewStatus ?? "SUBMITTED",
        managerReview: normalized?.managerReview ?? null,
        managerEvaluation: normalized?.managerEvaluation ?? null,
        managerSubmittedAt: normalized?.managerSubmittedAt ?? null,
        adminReview: normalized?.adminReview ?? null,
        adminSubmittedAt: normalized?.adminSubmittedAt ?? null,
        reopenedForResubmission: Boolean(normalized?.reopenedForResubmission),
        resubmissionRequested: Boolean(normalized?.resubmissionRequested),
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
        setEmployee(normalizeEmployeeFromMe(me, { fallbackEmail: authEmail, fallbackRole: role }));
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

  const account = useMemo(() => {
    const name = employee?.name || String(auth?.employeeName || "").trim() || authEmail || "Unknown";
    const designation =
      employee?.designation || String(auth?.designation || "").trim() || null;
    return { name, email: authEmail, role, designation };
  }, [auth?.designation, auth?.employeeName, authEmail, employee?.designation, employee?.name, role]);

  const needsResubmission = useMemo(
    () => Boolean(isResubmissionRequested(submissionMeta)),
    [submissionMeta]
  );

  const latestReviewComment = useMemo(() => {
    const manager = String(submissionMeta?.managerReview?.comments || "").trim();
    const admin = String(submissionMeta?.adminReview?.comments || "").trim();
    return admin || manager || "";
  }, [submissionMeta?.adminReview?.comments, submissionMeta?.managerReview?.comments]);

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
    if (activeTab === "profile") {
      return (
        <>
          {loading ? (
            <div className="max-w-4xl mx-auto mb-6 rt-panel-subtle rounded-lg p-4 text-sm text-[rgb(var(--muted))]">
              Loading profile…
            </div>
          ) : null}
          <ProfileTab employee={employee} authEmail={authEmail} />
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
          aiAgent={aiAgent}
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
      />
    );
  }

  return (
    <>
    {/* ─── Cycle label (outside rt-shell to avoid overflow:hidden breaking fixed) ─── */}
    <div className="fixed right-4 top-4 z-[65] flex items-center gap-3 md:right-6 md:top-5">
      <span className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))]/60 bg-[rgb(var(--surface))]/80 backdrop-blur-md px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--muted))] shadow-sm">
        <Calendar size={14} />
        {cycleInfo?.label || "—"}
      </span>
    </div>

    <div className="rt-shell flex min-h-screen text-[rgb(var(--text))] font-sans overflow-x-hidden">
      {isSidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-label="Close sidebar"
        />
      ) : null}

      <button
        type="button"
        className="fixed left-4 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))] shadow-lg md:hidden"
        onClick={() => setIsSidebarOpen((prev) => !prev)}
        aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
      >
        {isSidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
      </button>

      <Sidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={onLogout}
        account={account}
      />

      <main className={`relative flex-1 transition-all duration-300 ${isSidebarOpen ? "md:ml-64" : "md:ml-[72px]"} p-4 pt-20 md:pt-6 lg:p-8`}>
        <div className="max-w-4xl mx-auto mb-6 rt-page-header">
          <div className="rt-kicker">Employee Portal</div>
          <h1 className="rt-page-title">Monthly Performance Workspace</h1>
          <p className="rt-page-subtitle">
            Complete each step, then submit your final review for manager evaluation.
          </p>
        </div>

        {!locked && needsResubmission ? (
          <div className="max-w-4xl mx-auto mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
            Changes requested on your submission. Please update and resubmit this month.
            {latestReviewComment ? (
              <div className="mt-2 text-xs font-mono text-amber-900 dark:text-amber-100 break-words">
                Feedback: {latestReviewComment}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="max-w-4xl mx-auto mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Month
            </div>
            <select
              value={submissionMonth}
              onChange={(e) => {
                const next = normalizeYearMonth(e.target.value);
                if (!next) return;
                setSubmissionMonth(next);
              }}
              className="rt-input py-3 px-4 text-sm"
              aria-label="Select submission month"
              title="Select submission month"
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

          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Draft
            </div>
            <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              {locked
                ? "Locked"
                : hydratingSubmission
                ? "Loading…"
                : draftSaving
                  ? "Saving…"
                  : draftSaveError
                    ? "Not saved"
                    : "Saved"}
            </div>
          </div>
        </div>

        <SubmissionStepper activeTab={activeTab} steps={stepItems} onNavigate={goToTab} />

        {main}
      </main>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
    </>
  );
}
