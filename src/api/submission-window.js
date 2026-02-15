import { getAuthHeader } from "./auth.js";
import { buildApiUrl } from "./http.js";

async function readError(res) {
  const text = await res.text().catch(() => "");
  return text || `Request failed: ${res.status} ${res.statusText}`;
}

export async function fetchSubmissionWindowCurrent({ signal } = {}) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/submission-window/current"), {
    signal,
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function scheduleSubmissionWindow({ startAt, endAt }, { signal } = {}) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/submission-window/current/schedule"), {
    method: "PUT",
    signal,
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) },
    body: JSON.stringify({ startAt, endAt }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function openSubmissionWindowNow({ signal } = {}) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/submission-window/current/open-now"), {
    method: "POST",
    signal,
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function closeSubmissionWindowNow({ signal } = {}) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/submission-window/current/close-now"), {
    method: "POST",
    signal,
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}
