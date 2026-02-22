import React, { useMemo, useRef, useState } from "react";
import { Edit3, Eye, EyeOff, KeyRound, Plug, Plus, Trash2, X } from "lucide-react";
import Toast from "../shared/Toast.jsx";
import ConfirmDialog from "../shared/ConfirmDialog.jsx";

const LEGACY_STORAGE_KEY = "rt_tracking_ai_agents_config_v1";
const STORAGE_KEY = "rt_tracking_ai_agents_v1";

function tryParseJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function loadLegacyConfig() {
  if (typeof window === "undefined") return null;
  try {
    const parsed = tryParseJson(window.localStorage.getItem(LEGACY_STORAGE_KEY));
    if (!parsed || typeof parsed !== "object") return null;
    const provider = String(parsed?.provider ?? "").trim() || "openai";
    const apiKey = String(parsed?.apiKey ?? "").trim();
    if (!apiKey) return null;
    return { provider, apiKey };
  } catch {
    return null;
  }
}

function hashFNV1a32(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function makeAgentId({ provider, apiKey }) {
  const p = String(provider ?? "").trim().toLowerCase();
  const k = String(apiKey ?? "").trim();
  const base = `${p}:${k.slice(-6)}`;
  return `AGENT_${hashFNV1a32(base).toString(36)}`;
}

function normalizeAgents(items) {
  const list = Array.isArray(items) ? items : [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const provider = String(raw?.provider ?? "").trim() || "openai";
    const apiKey = String(raw?.apiKey ?? "").trim();
    if (!apiKey) continue;
    const id = String(raw?.id ?? "").trim() || makeAgentId({ provider, apiKey });
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      provider,
      apiKey,
      createdAt:
        typeof raw?.createdAt === "number" && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
      updatedAt:
        typeof raw?.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : null,
    });
  }
  return out;
}

function loadAgentsFromStorage() {
  if (typeof window === "undefined") return [];

  const stored = tryParseJson(window.localStorage.getItem(STORAGE_KEY));
  if (Array.isArray(stored)) return normalizeAgents(stored);

  // One-time migration from legacy single-config key.
  const legacy = loadLegacyConfig();
  if (!legacy) return [];
  const migrated = normalizeAgents([{ id: makeAgentId(legacy), ...legacy, createdAt: Date.now() }]);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignore
  }
  return migrated;
}

function saveAgentsToStorage(items) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeAgents(items)));
  } catch {
    // ignore
  }
}

function providerLabel(provider) {
  const p = String(provider ?? "").trim();
  if (!p) return "OpenAI";
  const key = p.toLowerCase();
  if (key === "openai") return "OpenAI";
  if (key === "anthropic") return "Anthropic";
  if (key === "google") return "Google (Gemini)";
  if (key === "azure_openai") return "Azure OpenAI";
  if (key === "custom") return "Custom";
  return p;
}

function maskApiKey(apiKey) {
  const key = String(apiKey ?? "");
  const last4 = key.length >= 4 ? key.slice(-4) : key;
  return last4 ? `••••••••${last4}` : "—";
}

