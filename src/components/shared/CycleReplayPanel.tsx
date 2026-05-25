// @ts-nocheck
import React, { useEffect, useState } from "react";
import { GitCompare, Loader2 } from "lucide-react";
import { fetchMyMonthlySubmission, normalizeMonthlySubmission } from "../../api/monthly-submissions";
import { previousYearMonth, extractReplaySnapshot, diffReplaySnapshots } from "../../utils/cycleReplay";

export default function CycleReplayPanel({
  currentSubmission,
  month,
  employeeId = null,
  className = "",
}) {
  const [prior, setPrior] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const currentSnap = extractReplaySnapshot(currentSubmission);
  const priorMonth = previousYearMonth(month || currentSnap.month);

  useEffect(() => {
    if (!priorMonth || priorMonth === "—") return;
    let alive = true;
    setLoading(true);
    setError("");
    fetchMyMonthlySubmission({ month: priorMonth, employeeId })
      .then((raw) => {
        if (!alive) return;
        const norm = normalizeMonthlySubmission(raw);
        setPrior(norm ? extractReplaySnapshot({ submission: norm }) : null);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err?.message || "Could not load prior cycle.");
        setPrior(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [priorMonth, employeeId]);

  const diffs = diffReplaySnapshots(currentSnap, prior);

  return (
    <section className={["rt-panel overflow-hidden", className].filter(Boolean).join(" ")}>
      <div className="flex items-center gap-2 border-b border-[rgb(var(--border))] px-4 py-3">
        <GitCompare size={16} className="text-[rgb(var(--accent))]" />
        <h4 className="text-sm font-semibold">Cycle replay</h4>
        <span className="text-xs text-[rgb(var(--muted))]">
          {currentSnap.month} vs {priorMonth || "prior"}
        </span>
        {loading ? <Loader2 size={14} className="animate-spin ml-auto" /> : null}
      </div>
      {error ? <p className="p-4 text-xs text-[rgb(var(--danger))]">{error}</p> : null}
      {diffs.length ? (
        <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-[rgb(var(--border))]">
          {diffs.map((d) => (
            <span key={d.field} className="rt-badge rt-badge--primary">
              Δ {d.field}
            </span>
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-[rgb(var(--border))]">
        <ReplayColumn title={`Prior (${priorMonth || "—"})`} snap={prior} />
        <ReplayColumn title={`Current (${currentSnap.month})`} snap={currentSnap} />
      </div>
    </section>
  );
}

function ReplayColumn({ title, snap }) {
  if (!snap) {
    return (
      <div className="p-4 text-sm text-[rgb(var(--muted))]">
        <div className="rt-field-label mb-2">{title}</div>
        No submission data for this period.
      </div>
    );
  }
  return (
    <div className="p-4 space-y-3 text-sm">
      <div className="rt-field-label">{title}</div>
      <div>
        <div className="text-[10px] font-semibold uppercase text-[rgb(var(--muted))]">Self review</div>
        <p className="mt-1 whitespace-pre-wrap text-[rgb(var(--text))]">{snap.selfReviewText || "—"}</p>
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase text-[rgb(var(--muted))]">Manager notes</div>
        <p className="mt-1 whitespace-pre-wrap text-[rgb(var(--text))]">{snap.managerNotes || "—"}</p>
      </div>
      <div className="text-xs text-[rgb(var(--muted))]">
        Status: {snap.reviewStatus || snap.status || "—"}
      </div>
    </div>
  );
}
