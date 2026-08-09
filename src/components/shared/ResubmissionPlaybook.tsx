// @ts-nocheck
import React, { useMemo } from "react";
import { CheckCircle2, Circle, ListChecks } from "lucide-react";
import { buildResubmissionPlaylist } from "../../utils/resubmissionPlaybook";

export default function ResubmissionPlaybook({
  submission,
  rejectComment = "",
  hideFeedbackItem = false,
  className = "",
}) {
  const playbook = useMemo(
    () => buildResubmissionPlaylist(submission, { rejectComment }),
    [submission, rejectComment],
  );

  const items = useMemo(() => {
    const list = Array.isArray(playbook.items) ? playbook.items : [];
    if (!hideFeedbackItem) return list;
    return list.filter((item) => item.id !== "feedback");
  }, [hideFeedbackItem, playbook.items]);

  if (!items.length) return null;

  const doneCount = items.filter((item) => item.status === "done").length;

  return (
    <section className={["rt-panel p-5 sm:p-6 space-y-4", className].filter(Boolean).join(" ")}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))]">
            <ListChecks size={16} />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[rgb(var(--text))]">Before you resubmit</h4>
            <p className="text-xs text-[rgb(var(--muted))] mt-0.5">
              Work through these steps, then submit from Review.
            </p>
          </div>
        </div>
        <span className="rt-badge rt-badge--neutral shrink-0 tabular-nums">
          {doneCount}/{items.length} complete
        </span>
      </div>

      <ul className="rounded-xl border border-[rgb(var(--border))] divide-y divide-[rgb(var(--border))] overflow-hidden bg-[rgb(var(--surface))]">
        {items.map((item) => {
          const isDone = item.status === "done";
          return (
            <li key={item.id} className="flex items-start gap-3 px-4 py-3.5">
              {isDone ? (
                <CheckCircle2
                  size={18}
                  className="shrink-0 text-[rgb(var(--success))] mt-0.5"
                  aria-hidden
                />
              ) : (
                <Circle size={18} className="shrink-0 text-[rgb(var(--muted))] mt-0.5" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <div
                  className={[
                    "text-sm font-medium",
                    isDone ? "text-[rgb(var(--text-secondary))]" : "text-[rgb(var(--text))]",
                  ].join(" ")}
                >
                  {item.label}
                </div>
                <div className="text-xs text-[rgb(var(--muted))] mt-0.5 leading-relaxed">{item.detail}</div>
              </div>
              {isDone ? (
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--success))]">
                  Done
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
