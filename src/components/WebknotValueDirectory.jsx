import React, { useMemo } from "react";
import { Edit3, Plus, Search, Trash2 } from "lucide-react";

export default function WebknotValueDirectory({
  values,
  searchQuery,
  setSearchQuery,
  onAddValue,
  onEditValue,
  onDeleteValue,
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
          <h2 className="text-3xl font-black uppercase tracking-tighter italic">
            Webknot Value Directory
          </h2>
          <p className="text-gray-500 text-sm mt-2">
            Curate the values that define how we operate.
          </p>
        </div>
        <button
          onClick={onAddValue}
          className="bg-purple-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-purple-500 shadow-xl shadow-purple-900/20 transition-all flex items-center gap-2"
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
          placeholder="Search by value, pillar, or description..."
          className="w-full bg-[#111] border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm focus:border-purple-500 outline-none transition-all"
        />
      </div>

      <div className="bg-[#111] border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl">
        <table className="w-full text-left">
          <thead className="bg-white/[0.02] text-[10px] uppercase tracking-[0.2em] text-gray-500 border-b border-white/5">
            <tr>
              <th className="p-6 font-black">Value</th>
              <th className="p-6 font-black">Pillar</th>
              <th className="p-6 font-black">Description</th>
              <th className="p-6 text-right font-black px-8">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map((v) => (
              <tr key={v.id} className="hover:bg-white/[0.01] transition-colors group">
                <td className="p-6">
                  <div className="font-bold text-white tracking-tight">{v.title}</div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase mt-1 font-mono">
                    {v.id}
                  </div>
                </td>
                <td className="p-6">
                  <span className="text-[10px] font-black uppercase px-3 py-1 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">
                    {v.pillar}
                  </span>
                </td>
                <td className="p-6 text-gray-200">{v.description}</td>
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
            {filtered.length === 0 ? (
              <tr>
                <td className="p-10 text-center text-gray-500" colSpan={4}>
                  No values match your search.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

