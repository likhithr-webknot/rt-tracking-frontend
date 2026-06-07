// @ts-nocheck
import type { ApiOptions } from "../types/api-options";
import { getAuthHeader } from "./auth";
import { buildApiUrl, ensureCsrfCookie, parseResponse, toHttpError, withCsrfHeaders } from "./http";

export const EMAIL_NOTIFICATION_DEFAULTS = Object.freeze({
  enabled: true,
  windowOpenEnabled: true,
  windowCloseEnabled: true,
  autoSendOnWindowOpen: true,
  autoSendOnWindowClose: true,
  closingReminderEnabled: true,
  closingReminderDaysBeforeEnd: 3,
  workflowReminderEnabled: true,
  managerReviewReminderDaysAfterSubmit: 3,
  employeeSubmitToManagerEnabled: true,
  employeeSubmitConfirmationEnabled: true,
  managerSubmitToAdminEnabled: true,
  managerSubmitConfirmationEnabled: true,
  adminApproveToEmployeeEnabled: true,
  adminRejectToEmployeeEnabled: true,
});

function unwrapConfig(raw) {
  const root = raw && typeof raw === "object" ? raw : {};
  const nested = root?.data && typeof root.data === "object" ? root.data : root;
  return { ...EMAIL_NOTIFICATION_DEFAULTS, ...(nested || {}) };
}

export async function fetchEmailNotificationSettings({ signal } = {} as ApiOptions) {
  await ensureCsrfCookie({ signal }).catch(() => {});
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/api/v1/settings/email-notifications"), {
    signal,
    credentials: "include",
    headers: withCsrfHeaders(auth ? { Authorization: auth } : {}),
  });
  if (!res.ok) throw await toHttpError(res);
  const raw = await parseResponse(res, {});
  return unwrapConfig(raw);
}

export async function saveEmailNotificationSettings(config, { signal } = {} as ApiOptions) {
  await ensureCsrfCookie({ signal }).catch(() => {});
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/api/v1/settings/email-notifications"), {
    method: "PUT",
    signal,
    credentials: "include",
    headers: withCsrfHeaders({
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    }),
    body: JSON.stringify(config && typeof config === "object" ? config : {}),
  });
  if (!res.ok) throw await toHttpError(res);
  const raw = await parseResponse(res, {});
  return unwrapConfig(raw);
}

export {
  sendSubmissionWindowClosingReminders,
  sendMonthlyWorkflowReminders,
} from "./portal-notifications";
