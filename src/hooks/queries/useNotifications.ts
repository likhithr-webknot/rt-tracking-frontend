import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminNotifications,
  fetchManagerNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  markAllManagerNotificationsRead,
  markManagerNotificationRead,
  normalizeAdminNotificationPage,
  normalizeManagerNotificationPage,
} from "../../api/notifications";
import { queryKeys } from "./keys";

type Role = "admin" | "manager";

function listFetcher(role: Role) {
  return role === "admin" ? fetchAdminNotifications : fetchManagerNotifications;
}

function singleMarker(role: Role) {
  return role === "admin" ? markAdminNotificationRead : markManagerNotificationRead;
}

function bulkMarker(role: Role) {
  return role === "admin" ? markAllAdminNotificationsRead : markAllManagerNotificationsRead;
}

function pageNormalizer(role: Role) {
  return role === "admin" ? normalizeAdminNotificationPage : normalizeManagerNotificationPage;
}

export function useNotifications(role: Role, userId: string | number | null | undefined) {
  return useQuery({
    enabled: userId != null && String(userId).trim() !== "",
    queryKey: queryKeys.notifications.forUser(String(userId ?? "")),
    queryFn: async ({ signal }) => {
      const raw = await listFetcher(role)({ userId: String(userId), signal });
      return pageNormalizer(role)(raw);
    },
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationReadMutation(role: Role, userId: string | number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string | number) => singleMarker(role)(notificationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.forUser(String(userId)) });
    },
  });
}

export function useMarkAllNotificationsReadMutation(
  role: Role,
  userId: string | number,
  notifications?: unknown[]
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => bulkMarker(role)({ notifications: notifications ?? [] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.forUser(String(userId)) });
    },
  });
}
