import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addProject,
  fetchAvailableProjects,
  fetchMyProjects,
  fetchProjects,
  normalizeProjects,
} from "../../api/projects";
import { queryKeys } from "./keys";

export interface ProjectsListParams {
  page?: number;
  size?: number;
  search?: string | null;
}

export function useProjects(params: ProjectsListParams = {}) {
  return useQuery({
    queryKey: queryKeys.projects.list(params as Record<string, unknown>),
    queryFn: async ({ signal }) => {
      const raw = await fetchProjects({ ...params, signal });
      return normalizeProjects(raw);
    },
    staleTime: 60_000,
  });
}

export function useAvailableProjects() {
  return useQuery({
    queryKey: queryKeys.projects.list({ all: true }),
    queryFn: async ({ signal }) => {
      const raw = await fetchAvailableProjects({ signal });
      return normalizeProjects(raw);
    },
    staleTime: 5 * 60_000,
  });
}

export function useMyProjects() {
  return useQuery({
    queryKey: queryKeys.projects.mine(),
    queryFn: async ({ signal }) => {
      const raw = await fetchMyProjects({ signal });
      return normalizeProjects(raw);
    },
    staleTime: 60_000,
  });
}

export interface AddProjectPayload {
  code: string;
  name: string;
  description?: string;
  managerEmployeeId: string;
  active?: boolean;
}

export function useAddProjectMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: AddProjectPayload) => addProject(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}
