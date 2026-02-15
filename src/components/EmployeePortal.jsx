import React, { useEffect, useMemo, useState } from "react";
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

import { fetchEmployees, normalizeEmployees } from "../api/employees.js";
import { fetchKpiDefinitions, normalizeKpiDefinitions } from "../api/kpi-definitions.js";

const CERTIFICATION_CATALOG_STORAGE_KEY = "rt_tracking_certification_catalog_v1";
const AI_AGENTS_STORAGE_KEY = "rt_tracking_ai_agents_v1";
const AI_AGENTS_LEGACY_KEY = "rt_tracking_ai_agents_config_v1";
const SUBMISSION_DRAFTS_STORAGE_KEY = "rt_tracking_submission_drafts_v1";
const FINAL_SUBMISSIONS_STORAGE_KEY = "rt_tracking_final_submissions_v1";

const WEBKNOT_VALUES = [
  { id: "VAL_001", title: "Own The Outcome", pillar: "Ownership" },
  { id: "VAL_002", title: "Customers Over Convenience", pillar: "Customer" },
  { id: "VAL_003", title: "Raise The Bar", pillar: "Excellence" },
];

function toPercentNumber(weight) {
  const raw = String(weight ?? "").trim();
  if (!raw) return 0;
  const numText = raw.endsWith("%") ? raw.slice(0, -1).trim() : raw;
  const parsed = Number.parseFloat(numText);
  return Number.isFinite(parsed) ? parsed : 0;
}

function loadAdminCertificationCatalog() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CERTIFICATION_CATALOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [];

    const seenByName = new Set();
    const out = [];
    for (const item of list) {
      const name = String(item?.name ?? item ?? "").trim();
      if (!name) continue;
      const nameKey = name.toLowerCase();
      if (seenByName.has(nameKey)) continue;
      seenByName.add(nameKey);

      const listed = item && typeof item === "object" ? Boolean(item.listed ?? true) : true;
      out.push({ name, listed });
    }

    return out
      .filter((c) => c.listed)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  } catch {
    return [];
  }
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

function loadDraft(email) {
  if (typeof window === "undefined") return null;
  const key = String(email || "").trim().toLowerCase();
  if (!key) return null;
  try {
    const parsed = tryParseJson(window.localStorage.getItem(SUBMISSION_DRAFTS_STORAGE_KEY));
    if (!parsed || typeof parsed !== "object") return null;
    const draft = parsed[key];
    if (!draft || typeof draft !== "object") return null;

    const rawCerts = draft.certifications;
    const certifications = Array.isArray(rawCerts)
      ? rawCerts
          .map((c) => {
            // Backward compat: previously we stored strings.
            if (typeof c === "string") return { name: c, proof: "" };
            if (!c || typeof c !== "object") return null;
            return { name: String(c.name || ""), proof: String(c.proof || "") };
          })
          .filter((c) => c && String(c.name || "").trim())
      : [];

    return {
      selfReviewText: String(draft.selfReviewText || ""),
      certifications,
      kpiRatings: draft.kpiRatings && typeof draft.kpiRatings === "object" ? draft.kpiRatings : {},
      webknotValues: Array.isArray(draft.webknotValues) ? draft.webknotValues : [],
      recognitionsCount:
        typeof draft.recognitionsCount === "number" && Number.isFinite(draft.recognitionsCount)
          ? draft.recognitionsCount
          : 0,
      updatedAt: typeof draft.updatedAt === "number" ? draft.updatedAt : null,
    };
  } catch {
    return null;
  }
}

