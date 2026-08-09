// @ts-nocheck
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function PortalWorkflowActions({
  onBack,
  onContinue,
  continueLabel = "Continue",
  backLabel = "Back",
  continueDisabled = false,
  backDisabled = false,
  hint = "",
}) {
  return (
    <div className="rt-workflow-actions">
      <div className="min-w-0">
        {hint ? <p className="text-xs text-[rgb(var(--muted))] leading-relaxed">{hint}</p> : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
        {typeof onBack === "function" ? (
          <button type="button" className="rt-btn-ghost" onClick={onBack} disabled={backDisabled}>
            <ChevronLeft size={16} /> {backLabel}
          </button>
        ) : null}
        {typeof onContinue === "function" ? (
          <button
            type="button"
            className="rt-btn-primary"
            onClick={onContinue}
            disabled={continueDisabled}
          >
            {continueLabel} <ChevronRight size={16} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
