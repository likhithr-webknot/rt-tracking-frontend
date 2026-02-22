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
      const description = String(v.description || "").toLowerCase();
      return title.includes(q) || pillar.includes(q) || description.includes(q);
    });
  }, [values, searchQuery]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="rt-title">
            Webknot Value Directory
          </h2>
          <p className="text-slate-500 text-sm mt-2">
            Curate the values that define how we operate.
          </p>
        </div>
        <button
          onClick={onAddValue}
          className="rt-btn-primary px-8 py-4 font-black text-xs uppercase tracking-widest inline-flex items-center gap-2"
        >
          <Plus size={18} /> Add New Value
        </button>
      </header>

      <div className="relative group max-w-2xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by value, evaluation criteria, or description..."
          className="w-full rt-input py-4 pl-12 pr-4 text-sm"
        />
      </div>

      <div className="rt-panel overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-[0.2em] text-slate-500 border-b border-[rgb(var(--border))]">
            <tr>
              <th className="p-6 font-black">Value</th>
              <th className="p-6 font-black">Evaluation Criteria</th>
              <th className="p-6 font-black">Description</th>
              <th className="p-6 text-right font-black px-8">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--border))]">
            {filtered.map((v) => (
              <tr key={v.id} className="hover:bg-[rgb(var(--surface-2))] transition-colors group">
                <td className="p-6">
                  <div className="font-bold text-[rgb(var(--text))] tracking-tight">{v.title}</div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase mt-1 font-mono">
                    {v.id}
                  </div>
                </td>
                <td className="p-6">
                  <span className="inline-flex max-w-[320px] items-center rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-500 break-words whitespace-normal">
                    {v.pillar}
                  </span>
                </td>
                <td className="p-6 text-[rgb(var(--text))]">{v.description}</td>
                <td className="p-6 text-right px-8">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => onEditValue?.(v)}
                      className="p-2.5 bg-blue-500/5 text-blue-500 hover:bg-blue-500 hover:text-white rounded-xl transition-all border border-blue-500/10"
                      title="Edit"
                    >
                      <Edit3 size={18} />
                    </button>
                    <button
                      onClick={() => onDeleteValue?.(v)}
                      className="p-2.5 bg-red-500/5 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all border border-red-500/10"
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && values.length > 0 ? (
              <tr>
                <td className="p-10 text-center text-slate-500" colSpan={4}>
                  No values match your search.
                </td>
              </tr>
            ) : null}
            {values.length === 0 ? (
              <tr>
                <td className="p-10 text-center text-slate-500" colSpan={4}>
                  No values yet. Click "Add New Value" to create one.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
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

