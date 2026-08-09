// @ts-nocheck
import type { ApiOptions } from "../types/api-options";
import { getAuthHeader } from "./auth";
import { buildApiUrl, ensureCsrfCookie, parseResponse, toHttpError, withCsrfHeaders } from "./http";

async function postNotification(path, { signal } = {} as ApiOptions) {
  await ensureCsrfCookie({ signal }).catch(() => {});
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl(path), {
    method: "POST",
    credentials: "include",
    headers: withCsrfHeaders({
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    }),
    body: "{}",
    signal,
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res);
}

/** Email employees who have not submitted before the global window closes. */
export async function sendSubmissionWindowClosingReminders(options = {} as ApiOptions) {
  return postNotification("/api/v1/notifications/submission-window-reminder", options);
}

/** Email managers/admins about pending monthly reviews (backend workflow job). */
export async function sendMonthlyWorkflowReminders(options = {} as ApiOptions) {
  return postNotification("/api/v1/notifications/monthly-workflow-reminder", options);
}
