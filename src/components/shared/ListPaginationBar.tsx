import CursorPagination from "./CursorPagination";

type ListPaginationBarProps = {
  rangeLabel?: string;
  page: number;
  maxPage: number;
  pageSize: number;
  pageSizeOptions?: number[];
  loading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  showFirst?: boolean;
  className?: string;
};

export default function ListPaginationBar({
  rangeLabel,
  page,
  maxPage,
  pageSize,
  pageSizeOptions = [25, 50, 100],
  loading = false,
  onPageChange,
  onPageSizeChange,
  showFirst = true,
  className = "",
}: ListPaginationBarProps) {
  return (
    <div
      className={[
        "flex flex-col gap-3 border-t border-[rgb(var(--border))]/70 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between",
        "bg-[rgb(var(--surface-2))]/35 backdrop-blur-sm",
        className,
      ].join(" ")}
    >
      <div className="text-xs font-medium tabular-nums text-[rgb(var(--muted))]">
        {rangeLabel || `${page} of ${maxPage}`}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        {onPageSizeChange ? (
          <label className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[rgb(var(--muted))]">
            Rows
            <select
              value={String(pageSize)}
              onChange={(e) => {
                const next = Number.parseInt(e.target.value, 10);
                if (Number.isFinite(next) && next > 0) onPageSizeChange(next);
              }}
              disabled={loading}
              className="rt-input h-9 min-h-0 rounded-lg px-2 py-1 text-[11px] font-semibold normal-case text-[rgb(var(--text))]"
              aria-label="Rows per page"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={String(size)}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {showFirst ? (
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={page <= 1 || loading}
            className={[
              "rt-btn-ghost h-9 px-3 text-xs font-semibold",
              page <= 1 || loading ? "cursor-not-allowed opacity-50" : "",
            ].join(" ")}
          >
            First
          </button>
        ) : null}
        <CursorPagination
          canPrev={page > 1}
          canNext={page < maxPage}
          onPrev={() => onPageChange(Math.max(1, page - 1))}
          onNext={() => onPageChange(Math.min(maxPage, page + 1))}
          onPageChange={onPageChange}
          page={page}
          maxPage={maxPage}
          loading={loading}
          pageInputLabel="Page"
        />
      </div>
    </div>
  );
}
