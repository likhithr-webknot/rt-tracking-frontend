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
        <div className="mr-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-600">
          {label}
        </div>
      ) : null}
      <button
        type="button"
        onClick={onPrev}
        disabled={!canPrev || loading}
        className={[
          "inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-[11px] font-black uppercase tracking-widest transition-all border",
          !canPrev || loading
            ? "bg-white/5 text-gray-600 border-white/10 cursor-not-allowed"
            : "border-white/10 text-gray-200 hover:bg-white/5",
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
          "inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-[11px] font-black uppercase tracking-widest transition-all",
          !canNext || loading
            ? "bg-white/5 text-gray-600 border border-white/10 cursor-not-allowed"
            : "bg-purple-600 text-white hover:bg-purple-500 shadow-xl shadow-purple-900/20",
        ].join(" ")}
        title="Next"
      >
        Next <ChevronRight size={16} />
      </button>
    </div>
  );
}