function saveDraft(email, draft) {
  if (typeof window === "undefined") return;
  const key = String(email || "").trim().toLowerCase();
  if (!key) return;
  try {
    const parsed = tryParseJson(window.localStorage.getItem(SUBMISSION_DRAFTS_STORAGE_KEY));
    const nextRoot = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    nextRoot[key] = {
      selfReviewText: String(draft?.selfReviewText || ""),
      certifications: Array.isArray(draft?.certifications)
        ? draft.certifications
            .map((c) => {
              if (typeof c === "string") return { name: c, proof: "" };
              if (!c || typeof c !== "object") return null;
              const name = String(c.name || "").trim();
              if (!name) return null;
              return { name, proof: String(c.proof || "") };
            })
            .filter(Boolean)
        : [],
      kpiRatings:
        draft?.kpiRatings && typeof draft.kpiRatings === "object" ? draft.kpiRatings : {},
      webknotValues: Array.isArray(draft?.webknotValues) ? draft.webknotValues : [],
      recognitionsCount:
        typeof draft?.recognitionsCount === "number" && Number.isFinite(draft.recognitionsCount)
          ? draft.recognitionsCount
          : 0,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(SUBMISSION_DRAFTS_STORAGE_KEY, JSON.stringify(nextRoot));
  } catch {
    // ignore
  }
}

function saveFinalSubmission(email, payload) {
  if (typeof window === "undefined") return;
  const key = String(email || "").trim().toLowerCase();
  if (!key) return;
  try {
    const parsed = tryParseJson(window.localStorage.getItem(FINAL_SUBMISSIONS_STORAGE_KEY));
    const nextRoot = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    nextRoot[key] = payload;
    window.localStorage.setItem(FINAL_SUBMISSIONS_STORAGE_KEY, JSON.stringify(nextRoot));
  } catch {
    // ignore
  }
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
        "fixed left-0 top-0 h-full bg-[#111] border-r border-white/5 transition-all duration-300 z-50",
        isOpen ? "w-64" : "w-20",
      ].join(" ")}
    >
      <div className="p-6 flex items-center justify-between">
        {isOpen ? (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-purple-600 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-purple-500/20">
              W
            </div>
            <span className="font-black tracking-tighter uppercase italic text-white">
              Webknot
            </span>
          </div>
        ) : null}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 hover:bg-white/5 rounded-lg text-gray-500 transition-colors"
          aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {isOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
      </div>

      <nav className="mt-10 px-3 space-y-2">
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
                  : "text-gray-500 hover:bg-white/5 hover:text-white",
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

      <div className="absolute bottom-24 w-full px-3">
        <div
          className={[
            "rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-gray-200",
            isOpen ? "" : "hidden",
          ].join(" ")}
        >
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
            Signed In
          </div>
          <div className="mt-2 font-bold tracking-tight text-white truncate">
            {account?.name || account?.email || "Unknown"}
          </div>
          <div className="mt-1 text-xs text-purple-300 truncate">
            {account?.designation || "—"}
          </div>
          <div className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
            Role
          </div>
          <div className="mt-1 text-xs text-gray-200">{account?.role || "Employee"}</div>
        </div>
      </div>

      <div className="absolute bottom-8 w-full px-3 text-red-500">
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
    <div className="flex items-start justify-between gap-6 py-3 border-b border-white/5 last:border-b-0">
      <div className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
        {label}
      </div>
      <div className="text-sm text-gray-200 font-mono text-right break-all">{value}</div>
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

      <section className="bg-[#111] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
              Employee Details
            </div>
            <div className="mt-3 text-2xl font-black tracking-tight text-white">
              {display?.name || email}
            </div>
            <div className="mt-1 text-sm text-purple-300 font-mono">{display?.id || "—"}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
              Support
            </div>
            <div className="mt-1 text-sm text-gray-200 font-mono">hr@webknot.in</div>
          </div>
        </div>

        <div className="mt-6">
          <InfoRow label="Email" value={email} />
          <InfoRow label="Role" value={display?.role || "Employee"} />
          <InfoRow label="Designation" value={display?.designation || "—"} />
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

      <section className="bg-[#111] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl">
        <div className="text-gray-300">
          Coming soon.
        </div>
      </section>
    </div>
  );
}

