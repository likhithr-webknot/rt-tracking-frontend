import React, { useMemo, useState } from "react";
import { AlertTriangle, Edit3, Layers3, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import CursorPagination from "../shared/CursorPagination.jsx";

export default function KPIRegistry({
  kpis,
  allKpis = null,
  allKpisLoaded = false,
  allKpisLoading = false,
  allKpisError = "",
  searchQuery,
  setSearchQuery,
  onAddKpi,
  onEditKpi,
  onDeleteKpi,
  loading,
  error,
  onReload,
  onReloadAll = null,
  pager,
  pageSize = 10,
  pageSizeOptions = [10, 20, 50],
  onPageSizeChange,
}) {
  const [selectedBands, setSelectedBands] = useState([]); // band strings; empty means "all"

  const searchUniverse = useMemo(() => {
    if (allKpisLoaded && Array.isArray(allKpis)) return allKpis;
    return kpis;
  }, [allKpis, allKpisLoaded, kpis]);

  // Ensure the full KPI list is hydrated at least once when the tab loads
  React.useEffect(() => {
    if (!onReloadAll) return;
    if (allKpisLoading) return;
    if (allKpisLoaded) return;
    onReloadAll({ silent: true }).catch(() => {});
  }, [allKpisLoaded, allKpisLoading, onReloadAll]);

  // Auto-load the full KPI set when user starts typing so search spans all pages
  React.useEffect(() => {
    if (!searchQuery.trim()) return;
    if (!onReloadAll) return;
    if (allKpisLoading) return;
    if (Array.isArray(allKpis) && allKpis.length) return;
    onReloadAll({ silent: true }).catch(() => {});
  }, [allKpis, allKpisLoading, onReloadAll, searchQuery]);

  // When user clicks Refresh, also trigger full reload (not just current page)
  const handleRefresh = React.useCallback(() => {
    onReload?.();
    if (onReloadAll) {
      onReloadAll({ silent: true }).catch(() => {});
    }
  }, [onReload, onReloadAll]);

  function normalizeKey(value) {
    const text = String(value ?? "").trim();
    return text ? text.toLowerCase() : "unassigned";
  }

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
    const map = new Map(); // normalized band -> { key, label, count }
    for (const kpi of searchUniverse) {
      const label = String(kpi?.band ?? "").trim() || "Unassigned";
      const key = normalizeKey(label);
      const prev = map.get(key) || { key, label, count: 0 };
      prev.count += 1;
      if (!map.has(key)) prev.label = label; // preserve first label for display
      map.set(key, prev);
    }

    const entries = Array.from(map.values()).sort((a, b) =>
      String(a.label).localeCompare(String(b.label), undefined, { numeric: true })
    );

    return {
      map,
      entries,
    };
  }, [searchUniverse]);

  const comboStats = useMemo(() => {
    const map = new Map(); // `${bandKey}||${streamKey}` -> { band, stream, bandKey, streamKey, count, sum }
    for (const kpi of searchUniverse) {
      const band = String(kpi?.band ?? "").trim() || "Unassigned";
      const stream = String(kpi?.stream ?? "").trim() || "Unassigned";
      const bandKey = normalizeKey(band);
      const streamKey = normalizeKey(stream);
      const key = `${bandKey}||${streamKey}`;
      const prev = map.get(key) || { band, stream, bandKey, streamKey, count: 0, sum: 0 };
      prev.count += 1;
      prev.sum += parseWeightPercent(kpi?.weight);
      if (!map.has(key)) {
        prev.band = band;
        prev.stream = stream;
      }
      map.set(key, prev);
    }

    const entries = Array.from(map.values()).sort((a, b) => {
      const bandCmp = String(a.band).localeCompare(String(b.band), undefined, { numeric: true });
      if (bandCmp !== 0) return bandCmp;
      return String(a.stream).localeCompare(String(b.stream), undefined, { numeric: true });
    });

    return { entries };
  }, [searchUniverse]);

  const selectedBandSet = useMemo(() => new Set(selectedBands), [selectedBands]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return searchUniverse.filter((kpi) => {
      const matchesText =
        kpi.title.toLowerCase().includes(q) || kpi.stream.toLowerCase().includes(q);

      const band = String(kpi?.band ?? "").trim() || "Unassigned";
      const bandKey = normalizeKey(band);
      const matchesBand = selectedBandSet.size === 0 ? true : selectedBandSet.has(bandKey);

      return matchesText && matchesBand;
    });
  }, [searchQuery, searchUniverse, selectedBandSet]);

  const selectedBandWeightWarnings = useMemo(() => {
    return comboStats.entries
      .filter((entry) => (selectedBandSet.size === 0 ? true : selectedBandSet.has(entry.bandKey)))
      .map((entry) => ({
        band: entry.band,
        stream: entry.stream,
        count: entry.count,
        sum: Math.round(entry.sum * 10) / 10,
      }))
      .filter((x) => x.count > 0 && x.sum > 100);
  }, [comboStats.entries, selectedBandSet]);

  const overweightBandSet = useMemo(
    () =>
      new Set(
        comboStats.entries
          .filter((entry) => Math.round(entry.sum * 10) / 10 > 100)
          .map((entry) => entry.bandKey)
      ),
    [comboStats.entries]
  );

  const overweightComboCount = useMemo(
    () => comboStats.entries.filter((entry) => Math.round(entry.sum * 10) / 10 > 100).length,
    [comboStats.entries]
  );

  return (
    <div className="space-y-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 text-[rgb(var(--text))]">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="rt-title">KPI Directory</h2>
          <p className="text-sm mt-2 text-slate-700 dark:text-slate-300">Map performance metrics to bands and streams.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-700 dark:text-slate-300">
            <span>Slots</span>
            <select
              value={String(pageSize)}
              onChange={(e) => {
                const next = Number.parseInt(String(e.target.value || ""), 10);
                if (!Number.isFinite(next) || next <= 0) return;
                onPageSizeChange?.(next);
              }}
              className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-2 py-1 text-[11px] font-semibold text-[rgb(var(--text))] outline-none focus:border-blue-400"
              aria-label="KPI slots per page"
              title="Slots per page"
            >
              {(Array.isArray(pageSizeOptions) ? pageSizeOptions : [10, 20, 50]).map((size) => (
                <option key={String(size)} value={String(size)}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={handleRefresh}
            disabled={Boolean(loading)}
            className={[
              "rt-btn-ghost transition-all",
              loading ? "opacity-60 cursor-not-allowed" : "",
            ].join("")}
            title="Reload KPIs"
          >
            <RefreshCw size={18} /> {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            onClick={onAddKpi}
            className="rt-btn-primary"
          >
            <Plus size={18} /> Add New KPI
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rt-panel-subtle p-4">
          <div className="rt-kicker">Rows Loaded</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{searchUniverse.length}</div>
        </div>
        <div className="rt-panel-subtle p-4">
          <div className="rt-kicker">Bands On Page</div>
          <div className="mt-2 inline-flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Layers3 size={18} className="text-blue-500" />
            <span>{bandStats.entries.length}</span>
          </div>
        </div>
        <div className="rt-panel-subtle p-4">
          <div className="rt-kicker">Overweight Pairs</div>
          <div className="mt-2 inline-flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <AlertTriangle size={18} className={overweightComboCount > 0 ? "text-red-500" : "text-emerald-500"} />
            <span>{overweightComboCount}</span>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          Failed to load KPIs: <span className="font-mono">{error}</span>
        </div>
      ) : null}

      <div className="rt-panel-subtle p-4 sm:p-5 space-y-3">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" size={20} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by KPI name or stream..."
            className="w-full rt-input py-4 pl-12 pr-4 text-sm text-[rgb(var(--text))] placeholder:text-slate-500 dark:placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {bandStats.entries.map((bandEntry) => {
            const band = bandEntry.label;
            const key = bandEntry.key;
            const isSelected = selectedBandSet.has(key);
            const stats = bandStats.map.get(key) || { count: 0 };
            const isOver = overweightBandSet.has(key);

            return (
              <button
                key={key}
                onClick={() => {
                  if (isSelected) return;
                  setSelectedBands((prev) => Array.from(new Set([...prev, key])));
                }}
                className={[
                  "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-semibold uppercase tracking-wider border transition-all",
                  isSelected
                    ? "bg-purple-600 text-white border-purple-600 shadow-lg shadow-purple-900/20"
                    : "bg-[rgb(var(--surface))] text-slate-700 dark:text-slate-200 border-[rgb(var(--border))] hover:bg-[rgb(var(--surface-2))]",
                  !isSelected && isOver ? "ring-2 ring-red-500/30" : "",
                ].join(" ")}
                title={`${band} (${stats.count})`}
              >
                <span>{band}</span>
                <span className={isOver ? "text-red-600 dark:text-red-300" : (isSelected ? "text-white/90" : "text-slate-500 dark:text-slate-400")}>
                  {stats.count} KPI
                </span>
                {isSelected ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBands((prev) => prev.filter((b) => b !== key));
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedBands((prev) => prev.filter((b) => b !== key));
                    }}
                    className="ml-1 rounded-md p-1 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--border))]"
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
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
          Weightage exceeds 100% for band + stream:
          {" "}
          <span className="font-mono font-semibold">
            {selectedBandWeightWarnings.map((x) => `${x.band}/${x.stream}=${x.sum}%`).join(", ")}
          </span>
        </div>
      ) : null}

      <div className="rt-panel overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-[rgb(var(--border))]">
            <tr>
              <th className="p-4 sm:p-5 font-semibold w-14">#</th>
              <th className="p-4 sm:p-5 font-semibold">Objective</th>
              <th className="p-4 sm:p-5 font-semibold">Stream</th>
              <th className="p-4 sm:p-5 font-semibold">Band</th>
              <th className="p-4 sm:p-5 text-right font-semibold px-8">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--border))]">
            {filtered.map((kpi, index) => (
              <tr key={kpi.id} className="hover:bg-[rgb(var(--surface-2))] transition-colors group">
                <td className="p-4 sm:p-5 text-xs font-bold text-slate-500 dark:text-slate-400">{index + 1}</td>
                <td className="p-4 sm:p-5">
                  <div className="font-bold text-[rgb(var(--text))] tracking-tight">{kpi.title}</div>
                  <div className="text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase mt-1">Weight: {kpi.weight}</div>
                </td>
                <td className="p-4 sm:p-5">
                  <span className="text-[10px] font-semibold uppercase px-3 py-1 bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300 rounded-lg border border-blue-200 dark:border-blue-500/20">
                    {kpi.stream}
                  </span>
                </td>
                <td className="p-4 sm:p-5 font-mono font-semibold text-indigo-600 dark:text-indigo-300">{kpi.band}</td>
	                <td className="p-4 sm:p-5 text-right px-8">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => onEditKpi?.(kpi)}
                        className="p-2 rounded-md text-[rgb(var(--muted))] hover:text-[rgb(var(--primary))] hover:bg-[rgb(var(--primary))]/10 transition-all"
                        title="Edit"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        onClick={() => onDeleteKpi?.(kpi)}
                        className="p-2 rounded-md text-red-500 hover:bg-red-500/10 transition-all"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
	                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 ? (
              <tr>
                <td className="p-10 text-center text-slate-600 dark:text-slate-400" colSpan={5}>
                  No KPIs match your search.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {pager ? (
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
