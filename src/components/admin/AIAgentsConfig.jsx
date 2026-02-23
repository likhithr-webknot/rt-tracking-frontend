import React, { useEffect, useMemo, useRef, useState } from "react";
import { Edit3, Eye, EyeOff, KeyRound, Loader2, Plug, Plus, RefreshCcw, Trash2, X } from "lucide-react";
import Toast from "../shared/Toast.jsx";
import ConfirmDialog from "../shared/ConfirmDialog.jsx";
import {
  addAiAgent,
  deleteAiAgent,
  fetchAiAgents,
  normalizeAiAgents,
  updateAiAgent,
} from "../../api/ai-agents.js";
import { normalizeCursorPage } from "../../api/employee-portal.js";

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
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const [modal, setModal] = useState({ open: false, mode: "add", agentId: null });
  const [draftProvider, setDraftProvider] = useState("openai");
  const [draftApiKey, setDraftApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const [pendingDeleteAgent, setPendingDeleteAgent] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState(null);
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

  async function reloadAgents() {
    setLoading(true);
    setError("");
    try {
      const all = [];
      let cursor = null;
      for (let i = 0; i < 20; i += 1) {
        const data = await fetchAiAgents({ limit: 100, cursor });
        const page = normalizeCursorPage(data);
        const items = normalizeAiAgents(page.items);
        all.push(...items);
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }

      const deduped = [];
      const seen = new Set();
      for (const item of all) {
        const key = String(item?.id ?? "").trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        deduped.push(item);
      }
      setAgents(deduped);
    } catch (err) {
      setAgents([]);
      setError(err?.message || "Failed to load AI agents.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reloadAgents().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = String(query || "").trim().toLowerCase();
  const filteredAgents = !q
    ? agents
    : agents.filter((a) => {
      const provider = String(a?.provider || "").toLowerCase();
      return provider.includes(q) || providerLabel(provider).toLowerCase().includes(q);
    });
  const activeAgents = useMemo(
    () => agents.filter((row) => Boolean(row?.active)).length,
    [agents]
  );
  const inactiveAgents = Math.max(0, agents.length - activeAgents);

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
    if (saving) return;
    setModal({ open: false, mode: "add", agentId: null });
    setDraftProvider("openai");
    setDraftApiKey("");
    setShowKey(false);
  }

  async function onSubmit(e) {
    e.preventDefault();
    const provider = String(draftProvider || "openai").trim() || "openai";
    const apiKey = String(draftApiKey || "").trim();
    if (!apiKey) {
      showToast({ title: "Missing field", message: "Enter an API key." });
      return;
    }

    setSaving(true);
    setError("");
    try {
      if (modal.mode === "edit") {
        const targetId = String(modal.agentId || "").trim();
        const raw = await updateAiAgent(targetId, { provider, apiKey });
        const nextAgent = normalizeAiAgents([raw])[0] || {
          id: targetId,
          provider,
          apiKey,
          active: true,
          createdAt: null,
          updatedAt: null,
        };
        setAgents((prev) => prev.map((a) => (String(a.id) === targetId ? { ...a, ...nextAgent } : a)));
        showToast({ title: "Agent updated", message: providerLabel(provider) });
      } else {
        const raw = await addAiAgent({ provider, apiKey });
        const nextAgent = normalizeAiAgents([raw])[0];
        if (nextAgent) {
          setAgents((prev) => [nextAgent, ...prev.filter((a) => String(a.id) !== String(nextAgent.id))]);
        } else {
          await reloadAgents();
        }
        showToast({ title: "Agent added", message: providerLabel(provider) });
      }
      closeModal();
    } catch (err) {
      const message = err?.message || "Failed to save AI agent.";
      setError(message);
      showToast({ title: "Save failed", message });
    } finally {
      setSaving(false);
    }
  }

  async function onConfirmDelete() {
    const agent = pendingDeleteAgent;
    if (!agent) return;

    setDeleting(true);
    setError("");
    try {
      await deleteAiAgent(agent.id);
      setAgents((prev) => prev.filter((a) => String(a.id) !== String(agent.id)));
      showToast({ title: "Agent deleted", message: providerLabel(agent.provider) });
      setPendingDeleteAgent(null);
    } catch (err) {
      const message = err?.message || "Failed to delete AI agent.";
      setError(message);
      showToast({ title: "Delete failed", message });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="rt-title">
            Configure AI Agents
          </h2>
          <p className="text-slate-500 text-sm mt-2">
            Stored in backend and available across sessions.
          </p>
        </div>
        <button
          onClick={() => reloadAgents().catch(() => {})}
          disabled={loading}
          className="rt-btn-ghost inline-flex items-center gap-2 text-xs uppercase tracking-widest"
        >
          <RefreshCcw size={16} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-4xl">
        <div className="rt-panel-subtle rounded-2xl px-4 py-3">
          <div className="rt-kicker">Total Agents</div>
          <div className="mt-1 text-2xl font-black text-[rgb(var(--text))]">{agents.length}</div>
        </div>
        <div className="rt-panel-subtle rounded-2xl px-4 py-3">
          <div className="rt-kicker">Active</div>
          <div className="mt-1 text-2xl font-black text-emerald-500">{activeAgents}</div>
        </div>
        <div className="rt-panel-subtle rounded-2xl px-4 py-3">
          <div className="rt-kicker">Inactive</div>
          <div className="mt-1 text-2xl font-black text-amber-500">{inactiveAgents}</div>
        </div>
      </div>

      {error ? (
        <div className="max-w-7xl mx-auto rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      ) : null}

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
              {loading ? "Loading..." : agents.length ? `${agents.length} configured` : "No agents configured yet."}
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

              {!loading && filteredAgents.length === 0 ? (
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

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
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
                  Keep this secret. Only admins should have access to this screen.
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rt-btn-ghost text-xs uppercase tracking-widest"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rt-btn-primary text-xs uppercase tracking-widest inline-flex items-center gap-2"
                  disabled={saving}
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : null}
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
        confirmText={deleting ? "Deleting..." : "Delete"}
        cancelText="Cancel"
        confirmVariant="danger"
        onCancel={() => {
          if (!deleting) setPendingDeleteAgent(null);
        }}
        onConfirm={onConfirmDelete}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
