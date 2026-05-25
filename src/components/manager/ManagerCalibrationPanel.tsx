// @ts-nocheck
import React, { useMemo, useState } from "react";
import { Eye, EyeOff, BarChart3 } from "lucide-react";
import { buildCalibrationDataset } from "../../utils/managerCalibration";

export default function ManagerCalibrationPanel({ teamRows = [] }) {
  const [reveal, setReveal] = useState(false);
  const data = useMemo(() => buildCalibrationDataset(teamRows, { reveal }), [teamRows, reveal]);

  if (!data.count) return null;

  return (
    <section className="rt-panel overflow-hidden mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgb(var(--border))] px-5 py-4">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} className="text-[rgb(var(--accent))]" />
          <div>
            <h3 className="rt-section-title">Calibration mode</h3>
            <p className="rt-section-subtitle">Blind comparison of team KPI/value averages before final submit.</p>
          </div>
        </div>
        <button type="button" className="rt-btn-soft text-xs" onClick={() => setReveal((v) => !v)}>
          {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
          {reveal ? "Hide names" : "Reveal names"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 p-5 border-b border-[rgb(var(--border))] sm:grid-cols-4">
        <Stat label="Team size" value={data.count} />
        <Stat label="KPI spread" value={data.kpiDistribution.spread ?? "—"} />
        <Stat label="KPI mean" value={data.kpiDistribution.mean ?? "—"} />
        <Stat label="Values mean" value={data.valueDistribution.mean ?? "—"} />
      </div>
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">
              <th className="p-3">Member</th>
              <th className="p-3">KPI avg</th>
              <th className="p-3">Values avg</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id} className="border-t border-[rgb(var(--border))]">
                <td className="p-3 font-medium">{row.label}</td>
                <td className="p-3 tabular-nums">{row.kpiAvg ?? "—"}</td>
                <td className="p-3 tabular-nums">{row.valueAvg ?? "—"}</td>
                <td className="p-3">
                  <span className="rt-badge rt-badge--neutral text-[10px]">{row.status || "—"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rt-stat">
      <div className="rt-field-label">{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}
