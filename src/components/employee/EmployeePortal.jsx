import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  UserCircle2,
  Award,
  Sparkles,
  CheckCircle2,
  ClipboardCheck,
  Target,
  X,
} from "lucide-react";
import Toast from "../shared/Toast.jsx";
import ThemeToggle from "../shared/ThemeToggle.jsx";

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
import { getAppSettings } from "../../utils/appSettings.js";

const AI_AGENTS_STORAGE_KEY = "rt_tracking_ai_agents_v1";
const AI_AGENTS_LEGACY_KEY = "rt_tracking_ai_agents_config_v1";

const DEFAULT_PAGE_LIMIT = 10;

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

function preventWheelInputChange(e) {
  e.currentTarget.blur();
}

function normalizeFilterKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isWildcardValue(key) {
  return key === "" || key === "*" || key === "all" || key === "any";
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
  const empBand = normalizeFilterKey(employee?.band);
  const empStream = normalizeFilterKey(employee?.stream);

  // If employee metadata is missing, do not filter out KPIs.
  if (!empBand && !empStream) return true;

  const kpiBand = normalizeFilterKey(kpi?.band);
  const kpiStream = normalizeFilterKey(kpi?.stream);

  const bandOk = isWildcardValue(kpiBand) || !empBand || kpiBand === empBand;

  // Treat "general" as a wildcard stream so global KPIs still show up.
  const streamOk =
    isWildcardValue(kpiStream) ||
    kpiStream === "general" ||
    !empStream ||
    kpiStream === empStream;

  return bandOk && streamOk;
}

function tryParseJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function loadFirstAIAgent() {
  if (typeof window === "undefined") return null;

  const parsed = tryParseJson(window.localStorage.getItem(AI_AGENTS_STORAGE_KEY));
  if (Array.isArray(parsed) && parsed.length) {
    const first = parsed[0];
    const provider = String(first?.provider ?? "").trim() || "openai";
    const apiKey = String(first?.apiKey ?? "").trim();
    if (!apiKey) return null;
    return { provider, apiKey };
  }

  // Backward-compat: old single config.
  const legacy = tryParseJson(window.localStorage.getItem(AI_AGENTS_LEGACY_KEY));
  if (!legacy || typeof legacy !== "object") return null;
  const provider = String(legacy?.provider ?? "").trim() || "openai";
  const apiKey = String(legacy?.apiKey ?? "").trim();
  if (!apiKey) return null;
  return { provider, apiKey };
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
}) {
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

  return {
    month: String(month || "").trim() || null,
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

async function enhanceSelfReviewText({ agent, text, signal }) {
  const provider = String(agent?.provider || "").trim().toLowerCase() || "openai";
  const apiKey = String(agent?.apiKey || "").trim();
  const input = String(text || "").trim();
  if (!apiKey) throw new Error("AI agent is not configured.");
  if (!input) throw new Error("Write your self review first.");

  if (provider !== "openai") {
    throw new Error(`Provider "${provider}" is not wired yet.`);
  }

  // Note: This calls OpenAI directly from the browser using the locally stored key.
  // We will move this server-side later.
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "You improve writing quality. Keep the meaning, do not invent facts. Make it concise, professional, and structured with short bullets when helpful.",
        },
        {
          role: "user",
          content: `Enhance this self review text:\n\n${input}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `AI request failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json().catch(() => ({}));
  const enhanced = String(data?.choices?.[0]?.message?.content ?? "").trim();
  if (!enhanced) throw new Error("AI returned an empty response.");
  return enhanced;
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
        "fixed left-0 top-0 h-full bg-[rgb(var(--surface))] border-r border-[rgb(var(--border))] transition-all duration-300 z-50",
        "flex flex-col",
        "md:translate-x-0",
        isOpen ? "translate-x-0 w-64" : "-translate-x-full md:translate-x-0 md:w-20",
      ].join(" ")}
    >
      <div className="p-6 flex items-center justify-between">
        {isOpen ? (
          <div className="flex items-center gap-2">
            <img
              src="/unnamed.webp"
              alt="Webknot Technologies logo"
              className="h-8 w-8 rounded-lg object-cover border border-[rgb(var(--border))] bg-white"
            />
            <span className="font-black tracking-tighter uppercase text-[rgb(var(--text))]">
              Webknot
            </span>
          </div>
        ) : null}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 hover:bg-[rgb(var(--surface-2))] rounded-lg text-slate-500 transition-colors"
          aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {isOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
      </div>

      <nav className="mt-10 px-3 space-y-2 flex-1 overflow-y-auto pb-6">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={[
                "w-full rounded-2xl transition-all duration-200",
                "px-4 py-4",
                isOpen ? "flex items-center justify-start gap-4" : "flex items-center justify-center",
                isActive
                  ? "bg-purple-600 text-white shadow-xl shadow-purple-900/20"
                  : "text-slate-500 hover:bg-[rgb(var(--surface-2))] hover:text-[rgb(var(--text))]",
              ].join(" ")}
              title={!isOpen ? item.label : undefined}
            >
              <span className="w-6 grid place-items-center shrink-0">{item.icon}</span>
              {isOpen ? (
                <span className="text-sm font-bold tracking-tight whitespace-nowrap">
                  {item.label}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto w-full px-3 pb-6 space-y-3">
        <div
          className={[
            "rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-3 text-[rgb(var(--text))]",
            isOpen ? "" : "hidden",
          ].join(" ")}
        >
          <div className="font-bold tracking-tight text-[rgb(var(--text))] truncate">
            {account?.name || account?.email || "Unknown"}
          </div>
          <div className="mt-1 text-xs text-purple-300 truncate">
            {account?.designation || "—"}
          </div>
          <div className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
            Role
          </div>
          <div className="mt-1 text-xs text-[rgb(var(--text))]">{account?.role || "Employee"}</div>
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
            "w-full rounded-xl transition-all font-bold group",
            isOpen ? "flex items-center justify-start gap-4 p-3" : "flex items-center justify-center p-3",
            "hover:bg-red-500/10",
          ].join(" ")}
          title={!isOpen ? "Logout" : undefined}
        >
          <span className="w-6 grid place-items-center shrink-0">
            <LogOut size={20} className="group-hover:translate-x-1 transition-transform" />
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
      <div className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
        {label}
      </div>
      <div className="text-sm text-[rgb(var(--text))] font-mono text-right break-all">{value}</div>
    </div>
  );
}

