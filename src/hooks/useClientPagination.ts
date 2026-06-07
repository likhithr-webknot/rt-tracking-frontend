import { useEffect, useMemo, useState } from "react";

type UseClientPaginationOptions = {
  pageSize?: number;
  pageSizeOptions?: number[];
  resetKey?: string | number;
};

export function useClientPagination<T>(
  items: T[],
  {
    pageSize: initialPageSize = 25,
    pageSizeOptions = [25, 50, 100],
    resetKey = "",
  }: UseClientPaginationOptions = {},
) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const total = items.length;
  const maxPage = Math.max(1, Math.ceil(total / pageSize) || 1);

  useEffect(() => {
    setPage(1);
  }, [resetKey, pageSize]);

  useEffect(() => {
    if (page > maxPage) setPage(maxPage);
  }, [page, maxPage]);

  const slice = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const rangeLabel = useMemo(() => {
    if (!total) return "No results";
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);
    return `${start}–${end} of ${total}`;
  }, [page, pageSize, total]);

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    maxPage,
    slice,
    rangeLabel,
    total,
    pageSizeOptions,
    show: total > 0,
  };
}
