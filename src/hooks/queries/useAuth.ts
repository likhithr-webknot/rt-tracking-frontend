import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clearAuth, fetchMe, logout } from "../../api/auth";
import { queryKeys } from "./keys";

/** Live profile + role for the signed-in user (cached, retried). */
export function useMe(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: ({ signal }) => fetchMe({ signal }),
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useLogoutMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => logout(),
    onSettled: () => {
      clearAuth();
      qc.clear();
    },
  });
}
