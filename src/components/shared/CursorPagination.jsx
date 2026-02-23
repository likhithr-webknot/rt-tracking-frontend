import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function CursorPagination({
  canPrev,
  canNext,
  onPrev,
  onNext,
  loading,
  label,
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      {label ? (
        <div className="mr-2 rt-kicker">
          {label}
        </div>
      ) : null}
      <button
        type="button"
        onClick={onPrev}
        disabled={!canPrev || loading}
        className={[
          "rt-btn-ghost inline-flex items-center gap-2 px-4 py-2 text-[11px] uppercase tracking-widest transition-all",
          !canPrev || loading
            ? "opacity-50 cursor-not-allowed"
            : "",
        ].join(" ")}
        title="Previous"
      >
        <ChevronLeft size={16} /> Prev
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext || loading}
        className={[
          "rt-btn-primary inline-flex items-center gap-2 px-4 py-2 text-[11px] uppercase tracking-widest transition-all",
          !canNext || loading
            ? "opacity-50 cursor-not-allowed"
            : "",
        ].join(" ")}
        title="Next"
      >
        Next <ChevronRight size={16} />
      </button>
    </div>
  );
}

