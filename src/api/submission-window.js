import { getAuthHeader } from "./auth.js";
import { buildApiUrl, withCsrfHeaders } from "./http.js";

async function readError(res) {
  const text = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(text);
    const message = parsed?.message ? String(parsed.message) : "";
    const details = parsed?.details ? String(parsed.details) : "";
    if (message && details) return `${message}: ${details}`;
    if (details) return details;
    if (message) return message;
    if (parsed?.error) return String(parsed.error);
  } catch {
    // ignore
  }
  return text || `Request failed: ${res.status} ${res.statusText}`;
}

async function toHttpError(res) {
  const message = await readError(res);
  const err = new Error(message);
  err.status = res.status;
  return err;
}

export async function fetchSubmissionWindowCurrent({ signal } = {}) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/submission-window/current"), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json();
}

export async function scheduleSubmissionWindow({ startAt, endAt }, { signal } = {}) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/submission-window/current/schedule"), {
    method: "PUT",
    signal,
    credentials: "include",
    headers: withCsrfHeaders({
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    }),
    body: JSON.stringify({ startAt, endAt }),
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json();
}

export async function openSubmissionWindowNow({ signal } = {}) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/submission-window/current/open-now"), {
    method: "POST",
    signal,
    credentials: "include",
    headers: withCsrfHeaders(auth ? { Authorization: auth } : {}),
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json();
}

export async function closeSubmissionWindowNow({ signal } = {}) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/submission-window/current/close-now"), {
    method: "POST",
    signal,
    credentials: "include",
    headers: withCsrfHeaders(auth ? { Authorization: auth } : {}),
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json();
}

export async function openSubmissionWindowForEmployeeNow(employeeId, { signal } = {}) {
  const id = String(employeeId ?? "").trim();
  if (!id) throw new Error("employeeId is required.");

  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/submission-window/employee/open-now"), {
    method: "POST",
    signal,
    credentials: "include",
    headers: withCsrfHeaders({
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    }),
    body: JSON.stringify({ employeeId: id }),
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json();
}

export async function closeSubmissionWindowForEmployeeNow(employeeId, { signal } = {}) {
  const id = String(employeeId ?? "").trim();
  if (!id) throw new Error("employeeId is required.");

  const auth = getAuthHeader();
  const safeId = encodeURIComponent(id);
  const res = await fetch(buildApiUrl(`/submission-window/employee/${safeId}/close-now`), {
    method: "POST",
    signal,
    credentials: "include",
    headers: withCsrfHeaders(auth ? { Authorization: auth } : {}),
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json();
}

export async function fetchEmployeeSubmissionWindowStatus(employeeId, { signal } = {}) {
  const id = String(employeeId ?? "").trim();
  if (!id) throw new Error("employeeId is required.");

  const auth = getAuthHeader();
  const safeId = encodeURIComponent(id);
  const res = await fetch(buildApiUrl(`/submission-window/employee/${safeId}`), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json();
}
