import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addKpiDefinition,
  deleteKpiDefinition,
  fetchKpiDefinition,
  fetchKpiDefinitions,
  normalizeKpiDefinition,
  normalizeKpiDefinitions,
  updateKpiDefinition,
} from "../../api/kpi-definitions";
import { queryKeys } from "./keys";

export interface KpiListParams {
  limit?: number | null;
  cursor?: string | null;
  offset?: number | null;
}

export function useKpiDefinitions(params: KpiListParams = {}) {
  return useQuery({
    queryKey: queryKeys.kpiDefinitions.list(params as Record<string, unknown>),
    queryFn: async ({ signal }) => {
      const raw = await fetchKpiDefinitions({ ...params, signal });
      return {
        ...raw,
        items: normalizeKpiDefinitions(raw),
      };
    },
    staleTime: 60_000,
  });
}

export function useKpiDefinition(id: string | number | null | undefined) {
  return useQuery({
    enabled: id != null && String(id).trim() !== "",
    queryKey: queryKeys.kpiDefinitions.byId(String(id ?? "")),
    queryFn: async ({ signal }) => {
      const raw = await fetchKpiDefinition(String(id), { signal });
      return normalizeKpiDefinition(raw);
    },
  });
}

export function useAddKpiDefinitionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => addKpiDefinition(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.kpiDefinitions.all });
    },
  });
}

export function useUpdateKpiDefinitionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => updateKpiDefinition(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.kpiDefinitions.all });
    },
  });
}

export function useDeleteKpiDefinitionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => deleteKpiDefinition(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.kpiDefinitions.all });
    },
  });
}
