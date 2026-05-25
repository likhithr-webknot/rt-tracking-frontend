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
    <div className="flex flex-wrap items-center justify-end gap-2">
      {label ? <div className="mr-2 rt-kicker">{label}</div> : null}
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
          <label htmlFor={pageInputId} className="rt-kicker">
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
            className="rt-input h-9 w-20 px-2 py-1 text-center text-sm"
            inputMode="numeric"
            title={maxPage != null ? `Enter page number (max ${maxPage})` : "Enter page number"}
          />
          {maxPage != null ? <div className="rt-kicker">/ {maxPage}</div> : null}
        </form>
      ) : null}
      <button
        type="button"
        onClick={onPrev}
        disabled={!canPrev || loading}
        className={["rt-btn-ghost transition-all", !canPrev || loading ? "cursor-not-allowed opacity-50" : ""].join(
          " "
        )}
        title="Previous"
      >
        <ChevronLeft size={16} /> Prev
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext || loading}
        className={["rt-btn-primary transition-all", !canNext || loading ? "cursor-not-allowed opacity-50" : ""].join(
          " "
        )}
        title="Next"
      >
        Next <ChevronRight size={16} />
      </button>
    </div>
  );
}