function ProfileTab({ employee, authEmail }) {
  const display = employee || null;
  const email = authEmail || display?.email || "—";

  return (
    <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header>
        <h2 className="text-3xl font-black uppercase tracking-tighter italic">Profile</h2>
        <p className="text-gray-500 text-sm mt-2">
          If anything looks wrong, please contact support.
        </p>
      </header>

      <section className="rt-panel rounded-[2.5rem] p-6 sm:p-8 shadow-2xl">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
              Employee Details
            </div>
            <div className="mt-3 text-2xl font-black tracking-tight text-[rgb(var(--text))]">
              {display?.name || email}
            </div>
            <div className="mt-1 text-sm text-purple-300 font-mono">{display?.id || "—"}</div>
          </div>
          <div className="rt-panel-subtle rounded-2xl px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
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
      <header>
        <h2 className="text-3xl font-black uppercase tracking-tighter italic">{title}</h2>
        <p className="text-gray-500 text-sm mt-2">{note}</p>
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
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
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
              "inline-flex items-center gap-2 rounded-2xl px-6 py-3 font-black text-xs uppercase tracking-widest transition-all",
              locked || enhancing || !String(text || "").trim() || !aiAgent
                ? "bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] border border-[rgb(var(--border))] cursor-not-allowed"
                : "bg-purple-600 text-white hover:bg-purple-500 shadow-xl shadow-purple-900/20",
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
                "inline-flex items-center gap-2 rounded-2xl px-6 py-3 font-black text-xs uppercase tracking-widest transition-all",
                locked || !canFinalSubmit || enhancing
                  ? "bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] border border-[rgb(var(--border))] cursor-not-allowed"
                  : "bg-emerald-500 text-black hover:bg-emerald-400 shadow-xl shadow-emerald-900/20",
              ].join(" ")}
              title={locked ? "This month's review is locked" : (!canFinalSubmit ? "Complete required fields first" : "Submit your self review")}
            >
              <CheckCircle2 size={18} /> Final submit
            </button>
          ) : null}
        </div>
      </div>

      {!aiAgent ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
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
      <header>
        <h2 className="text-3xl font-black uppercase tracking-tighter italic">KPIs</h2>
        <p className="text-gray-500 text-sm mt-2">
          Rate yourself from 1.0 to 5.0 (1 decimal allowed). Weightage is out of 100%.
        </p>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
          Failed to load KPIs: <span className="font-mono">{error}</span>
        </div>
      ) : null}

      {loading ? (
        <div className="rt-panel-subtle rounded-2xl p-4 text-sm text-[rgb(var(--muted))]">
          Loading KPIs…
        </div>
      ) : null}
      {!fullyLoaded && (prefetching || loading) ? (
        <div className="rt-panel-subtle rounded-2xl p-4 text-sm text-[rgb(var(--muted))]">
          Loading full KPI list for this month…
        </div>
      ) : null}

      <section className="rt-panel rounded-[2.5rem] overflow-hidden shadow-2xl">
        <div className="p-8 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-xl font-black uppercase tracking-tight">KPI Ratings</h3>
            <p className="text-gray-500 text-sm mt-1">
              Total weightage: <span className="font-mono">{Math.round(totalWeight * 10) / 10}%</span>
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-[0.2em] text-gray-500 border-t border-b border-[rgb(var(--border))]">
              <tr>
                <th className="p-6 font-black">KPI</th>
                <th className="p-6 font-black">Weightage</th>
                <th className="p-6 font-black">Your Rating (1-5)</th>
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
                            // Keep 1 decimal.
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
              "inline-flex items-center gap-2 rounded-2xl px-6 py-3 font-black text-xs uppercase tracking-widest transition-all",
              proceedDisabled
                ? "bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] border border-[rgb(var(--border))] cursor-not-allowed"
                : "bg-purple-600 text-white hover:bg-purple-500 shadow-xl shadow-purple-900/20",
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
      <header>
        <h2 className="text-3xl font-black uppercase tracking-tighter italic">Webknot Values</h2>
        <p className="text-gray-500 text-sm mt-2">
          Select the values you feel you demonstrated this cycle.
        </p>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
          Failed to load values: <span className="font-mono">{error}</span>
        </div>
      ) : null}
      {loading ? (
        <div className="rt-panel-subtle rounded-2xl p-4 text-sm text-[rgb(var(--muted))]">
          Loading values…
        </div>
      ) : null}

      <section className="rt-panel rounded-[2.5rem] overflow-hidden shadow-2xl">
        <div className="p-8 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-xl font-black uppercase tracking-tight">Values</h3>
            <p className="text-gray-500 text-sm mt-1">
              Rated: <span className="font-mono">{ratedCount}</span> / {list.length}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-[0.2em] text-gray-500 border-t border-b border-[rgb(var(--border))]">
              <tr>
                <th className="p-6 font-black">Value</th>
                <th className="p-6 font-black">Evaluation Criteria</th>
                <th className="p-6 font-black">Your Rating (1-5)</th>
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
                          "inline-flex text-[10px] font-black uppercase px-3 py-1 rounded-lg border",
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
        <button
          type="button"
          onClick={onProceed}
          className="inline-flex items-center gap-2 rounded-2xl bg-purple-600 text-white px-6 py-3 font-black text-xs uppercase tracking-widest hover:bg-purple-500 shadow-xl shadow-purple-900/20 transition-all"
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
      <header>
        <h2 className="text-3xl font-black uppercase tracking-tighter italic">Certifications</h2>
        <p className="text-gray-500 text-sm mt-2">
          Certifications listed by Admin appear here. If something looks wrong, please contact support.
        </p>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
          Failed to load certifications: <span className="font-mono">{error}</span>
        </div>
      ) : null}

      {loading ? (
        <div className="rt-panel-subtle rounded-2xl p-4 text-sm text-[rgb(var(--muted))]">
          Loading certifications…
        </div>
      ) : null}

      <section className="rt-panel rounded-[2.5rem] overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-[0.2em] text-gray-500 border-t border-b border-[rgb(var(--border))]">
              <tr>
                <th className="p-6 font-black">Certification</th>
                <th className="p-6 font-black">Completed</th>
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

                          // Uncheck removes it + its proof.
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
            <button
              type="button"
              onClick={onProceed}
              className={[
                "inline-flex items-center gap-2 rounded-2xl px-6 py-3 font-black text-xs uppercase tracking-widest transition-all",
                "bg-purple-600 text-white hover:bg-purple-500 shadow-xl shadow-purple-900/20",
              ].join(" ")}
            >
              Proceed
            </button>
          </div>
        </div>
      </section>

      {proofModal.open ? (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 z-[60] overflow-y-auto">
          <div className="w-full max-w-lg rt-panel rounded-3xl p-4 sm:p-6 my-4 sm:my-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black uppercase tracking-tight">Proof of Certification</h3>
                <p className="text-gray-500 text-sm mt-1">{proofModal.name}</p>
              </div>
              <button
                onClick={closeProofModal}
                  className="p-2 rounded-xl hover:bg-[rgb(var(--surface-2))]"
                aria-label="Close"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {proofError ? (
              <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
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
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
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
                  className="rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest border border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-2))] transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={locked}
                  className={[
                    "rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest transition-all",
                    locked ? "bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] border border-[rgb(var(--border))] cursor-not-allowed" : "bg-purple-600 text-white hover:bg-purple-500",
                  ].join(" ")}
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RecognitionsTab({ recognitionsCount, setRecognitionsCount, onProceed, locked }) {
  return (
    <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header>
        <h2 className="text-3xl font-black uppercase tracking-tighter italic">Recognitions</h2>
        <p className="text-gray-500 text-sm mt-2">
          Report the number of awards received at All Hands.
        </p>
      </header>

      <section className="rt-panel rounded-[2.5rem] p-6 sm:p-8 shadow-2xl">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
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
          <button
            type="button"
            onClick={onProceed}
            className="inline-flex items-center gap-2 rounded-2xl bg-purple-600 text-white px-6 py-3 font-black text-xs uppercase tracking-widest hover:bg-purple-500 shadow-xl shadow-purple-900/20 transition-all"
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

  return (
    <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header>
        <div>
          <h2 className="text-3xl font-black uppercase tracking-tighter italic">Review</h2>
          <p className="text-gray-500 text-sm mt-2">
            Review everything before final submit.
          </p>
        </div>
      </header>

      <section className="rt-panel rounded-[2.5rem] p-6 sm:p-8 shadow-2xl space-y-4">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
          Employee
        </div>
        <div className="text-sm text-[rgb(var(--text))]">
          {employee?.name || authEmail || "Unknown"}{" "}
          <span className="text-gray-500 font-mono">({employee?.id || "—"})</span>
        </div>
        <div className="text-xs text-gray-500 font-mono">{authEmail || "—"} • {role}</div>
      </section>

      <section className="rt-panel rounded-[2.5rem] p-6 sm:p-8 shadow-2xl space-y-3">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
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
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
          Self Review
        </div>
        <div className="text-sm text-[rgb(var(--text))] whitespace-pre-wrap">{String(selfReviewText || "")}</div>
      </section>

      <section className="rt-panel rounded-[2.5rem] p-6 sm:p-8 shadow-2xl space-y-3">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
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
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
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
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
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
          className="inline-flex items-center gap-2 rounded-2xl px-6 py-3 font-black text-xs uppercase tracking-widest border border-[rgb(var(--border))] text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-2))] transition-all"
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
            "inline-flex items-center gap-2 rounded-2xl px-6 py-3 font-black text-xs uppercase tracking-widest transition-all",
            locked || !canFinalSubmit
              ? "bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] border border-[rgb(var(--border))] cursor-not-allowed"
              : "bg-purple-600 text-white hover:bg-purple-500 shadow-xl shadow-purple-900/20",
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

export default function EmployeePortal({ onLogout, auth }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth >= 1024;
  });
  const [activeTab, setActiveTab] = useState("profile");

  const [employee, setEmployee] = useState(() =>
    normalizeEmployeeFromAuth(auth, {
      fallbackEmail: String(auth?.email || auth?.claims?.sub || "").trim(),
      fallbackRole: String(auth?.role || auth?.claims?.role || "").trim() || "Employee",
    })
  );

  const [portalBootstrapError, setPortalBootstrapError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [certificationCatalog, setCertificationCatalog] = useState([]);
  const [certificationsLoading, setCertificationsLoading] = useState(false);
  const [certificationsError, setCertificationsError] = useState("");
  const [aiAgent, setAiAgent] = useState(() => loadFirstAIAgent());
  const [submissionMonth, setSubmissionMonth] = useState(() => formatYearMonth(new Date()));
  const [hydratingSubmission, setHydratingSubmission] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState("");
  const lastSavedDraftHashRef = useRef("");
  const [submissionMeta, setSubmissionMeta] = useState(null); // { id, month, status, submittedAt, updatedAt }
  const [selfReviewText, setSelfReviewText] = useState("");
  const [selectedCertifications, setSelectedCertifications] = useState([]); // { name, proof }[]
  const [kpis, setKpis] = useState([]); // all loaded KPIs (union)
  const [kpiPage, setKpiPage] = useState({ cursor: null, nextCursor: null, stack: [], items: [] });
  const [kpisFullyLoaded, setKpisFullyLoaded] = useState(false);
  const [kpiPageLoading, setKpiPageLoading] = useState(false);
  const [kpiPrefetching, setKpiPrefetching] = useState(false);
  const [kpisError, setKpisError] = useState("");
  const [kpiRatings, setKpiRatings] = useState({}); // { [kpiId]: number }
  const [valuesIndex, setValuesIndex] = useState({}); // { [id]: { title, pillar } }
  const [valuesPage, setValuesPage] = useState({ cursor: null, nextCursor: null, stack: [], items: [] });
  const [valuesLoading, setValuesLoading] = useState(false);
  const [valuesPageLoading, setValuesPageLoading] = useState(false);
  const [valuesError, setValuesError] = useState("");
  const [selectedValues, setSelectedValues] = useState({}); // { [valueId]: rating }
  const [recognitionsCount, setRecognitionsCount] = useState(0);

  const authEmail = String(auth?.email || auth?.claims?.sub || "").trim();
  const role = String(auth?.role || auth?.claims?.role || "").trim() || "Employee";

  const kpiPrefetchCursorRef = useRef(null);

  const loadKpiPage = useCallback(async ({ cursor, stack }, { signal } = {}) => {
    setKpisError("");
    setKpiPageLoading(true);
    try {
      const data = await fetchEmployeePortalKpiDefinitions({
        limit: DEFAULT_PAGE_LIMIT,
        cursor,
        signal,
      });
      const page = normalizeCursorPage(data);
      const normalized = normalizeKpiDefinitions(page.items);
      setKpiPage({ cursor: cursor || null, nextCursor: page.nextCursor, stack: Array.isArray(stack) ? stack : [], items: normalized });
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
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (err?.status === 401) {
        onLogout?.();
        return;
      }
      setKpisError(err?.message || "Failed to load KPIs.");
    } finally {
      setKpiPageLoading(false);
    }
  }, [onLogout]);

  const loadValuesPage = useCallback(async ({ cursor, stack }, { signal } = {}) => {
    setValuesError("");
    setValuesPageLoading(true);
    try {
      const data = await fetchEmployeePortalWebknotValues({
        limit: getEmployeeValuesPageSize(),
        cursor,
        signal,
      });
      const page = normalizeCursorPage(data);
      let normalized = normalizeWebknotValues(page.items);
      let nextCursor = page.nextCursor;

      if (!hasReadableValueItems(normalized)) {
        const fallbackRaw = await fetchValues(true, { signal });
        normalized = normalizeWebknotValuesList(fallbackRaw).map((v) => ({
          id: String(v?.id || ""),
          title: String(v?.title || v?.id || ""),
          pillar: String(v?.pillar || "—"),
        }));
        nextCursor = null;
      }

      setValuesPage({ cursor: cursor || null, nextCursor, stack: Array.isArray(stack) ? stack : [], items: normalized });
      setValuesIndex((prev) => {
        const next = { ...(prev && typeof prev === "object" ? prev : {}) };
        for (const v of normalized) {
          const id = String(v?.id || "").trim();
          if (!id) continue;
          next[id] = { title: v.title, pillar: v.pillar };
        }
        return next;
      });
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (err?.status === 401) {
        onLogout?.();
        return;
      }
      setValuesError(err?.message || "Failed to load values.");
    } finally {
      setValuesPageLoading(false);
    }
  }, [onLogout]);

  // If the browser duplicates the tab, it may clone in-memory state (including active tab).
  // This resets the UI to the first tab for the duplicated copy.
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
    } catch {
      // ignore storage errors
    }
  }, [onLogout]);

  useEffect(() => {
    function onStorage(e) {
      if (e?.key === AI_AGENTS_STORAGE_KEY || e?.key === AI_AGENTS_LEGACY_KEY) {
        setAiAgent(loadFirstAIAgent());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [onLogout]);

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
    // Intentionally a best-effort call; portal payload shape may vary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onLogout]);

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
    // Load first KPI page on portal init; full list is fetched progressively as the user navigates.
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
  }, [onLogout]);

  useEffect(() => {
    // Prefetch all remaining KPI pages while the user is on the KPI tab so we can enforce "rate all KPIs".
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
  }, [activeTab, kpiPrefetching, kpisFullyLoaded, onLogout]);

  useEffect(() => {
    // Load first Webknot Values page on portal init (for values tab + review labels).
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      setValuesError("");
      setValuesLoading(true);
      try {
        const data = await fetchEmployeePortalWebknotValues({
          limit: getEmployeeValuesPageSize(),
          cursor: null,
          signal: controller.signal,
        });
        const page = normalizeCursorPage(data);
        let normalized = normalizeWebknotValues(page.items);
        let nextCursor = page.nextCursor;

        if (!hasReadableValueItems(normalized)) {
          const fallbackRaw = await fetchValues(true, { signal: controller.signal });
          normalized = normalizeWebknotValuesList(fallbackRaw).map((v) => ({
            id: String(v?.id || ""),
            title: String(v?.title || v?.id || ""),
            pillar: String(v?.pillar || "—"),
          }));
          nextCursor = null;
        }

        if (!mounted) return;
        setValuesPage({ cursor: null, nextCursor, stack: [], items: normalized });
        const idx = {};
        for (const v of normalized) idx[String(v.id)] = { title: v.title, pillar: v.pillar };
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
          });
          lastSavedDraftHashRef.current = payloadHash(cleared);
          return;
        }

        setSubmissionMeta({
          id: normalized.id,
          month: normalized.month || submissionMonth,
          status: normalized.status || null,
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
  }, [onLogout, submissionMonth]);

  const locked = useMemo(
    () => isFinalSubmissionStatus(submissionMeta?.status, submissionMeta),
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

  const visibleKpiPage = useMemo(() => {
    const list = Array.isArray(kpiPage?.items) ? kpiPage.items : [];
    return list.filter((k) => kpiAppliesToEmployee(k, employee));
  }, [employee, kpiPage?.items]);

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

  const main = (() => {
    if (activeTab === "profile") {
      return (
        <>
          {error ? (
            <div className="max-w-4xl mx-auto mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
              Failed to load employee details: <span className="font-mono">{error}</span>
              <div className="mt-2 text-xs text-gray-300">
                If this is unexpected, please contact support: <span className="font-mono">hr@webknot.in</span>
              </div>
            </div>
          ) : null}
          {loading ? (
            <div className="max-w-4xl mx-auto mb-6 rt-panel-subtle rounded-2xl p-4 text-sm text-[rgb(var(--muted))]">
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
          pageKpis={visibleKpiPage}
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
          onProceed={() => setActiveTab("values")}
        />
      );
    }
    if (activeTab === "values") {
      return (
        <ValuesTab
          items={valuesPage.items}
          loading={valuesLoading || valuesPageLoading}
          error={valuesError}
          selectedValues={selectedValues}
          setSelectedValues={setSelectedValues}
          locked={locked}
          onProceed={() => setActiveTab("certifications")}
        />
      );
    }
    if (activeTab === "certifications") {
      return (
        <CertificationsTab
          catalog={certificationCatalog}
          selectedCertifications={selectedCertifications}
          setSelectedCertifications={setSelectedCertifications}
          onProceed={() => setActiveTab("recognitions")}
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
          onProceed={() => setActiveTab("review")}
        />
      );
    }
    if (activeTab === "review") {
      return (
        <ReviewTab
          employee={employee}
          authEmail={authEmail}
          role={role}
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

  return (
    <div className="rt-shell flex min-h-screen bg-[rgb(var(--bg))] text-[rgb(var(--text))] font-sans overflow-x-hidden">
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
        className="fixed left-4 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))] shadow-lg md:hidden"
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

      <main className={`flex-1 transition-all duration-300 ${isSidebarOpen ? "md:ml-64" : "md:ml-20"} p-4 pt-20 md:pt-6 lg:p-12`}>
        {portalBootstrapError ? (
          <div className="max-w-4xl mx-auto mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
            {portalBootstrapError}
          </div>
        ) : null}
        {locked ? (
          <div className="max-w-4xl mx-auto mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            This month's self review is locked (already submitted). No further edits or submissions are allowed.
          </div>
        ) : null}
        <div className="max-w-4xl mx-auto mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
              Month
            </div>
            <input
              type="month"
              value={submissionMonth}
              onWheel={preventWheelInputChange}
              onChange={(e) => {
                const next = String(e.target.value || "").trim();
                if (!next) return;
                setSubmissionMonth(next);
              }}
              className="rt-input py-3 px-4 text-sm"
              aria-label="Select submission month"
              title="Select submission month"
            />
          </div>

          <div className="text-right">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
              Draft
            </div>
            <div className="mt-1 text-xs text-gray-300">
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
            {draftSaveError ? (
              <div className="mt-1 text-[10px] font-mono text-red-300 max-w-[260px] break-words">
                {draftSaveError}
              </div>
            ) : null}
          </div>
        </div>

        {main}
      </main>
    </div>
  );
}
