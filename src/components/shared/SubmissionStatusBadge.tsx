// @ts-nocheck
import { resolveSubmissionWorkflow } from "../../utils/submissionStatus";

export default function SubmissionStatusBadge({
  status,
  reviewStatus,
  managerReady = false,
  adminAction = null,
  submissionType = null,
  size = "md",
  showDescription = false,
  className = "",
}) {
  const wf = resolveSubmissionWorkflow({
    status,
    reviewStatus,
    managerReady,
    adminAction,
    submissionType,
  });

  const sizeClass =
    size === "sm" ? "text-[10px] px-2 py-0.5" : size === "lg" ? "text-xs px-3 py-1" : "";

  return (
    <div className={["inline-flex flex-col gap-1", className].filter(Boolean).join(" ")}>
      <span className={["rt-badge uppercase", wf.badgeClass, sizeClass].join(" ")} title={wf.description}>
        {wf.label}
      </span>
      {showDescription ? (
        <span className="text-[11px] text-[rgb(var(--muted))] max-w-xs">{wf.description}</span>
      ) : null}
    </div>
  );
}

export function SubmissionLifecycleStrip({ workflowInput, className = "" }) {
  const wf = resolveSubmissionWorkflow(workflowInput);
  return (
    <ol
      className={["flex flex-wrap items-center gap-1", className].filter(Boolean).join(" ")}
      aria-label="Submission workflow"
    >
      {wf.steps.map((step, idx) => (
        <li key={step.phase} className="flex items-center gap-1">
          <span
            className={[
              "rounded-[var(--radius-pill)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
              step.state === "done"
                ? "bg-[rgb(var(--success-soft))] text-[rgb(var(--success))]"
                : step.state === "current"
                  ? "bg-[rgb(var(--accent-soft))] text-[rgb(var(--accent))] ring-1 ring-[rgb(var(--accent))]/30"
                  : "bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))]",
            ].join(" ")}
          >
            {step.label}
          </span>
          {idx < wf.steps.length - 1 ? (
            <span className="text-[rgb(var(--border-strong))]" aria-hidden>
              →
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
