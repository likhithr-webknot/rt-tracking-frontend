import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Edit3, Eye, EyeOff, KeyRound, Loader2, Plug, Plus, RefreshCcw, Trash2, X } from "lucide-react";
import Toast from "../shared/Toast.jsx";
import ConfirmDialog from "../shared/ConfirmDialog.jsx";
import CursorPagination from "../shared/CursorPagination.jsx";
import {
  addAiAgent,
  deleteAiAgent,
  fetchAiAgents,
  normalizeAiAgents,
  updateAiAgent,
} from "../../api/ai-agents.js";
import { normalizeCursorPage } from "../../api/employee-portal.js";

const AI_AGENT_PAGE_SIZE = 10;

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
  const [cursor, setCursor] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [cursorStack, setCursorStack] = useState([]);
  const cursorRef = useRef(null);

  const [modal, setModal] = useState({ open: false, mode: "add", agentId: null });
  const [draftProvider, setDraftProvider] = useState("openai");
  const [draftApiKey, setDraftApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const [pendingDeleteAgent, setPendingDeleteAgent] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

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

  const reloadAgents = useCallback(
    async ({ signal, cursor: requestedCursor, pageAction = "stay", fromCursor = null } = {}) => {
      const resolvedCursor = requestedCursor === undefined ? (cursorRef.current ?? null) : (requestedCursor ?? null);
      setLoading(true);
      setError("");
      try {
        const data = await fetchAiAgents({
          limit: AI_AGENT_PAGE_SIZE,
          cursor: resolvedCursor,
          signal,
        });
        const page = normalizeCursorPage(data);
        setAgents(normalizeAiAgents(page.items));
        setNextCursor(page.nextCursor ?? null);
        setCursor(resolvedCursor);
        cursorRef.current = resolvedCursor;
        setCursorStack((prev) => {
          if (pageAction === "next") return [...prev, (fromCursor ?? cursorRef.current ?? null)];
          if (pageAction === "prev") return prev.slice(0, -1);
          if (pageAction === "reset") return [];
          return prev;
        });
      } catch (err) {
        if (err?.name === "AbortError") return;
        setAgents([]);
        setNextCursor(null);
        setError(err?.message || "Failed to load AI agents.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();
    reloadAgents({ signal: controller.signal, cursor: null, pageAction: "reset" }).catch(() => {});
    return () => controller.abort();
  }, [reloadAgents]);

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
        await updateAiAgent(targetId, { provider, apiKey });
        await reloadAgents({ cursor: cursor ?? null, pageAction: "stay" }).catch(() => {});
        showToast({ title: "Agent updated", message: providerLabel(provider) });
      } else {
        await addAiAgent({ provider, apiKey });
        await reloadAgents({ cursor: null, pageAction: "reset" }).catch(() => {});
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
      await reloadAgents({ cursor: cursor ?? null, pageAction: "stay" }).catch(() => {});
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
            AI Agents
          </h2>
          <p className="text-slate-500 text-sm mt-2">
            Configure AI-powered agents stored in backend and available across sessions.
          </p>
        </div>
        <button
          onClick={() => reloadAgents({ cursor: cursor ?? null, pageAction: "stay" }).catch(() => {})}
          disabled={loading}
          className="rt-btn-ghost"
        >
          <RefreshCcw size={16} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-4xl">
        <div className="rt-panel-subtle rounded-lg px-4 py-3">
          <div className="rt-kicker">Rows On Page</div>
          <div className="mt-1 text-2xl font-semibold text-[rgb(var(--text))]">{agents.length}</div>
        </div>
        <div className="rt-panel-subtle rounded-lg px-4 py-3">
          <div className="rt-kicker">Active</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-500">{activeAgents}</div>
        </div>
        <div className="rt-panel-subtle rounded-lg px-4 py-3">
          <div className="rt-kicker">Inactive</div>
          <div className="mt-1 text-2xl font-semibold text-amber-500">{inactiveAgents}</div>
        </div>
      </div>

      {error ? (
        <div className="max-w-7xl mx-auto rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-200">
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
            <h3 className="text-xl font-semibold tracking-tight">AI Agents</h3>
            <p className="text-slate-500 text-sm mt-1">
              {loading ? "Loading..." : agents.length ? `${agents.length} shown on this page` : "No agents configured yet."}
            </p>
          </div>

          <button
            onClick={openAddModal}
            className="rt-btn-primary"
          >
            <Plus size={18} /> Add AI Agent
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-slate-500 border-b border-[rgb(var(--border))]">
              <tr>
                <th className="p-6 font-semibold">Provider</th>
                <th className="p-6 font-semibold">API Key</th>
                <th className="p-6 text-right font-semibold px-8">Actions</th>
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
                        className="p-2 rounded-md text-[rgb(var(--muted))] hover:text-[rgb(var(--primary))] hover:bg-[rgb(var(--primary))]/10 transition-all"
                        title="Edit API key"
                        aria-label={`Edit API key for ${providerLabel(agent.provider)}`}
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        onClick={() => {
                          setPendingDeleteAgent(agent);
                        }}
                        className="p-2 rounded-md text-red-500 hover:bg-red-500/10 transition-all"
                        title="Delete agent"
                        aria-label={`Delete agent ${providerLabel(agent.provider)}`}
                      >
                        <Trash2 size={16} />
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
        <div className="p-6 border-t border-[rgb(var(--border))]">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => reloadAgents({ cursor: null, pageAction: "reset" }).catch(() => {})}
              disabled={loading}
              className={[
                "rt-btn-ghost",
                loading ? "opacity-50 cursor-not-allowed" : "",
              ].join("")}
            >
              First Page
            </button>
            <CursorPagination
              canPrev={cursorStack.length > 0}
              canNext={Boolean(nextCursor)}
              onPrev={() => {
                const prevCursor = cursorStack[cursorStack.length - 1] ?? null;
                reloadAgents({ cursor: prevCursor, pageAction: "prev" }).catch(() => {});
              }}
              onNext={() => {
                if (!nextCursor) return;
                reloadAgents({ cursor: nextCursor, pageAction: "next", fromCursor: cursor }).catch(() => {});
              }}
              loading={loading}
              label={`Page ${cursorStack.length + 1}`}
            />
          </div>
        </div>
      </section>

      {modal.open ? (
        <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 z-[60] overflow-y-auto">
          <div className="w-full max-w-lg rt-panel p-4 sm:p-6 my-4 sm:my-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold uppercase tracking-tight">
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
                className="p-2 rounded-md hover:bg-[rgb(var(--surface-2))]"
                aria-label="Close"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
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
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-md hover:bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))]"
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
                  className="rt-btn-ghost"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rt-btn-primary"
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
