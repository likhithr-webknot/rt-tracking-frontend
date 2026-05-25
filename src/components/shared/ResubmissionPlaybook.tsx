// @ts-nocheck
import React, { useMemo } from "react";
import { CheckCircle2, Circle, ListChecks } from "lucide-react";
import { buildResubmissionPlaylist } from "../../utils/resubmissionPlaybook";

export default function ResubmissionPlaybook({ submission, rejectComment = "", className = "" }) {
  const playbook = useMemo(
    () => buildResubmissionPlaylist(submission, { rejectComment }),
    [submission, rejectComment],
  );

  if (!playbook.items.length) return null;

  return (
    <section className={["rt-panel-subtle p-4 space-y-3", className].filter(Boolean).join(" ")}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListChecks size={16} className="text-[rgb(var(--warning))]" />
          <h4 className="text-sm font-semibold text-[rgb(var(--text))]">Resubmission playbook</h4>
        </div>
        <span className="rt-badge rt-badge--warning">
          {playbook.progress}/{playbook.total} done
        </span>
      </div>
      <ul className="space-y-2">
        {playbook.items.map((item) => (
          <li
            key={item.id}
            className={[
              "flex gap-3 rounded-[var(--radius-lg)] border px-3 py-2.5 text-sm",
              item.status === "done"
                ? "border-[rgb(var(--success))]/25 bg-[rgb(var(--success-soft))]"
                : "border-[rgb(var(--border))] bg-[rgb(var(--surface))]",
            ].join(" ")}
          >
            {item.status === "done" ? (
              <CheckCircle2 size={16} className="shrink-0 text-[rgb(var(--success))] mt-0.5" />
            ) : (
              <Circle size={16} className="shrink-0 text-[rgb(var(--muted))] mt-0.5" />
            )}
            <div>
              <div className="font-medium text-[rgb(var(--text))]">{item.label}</div>
              <div className="text-xs text-[rgb(var(--muted))] mt-0.5">{item.detail}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
