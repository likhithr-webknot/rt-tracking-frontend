import React, { useMemo, useState } from "react";
import { Edit3, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import CursorPagination from "../shared/CursorPagination.jsx";

export default function KPIRegistry({
  kpis,
  searchQuery,
  setSearchQuery,
  onAddKpi,
  onEditKpi,
  loading,
  error,
  onReload,
  pager,
}) {
  const [selectedBands, setSelectedBands] = useState([]); // band strings; empty means "all"

  function parseWeightPercent(value) {
    if (value == null) return 0;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const text = String(value).trim();
    if (!text) return 0;
    const numericText = text.endsWith("%") ? text.slice(0, -1).trim() : text;
    const parsed = Number.parseFloat(numericText);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const bandStats = useMemo(() => {
    const map = new Map(); // band -> { count, sum }
    for (const kpi of kpis) {
      const band = String(kpi?.band ?? "").trim() || "Unassigned";
      const prev = map.get(band) || { count: 0, sum: 0 };
      prev.count += 1;
      prev.sum += parseWeightPercent(kpi?.weight);
      map.set(band, prev);
    }

    const entries = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));

    return {
      map,
      bands: entries.map(([band]) => band),
    };
  }, [kpis]);

  const selectedBandSet = useMemo(() => new Set(selectedBands), [selectedBands]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return kpis.filter((kpi) => {
      const matchesText =
        kpi.title.toLowerCase().includes(q) || kpi.stream.toLowerCase().includes(q);

      const band = String(kpi?.band ?? "").trim() || "Unassigned";
      const matchesBand = selectedBandSet.size === 0 ? true : selectedBandSet.has(band);

      return matchesText && matchesBand;
    });
  }, [kpis, searchQuery, selectedBandSet]);

  const selectedBandWeightWarnings = useMemo(() => {
    const bands = selectedBandSet.size ? Array.from(selectedBandSet) : bandStats.bands;
    return bands
      .map((band) => {
        const stats = bandStats.map.get(band) || { count: 0, sum: 0 };
        const rounded = Math.round(stats.sum * 10) / 10;
        return { band, count: stats.count, sum: rounded };
      })
      .filter((x) => x.count > 0 && x.sum > 100);
  }, [bandStats, selectedBandSet]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="rt-title">KPI Master Registry</h2>
          <p className="text-slate-500 text-sm mt-2">Map performance metrics to bands and streams.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onReload?.()}
            disabled={Boolean(loading)}
            className={[
              "rt-btn-ghost inline-flex items-center gap-2 px-6 py-4 text-xs uppercase tracking-widest transition-all",
              loading ? "opacity-60 cursor-not-allowed" : "",
            ].join(" ")}
            title="Reload KPIs"
          >
            <RefreshCw size={18} /> {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            onClick={onAddKpi}
            className="rt-btn-primary px-8 py-4 font-black text-xs uppercase tracking-widest inline-flex items-center gap-2"
          >
            <Plus size={18} /> Add New KPI
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          Failed to load KPIs: <span className="font-mono">{error}</span>
        </div>
      ) : null}

      <div className="max-w-4xl space-y-3">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by KPI name or stream..."
            className="w-full rt-input py-4 pl-12 pr-4 text-sm"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {bandStats.bands.map((band) => {
            const isSelected = selectedBandSet.has(band);
            const stats = bandStats.map.get(band) || { count: 0, sum: 0 };
            const sumRounded = Math.round(stats.sum * 10) / 10;
            const isOver = sumRounded > 100;

            return (
              <button
                key={band}
                onClick={() => {
                  if (isSelected) return;
                  setSelectedBands((prev) => Array.from(new Set([...prev, band])));
                }}
                className={[
                  "inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] border transition-all",
                  isSelected
                    ? "bg-purple-600 text-white border-purple-600 shadow-lg shadow-purple-900/20"
                    : "bg-transparent text-[rgb(var(--text))] border-[rgb(var(--border))] hover:bg-[rgb(var(--surface-2))]",
                  !isSelected && isOver ? "ring-2 ring-red-500/30" : "",
                ].join(" ")}
                title={`${band} (${stats.count}) • ${sumRounded}%`}
              >
                <span>{band}</span>
                <span className={isOver ? "text-red-200" : (isSelected ? "text-white/80" : "text-[rgb(var(--muted))]")}>
                  {sumRounded}%
                </span>
                {isSelected ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBands((prev) => prev.filter((b) => b !== band));
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedBands((prev) => prev.filter((b) => b !== band));
                    }}
                    className="ml-1 rounded-xl p-1 hover:bg-[rgb(var(--surface-2))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--border))]"
                    aria-label={`Deselect ${band}`}
                    title="Deselect"
                  >
                    <X size={14} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {selectedBandWeightWarnings.length ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
          Weightage exceeds 100% for:
          {" "}
          <span className="font-mono">
            {selectedBandWeightWarnings.map((x) => `${x.band}=${x.sum}%`).join(", ")}
          </span>
        </div>
      ) : null}

      <div className="rt-panel overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-[0.2em] text-slate-500 border-b border-[rgb(var(--border))]">
            <tr>
              <th className="p-6 font-black">Objective</th>
              <th className="p-6 font-black">Evaluation Criteria</th>
              <th className="p-6 font-black">Band</th>
              <th className="p-6 text-right font-black px-8">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--border))]">
            {filtered.map(kpi => (
              <tr key={kpi.id} className="hover:bg-[rgb(var(--surface-2))] transition-colors group">
                <td className="p-6">
                  <div className="font-bold text-[rgb(var(--text))] tracking-tight">{kpi.title}</div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase mt-1">Weight: {kpi.weight}</div>
                </td>
                <td className="p-6">
                  <span className="text-[10px] font-black uppercase px-3 py-1 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">
                    {kpi.stream}
                  </span>
                </td>
                <td className="p-6 font-mono text-purple-400">{kpi.band}</td>
	                <td className="p-6 text-right px-8">
	                  <div className="flex justify-end gap-2">
	                    <button
	                      onClick={() => onEditKpi?.(kpi)}
	                      className="p-2.5 bg-blue-500/5 text-blue-500 hover:bg-blue-500 hover:text-white rounded-xl transition-all border border-blue-500/10"
	                      title="Edit"
	                    >
	                      <Edit3 size={18} />
	                    </button>
	                    <button className="p-2.5 bg-red-500/5 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all border border-red-500/10">
	                      <Trash2 size={18} />
	                    </button>
	                  </div>
	                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td className="p-10 text-center text-slate-500" colSpan={4}>
                  No KPIs match your search.
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
