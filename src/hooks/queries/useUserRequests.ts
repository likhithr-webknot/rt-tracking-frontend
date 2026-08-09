import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createUserRequest,
  deleteUserRequest,
  fetchUserRequestManagers,
  fetchUserRequests,
  normalizeUserRequestRows,
  remindUserRequestApproval,
  updateUserRequest,
  updateUserRequestStatus,
} from "../../api/user-requests";
import { queryKeys } from "./keys";

export interface UserRequestsRangeParams {
  fromDate: string;
  toDate: string;
  requestType: string;
  empEmails?: string | null;
  page?: number;
  size?: number;
}

export function useUserRequests(params: UserRequestsRangeParams | null) {
  return useQuery({
    enabled: !!params && !!params.fromDate && !!params.toDate && !!params.requestType,
    queryKey: queryKeys.userRequests.range(params as unknown as Record<string, unknown>),
    queryFn: async ({ signal }) => {
      const raw = await fetchUserRequests({ ...(params as UserRequestsRangeParams), signal });
      return {
        ...raw,
        items: normalizeUserRequestRows(raw),
      };
    },
    staleTime: 30_000,
  });
}

export function useUserRequestManagers() {
  return useQuery({
    queryKey: queryKeys.userRequests.managers(),
    queryFn: ({ signal }) => fetchUserRequestManagers({ signal }),
    staleTime: 5 * 60_000,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: queryKeys.userRequests.all });
}

export function useCreateUserRequestMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ request, file }: { request: Record<string, unknown>; file?: File | null }) =>
      createUserRequest(request, { file: file ?? null }),
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateUserRequestMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ request, file }: { request: Record<string, unknown>; file?: File | null }) =>
      updateUserRequest(request, { file: file ?? null }),
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteUserRequestMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userRequestId: string | number) => deleteUserRequest(userRequestId),
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateUserRequestStatusMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => updateUserRequestStatus(payload),
    onSuccess: () => invalidate(qc),
  });
}

export function useRemindUserRequestApprovalMutation() {
  return useMutation({
    mutationFn: (userRequestId: string | number) => remindUserRequestApproval(userRequestId),
  });
}
