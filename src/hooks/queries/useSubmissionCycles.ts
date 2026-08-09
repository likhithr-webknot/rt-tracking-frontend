import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addSubmissionCycle,
  deleteSubmissionCycle,
  fetchSubmissionCycleById,
  fetchSubmissionCycleByKey,
  fetchSubmissionCycles,
  updateSubmissionCycle,
} from "../../api/monthly-submissions";
import { queryKeys } from "./keys";

export function useSubmissionCycles(params: { limit?: number; offset?: number } = {}) {
  return useQuery({
    queryKey: queryKeys.submissionCycles.list(params as Record<string, unknown>),
    queryFn: ({ signal }) => fetchSubmissionCycles({ ...params, signal }),
    staleTime: 60_000,
  });
}

export function useSubmissionCycleById(id: string | number | null | undefined) {
  return useQuery({
    enabled: id != null && String(id).trim() !== "",
    queryKey: queryKeys.submissionCycles.byId(String(id ?? "")),
    queryFn: ({ signal }) => fetchSubmissionCycleById(String(id), { signal }),
  });
}

export function useSubmissionCycleByKey(
  cycleKey: string | null | undefined,
  scope?: string | null
) {
  return useQuery({
    enabled: typeof cycleKey === "string" && cycleKey.trim() !== "",
    queryKey: queryKeys.submissionCycles.byKey(String(cycleKey ?? ""), scope),
    queryFn: ({ signal }) =>
      fetchSubmissionCycleByKey({ cycleKey: String(cycleKey), scope, signal }),
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: queryKeys.submissionCycles.all });
}

export function useAddSubmissionCycleMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => addSubmissionCycle(payload),
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateSubmissionCycleMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => updateSubmissionCycle(payload),
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteSubmissionCycleMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => deleteSubmissionCycle(id),
    onSuccess: () => invalidate(qc),
  });
}
