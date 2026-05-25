import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addBand,
  addStream,
  deleteBandOrDeactivate,
  deleteStream,
  fetchBands,
  fetchStreams,
  normalizeDirectoryPage,
  updateBand,
  updateBandType,
  updateStream,
} from "../../api/band-stream-directory";
import type { BandPayload, DirectoryRow } from "../../api/band-stream-directory";
import { queryKeys } from "./keys";

export interface DirectoryQueryParams {
  search?: string | null;
  page?: number;
  limit?: number | null;
  cursor?: string | null;
}

export function useBands(params: DirectoryQueryParams = {}) {
  return useQuery({
    queryKey: queryKeys.bands.list(params as Record<string, unknown>),
    queryFn: async ({ signal }) => {
      const raw = await fetchBands({ ...params, signal });
      return normalizeDirectoryPage(raw);
    },
    staleTime: 60_000,
  });
}

export function useStreams(params: DirectoryQueryParams & { activeOnly?: boolean | null } = {}) {
  return useQuery({
    queryKey: queryKeys.streams.list(params as Record<string, unknown>),
    queryFn: async ({ signal }) => {
      const raw = await fetchStreams({ ...params, signal });
      return normalizeDirectoryPage(raw);
    },
    staleTime: 60_000,
  });
}

function invalidateDirectory(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: queryKeys.bandStreamDirectory.all });
  qc.invalidateQueries({ queryKey: queryKeys.bands.all });
  qc.invalidateQueries({ queryKey: queryKeys.streams.all });
}

export function useAddBandMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: BandPayload) => addBand(payload),
    onSuccess: () => invalidateDirectory(qc),
  });
}

export function useUpdateBandMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ codeOrId, payload }: { codeOrId: string | number; payload: BandPayload }) =>
      updateBand(codeOrId, payload),
    onSuccess: () => invalidateDirectory(qc),
  });
}

export function useUpdateBandTypeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, bandType }: { id: string | number; bandType: string }) =>
      updateBandType(id, bandType),
    onSuccess: () => invalidateDirectory(qc),
  });
}

export function useDeleteBandMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (row: DirectoryRow) => deleteBandOrDeactivate(row as unknown as Record<string, unknown>),
    onSuccess: () => invalidateDirectory(qc),
  });
}

export function useAddStreamMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: BandPayload) => addStream(payload),
    onSuccess: () => invalidateDirectory(qc),
  });
}

export function useUpdateStreamMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ targetKey, payload }: { targetKey: string | number; payload: BandPayload }) =>
      updateStream(targetKey, payload),
    onSuccess: () => invalidateDirectory(qc),
  });
}

export function useDeleteStreamMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (target: string | DirectoryRow) =>
      deleteStream(target as unknown as string | Record<string, unknown>),
    onSuccess: () => invalidateDirectory(qc),
  });
}
