// @ts-nocheck
import { getAuthHeader } from "./auth";
import { buildApiUrl, parseResponse, toHttpError, withCsrfHeaders } from "./http";
import { loadPortalNotes, savePortalNotes, normalizeNotesState } from "../utils/portalNotesStorage";

const PATHS = ["/api/v1/portal-notes", "/api/v1/notes/workspace"];

export async function fetchPortalNotesRemote(portal, userKey, { signal } = {}) {
  const auth = getAuthHeader();
  const qs = new URLSearchParams({ portal: String(portal), userKey: String(userKey) });
  for (const base of PATHS) {
    const res = await fetch(buildApiUrl(`${base}?${qs}`), {
      signal,
      credentials: "include",
      headers: auth ? { Authorization: auth } : undefined,
    });
    if (res.status === 404 || res.status === 405) continue;
    if (!res.ok) throw await toHttpError(res);
    const data = await parseResponse(res, {});
    const payload = data?.data && typeof data.data === "object" ? data.data : data;
    const state = payload?.state ?? data?.state ?? payload;
    return normalizeNotesState(state);
  }
  return null;
}

export async function savePortalNotesRemote(portal, userKey, state, { signal } = {}) {
  const auth = getAuthHeader();
  const body = JSON.stringify({ portal, userKey, state: normalizeNotesState(state) });
  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });
  for (const base of PATHS) {
    let res = await fetch(buildApiUrl(base), {
      method: "PUT",
      signal,
      credentials: "include",
      headers,
      body,
    });
    if (res.status === 404 || res.status === 405) {
      res = await fetch(buildApiUrl(base), {
        method: "POST",
        signal,
        credentials: "include",
        headers,
        body,
      });
    }
    if (res.status === 404 || res.status === 405) continue;
    if (!res.ok) throw await toHttpError(res);
    return parseResponse(res, {});
  }
  return null;
}

/** Load notes: server first, then local fallback; merge server wins. */
export async function loadPortalNotesSynced(portal, userKey) {
  const local = loadPortalNotes(portal, userKey);
  try {
    const remote = await fetchPortalNotesRemote(portal, userKey);
    if (remote?.notebooks?.length) {
      savePortalNotes(portal, userKey, remote);
      return { state: remote, source: "server" };
    }
  } catch {
    void 0;
  }
  return { state: local, source: "local" };
}

export async function savePortalNotesSynced(portal, userKey, state) {
  const normalized = savePortalNotes(portal, userKey, state);
  try {
    await savePortalNotesRemote(portal, userKey, normalized);
    return { state: normalized, source: "server" };
  } catch {
    return { state: normalized, source: "local" };
  }
}
