import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addCertification,
  deleteCertification,
  fetchAllCertifications,
  fetchCertifications,
  normalizeCertifications,
  updateCertification,
} from "../../api/certifications";
import { queryKeys } from "./keys";

export interface CertificationsListParams {
  limit?: number | null;
  cursor?: string | null;
  offset?: number | null;
}

export function useCertifications(params: CertificationsListParams = {}) {
  return useQuery({
    queryKey: queryKeys.certifications.list(params as Record<string, unknown>),
    queryFn: async ({ signal }) => {
      const raw = await fetchCertifications({ ...params, signal });
      return {
        ...raw,
        items: normalizeCertifications(raw),
      };
    },
    staleTime: 60_000,
  });
}

export function useAllCertifications() {
  return useQuery({
    queryKey: queryKeys.certifications.list({ all: true }),
    queryFn: async ({ signal }) => {
      const raw = await fetchAllCertifications({ signal });
      return normalizeCertifications(raw);
    },
    staleTime: 5 * 60_000,
  });
}

export interface CertificationPayload {
  name: string;
  listed?: boolean;
}

export function useAddCertificationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CertificationPayload) => addCertification(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.certifications.all });
    },
  });
}

export function useUpdateCertificationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CertificationPayload }) =>
      updateCertification(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.certifications.all });
    },
  });
}

export function useDeleteCertificationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCertification(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.certifications.all });
    },
  });
}
