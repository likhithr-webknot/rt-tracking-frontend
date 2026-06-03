// @ts-nocheck
import type { ApiOptions } from "../types/api-options";
import { getAuthHeader } from "./auth";
import { buildApiUrl, ensureCsrfCookie, parseResponse, toHttpError, withCsrfHeaders } from "./http";
import { buildProjectStakeholderAlerts } from "../utils/projectSubmitAlerts";

export async function notifyProjectStakeholdersOnSubmit(
  {
    projects = [],
    projectIds = [],
    month = "",
    employeeId = "",
    employeeName = "",
    employeeEmail = "",
    fallbackNotifyRoles = ["ADMIN", "HR"],
  } = {},
  { signal } = {} as ApiOptions,
) {
  const ids = new Set(
    (Array.isArray(projectIds) ? projectIds : [])
      .map((id) => String(id ?? "").trim())
      .filter(Boolean),
  );
  const selectedProjects = (Array.isArray(projects) ? projects : []).filter((p) =>
    ids.has(String(p?.id ?? "").trim()),
  );
  const alerts = buildProjectStakeholderAlerts(selectedProjects, { employeeName, month });
  if (!alerts.length && ids.size > 0) {
    for (const role of fallbackNotifyRoles) {
      alerts.push({
        projectId: "",
        projectName: "Monthly submission",
        employeeName,
        month,
        recipientRole: role,
        recipientName: role,
      });
    }
  }

  const body = {
    month: String(month || "").trim() || undefined,
    employeeId: String(employeeId || "").trim() || undefined,
    employeeName: String(employeeName || "").trim() || undefined,
    employeeEmail: String(employeeEmail || "").trim() || undefined,
    projectIds: [...ids],
    alerts,
  };

  const auth = getAuthHeader();
  await ensureCsrfCookie({ signal });
  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });

  const paths = [
    "/api/v1/notifications/project-submit",
    "/api/v1/notifications/employee-project-submit",
    "/api/v1/employees/me/project-preferences/notify",
    "/api/v1/notifications/announcement",
  ];

  let lastErr = null;
  for (const path of paths) {
    const res = await fetch(buildApiUrl(path), {
      method: "POST",
      signal,
      credentials: "include",
      headers,
      body: JSON.stringify(body),
    });
    if (res.ok) return parseResponse(res, { alerts, delivered: alerts.length });
    const err = await toHttpError(res);
    if (res.status === 404 || res.status === 405) {
      lastErr = err;
      continue;
    }
    throw err;
  }

  return { alerts, delivered: 0, fallback: true, message: lastErr?.message || "Notification endpoint unavailable." };
}