function SelfReviewEditor({ aiAgent, text, setText, showFinalSubmit, onFinalSubmit, canFinalSubmit }) {
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
          <div className="mt-2 text-sm text-gray-300">
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
            disabled={enhancing || !String(text || "").trim() || !aiAgent}
            className={[
              "inline-flex items-center gap-2 rounded-2xl px-6 py-3 font-black text-xs uppercase tracking-widest transition-all",
              enhancing || !String(text || "").trim() || !aiAgent
                ? "bg-white/5 text-gray-600 border border-white/10 cursor-not-allowed"
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
              disabled={!canFinalSubmit || enhancing}
              className={[
                "inline-flex items-center gap-2 rounded-2xl px-6 py-3 font-black text-xs uppercase tracking-widest transition-all",
                !canFinalSubmit || enhancing
                  ? "bg-white/5 text-gray-600 border border-white/10 cursor-not-allowed"
                  : "bg-emerald-500 text-black hover:bg-emerald-400 shadow-xl shadow-emerald-900/20",
              ].join(" ")}
              title={!canFinalSubmit ? "Complete required fields first" : "Submit your self review"}
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
        rows={10}
        className="w-full bg-[#0c0c0c] border border-white/10 rounded-2xl p-4 text-sm focus:border-purple-500 outline-none transition-all resize-none"
        placeholder="Write your self review here..."
      />
      <div className="text-xs text-gray-500">
        Tip: include accomplishments, impact, collaboration, and next goals.
      </div>

      {toast ? (
        <div className="fixed top-6 right-6 z-[80]">
          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-purple-600 px-4 py-3 shadow-2xl text-white">
            <div className="mt-0.5 text-white">
              <CheckCircle2 size={18} />
            </div>
            <div className="min-w-[220px]">
              <div className="text-sm font-black">{toast.title}</div>
              {toast.message ? (
                <div className="text-xs text-white/90 mt-1">{toast.message}</div>
              ) : null}
            </div>
            <button
              onClick={() => setToast(null)}
              className="ml-2 rounded-xl p-1 text-white/90 hover:bg-white/10 hover:text-white transition"
              aria-label="Dismiss notification"
              title="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KpisTab({
  kpis,
  ratings,
  setRatings,
  onProceed,
  loading,
  error,
  aiAgent,
  selfReviewText,
  setSelfReviewText,
}) {
  const items = Array.isArray(kpis) ? kpis : [];
  const totalWeight = items.reduce((sum, k) => sum + toPercentNumber(k?.weight), 0);
  const allRated = items.length === 0
    ? true
    : items.every((k) => {
        const v = ratings?.[k.id];
        return typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 5;
      });
  const selfReviewOk = Boolean(String(selfReviewText || "").trim());
  const canProceed = allRated && selfReviewOk;

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
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-300">
          Loading KPIs…
        </div>
      ) : null}

      <section className="bg-[#111] border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl">
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
            <thead className="bg-white/[0.02] text-[10px] uppercase tracking-[0.2em] text-gray-500 border-t border-b border-white/5">
              <tr>
                <th className="p-6 font-black">KPI</th>
                <th className="p-6 font-black">Weightage</th>
                <th className="p-6 font-black">Your Rating (1-5)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {items.map((k) => {
                const id = String(k?.id || "");
                const title = String(k?.title || "");
                const weight = toPercentNumber(k?.weight);
                const value = ratings?.[id];
                const display = typeof value === "number" && Number.isFinite(value) ? value : "";
                return (
                  <tr key={id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="p-6">
                      <div className="font-bold text-white tracking-tight">{title || id}</div>
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
                        onChange={(e) => {
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
                        className="w-40 bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all"
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

      <section className="bg-[#111] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl">
        <SelfReviewEditor
          aiAgent={aiAgent}
          text={selfReviewText}
          setText={setSelfReviewText}
          showFinalSubmit={false}
        />
      </section>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="text-sm text-gray-500">
          All KPI ratings and Self Review are required to proceed.
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={onProceed}
            disabled={!canProceed}
            className={[
              "inline-flex items-center gap-2 rounded-2xl px-6 py-3 font-black text-xs uppercase tracking-widest transition-all",
              !canProceed
                ? "bg-white/5 text-gray-600 border border-white/10 cursor-not-allowed"
                : "bg-purple-600 text-white hover:bg-purple-500 shadow-xl shadow-purple-900/20",
            ].join(" ")}
            title={
              !allRated
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

function ValuesTab({ selectedValues, setSelectedValues, onProceed }) {
  const selectedSet = useMemo(() => new Set(Array.isArray(selectedValues) ? selectedValues : []), [selectedValues]);

  return (
    <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header>
        <h2 className="text-3xl font-black uppercase tracking-tighter italic">Webknot Values</h2>
        <p className="text-gray-500 text-sm mt-2">
          Select the values you feel you demonstrated this cycle.
        </p>
      </header>

      <section className="bg-[#111] border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl">
        <div className="p-8 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-xl font-black uppercase tracking-tight">Values</h3>
            <p className="text-gray-500 text-sm mt-1">
              Selected: <span className="font-mono">{selectedSet.size}</span>
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white/[0.02] text-[10px] uppercase tracking-[0.2em] text-gray-500 border-t border-b border-white/5">
              <tr>
                <th className="p-6 font-black">Value</th>
                <th className="p-6 font-black">Pillar</th>
                <th className="p-6 font-black">Selected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {WEBKNOT_VALUES.map((v) => {
                const checked = selectedSet.has(v.id);
                return (
                  <tr key={v.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="p-6">
                      <div className="font-bold text-white tracking-tight">{v.title}</div>
                    </td>
                    <td className="p-6 text-gray-300">{v.pillar}</td>
                    <td className="p-6">
                      <label className="inline-flex items-center gap-3 select-none">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setSelectedValues((prev) => {
                              const list = Array.isArray(prev) ? prev.slice() : [];
                              const next = list.filter((id) => String(id) !== v.id);
                              if (e.target.checked) next.push(v.id);
                              return next;
                            });
                          }}
                          className="h-4 w-4 accent-purple-500"
                        />
                      </label>
                    </td>
                  </tr>
                );
              })}
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

      <section className="bg-[#111] border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white/[0.02] text-[10px] uppercase tracking-[0.2em] text-gray-500 border-t border-b border-white/5">
              <tr>
                <th className="p-6 font-black">Certification</th>
                <th className="p-6 font-black">Completed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sorted.map((c) => {
                const name = String(c?.name || "");
                const key = name.toLowerCase();
                const checked = selectedKeySet.has(key);
                return (
                <tr key={key} className="hover:bg-white/[0.01] transition-colors">
                  <td className="p-6">
                    <div className="font-bold text-white tracking-tight">{name}</div>
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

        <div className="p-6 border-t border-white/5 flex items-center justify-between gap-4 flex-wrap">
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm grid place-items-center p-6 z-[60]">
          <div className="w-full max-w-lg bg-[#111] border border-white/10 rounded-3xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black uppercase tracking-tight">Proof of Certification</h3>
                <p className="text-gray-500 text-sm mt-1">{proofModal.name}</p>
              </div>
              <button
                onClick={closeProofModal}
                className="p-2 rounded-xl hover:bg-white/5"
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
                    setProofDraft(e.target.value);
                    setProofError("");
                  }}
                  className="mt-2 w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all"
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
                  className="rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest border border-white/10 text-gray-200 hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest bg-purple-600 text-white hover:bg-purple-500 transition-all"
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

function RecognitionsTab({ recognitionsCount, setRecognitionsCount, onProceed }) {
  return (
    <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header>
        <h2 className="text-3xl font-black uppercase tracking-tighter italic">Recognitions</h2>
        <p className="text-gray-500 text-sm mt-2">
          Report the number of awards received at All Hands.
        </p>
      </header>

      <section className="bg-[#111] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
          Awards Received
        </div>
        <div className="mt-4 flex items-center gap-4 flex-wrap">
          <input
            type="number"
            min={0}
            step={1}
            value={Number.isFinite(recognitionsCount) ? recognitionsCount : 0}
            onChange={(e) => {
              const parsed = Number.parseInt(String(e.target.value || "0"), 10);
              setRecognitionsCount(Number.isFinite(parsed) && parsed >= 0 ? parsed : 0);
            }}
            className="w-40 bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all"
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
}) {
  const [toast, setToast] = useState(null); // { title, message? }
  const [toastTimerId, setToastTimerId] = useState(null);

  function showToast(nextToast) {
    setToast(nextToast);
    if (toastTimerId) window.clearTimeout(toastTimerId);
    const id = window.setTimeout(() => setToast(null), 2200);
    setToastTimerId(id);
  }

  const valueLabels = useMemo(() => {
    const selectedSet = new Set(Array.isArray(selectedValues) ? selectedValues : []);
    return WEBKNOT_VALUES.filter((v) => selectedSet.has(v.id)).map((v) => v.title);
  }, [selectedValues]);

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

      <section className="bg-[#111] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl space-y-4">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
          Employee
        </div>
        <div className="text-sm text-gray-200">
          {employee?.name || authEmail || "Unknown"}{" "}
          <span className="text-gray-500 font-mono">({employee?.id || "—"})</span>
        </div>
        <div className="text-xs text-gray-500 font-mono">{authEmail || "—"} • {role}</div>
      </section>

      <section className="bg-[#111] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl space-y-3">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
          KPI Ratings
        </div>
        {Array.isArray(kpis) && kpis.length ? (
          <div className="space-y-2">
            {kpis.map((k) => (
              <div key={k.id} className="flex items-center justify-between gap-4">
                <div className="text-sm text-gray-200">{k.title}</div>
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

      <section className="bg-[#111] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl space-y-3">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
          Self Review
        </div>
        <div className="text-sm text-gray-200 whitespace-pre-wrap">{String(selfReviewText || "")}</div>
      </section>

      <section className="bg-[#111] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl space-y-3">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
          Webknot Values
        </div>
        {valueLabels.length ? (
          <div className="flex flex-wrap gap-2">
            {valueLabels.map((t) => (
              <span key={t} className="text-xs px-3 py-1 rounded-full border border-white/10 bg-white/[0.03] text-gray-200">
                {t}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500">None selected.</div>
        )}
      </section>

      <section className="bg-[#111] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl space-y-3">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
          Certifications
        </div>
        {Array.isArray(selectedCertifications) && selectedCertifications.length ? (
          <div className="space-y-2">
            {selectedCertifications.map((c) => (
              <div key={String(c?.name || "")} className="flex items-start justify-between gap-4">
                <div className="text-sm text-gray-200">{String(c?.name || "")}</div>
                <div className="text-xs text-gray-500 font-mono break-all">{String(c?.proof || "")}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500">None selected.</div>
        )}
      </section>

      <section className="bg-[#111] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl space-y-3">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
          Recognitions
        </div>
        <div className="text-sm text-gray-200">
          Awards received at All Hands: <span className="font-mono text-purple-200">{Number(recognitionsCount || 0)}</span>
        </div>
      </section>

      <div className="flex items-center justify-end gap-3 flex-wrap">
        <button
          type="button"
          onClick={onSaveDraft}
          className="inline-flex items-center gap-2 rounded-2xl px-6 py-3 font-black text-xs uppercase tracking-widest border border-white/10 text-gray-200 hover:bg-white/5 transition-all"
        >
          Save draft
        </button>
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
          disabled={!canFinalSubmit}
          className={[
            "inline-flex items-center gap-2 rounded-2xl px-6 py-3 font-black text-xs uppercase tracking-widest transition-all",
            !canFinalSubmit
              ? "bg-white/5 text-gray-600 border border-white/10 cursor-not-allowed"
              : "bg-purple-600 text-white hover:bg-purple-500 shadow-xl shadow-purple-900/20",
          ].join(" ")}
          title={!canFinalSubmit ? "Complete required fields first" : "Final submit"}
        >
          <CheckCircle2 size={18} /> Final submit
        </button>
      </div>

      {toast ? (
        <div className="fixed top-6 right-6 z-[80]">
          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-purple-600 px-4 py-3 shadow-2xl text-white">
            <div className="mt-0.5 text-white">
              <CheckCircle2 size={18} />
            </div>
            <div className="min-w-[220px]">
              <div className="text-sm font-black">{toast.title}</div>
              {toast.message ? (
                <div className="text-xs text-white/90 mt-1">{toast.message}</div>
              ) : null}
            </div>
            <button
              onClick={() => setToast(null)}
              className="ml-2 rounded-xl p-1 text-white/90 hover:bg-white/10 hover:text-white transition"
              aria-label="Dismiss notification"
              title="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function EmployeePortal({ onLogout, auth }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("profile");

  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [adminCertCatalog, setAdminCertCatalog] = useState(() => loadAdminCertificationCatalog());
  const [aiAgent, setAiAgent] = useState(() => loadFirstAIAgent());
  const [selfReviewText, setSelfReviewText] = useState("");
  const [selectedCertifications, setSelectedCertifications] = useState([]); // { name, proof }[]
  const [kpis, setKpis] = useState([]);
  const [kpisLoading, setKpisLoading] = useState(false);
  const [kpisError, setKpisError] = useState("");
  const [kpiRatings, setKpiRatings] = useState({}); // { [kpiId]: number }
  const [selectedValues, setSelectedValues] = useState([]); // string[] (value ids)
  const [recognitionsCount, setRecognitionsCount] = useState(0);
  const [_finalSubmission, setFinalSubmission] = useState(null);

  const authEmail = String(auth?.claims?.sub || "").trim();
  const role = String(auth?.role || auth?.claims?.role || "").trim() || "Employee";

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
  }, []);

  useEffect(() => {
    function onStorage(e) {
      if (e?.key === CERTIFICATION_CATALOG_STORAGE_KEY) {
        setAdminCertCatalog(loadAdminCertificationCatalog());
      }
      if (e?.key === AI_AGENTS_STORAGE_KEY || e?.key === AI_AGENTS_LEGACY_KEY) {
        setAiAgent(loadFirstAIAgent());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    async function run() {
      setKpisError("");
      setKpisLoading(true);
      try {
        const data = await fetchKpiDefinitions({ signal: controller.signal });
        const normalized = normalizeKpiDefinitions(data);
        if (!mounted) return;
        setKpis(normalized);
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!mounted) return;
        // Fallback demo KPIs if backend blocks/403s.
        setKpis([
          { id: "KPI_DEMO_1", title: "Execution & Delivery", stream: "General", band: "", weight: "40%" },
          { id: "KPI_DEMO_2", title: "Quality & Ownership", stream: "General", band: "", weight: "35%" },
          { id: "KPI_DEMO_3", title: "Collaboration", stream: "General", band: "", weight: "25%" },
        ]);
        setKpisError(err?.message || "Failed to load KPIs.");
      } finally {
        if (mounted) setKpisLoading(false);
      }
    }
    run();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const draft = loadDraft(authEmail);
    if (!draft) {
      setSelfReviewText("");
      setSelectedCertifications([]);
      setKpiRatings({});
      setSelectedValues([]);
      setRecognitionsCount(0);
      return;
    }
    setSelfReviewText(draft.selfReviewText || "");
    setSelectedCertifications(Array.isArray(draft.certifications) ? draft.certifications : []);
    setKpiRatings(draft.kpiRatings && typeof draft.kpiRatings === "object" ? draft.kpiRatings : {});
    setSelectedValues(Array.isArray(draft.webknotValues) ? draft.webknotValues : []);
    setRecognitionsCount(
      typeof draft.recognitionsCount === "number" && Number.isFinite(draft.recognitionsCount)
        ? draft.recognitionsCount
        : 0
    );
  }, [authEmail]);

  useEffect(() => {
    if (!authEmail) return;
    saveDraft(authEmail, {
      selfReviewText,
      certifications: selectedCertifications,
      kpiRatings,
      webknotValues: selectedValues,
      recognitionsCount,
    });
  }, [authEmail, kpiRatings, recognitionsCount, selectedCertifications, selectedValues, selfReviewText]);

  function saveDraftNow() {
    if (!authEmail) return;
    saveDraft(authEmail, {
      selfReviewText,
      certifications: selectedCertifications,
      kpiRatings,
      webknotValues: selectedValues,
      recognitionsCount,
    });
  }

  async function finalSubmit() {
    const text = String(selfReviewText || "").trim();
    if (!text) throw new Error("Write your self review first.");

    const kpisOk = kpis.length === 0
      ? true
      : kpis.every((k) => {
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
      employee: employee
        ? {
            id: employee.id,
            name: employee.name,
            email: employee.email,
            role: employee.role,
            designation: employee.designation,
            band: employee.band,
          }
        : {
            id: null,
            name: authEmail || "Unknown",
            email: authEmail || null,
            role,
            designation: null,
            band: null,
          },
      selfReviewText: text,
      certifications: Array.isArray(selectedCertifications) ? selectedCertifications : [],
      kpiRatings: kpiRatings && typeof kpiRatings === "object" ? kpiRatings : {},
      webknotValues: Array.isArray(selectedValues) ? selectedValues : [],
      recognitionsCount: Number.isFinite(recognitionsCount) ? recognitionsCount : 0,
      submittedAt: new Date().toISOString(),
    };

    setFinalSubmission(payload);
    saveFinalSubmission(authEmail, payload);
  }

  const canFinalSubmit = useMemo(() => {
    const textOk = Boolean(String(selfReviewText || "").trim());
    const kpisOk = kpis.length === 0
      ? true
      : kpis.every((k) => {
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
  }, [kpiRatings, kpis, selectedCertifications, selfReviewText]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    async function run() {
      setError("");
      setLoading(true);
      try {
        const data = await fetchEmployees({ signal: controller.signal });
        const employees = normalizeEmployees(data);
        const match = authEmail
          ? employees.find((e) => String(e?.email || "").trim().toLowerCase() === authEmail.toLowerCase())
          : null;
        if (!mounted) return;
        setEmployee(match || null);
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!mounted) return;
        setError(err?.message || "Failed to load profile.");
        setEmployee(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    run();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [authEmail]);

  const account = useMemo(() => {
    const name = employee?.name || authEmail || "Unknown";
    const designation = employee?.designation || null;
    return { name, email: authEmail, role, designation };
  }, [authEmail, employee?.designation, employee?.name, role]);

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
            <div className="max-w-4xl mx-auto mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-300">
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
          kpis={kpis}
          ratings={kpiRatings}
          setRatings={setKpiRatings}
          loading={kpisLoading}
          error={kpisError}
          aiAgent={aiAgent}
          selfReviewText={selfReviewText}
          setSelfReviewText={setSelfReviewText}
          onProceed={() => setActiveTab("values")}
        />
      );
    }
    if (activeTab === "values") {
      return (
        <ValuesTab
          selectedValues={selectedValues}
          setSelectedValues={setSelectedValues}
          onProceed={() => setActiveTab("certifications")}
        />
      );
    }
    if (activeTab === "certifications") {
      return (
        <CertificationsTab
          catalog={adminCertCatalog}
          selectedCertifications={selectedCertifications}
          setSelectedCertifications={setSelectedCertifications}
          onProceed={() => setActiveTab("recognitions")}
        />
      );
    }
    if (activeTab === "recognitions") {
      return (
        <RecognitionsTab
          recognitionsCount={recognitionsCount}
          setRecognitionsCount={setRecognitionsCount}
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
          kpis={kpis}
          kpiRatings={kpiRatings}
          selfReviewText={selfReviewText}
          selectedValues={selectedValues}
          selectedCertifications={selectedCertifications}
          recognitionsCount={recognitionsCount}
          onSaveDraft={saveDraftNow}
          onFinalSubmit={finalSubmit}
          canFinalSubmit={canFinalSubmit}
        />
      );
    }
    return <Placeholder title="Profile" note="Employee profile." />;
  })();

  return (
    <div className="flex min-h-screen bg-[#080808] text-slate-100 font-sans overflow-x-hidden">
      <Sidebar
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={onLogout}
        account={account}
      />

      <main className={`flex-1 transition-all duration-300 ${isSidebarOpen ? "ml-64" : "ml-20"} p-6 lg:p-12`}>
        {main}
      </main>
    </div>
  );
}
