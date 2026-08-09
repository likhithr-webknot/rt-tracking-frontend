// @ts-nocheck
import React, { useMemo } from "react";
import { FolderKanban, RefreshCw } from "lucide-react";
import { extractPmAmFromProject } from "../../utils/projectSubmitAlerts";

export const MAX_PROJECT_SELECTIONS = 3;

export default function ProjectSelectionPanel({
  title = "Active projects",
  subtitle = "Select the projects you worked on this cycle. Your project manager (or account manager) will be notified when you submit.",
  projects = [],
  selectedProjectIds = new Set(),
  onToggleProject,
  loading = false,
  disabled = false,
  search = "",
  onSearchChange,
  error = "",
  compact = false,
}) {
  const filtered = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const name = String(p?.name ?? p?.code ?? "").toLowerCase();
      const { pm, am } = extractPmAmFromProject(p);
      return name.includes(q) || pm.toLowerCase().includes(q) || am.toLowerCase().includes(q);
    });
  }, [projects, search]);

  return (
    <section className={`rt-panel rounded-2xl ${compact ? "p-5" : "p-6 sm:p-8"} space-y-4`}>
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-[rgb(var(--primary))]/10 flex items-center justify-center shrink-0">
          <FolderKanban size={18} className="text-[rgb(var(--primary))]" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-[rgb(var(--text))]">{title}</h3>
          <p className="text-sm text-[rgb(var(--muted))] mt-1">{subtitle}</p>
        </div>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      {!disabled ? (
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange?.(e.target.value)}
          placeholder="Search projects, PM, or AM…"
          className="rt-input w-full text-sm"
          disabled={loading}
        />
      ) : null}

      {loading ? (
        <div className="text-sm text-[rgb(var(--muted))] flex items-center gap-2">
          <RefreshCw size={14} className="animate-spin" /> Loading active projects…
        </div>
      ) : (
        <div className={`grid gap-2 ${compact ? "max-h-52" : "max-h-64"} overflow-y-auto custom-scrollbar`}>
          {filtered.map((p) => {
            const id = String(p?.id ?? "").trim();
            const selected = selectedProjectIds.has(id);
            const { pm, am } = extractPmAmFromProject(p);
            return (
              <button
                key={id}
                type="button"
                disabled={disabled || !id}
                onClick={() => onToggleProject?.(id)}
                className={[
                  "text-left rounded-lg border px-3 py-2.5 transition-all",
                  selected
                    ? "border-[rgb(var(--primary)/.5)] bg-[rgb(var(--primary)/.08)] ring-1 ring-[rgb(var(--primary)/.25)]"
                    : "border-[rgb(var(--border))] hover:border-[rgb(var(--primary)/.3)]",
                  disabled ? "opacity-60 cursor-not-allowed" : "",
                ].join(" ")}
              >
                <div className="font-medium text-sm">{p.name || p.code || id}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[rgb(var(--muted))]">
                  {pm ? <span>PM: {pm}</span> : <span className="text-amber-700 dark:text-amber-300">PM not assigned</span>}
                  {am ? <span>AM: {am}</span> : null}
                </div>
              </button>
            );
          })}
          {!filtered.length ? (
            <div className="text-sm text-[rgb(var(--muted))] py-4 text-center">No active projects match your search.</div>
          ) : null}
        </div>
      )}

      <div className="text-[11px] text-[rgb(var(--muted))]">
        {selectedProjectIds.size} of {MAX_PROJECT_SELECTIONS} selected
        {!disabled && selectedProjectIds.size === 0 ? " · pick at least one before submitting" : ""}
      </div>
    </section>
  );
}
