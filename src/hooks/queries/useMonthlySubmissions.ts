import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteAdminMonthlySubmission,
  fetchAdminAllSubmissions,
  fetchAdminMonthlyOverview,
  fetchEmployeeCycleMonthlySubmissions,
  fetchEmployeeSubmissionCycleSummary,
  fetchEmployeeSubmissionCycles,
  fetchManagerTeamSubmissions,
  fetchMyMonthlySubmission,
  submitAdminReviewDecision,
  submitMonthlySubmission,
} from "../../api/monthly-submissions";
import { queryKeys } from "./keys";

export interface AdminMonthlyOverviewParams {
  month?: string | null;
  cycleKey?: string | null;
}

export function useAdminMonthlyOverview(params: AdminMonthlyOverviewParams) {
  return useQuery({
    queryKey: queryKeys.monthlySubmissions.adminList(
      { overview: true, ...params } as Record<string, unknown>
    ),
    queryFn: ({ signal }) => fetchAdminMonthlyOverview({ ...params, signal }),
    staleTime: 60_000,
  });
}

export function useAdminAllSubmissions(params: { month?: string | null; status?: string | null }) {
  return useQuery({
    queryKey: queryKeys.monthlySubmissions.adminList(params as Record<string, unknown>),
    queryFn: ({ signal }) => fetchAdminAllSubmissions({ ...params, signal }),
    staleTime: 30_000,
  });
}

export interface ManagerTeamSubmissionsParams {
  month?: string | null;
  status?: string | null;
  limit?: number | null;
  cursor?: string | null;
}

export function useManagerTeamSubmissions(params: ManagerTeamSubmissionsParams) {
  return useQuery({
    queryKey: queryKeys.monthlySubmissions.managerTeam(params as Record<string, unknown>),
    queryFn: ({ signal }) => fetchManagerTeamSubmissions({ ...params, signal }),
    staleTime: 30_000,
  });
}

export function useMyMonthlySubmission(params: { month?: string | null; employeeId?: string | null }) {
  return useQuery({
    enabled: !!params?.month && !!params?.employeeId,
    queryKey: queryKeys.monthlySubmissions.forCycleEmployee(
      String(params?.month ?? ""),
      String(params?.employeeId ?? "")
    ),
    queryFn: ({ signal }) => fetchMyMonthlySubmission({ ...params, signal }),
  });
}

export function useEmployeeCycleMonthlySubmissions(params: {
  cycleKey?: string | null;
  employeeId?: string | null;
}) {
  return useQuery({
    enabled: !!params?.cycleKey && !!params?.employeeId,
    queryKey: queryKeys.monthlySubmissions.forCycleEmployee(
      String(params?.cycleKey ?? ""),
      String(params?.employeeId ?? "")
    ),
    queryFn: ({ signal }) =>
      fetchEmployeeCycleMonthlySubmissions(
        { cycleKey: String(params?.cycleKey), employeeId: String(params?.employeeId), signal },
        { signal }
      ),
  });
}

export function useEmployeeSubmissionCycleSummary(params: {
  cycleKey?: string | null;
  employeeId?: string | null;
}) {
  return useQuery({
    enabled: !!params?.cycleKey && !!params?.employeeId,
    queryKey: [
      "submission-cycle-summary",
      String(params?.cycleKey ?? ""),
      String(params?.employeeId ?? ""),
    ] as const,
    queryFn: ({ signal }) =>
      fetchEmployeeSubmissionCycleSummary(
        { cycleKey: String(params?.cycleKey), employeeId: String(params?.employeeId), signal },
        { signal }
      ),
  });
}

export function useEmployeeSubmissionCycles(employeeId: string | null | undefined) {
  return useQuery({
    enabled: !!employeeId,
    queryKey: ["employee-submission-cycles", String(employeeId ?? "")] as const,
    queryFn: ({ signal }) => fetchEmployeeSubmissionCycles(String(employeeId), { signal }),
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: queryKeys.monthlySubmissions.all });
}

export function useSubmitMonthlySubmissionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => submitMonthlySubmission(payload),
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteAdminMonthlySubmissionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => deleteAdminMonthlySubmission(id),
    onSuccess: () => invalidate(qc),
  });
}

export function useSubmitAdminReviewDecisionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => submitAdminReviewDecision(payload),
    onSuccess: () => invalidate(qc),
  });
}
