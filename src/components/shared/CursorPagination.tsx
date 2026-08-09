import { useId } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type CursorPaginationProps = {
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  loading?: boolean;
  label?: string;
  page?: number | null;
  onPageChange?: ((page: number) => void) | null;
  pageInputLabel?: string;
  maxPage?: number | null;
};

export default function CursorPagination({
  canPrev,
  canNext,
  onPrev,
  onNext,
  loading = false,
  label,
  page = null,
  onPageChange = null,
  pageInputLabel = "Page",
  maxPage = null,
}: CursorPaginationProps) {
  const hasPageInput = Number.isFinite(Number(page)) && typeof onPageChange === "function";
  const pageInputId = useId();
  const currentPage = hasPageInput ? Math.max(1, Number(page)) : 1;

  function resolvePage(rawValue: unknown) {
    const parsed = Number.parseInt(String(rawValue ?? "").trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 1) return null;
    if (maxPage != null && parsed > maxPage) return maxPage;
    return parsed;
  }

  return (
    <div className="pulse-pagination inline-flex flex-wrap items-center justify-end gap-1.5">
      {label ? <div className="mr-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[rgb(var(--muted))]">{label}</div> : null}
      {hasPageInput ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!hasPageInput || loading) return;
            const form = new FormData(e.currentTarget);
            const targetPage = resolvePage(form.get("cursorPage"));
            if (!targetPage || targetPage === currentPage) return;
            onPageChange!(targetPage);
          }}
          className="inline-flex items-center gap-2"
        >
          <label htmlFor={pageInputId} className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[rgb(var(--muted))]">
            {pageInputLabel}
          </label>
          <input
            key={`cursor-page-${currentPage}-${maxPage ?? "na"}`}
            id={pageInputId}
            name="cursorPage"
            type="number"
            min={1}
            max={maxPage ?? undefined}
            step={1}
            defaultValue={currentPage}
            onBlur={(e) => {
              if (!hasPageInput || loading) return;
              const targetPage = resolvePage(e.target.value);
              if (!targetPage) {
                e.target.value = String(currentPage);
                return;
              }
              e.target.value = String(targetPage);
              if (targetPage === currentPage) return;
              onPageChange!(targetPage);
            }}
            disabled={loading}
            className="rt-input h-9 w-[3.25rem] min-h-0 px-2 py-1 text-center text-sm tabular-nums"
            inputMode="numeric"
            title={maxPage != null ? `Enter page number (max ${maxPage})` : "Enter page number"}
          />
          {maxPage != null ? (
            <div className="text-[11px] font-semibold tabular-nums text-[rgb(var(--muted))]">/ {maxPage}</div>
          ) : null}
        </form>
      ) : null}
      <button
        type="button"
        onClick={onPrev}
        disabled={!canPrev || loading}
        className={[
          "pulse-pagination-btn",
          !canPrev || loading ? "cursor-not-allowed opacity-40" : "",
        ].join(" ")}
        title="Previous"
      >
        <ChevronLeft size={16} strokeWidth={2} /> Prev
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext || loading}
        className={[
          "pulse-pagination-btn pulse-pagination-btn--primary",
          !canNext || loading ? "cursor-not-allowed opacity-40" : "",
        ].join(" ")}
        title="Next"
      >
        Next <ChevronRight size={16} strokeWidth={2} />
      </button>
    </div>
  );
}
