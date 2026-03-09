import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Edit3, Plus, Search, Trash2 } from "lucide-react";
import CursorPagination from "../shared/CursorPagination.jsx";

export default function WebknotValueDirectory({
  values = [],
  searchQuery = "",
  setSearchQuery = () => {},
  onAddValue,
  onEditValue,
  onDeleteValue,
  pager, 
}) {
  const PAGE_SIZE = 20; // items per page, but we keep groups intact
  const [pageIndex, setPageIndex] = useState(0);
  const normalizeText = useCallback((raw) => String(raw ?? "").trim().replace(/\s+/g, " ").toLowerCase(), []);

  const toTitleCase = useCallback((text) => {
    return String(text || "")
      .toLowerCase()
      .split(" ")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ") || "";
  }, []);

  const canonicalizePillar = useCallback((raw) => {
    const trimmed = String(raw ?? "").trim();
    const collapsed = trimmed.replace(/\s+/g, " ");
    if (!collapsed) return { key: "--", label: "—" };
    const pretty = toTitleCase(collapsed);
    return { key: collapsed.toLowerCase(), label: pretty || collapsed };
  }, [toTitleCase]);

  const pillarPalette = useMemo(
    () => [
      { bg: "bg-blue-500/10", text: "text-blue-500", border: "border-blue-500/20" },
      { bg: "bg-emerald-500/10", text: "text-emerald-500", border: "border-emerald-500/20" },
      { bg: "bg-amber-500/10", text: "text-amber-600", border: "border-amber-500/30" },
      { bg: "bg-purple-500/10", text: "text-purple-500", border: "border-purple-500/20" },
      { bg: "bg-rose-500/10", text: "text-rose-500", border: "border-rose-500/20" },
      { bg: "bg-cyan-500/10", text: "text-cyan-500", border: "border-cyan-500/20" },
      { bg: "bg-indigo-500/10", text: "text-indigo-500", border: "border-indigo-500/20" },
      { bg: "bg-teal-500/10", text: "text-teal-500", border: "border-teal-500/20" },
    ],
    []
  );

  const colorForPillar = useCallback(
    (pillar) => {
      const { key } = canonicalizePillar(pillar);
      if (!key || key === "--") return { bg: "bg-[rgb(var(--surface-2))]", text: "text-[rgb(var(--muted))]", border: "border-[rgb(var(--border))]" };
      let hash = 0;
      for (let i = 0; i < key.length; i++) {
        hash = (hash * 31 + key.charCodeAt(i)) | 0;
      }
      const idx = Math.abs(hash) % pillarPalette.length;
      return pillarPalette[idx];
    },
    [pillarPalette, canonicalizePillar]
  );
  const filtered = useMemo(() => {
    const q = normalizeText(searchQuery);
    if (!q) return values;
    return values.filter((v) => {
      const title = normalizeText(v.title);
      const { key } = canonicalizePillar(v.pillar);
      return title.includes(q) || key.includes(q);
    });
  }, [values, searchQuery, canonicalizePillar, normalizeText]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const v of filtered) {
      const canonical = canonicalizePillar(v?.pillar);
      const key = canonical.key;
      const label = canonical.label;
      if (!map.has(key)) map.set(key, { label, items: [] });
      const entry = map.get(key);
      // Keep a prettified label; if placeholder or lower fidelity, replace with prettier version
      if (label !== "—" && (entry.label === "—" || entry.label.toLowerCase() === entry.label)) {
        entry.label = label;
      }
      entry.items.push(v);
    }
    return Array.from(map.entries())
      .map(([key, { label, items }]) => ({
        key,
        pillar: label,
        items: items.slice().sort((a, b) => normalizeText(a.title).localeCompare(normalizeText(b.title))),
      }))
      .sort((a, b) => a.pillar.localeCompare(b.pillar, undefined, { sensitivity: "base" }));
  }, [filtered, canonicalizePillar, normalizeText]);

  const groupedPages = useMemo(() => {
    const pages = [];
    let current = [];
    let count = 0;
    for (const group of grouped) {
      const groupSize = group.items.length;
      if (count > 0 && count + groupSize > PAGE_SIZE) {
        pages.push(current);
        current = [];
        count = 0;
      }
      current.push(group);
      count += groupSize;
    }
    if (current.length) pages.push(current);
    return pages;
  }, [grouped]);

  useEffect(() => {
    setPageIndex(0);
  }, [searchQuery, groupedPages.length]);
  const pillarCount = useMemo(
    () =>
      new Set(
        (Array.isArray(values) ? values : [])
          .map((v) => String(v?.pillar || "").trim())
          .filter(Boolean)
      ).size,
    [values]
  );

  return (
    <div className="space-y-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="rt-title">
            Webknot Values
          </h2>
          <p className="text-slate-500 text-sm mt-2">
            Curate the core values that define how we operate.
          </p>
        </div>
        <button
          onClick={onAddValue}
          className="rt-btn-primary"
        >
          <Plus size={18} /> Add New Value
        </button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-4xl">
        <div className="rt-panel-subtle rounded-lg px-4 py-3">
          <div className="rt-kicker">Total Values</div>
          <div className="mt-1 text-2xl font-semibold text-[rgb(var(--text))]">{values.length}</div>
        </div>
        <div className="rt-panel-subtle rounded-lg px-4 py-3">
          <div className="rt-kicker">Evaluation Criteria</div>
          <div className="mt-1 text-2xl font-semibold text-[rgb(var(--text))]">{pillarCount}</div>
        </div>
        <div className="rt-panel-subtle rounded-lg px-4 py-3">
          <div className="rt-kicker">On Page</div>
          <div className="mt-1 text-2xl font-semibold text-[rgb(var(--text))]">{filtered.length}</div>
        </div>
      </div>

      <div className="relative group max-w-2xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" size={20} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by value or evaluation criteria..."
          className="w-full rt-input py-4 pl-12 pr-4 text-sm"
        />
      </div>

      {/* ── Desktop table ── */}
      <div className="rt-panel overflow-hidden hidden lg:block">
        <table className="w-full text-left">
          <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-[rgb(var(--muted))] border-b border-[rgb(var(--border))]">
            <tr>
              <th className="px-6 py-4 font-semibold">Value</th>
              <th className="px-6 py-4 font-semibold">Evaluation Criteria</th>
              <th className="px-6 py-4 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--border))]">
            {(groupedPages[pageIndex] || []).map((group) => {
              const colors = colorForPillar(group.pillar);
              return (
                <React.Fragment key={`grp-${group.pillar}`}>
                  <tr className="bg-[rgb(var(--surface-2))]/60">
                    <td className="px-6 py-3 font-semibold text-[rgb(var(--text))]" colSpan={3}>
                      <span className={`inline-flex items-center rounded-md px-3 py-1 text-[10px] font-semibold uppercase border ${colors.bg} ${colors.text} ${colors.border}`}>
                        {group.pillar || "—"}
                      </span>
                      <span className="ml-2 text-[11px] text-[rgb(var(--muted))]">{group.items.length} value{group.items.length !== 1 ? "s" : ""}</span>
                    </td>
                  </tr>
                  {group.items.map((v) => (
                    <tr key={v.id} className="hover:bg-[rgb(var(--surface-2))]/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-[rgb(var(--text))] tracking-tight">{v.title}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex max-w-[360px] items-center rounded-md px-2.5 py-1 text-xs font-medium break-words whitespace-normal border ${colors.bg} ${colors.text} ${colors.border}`}>
                          {group.pillar || "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => onEditValue?.(v)}
                            className="p-2 rounded-md text-[rgb(var(--muted))] hover:text-[rgb(var(--primary))] hover:bg-[rgb(var(--primary))]/10 transition-all"
                            title="Edit"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={() => onDeleteValue?.(v)}
                            className="p-2 rounded-md text-red-500 hover:bg-red-500/10 transition-all"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
            {filtered.length === 0 && values.length > 0 ? (
              <tr>
                <td className="p-10 text-center text-[rgb(var(--muted))]" colSpan={3}>
                  No values match your search.
                </td>
              </tr>
            ) : null}
            {values.length === 0 ? (
              <tr>
                <td className="p-10 text-center text-[rgb(var(--muted))]" colSpan={3}>
                  No values yet. Click "Add New Value" to create one.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* ── Mobile cards ── */}
      <div className="lg:hidden space-y-3">
        {(groupedPages[pageIndex] || []).map((group) => {
          const colors = colorForPillar(group.pillar);
          return (
            <div key={`mgrp-${group.pillar}`} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className={`inline-flex items-center rounded-md px-3 py-1 text-[10px] font-semibold uppercase border ${colors.bg} ${colors.text} ${colors.border}`}>
                  {group.pillar || "—"}
                </span>
                <span className="text-[11px] text-[rgb(var(--muted))]">{group.items.length} value{group.items.length !== 1 ? "s" : ""}</span>
              </div>
              {group.items.map((v) => (
                <div key={v.id} className="rt-panel p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[rgb(var(--text))] tracking-tight truncate">{v.title}</div>
                    <span className={`mt-2 inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium border ${colors.bg} ${colors.text} ${colors.border}`}>
                      {group.pillar || "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => onEditValue?.(v)}
                      className="p-2 rounded-md text-[rgb(var(--muted))] hover:text-[rgb(var(--primary))] hover:bg-[rgb(var(--primary))]/10 transition-all"
                      title="Edit"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      onClick={() => onDeleteValue?.(v)}
                      className="p-2 rounded-md text-red-500 hover:bg-red-500/10 transition-all"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
        {filtered.length === 0 && values.length > 0 ? (
          <div className="rt-panel p-8 text-center text-[rgb(var(--muted))] text-sm">No values match your search.</div>
        ) : null}
        {values.length === 0 ? (
          <div className="rt-panel p-8 text-center text-[rgb(var(--muted))] text-sm">No values yet. Click "Add New Value" to create one.</div>
        ) : null}
      </div>

      <div className="pt-4 flex items-center justify-between">
        <div className="text-xs text-[rgb(var(--muted))]">
          Page {pageIndex + 1} of {Math.max(1, groupedPages.length)}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            disabled={pageIndex === 0}
            className={["rt-btn-ghost rt-btn-sm", pageIndex === 0 ? "opacity-50 cursor-not-allowed" : ""].join(" ")}
          >
            Prev
          </button>
          <button
            onClick={() => setPageIndex((p) => Math.min(groupedPages.length - 1, p + 1))}
            disabled={pageIndex >= groupedPages.length - 1}
            className={["rt-btn-ghost rt-btn-sm", pageIndex >= groupedPages.length - 1 ? "opacity-50 cursor-not-allowed" : ""].join(" ")}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
