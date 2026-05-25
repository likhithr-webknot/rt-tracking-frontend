// @ts-nocheck
import React, { useMemo } from "react";
import { ArrowUpCircle } from "lucide-react";
import { buildPromotionReadiness } from "../../utils/promotionReadiness";

export default function PromotionReadinessTimeline({ employee, averageScore = null, compact = false }) {
  const readiness = useMemo(
    () => buildPromotionReadiness(employee, { averageScore }),
    [employee, averageScore],
  );

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {readiness.monthsInBand != null ? (
          <span className="rt-badge rt-badge--neutral">{readiness.monthsInBand} mo in band</span>
        ) : null}
        {readiness.lastPromotionDate ? (
          <span className="rt-badge rt-badge--primary">
            Promoted {new Date(readiness.lastPromotionDate).toLocaleDateString(undefined, { month: "short", year: "2-digit" })}
          </span>
        ) : (
          <span className="rt-badge rt-badge--neutral">No promotion on file</span>
        )}
        {readiness.eligible ? (
          <span className="rt-badge rt-badge--success">Eligible → {readiness.preview.nextBand}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rt-panel-subtle p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ArrowUpCircle size={16} className="text-[rgb(var(--accent))]" />
        <span className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">
          Promotion readiness
        </span>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rt-badge rt-badge--neutral">Band {readiness.code || "—"}</span>
        {readiness.monthsInBand != null ? (
          <span className="rt-badge rt-badge--neutral">{readiness.monthsInBand} months in band</span>
        ) : null}
        {readiness.averageScore != null ? (
          <span className="rt-badge rt-badge--primary">Score {readiness.averageScore}/5</span>
        ) : null}
        {readiness.eligible ? (
          <span className="rt-badge rt-badge--success">Next: {readiness.preview.nextBand}</span>
        ) : (
          <span className="rt-badge rt-badge--warning">{readiness.preview.reasonIfBlocked || "Not eligible"}</span>
        )}
      </div>
      {readiness.milestones?.length ? (
        <div className="flex flex-wrap gap-1 pt-1">
          {readiness.milestones.map((m) => (
            <span
              key={m.band}
              className={[
                "rounded-[var(--radius-pill)] px-2 py-0.5 text-[10px] font-semibold",
                m.state === "current"
                  ? "bg-[rgb(var(--accent-soft))] text-[rgb(var(--accent))]"
                  : m.state === "past"
                    ? "bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))]"
                    : "border border-dashed border-[rgb(var(--border))] text-[rgb(var(--muted))]",
              ].join(" ")}
            >
              {m.band}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
