// @ts-nocheck
import React, { useMemo } from "react";
import { AlertTriangle, Radar } from "lucide-react";
import { computeKpiWeightIntegrity } from "../../utils/kpiWeightIntegrity";

export default function CriteriaWeightIntegrityRadar({ kpis = [], className = "" }) {
  const report = useMemo(() => computeKpiWeightIntegrity(kpis), [kpis]);

  if (!report.totalGoals) return null;

  return (
    <section className={["rt-panel overflow-hidden", className].filter(Boolean).join(" ")}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgb(var(--border))] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-lg)] bg-[rgb(var(--accent-soft))] text-[rgb(var(--accent))]">
            <Radar size={20} />
          </div>
          <div>
            <h3 className="rt-section-title">Criteria-weight integrity</h3>
            <p className="rt-section-subtitle">
              Live check: band + department weights per evaluation criteria must not exceed 100%.
            </p>
          </div>
        </div>
        {report.blocksCycleGate ? (
          <span className="rt-badge rt-badge--danger uppercase">
            <AlertTriangle size={12} className="inline mr-1" />
            Cycle gate: fix overweight
          </span>
        ) : (
          <span className="rt-badge rt-badge--success uppercase">All buckets valid</span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5 border-b border-[rgb(var(--border))]">
        {[
          { label: "Goals", value: report.totalGoals },
          { label: "Combos", value: report.totalCombos },
          { label: "Over 100%", value: report.overweightCount },
          { label: "Criteria", value: report.criteriaBuckets.length },
        ].map((s) => (
          <div key={s.label} className="rt-stat">
            <div className="rt-field-label">{s.label}</div>
            <div className="mt-2 text-xl font-bold tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>

      {report.overweight.length ? (
        <div className="max-h-72 overflow-auto custom-scrollbar p-5 space-y-3">
          {report.overweight.map((c) => (
            <div
              key={`${c.criteriaKey}-${c.band}-${c.stream}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-lg)] border border-[rgb(var(--danger))]/25 bg-[rgb(var(--danger-soft))] px-4 py-3"
            >
              <div>
                <div className="text-sm font-semibold text-[rgb(var(--text))]">{c.criteriaLabel}</div>
                <div className="text-xs text-[rgb(var(--muted))]">
                  {c.band} · {c.stream} · {c.goalCount} goals
                </div>
              </div>
              <span className="rt-badge rt-badge--danger tabular-nums">{c.sum}% (+{c.gap}%)</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="p-5 text-sm text-[rgb(var(--muted))]">No overweight band/department combinations.</p>
      )}
    </section>
  );
}
