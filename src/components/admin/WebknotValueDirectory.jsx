import React, { useMemo } from "react";
import { Edit3, Plus, Search, Trash2 } from "lucide-react";
import CursorPagination from "../shared/CursorPagination.jsx";

export default function WebknotValueDirectory({
  values,
  searchQuery,
  setSearchQuery,
  onAddValue,
  onEditValue,
  onDeleteValue,
  pager, 
}) {
  const filtered = useMemo(() => {
    const q = String(searchQuery || "").trim().toLowerCase();
    if (!q) return values;
    return values.filter((v) => {
      const title = String(v.title || "").toLowerCase();
      const pillar = String(v.pillar || "").toLowerCase();
      return title.includes(q) || pillar.includes(q);
    });
  }, [values, searchQuery]);
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
          <div className="rt-kicker">Pillars</div>
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
            {filtered.map((v) => (
              <tr key={v.id} className="hover:bg-[rgb(var(--surface-2))]/50 transition-colors group">
                <td className="px-6 py-4">
                  <div className="font-semibold text-[rgb(var(--text))] tracking-tight">{v.title}</div>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex max-w-[360px] items-center rounded-md bg-[rgb(var(--primary))]/10 px-2.5 py-1 text-xs font-medium text-[rgb(var(--primary))] break-words whitespace-normal">
                    {v.pillar}
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
                      className="p-2 rounded-md text-[rgb(var(--muted))] hover:text-red-500 hover:bg-red-500/10 transition-all"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
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
        {filtered.map((v) => (
          <div key={v.id} className="rt-panel p-4 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-[rgb(var(--text))] tracking-tight truncate">{v.title}</div>
              <span className="mt-2 inline-flex items-center rounded-md bg-[rgb(var(--primary))]/10 px-2.5 py-1 text-xs font-medium text-[rgb(var(--primary))]">
                {v.pillar}
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
                className="p-2 rounded-md text-[rgb(var(--muted))] hover:text-red-500 hover:bg-red-500/10 transition-all"
                title="Delete"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && values.length > 0 ? (
          <div className="rt-panel p-8 text-center text-[rgb(var(--muted))] text-sm">No values match your search.</div>
        ) : null}
        {values.length === 0 ? (
          <div className="rt-panel p-8 text-center text-[rgb(var(--muted))] text-sm">No values yet. Click "Add New Value" to create one.</div>
        ) : null}
      </div>

      {pager && (pager.canPrev || pager.canNext) ? (
        <div className="pt-4">
          <CursorPagination
            canPrev={Boolean(pager.canPrev)}
            canNext={Boolean(pager.canNext)}
            onPrev={pager.onPrev}
            onNext={pager.onNext}
            loading={Boolean(pager.loading)}
            label={pager.label}
          />
        </div>
      ) : null}
    </div>
  );
}
