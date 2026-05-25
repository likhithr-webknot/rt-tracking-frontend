// @ts-nocheck
import { getAuthHeader } from "./auth";
import { buildApiUrl, toHttpError } from "./http";

export async function fetchReports(options = {}) {
  const { signal } = options;
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/api/v1/reports/list"), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}

export async function downloadMonthlySubmissionAudit(options = {}) {
  const { month, cycleKey, signal } = options;
  const auth = getAuthHeader();
  const qs = new URLSearchParams();
  if (month) qs.set("month", String(month));
  if (cycleKey) qs.set("cycleKey", String(cycleKey));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(buildApiUrl(`/api/v1/reports/monthly-submissions/audit${suffix}`), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.blob();
}

export async function downloadReport(reportId, options = {}) {
  const { signal } = options;
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl(`/api/v1/reports/download/${reportId}`), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.blob();
}
