// @ts-nocheck
import React, { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { findMisalignedTimeLogs } from "../../utils/projectTimeAlignment";

export default function ProjectTimeAlignmentPanel({ logs = [], assignedProjectIds = [], assignedProjectCodes = [] }) {
  const misaligned = useMemo(
    () => findMisalignedTimeLogs(logs, assignedProjectIds, assignedProjectCodes),
    [logs, assignedProjectIds, assignedProjectCodes],
  );

  if (!misaligned.length) return null;

  return (
    <div className="rt-panel-subtle border border-amber-500/30 p-4 space-y-3">
      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
        <AlertTriangle size={16} />
        <span className="text-sm font-semibold">Project–time misalignment</span>
        <span className="rt-badge rt-badge--warning ml-auto">{misaligned.length} entries</span>
      </div>
      <p className="text-xs text-[rgb(var(--muted))]">
        These logs reference projects outside your assigned set for this cycle. HR may follow up.
      </p>
      <ul className="space-y-2 max-h-40 overflow-auto custom-scrollbar">
        {misaligned.map((m, i) => (
          <li key={i} className="text-xs flex justify-between gap-2 border-b border-[rgb(var(--border))] pb-2">
            <span className="font-medium">{m.projectLabel}</span>
            <span className="text-[rgb(var(--muted))]">
              {m.logDate} · {m.hours}h
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
