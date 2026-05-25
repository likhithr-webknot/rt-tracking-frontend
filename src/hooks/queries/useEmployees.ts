import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addEmployee,
  deleteEmployee,
  fetchEmployees,
  fetchManagers,
  normalizeEmployees,
  normalizeManagers,
  updateEmployee,
} from "../../api/employees";
import { queryKeys } from "./keys";

export interface EmployeesListParams {
  page?: number;
  size?: number;
  search?: string | null;
  band?: string | null;
  type?: string | null;
  status?: string | null;
}

export function useEmployees(params: EmployeesListParams = {}) {
  return useQuery({
    queryKey: queryKeys.employees.list(params as Record<string, unknown>),
    queryFn: async ({ signal }) => {
      const raw = await fetchEmployees({ ...params, signal });
      return {
        ...raw,
        items: normalizeEmployees(raw),
      };
    },
    staleTime: 30_000,
  });
}

export function useManagers() {
  return useQuery({
    queryKey: queryKeys.employees.managers(),
    queryFn: async ({ signal }) => {
      const raw = await fetchManagers({ signal });
      return normalizeManagers(raw);
    },
    staleTime: 5 * 60_000,
  });
}

export function useAddEmployeeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => addEmployee(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.employees.all });
    },
  });
}

export function useUpdateEmployeeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      updateEmployee(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.employees.all });
    },
  });
}

export function useDeleteEmployeeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      hardDelete,
      alternateIds,
    }: {
      id: string;
      hardDelete?: boolean;
      alternateIds?: (string | number | null | undefined)[];
    }) => deleteEmployee(id, { hardDelete, alternateIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.employees.all });
    },
  });
}
