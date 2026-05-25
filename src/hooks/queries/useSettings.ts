import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSetting,
  deleteSettingKey,
  fetchSettingByKey,
  fetchSettingsList,
  normalizeServerSettingRow,
  normalizeServerSettingsList,
  updateSettingKey,
} from "../../api/settings";
import { queryKeys } from "./keys";

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings.list(),
    queryFn: async ({ signal }) => {
      const raw = await fetchSettingsList({ signal });
      return normalizeServerSettingsList(raw);
    },
    staleTime: 60_000,
  });
}

export function useSetting(key: string | null | undefined) {
  return useQuery({
    enabled: typeof key === "string" && key.trim() !== "",
    queryKey: queryKeys.settings.byKey(String(key ?? "")),
    queryFn: async ({ signal }) => {
      const raw = await fetchSettingByKey(String(key), { signal });
      return normalizeServerSettingRow(raw);
    },
  });
}

function invalidateSettings(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: queryKeys.settings.all });
}

export function useCreateSettingMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => createSetting(payload),
    onSuccess: () => invalidateSettings(qc),
  });
}

export function useUpdateSettingMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, payload }: { key: string; payload: Record<string, unknown> }) =>
      updateSettingKey(key, payload),
    onSuccess: () => invalidateSettings(qc),
  });
}

export function useDeleteSettingMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => deleteSettingKey(key),
    onSuccess: () => invalidateSettings(qc),
  });
}