export default function AIAgentsConfig() {
  const [agents, setAgents] = useState(() => loadAgentsFromStorage());
  const [query, setQuery] = useState("");

  const [modal, setModal] = useState({ open: false, mode: "add", agentId: null });
  const [draftProvider, setDraftProvider] = useState("openai");
  const [draftApiKey, setDraftApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [pendingDeleteAgent, setPendingDeleteAgent] = useState(null);

  const [toast, setToast] = useState(null); // { title, message? }
  const toastTimerRef = useRef(null);

  function showToast(nextToast) {
    setToast(nextToast);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  }

  const providerOptions = useMemo(
    () => [
      { value: "openai", label: "OpenAI" },
      { value: "anthropic", label: "Anthropic" },
      { value: "google", label: "Google (Gemini)" },
      { value: "azure_openai", label: "Azure OpenAI" },
      { value: "custom", label: "Custom" },
    ],
    []
  );

  const q = String(query || "").trim().toLowerCase();
  const filteredAgents = !q
    ? agents
    : agents.filter((a) => {
        const provider = String(a?.provider || "").toLowerCase();
        return provider.includes(q) || providerLabel(provider).toLowerCase().includes(q);
      });

  function openAddModal() {
    setModal({ open: true, mode: "add", agentId: null });
    setDraftProvider("openai");
    setDraftApiKey("");
    setShowKey(false);
  }

  function openEditModal(agent) {
    if (!agent) return;
    setModal({ open: true, mode: "edit", agentId: agent.id });
    setDraftProvider(String(agent.provider || "openai"));
    setDraftApiKey(String(agent.apiKey || ""));
    setShowKey(false);
  }

  function closeModal() {
    setModal({ open: false, mode: "add", agentId: null });
    setDraftProvider("openai");
    setDraftApiKey("");
    setShowKey(false);
  }

  function persist(next) {
    setAgents(next);
    saveAgentsToStorage(next);
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="rt-title">
            Configure AI Agents
          </h2>
          <p className="text-slate-500 text-sm mt-2">
            Stored locally in your browser. Not sent anywhere until we wire the backend.
          </p>
        </div>
      </header>

      <div className="relative group max-w-2xl">
        <Plug className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search agents by provider..."
          className="w-full rt-input py-4 pl-12 pr-4 text-sm"
        />
      </div>

      <section className="rt-panel overflow-hidden">
        <div className="p-8 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-xl font-black tracking-tight">AI Agents</h3>
            <p className="text-slate-500 text-sm mt-1">
              {agents.length ? `${agents.length} configured` : "No agents configured yet."}
            </p>
          </div>

          <button
            onClick={openAddModal}
            className="rt-btn-primary inline-flex items-center gap-2 px-6 py-3 font-black text-xs uppercase tracking-widest"
          >
            <Plus size={18} /> Add AI Agent
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-[0.2em] text-slate-500 border-b border-[rgb(var(--border))]">
              <tr>
                <th className="p-6 font-black">Provider</th>
                <th className="p-6 font-black">API Key</th>
                <th className="p-6 text-right font-black px-8">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {filteredAgents.map((agent) => (
                <tr key={agent.id} className="hover:bg-[rgb(var(--surface-2))] transition-colors">
                  <td className="p-6">
                    <div className="font-bold text-[rgb(var(--text))] tracking-tight">
                      {providerLabel(agent.provider)}
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-1">
                      {String(agent.provider || "")}
                    </div>
                  </td>
                  <td className="p-6">
                    <span className="font-mono text-purple-200">
                      {maskApiKey(agent.apiKey)}
                    </span>
                  </td>
                  <td className="p-6 text-right px-8">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEditModal(agent)}
                        className="p-2.5 bg-[rgb(var(--surface-2))] text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-2))] hover:brightness-95 rounded-xl transition-all border border-[rgb(var(--border))]"
                        title="Edit API key"
                        aria-label={`Edit API key for ${providerLabel(agent.provider)}`}
                      >
                        <Edit3 size={18} />
                      </button>
                      <button
                        onClick={() => {
                          setPendingDeleteAgent(agent);
                        }}
                        className="p-2.5 bg-red-500/10 text-red-300 hover:bg-red-500 hover:text-white rounded-xl transition-all border border-red-500/20"
                        title="Delete agent"
                        aria-label={`Delete agent ${providerLabel(agent.provider)}`}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredAgents.length === 0 ? (
                <tr>
                  <td className="p-10 text-center text-slate-500" colSpan={3}>
                    No agents to show.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {modal.open ? (
        <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 z-[60] overflow-y-auto">
          <div className="w-full max-w-lg rt-panel p-4 sm:p-6 my-4 sm:my-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black uppercase tracking-tight">
                  {modal.mode === "edit" ? "Edit AI Agent" : "Add AI Agent"}
                </h3>
                <p className="text-gray-500 text-sm mt-1">
                  {modal.mode === "edit"
                    ? "Update the provider and API key for this agent."
                    : "Create a new AI agent configuration."}
                </p>
              </div>
              <button
                onClick={closeModal}
                className="p-2 rounded-xl hover:bg-[rgb(var(--surface-2))]"
                aria-label="Close"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const provider = String(draftProvider || "openai").trim() || "openai";
                const apiKey = String(draftApiKey || "").trim();
                if (!apiKey) {
                  showToast({ title: "Missing field", message: "Enter an API key." });
                  return;
                }

                if (modal.mode === "edit") {
                  const targetId = String(modal.agentId || "").trim();
                  const next = agents.map((a) =>
                    a.id === targetId
                      ? { ...a, provider, apiKey, updatedAt: Date.now() }
                      : a
                  );
                  persist(next);
                  showToast({ title: "Agent updated", message: providerLabel(provider) });
                  closeModal();
                  return;
                }

                const nextAgent = {
                  id: makeAgentId({ provider, apiKey }),
                  provider,
                  apiKey,
                  createdAt: Date.now(),
                  updatedAt: null,
                };
                const next = normalizeAgents([nextAgent, ...agents]);
                persist(next);
                showToast({ title: "Agent added", message: providerLabel(provider) });
                closeModal();
              }}
              className="mt-6 space-y-4"
            >
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                  Provider *
                </label>
                <div className="relative mt-2">
                  <Plug className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                  <select
                    value={draftProvider}
                    onChange={(e) => setDraftProvider(e.target.value)}
                    className="w-full rt-input py-3 pl-12 pr-4 text-sm"
                  >
                    {providerOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                  API Key *
                </label>
                <div className="relative mt-2">
                  <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                  <input
                    type={showKey ? "text" : "password"}
                    value={draftApiKey}
                    onChange={(e) => setDraftApiKey(e.target.value)}
                    placeholder="Paste API key…"
                    className="w-full rt-input py-3 pl-12 pr-12 text-sm"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl hover:bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))]"
                    aria-label={showKey ? "Hide key" : "Show key"}
                    title={showKey ? "Hide key" : "Show key"}
                  >
                    {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Keep this secret. Anyone with access to this browser profile can read it.
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rt-btn-ghost text-xs uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rt-btn-primary text-xs uppercase tracking-widest"
                >
                  {modal.mode === "edit" ? "Save" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingDeleteAgent)}
        title="Delete AI Agent"
        message={`Delete AI Agent (${providerLabel(pendingDeleteAgent?.provider)})?`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        onCancel={() => setPendingDeleteAgent(null)}
        onConfirm={() => {
          const agent = pendingDeleteAgent;
          if (!agent) return;
          const next = agents.filter((a) => a.id !== agent.id);
          persist(next);
          setPendingDeleteAgent(null);
          showToast({ title: "Agent deleted", message: providerLabel(agent.provider) });
        }}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
