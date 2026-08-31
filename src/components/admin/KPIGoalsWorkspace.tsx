// @ts-nocheck
import React, { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Filter,
  Hash,
  Layers3,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import AdminPageHeader, { AdminPageShell } from "./AdminPageHeader";
import CursorPagination from "../shared/CursorPagination";
import EntityCsvToolbar from "../shared/EntityCsvToolbar";
import {
  extractEvaluationCriteria,
  evaluationCriteriaDisplayLabel,
  evaluationCriteriaGroupKey,
} from "../../utils/evaluationCriteria";
import { buildCriteriaColorMap, paletteForCriteria } from "../../utils/evaluationCriteriaPalette";
import { computeKpiWeightIntegrity } from "../../utils/kpiWeightIntegrity";

function normKey(v) {
  const s = String(v ?? "").trim();
  return s ? s.toLowerCase() : "unassigned";
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

function formatWeight(value) {
  const n = parseWeightPercent(value);
  if (!n) return "—";
  return `${n % 1 === 0 ? n : n.toFixed(1)}%`;
}

function FilterChip({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={["rt-chip", active ? "rt-chip--active" : ""].join(" ")}
    >
      {label}
    </button>
  );
}

export default function KPIGoalsWorkspace({
  kpis,
  allKpis = null,
  allKpisLoaded = false,
  allKpisLoading = false,
  searchQuery,
  setSearchQuery,
  onAddKpi,
  onEditKpi,
  onDeleteKpi,
  loading,
  onReloadAll = null,
  pager,
  pageSize = 10,
  pageSizeOptions = [10, 20, 50],
  onPageSizeChange,
  catalogStreams = [],
  catalogBands = [],
  catalogLoading = false,
  onImportComplete = null,
  onExportKpis = null,
  showToast = null,
}) {
  const [filterStream, setFilterStream] = useState("");
  const [filterBand, setFilterBand] = useState("");

  const searchUniverse = useMemo(() => {
    if (allKpisLoaded && Array.isArray(allKpis)) return allKpis;
    return kpis;
  }, [allKpis, allKpisLoaded, kpis]);

  React.useEffect(() => {
    if (!onReloadAll || allKpisLoading || allKpisLoaded) return;
    onReloadAll({ silent: true }).catch(() => {});
  }, [allKpisLoaded, allKpisLoading, onReloadAll]);

  React.useEffect(() => {
    if (!searchQuery.trim() || !onReloadAll || allKpisLoading) return;
    if (Array.isArray(allKpis) && allKpis.length) return;
    onReloadAll({ silent: true }).catch(() => {});
  }, [allKpis, allKpisLoading, onReloadAll, searchQuery]);

  const streamOptions = useMemo(() => {
    const fromCat = (catalogStreams || [])
      .filter((r) => r?.active !== false)
      .map((r) => String(r.label || r.code || "").trim())
      .filter(Boolean);
    const fromKpis = searchUniverse.map((k) => String(k?.stream ?? "").trim()).filter(Boolean);
    return Array.from(new Set([...fromCat, ...fromKpis])).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [catalogStreams, searchUniverse]);

  const bandOptions = useMemo(() => {
    const fromCat = (catalogBands || [])
      .filter((r) => r?.active !== false)
      .map((r) => String(r.label || r.code || "").trim())
      .filter(Boolean);
    const fromKpis = searchUniverse.map((k) => String(k?.band ?? "").trim()).filter(Boolean);
    return Array.from(new Set([...fromCat, ...fromKpis])).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [catalogBands, searchUniverse]);

  const filtered = useMemo(() => {
    const q = String(searchQuery || "").toLowerCase();
    return searchUniverse.filter((kpi) => {
      const stream = String(kpi?.stream ?? "").trim() || "Unassigned";
      const band = String(kpi?.band ?? "").trim() || "Unassigned";
      const matchesStream = !filterStream || normKey(stream) === normKey(filterStream);
      const matchesBand = !filterBand || normKey(band) === normKey(filterBand);
      if (!matchesStream || !matchesBand) return false;
      const criteria = extractEvaluationCriteria(kpi);
      if (!q) return true;
      return (
        String(kpi?.title || "").toLowerCase().includes(q) ||
        criteria.toLowerCase().includes(q) ||
        stream.toLowerCase().includes(q) ||
        band.toLowerCase().includes(q)
      );
    });
  }, [searchQuery, searchUniverse, filterStream, filterBand]);

  const grouped = useMemo(() => {
    const map = new Map();

    for (const kpi of filtered) {
      const band = String(kpi?.band ?? "").trim() || "Unassigned";
      const stream = String(kpi?.stream ?? "").trim() || "Unassigned";
      const criteria = extractEvaluationCriteria(kpi);
      const criteriaKey = evaluationCriteriaGroupKey(criteria);
      const criteriaLabel = evaluationCriteriaDisplayLabel(criteria);

      if (!map.has(criteriaKey)) {
        map.set(criteriaKey, { key: criteriaKey, label: criteriaLabel, goals: [] });
      }
      map.get(criteriaKey).goals.push({
        ...kpi,
        band,
        stream,
        evaluationCriteria: criteria || criteriaLabel,
      });
    }

    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    );
  }, [filtered]);

  const criteriaColorMap = useMemo(
    () => buildCriteriaColorMap(grouped.map((group) => group.label)),
    [grouped],
  );

  const weightReport = useMemo(() => computeKpiWeightIntegrity(searchUniverse), [searchUniverse]);

  const stats = useMemo(
    () => ({
      total: searchUniverse.length,
      groups: grouped.length,
      visible: filtered.length,
      overweightCount: weightReport.overweightCount,
    }),
    [searchUniverse.length, grouped.length, filtered.length, weightReport.overweightCount],
  );

  return (
    <AdminPageShell className="space-y-8 text-[rgb(var(--text))]">
      <AdminPageHeader title="KPI Goals" subtitle="Goals grouped by evaluation criteria; each row shows department, band, and weightage.">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[rgb(var(--muted))]">
            <span>Slots</span>
            <select
              value={String(pageSize)}
              onChange={(e) => {
                const next = Number.parseInt(e.target.value, 10);
                if (Number.isFinite(next) && next > 0) onPageSizeChange?.(next);
              }}
              className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-2 py-1 text-[11px] font-semibold text-[rgb(var(--text))]"
            >
              {(pageSizeOptions || [10, 20, 50]).map((size) => (
                <option key={size} value={String(size)}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <EntityCsvToolbar
            entityKey="kpi-definitions"
            onImportComplete={onImportComplete}
            onExport={onExportKpis}
            showToast={showToast}
          />
          <button type="button" onClick={onAddKpi} className="rt-btn-primary">
            <Plus size={18} /> Add goal
          </button>
        </div>
      </AdminPageHeader>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={Hash} label="Total goals" value={stats.total} />
        <StatCard icon={Layers3} label="Criteria groups" value={stats.groups} />
        <StatCard
          icon={AlertTriangle}
          label="Over 100%"
          value={stats.overweightCount}
          iconClassName={
            stats.overweightCount > 0
              ? "text-red-500 dark:text-red-400"
              : "text-emerald-500 dark:text-emerald-400"
          }
        />
      </div>

      {weightReport.overweightCount > 0 ? (
        <div className="rt-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgb(var(--border))] px-5 py-3">
            <div>
              <p className="text-sm font-semibold text-[rgb(var(--text))]">Weight totals over 100%</p>
              <p className="mt-0.5 text-xs text-[rgb(var(--muted))]">
                Band + department weights per evaluation criteria must not exceed 100%.
              </p>
            </div>
            <span className="rt-badge rt-badge--danger uppercase">
              <AlertTriangle size={12} className="inline mr-1" />
              Fix overweight
            </span>
          </div>
          <div className="max-h-56 space-y-2 overflow-auto custom-scrollbar p-4">
            {weightReport.overweight.map((c) => (
              <div
                key={`${c.criteriaKey}-${c.band}-${c.stream}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-lg)] border border-[rgb(var(--danger))]/25 bg-[rgb(var(--danger-soft))] px-4 py-2.5"
              >
                <div>
                  <div className="text-sm font-semibold text-[rgb(var(--text))]">{c.criteriaLabel}</div>
                  <div className="text-xs text-[rgb(var(--muted))]">
                    {c.band} · {c.stream} · {c.goalCount} goal{c.goalCount === 1 ? "" : "s"}
                  </div>
                </div>
                <span className="rt-badge rt-badge--danger tabular-nums">{c.sum}% (+{c.gap}%)</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" size={18} />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search goal, evaluation criteria, band, or department…"
            className="rt-input w-full py-3.5 pl-11"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterChip active={!filterBand && !filterStream} onClick={() => { setFilterBand(""); setFilterStream(""); }} label="All" />
          {bandOptions.slice(0, 8).map((b) => (
            <FilterChip key={b} active={filterBand === b} onClick={() => setFilterBand((x) => (x === b ? "" : b))} label={b} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex flex-1 min-w-[12rem] flex-col gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[rgb(var(--muted))]">
          Department
          <select value={filterStream} onChange={(e) => setFilterStream(e.target.value)} className="rt-input text-xs font-semibold normal-case">
            <option value="">All departments</option>
            {streamOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 min-w-[12rem] flex-col gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[rgb(var(--muted))]">
          Band
          <select value={filterBand} onChange={(e) => setFilterBand(e.target.value)} className="rt-input text-xs font-semibold normal-case">
            <option value="">All bands</option>
            {bandOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </label>
        {catalogLoading ? <p className="text-[11px] text-[rgb(var(--muted))]">Loading catalog…</p> : null}
      </div>

      {loading && !filtered.length ? (
        <div className="rt-panel flex items-center justify-center gap-3 p-12 text-sm text-[rgb(var(--muted))]">
          <Loader2 size={20} className="animate-spin" />
          Loading KPI goals…
        </div>
      ) : !filtered.length ? (
        <div className="rt-panel p-10 text-center text-sm text-[rgb(var(--muted))]">No KPI goals match your filters.</div>
      ) : (
        <div className="space-y-5">
          <AnimatePresence mode="popLayout">
            {grouped.map((group) => {
              const palette = paletteForCriteria(group.label, criteriaColorMap);
              const groupOverweight = weightReport.overweight.filter((c) => c.criteriaKey === group.key);
              return (
                <motion.section
                  key={group.key}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`rt-panel ring-2 ${palette.ring}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgb(var(--border))] px-5 py-4 sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${palette.dot}`} />
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold tracking-tight text-[rgb(var(--text))]">
                          {group.label}
                        </h3>
                        <p className="mt-1 text-[11px] font-medium text-[rgb(var(--muted))]">
                          {group.goals.length} goal{group.goals.length === 1 ? "" : "s"}
                          {groupOverweight.length
                            ? ` · ${groupOverweight.length} combo${groupOverweight.length === 1 ? "" : "s"} over 100%`
                            : ""}
                        </p>
                        {groupOverweight.length ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {groupOverweight.map((c) => (
                              <span
                                key={`${c.band}-${c.stream}`}
                                className="rt-badge rt-badge--danger text-[10px] tabular-nums"
                              >
                                {c.band} · {c.stream} · {c.sum}%
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <span className={`rt-badge shrink-0 border ${palette.badge}`}>
                      {group.label}
                    </span>
                  </div>
                  <ul className="divide-y divide-[rgb(var(--border))]">
                    {group.goals.map((kpi) => (
                      <li
                        key={kpi.id}
                        className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-[rgb(var(--surface-2))]/60 sm:px-6"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[rgb(var(--text))]">{kpi.title}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <span className={`rt-badge border text-[10px] ${palette.dept}`}>
                              Dept · {kpi.stream}
                            </span>
                            <span className={`rt-badge border text-[10px] ${palette.band}`}>
                              Band · {kpi.band}
                            </span>
                            <span className="text-[11px] text-[rgb(var(--muted))]">
                              Weight ·{" "}
                              <span className="font-mono font-semibold text-[rgb(var(--text))]">
                                {formatWeight(kpi.weight)}
                              </span>
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button type="button" onClick={() => onEditKpi?.(kpi)} className="rounded-lg p-2 text-[rgb(var(--muted))] hover:bg-[rgb(var(--primary-soft))] hover:text-[rgb(var(--primary))]" title="Edit">
                            <Pencil size={16} />
                          </button>
                          <button type="button" onClick={() => onDeleteKpi?.(kpi)} className="rounded-lg p-2 text-[rgb(var(--muted))] hover:bg-red-500/10 hover:text-red-500" title="Delete">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </motion.section>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {pager ? (
        <CursorPagination
          canPrev={Boolean(pager.canPrev)}
          canNext={Boolean(pager.canNext)}
          onPrev={pager.onPrev}
          onNext={pager.onNext}
          loading={Boolean(pager.loading)}
          label={pager.label}
        />
      ) : null}
    </AdminPageShell>
  );
}

function StatCard({ icon: Icon, label, value, iconClassName = "text-[rgb(var(--accent))]" }) {
  return (
    <div className="pulse-metric">
      <div className="flex items-start justify-between gap-3">
        <div className="pulse-metric-label">{label}</div>
        {Icon ? <Icon size={18} strokeWidth={2} className={iconClassName} /> : null}
      </div>
      <div className="pulse-metric-value tabular-nums">{value}</div>
    </div>
  );
}
