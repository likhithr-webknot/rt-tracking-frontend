import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addValue,
  deleteValue,
  fetchValues,
  normalizeWebknotValuesList,
  updateValue,
} from "../../api/webknotValueApi";
import { queryKeys } from "./keys";

export interface WebknotValueListParams {
  limit?: number | null;
  offset?: number | null;
  cursor?: string | null;
  activeAll?: boolean | null;
}

export function useWebknotValues(
  params: WebknotValueListParams & { activeOnly?: boolean } = {}
) {
  const { activeOnly = true, ...rest } = params;
  return useQuery({
    queryKey: queryKeys.webknotValues.list({ activeOnly, ...rest } as Record<string, unknown>),
    queryFn: async ({ signal }) => {
      const raw = await fetchValues(activeOnly, { ...rest, signal });
      return {
        raw,
        items: normalizeWebknotValuesList(raw),
      };
    },
    staleTime: 60_000,
  });
}

export function useAddWebknotValueMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => addValue(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.webknotValues.all });
    },
  });
}

export function useUpdateWebknotValueMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string | number; payload: Record<string, unknown> }) =>
      updateValue(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.webknotValues.all });
    },
  });
}

export function useDeleteWebknotValueMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => deleteValue(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.webknotValues.all });
    },
  });
}
