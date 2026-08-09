// @ts-nocheck
import React, { useMemo } from "react";
import { Grid3X3 } from "lucide-react";
import { buildWebknotValueHeatmap, heatColorForScore } from "../../utils/webknotValueHeatmap";

export default function WebknotValueHeatmap({ rows = [], valuesIndex = {} }) {
  const { valueColumns, matrix } = useMemo(
    () => buildWebknotValueHeatmap(rows, valuesIndex),
    [rows, valuesIndex],
  );

  if (!matrix.length) {
    return (
      <div className="rt-panel p-8 text-center text-sm text-[rgb(var(--muted))]">
        No manager value ratings available for heatmap.
      </div>
    );
  }

  return (
    <section className="rt-panel overflow-hidden">
      <div className="flex items-center gap-3 border-b border-[rgb(var(--border))] px-5 py-4">
        <Grid3X3 size={18} className="text-[rgb(var(--accent))]" />
        <div>
          <h3 className="rt-section-title">Webknot value heatmap</h3>
          <p className="rt-section-subtitle">Average manager value scores by band and department.</p>
        </div>
      </div>
      <div className="overflow-x-auto custom-scrollbar p-4">
        <table className="text-left text-xs border-collapse min-w-full">
          <thead>
            <tr>
              <th className="p-2 font-semibold text-[rgb(var(--muted))] sticky left-0 bg-[rgb(var(--surface))]">Band</th>
              <th className="p-2 font-semibold text-[rgb(var(--muted))]">Dept</th>
              {valueColumns.map((col) => (
                <th key={col.id} className="p-2 font-semibold text-[rgb(var(--muted))] max-w-[8rem] truncate" title={col.title}>
                  {col.title}
                </th>
              ))}
              <th className="p-2 font-semibold text-[rgb(var(--muted))]">Avg</th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => (
              <tr key={row.key} className="border-t border-[rgb(var(--border))]">
                <td className="p-2 font-mono font-semibold sticky left-0 bg-[rgb(var(--surface))]">{row.band}</td>
                <td className="p-2">{row.stream}</td>
                {valueColumns.map((col) => {
                  const score = row.cells[col.id];
                  return (
                    <td key={col.id} className={`p-2 text-center font-semibold tabular-nums ${heatColorForScore(score)}`}>
                      {score != null ? score : "—"}
                    </td>
                  );
                })}
                <td className="p-2 text-center font-bold tabular-nums">{row.rowAvg ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
