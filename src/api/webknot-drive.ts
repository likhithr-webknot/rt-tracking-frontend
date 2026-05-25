// @ts-nocheck
import { getAuth, getAuthHeader } from "./auth";
import { resolveAccountStorageKey } from "../utils/accountStorageKey";
import { buildApiUrl, ensureCsrfCookie, parseResponse, requestWithFallbacks, toHttpError, withCsrfHeaders } from "./http";
import { fetchEmployees, normalizeEmployees } from "./employees";
import { normalizeProjects } from "./projects";

const FILES_URL = "/api/v1/webknot-drive/files";
const UPLOAD_URL = "/api/v1/webknot-drive/upload";
const SHARE_URL = "/api/v1/webknot-drive/share";
const REVOKE_SHARE_URL = "/api/v1/webknot-drive/share/revoke";
const SEARCH_USERS_URL = "/api/v1/webknot-drive/users/search";
const STORAGE_STATS_URL = "/api/v1/webknot-drive/storage-stats";
const DRIVE_PROJECTS_URL = "/api/v1/webknot-drive/projects";
const PREVIEW_PATH = "/api/v1/webknot-drive/files";

export function getDrivePreviewUrl(fileId) {
  const id = String(fileId ?? "").trim();
  if (!id) return null;
  return buildApiUrl(`${PREVIEW_PATH}/${encodeURIComponent(id)}/preview`);
}

const LOCAL_INDEX_KEY = "rt_webknot_drive_index_v1";

function readLocalIndex() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalIndex(items) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_INDEX_KEY, JSON.stringify(items));
  } catch {
    void 0;
  }
}

function currentOwnerKey() {
  const auth = getAuth();
  return resolveAccountStorageKey(auth, "anonymous").toLowerCase();
}

function currentOwnerEmail() {
  const auth = getAuth();
  const email = String(auth?.email ?? "").trim().toLowerCase();
  return email || currentOwnerKey();
}

function fileVisibleToUser(file, ownerEmail) {
  if (!file) return false;
  const owner = String(file.uploadedBy ?? "").trim().toLowerCase();
  if (owner && owner === ownerEmail) return true;
  const shared = Array.isArray(file.sharedWith) ? file.sharedWith : [];
  return shared.some((u) => String(u?.email ?? "").trim().toLowerCase() === ownerEmail);
}

function filterFilesForCurrentUser(items) {
  const ownerEmail = currentOwnerEmail();
  return (Array.isArray(items) ? items : []).filter((f) => fileVisibleToUser(f, ownerEmail));
}

function unwrapList(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (data.data != null) return unwrapList(data.data);
  if (Array.isArray(data.files)) return data.files;
  return [];
}

function unwrapDriveFilePayload(data) {
  if (!data || typeof data !== "object") return null;
  const raw = data.file ?? data.data?.file ?? data.data;
  return normalizeDriveFile(raw);
}

function normalizeDriveFile(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id ?? raw.fileId ?? raw.objectKey ?? "").trim();
  if (!id) return null;
  return {
    id,
    name: String(raw.name ?? raw.fileName ?? "file").trim(),
    size: Number(raw.size ?? raw.fileSize ?? 0) || 0,
    mimeType: String(raw.mimeType ?? raw.contentType ?? "application/octet-stream"),
    uploadedAt: raw.uploadedAt ?? raw.createdAt ?? new Date().toISOString(),
    uploadedBy: String(raw.uploadedBy ?? raw.ownerEmail ?? "").trim(),
    objectKey: String(raw.objectKey ?? raw.storageKey ?? id),
    downloadUrl: raw.downloadUrl ?? raw.url ?? null,
    previewUrl: raw.previewUrl ?? (id ? getDrivePreviewUrl(id) : null),
    sharedWith: Array.isArray(raw.sharedWith) ? raw.sharedWith : [],
    source: raw.source || "server",
  };
}

async function tryJsonPaths(paths, init) {
  let lastErr = null;
  for (const path of paths) {
    try {
      const res = await fetch(buildApiUrl(path), init);
      if (res.status === 404 || res.status === 405) continue;
      if (!res.ok) throw await toHttpError(res);
      return parseResponse(res, {});
    } catch (err) {
      lastErr = err;
      if (err?.status === 404 || err?.status === 405) continue;
      throw err;
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

export async function listDriveFiles({ signal } = {}) {
  const auth = getAuthHeader();
  try {
    const data = await tryJsonPaths([FILES_URL], {
      signal,
      credentials: "include",
      headers: auth ? { Authorization: auth } : undefined,
    });
    // Backend already scopes files to the signed-in user (owner or shared).
    const items = unwrapList(data).map(normalizeDriveFile).filter(Boolean);
    return { items, source: "server" };
  } catch (err) {
    if (err?.status === 403) {
      throw new Error(
        "Drive access denied (403). Sign in again, or ask HR/Admin to confirm your account has access.",
      );
    }
    if (err?.status === 401) {
      throw new Error("Not signed in (401). Sign in again to use Webknot Drive.");
    }
    if (err?.status !== 404 && err?.status !== 405) throw err;
  }
  const local = filterFilesForCurrentUser(readLocalIndex());
  return { items: local, source: "local" };
}

export async function fetchDriveStorageStats({ signal } = {}) {
  const auth = getAuthHeader();
  try {
    const data = await tryJsonPaths([STORAGE_STATS_URL], {
      signal,
      credentials: "include",
      headers: auth ? { Authorization: auth } : undefined,
    });
    const stats = data?.data && typeof data.data === "object" ? data.data : data;
    return {
      fileCount: Number(stats?.fileCount ?? 0) || 0,
      totalBytes: Number(stats?.totalBytes ?? 0) || 0,
      totalMb: Number(stats?.totalMb ?? 0) || 0,
      source: "server",
    };
  } catch (err) {
    if (err?.status !== 404 && err?.status !== 405) throw err;
    const local = filterFilesForCurrentUser(readLocalIndex());
    const totalBytes = local.reduce((sum, f) => sum + (Number(f.size) || 0), 0);
    return {
      fileCount: local.length,
      totalBytes,
      totalMb: Math.round((totalBytes / (1024 * 1024)) * 100) / 100,
      source: "local",
    };
  }
}

export async function uploadDriveFile(file, { signal } = {}) {
  await ensureCsrfCookie({ signal });
  const auth = getAuthHeader();
  const fd = new FormData();
  fd.append("file", file);
  const headers = withCsrfHeaders(auth ? { Authorization: auth } : undefined);

  try {
    const res = await fetch(buildApiUrl(UPLOAD_URL), {
      method: "POST",
      signal,
      credentials: "include",
      headers,
      body: fd,
    });
    if (!res.ok) throw await toHttpError(res);
    const data = await parseResponse(res, {});
    const norm = unwrapDriveFilePayload(data);
    if (norm) return { ...norm, source: "server" };
    throw new Error("Upload succeeded but the server response was invalid.");
  } catch (err) {
    if (err?.status !== 404 && err?.status !== 405) throw err;
  }

  const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry = {
    id,
    name: file.name,
    size: file.size,
    mimeType: file.type || "application/octet-stream",
    uploadedAt: new Date().toISOString(),
    uploadedBy: currentOwnerEmail(),
    objectKey: id,
    downloadUrl: URL.createObjectURL(file),
    sharedWith: [],
    source: "local",
    _localBlob: true,
  };
  const index = readLocalIndex();
  index.unshift(entry);
  writeLocalIndex(index);
  return entry;
}

export async function shareDriveFile(
  { fileId, shareWith = [], shareScope, projectCode },
  { signal } = {},
) {
  await ensureCsrfCookie({ signal });
  const auth = getAuthHeader();
  const scope = String(shareScope ?? "").trim() || undefined;
  const body = JSON.stringify({
    fileId,
    shareScope: scope,
    projectCode: String(projectCode ?? "").trim() || undefined,
    shareWith: shareWith.map((u) => ({
      email: u.email,
      empId: u.empId,
      name: u.name,
      permission: u.permission || "view",
    })),
  });
  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });

  try {
    const res = await fetch(buildApiUrl(SHARE_URL), {
        method: "POST",
        signal,
        credentials: "include",
        headers,
        body,
      });
    if (!res.ok) throw await toHttpError(res);
    return parseResponse(res, {});
  } catch (err) {
    if (err?.status !== 404 && err?.status !== 405) throw err;
  }

  const index = readLocalIndex();
  const next = index.map((f) => {
    if (f.id !== fileId) return f;
    const existing = Array.isArray(f.sharedWith) ? f.sharedWith : [];
    const merged = [...existing];
    for (const u of shareWith) {
      if (!merged.some((m) => m.email === u.email)) merged.push(u);
    }
    return { ...f, sharedWith: merged };
  });
  writeLocalIndex(next);
  return { ok: true, source: "local" };
}

export async function revokeDriveShare({ fileId, email }, { signal } = {}) {
  const target = String(email ?? "").trim().toLowerCase();
  if (!fileId || !target) throw new Error("fileId and email are required.");

  await ensureCsrfCookie({ signal });
  const auth = getAuthHeader();
  const body = JSON.stringify({ fileId, email: target });
  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });

  try {
    const res = await fetch(buildApiUrl(REVOKE_SHARE_URL), {
      method: "POST",
      signal,
      credentials: "include",
      headers,
      body,
    });
    if (!res.ok) throw await toHttpError(res);
    return parseResponse(res, {});
  } catch (err) {
    if (err?.status !== 404 && err?.status !== 405) throw err;
  }

  const index = readLocalIndex();
  const next = index.map((f) => {
    if (f.id !== fileId) return f;
    const sharedWith = (Array.isArray(f.sharedWith) ? f.sharedWith : []).filter(
      (u) => String(u?.email ?? "").trim().toLowerCase() !== target,
    );
    return { ...f, sharedWith };
  });
  writeLocalIndex(next);
  return { ok: true, source: "local" };
}

/**
 * Projects for Drive “share with project team” — any signed-in user.
 * Does not use GET /api/v1/projects/all (HR/Admin catalog only).
 */
export async function fetchDriveShareProjects({ signal, search } = {}) {
  const auth = getAuthHeader();
  const q = String(search ?? "").trim();
  const qs = new URLSearchParams();
  if (q) qs.set("search", q);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  const raw = await requestWithFallbacks(
    [`${DRIVE_PROJECTS_URL}${suffix}`, `/api/v1/drive/projects${suffix}`],
    {
      signal,
      credentials: "include",
      headers: auth ? { Authorization: auth } : undefined,
      fallbackStatuses: [404, 405],
      notFoundMessage:
        "Drive project list is not available. Restart the backend or confirm GET /api/v1/webknot-drive/projects is deployed.",
    },
  );

  const root = raw?.data && typeof raw.data === "object" ? raw.data : raw;
  const list =
    (Array.isArray(root?.projects) && root.projects) ||
    (Array.isArray(root?.items) && root.items) ||
    unwrapList(root);
  return normalizeProjects(list);
}

export async function searchDriveUsers(query, { signal, limit = 12 } = {}) {
  const q = String(query ?? "").trim();
  if (!q || q.length < 2) return [];

  const auth = getAuthHeader();
  const qs = new URLSearchParams({ q, limit: String(limit) });
  try {
    const res = await fetch(buildApiUrl(`${SEARCH_USERS_URL}?${qs}`), {
      signal,
      credentials: "include",
      headers: auth ? { Authorization: auth } : undefined,
    });
    if (!res.ok) throw await toHttpError(res);
    const data = await parseResponse(res, {});
    return unwrapList(data).map((u) => ({
      email: String(u.email ?? "").trim(),
      name: String(u.name ?? u.employeeName ?? "").trim(),
      empId: String(u.empId ?? u.id ?? "").trim(),
    }));
  } catch (err) {
    if (err?.status !== 404 && err?.status !== 405) throw err;
  }

  const page = await fetchEmployees({ limit: 500, signal });
  const employees = normalizeEmployees(page);
  const needle = q.toLowerCase();
  return employees
    .filter(
      (e) =>
        String(e.name || "").toLowerCase().includes(needle) ||
        String(e.email || "").toLowerCase().includes(needle) ||
        String(e.id || "").toLowerCase().includes(needle),
    )
    .slice(0, limit)
    .map((e) => ({ email: e.email, name: e.name, empId: e.id }));
}

export async function deleteDriveFile(fileId, { signal } = {}) {
  const id = String(fileId ?? "").trim();
  if (!id) throw new Error("File id is required");

  if (id.startsWith("local_")) {
    const index = readLocalIndex().filter((f) => f.id !== id);
    writeLocalIndex(index);
    return { ok: true, source: "local" };
  }

  await ensureCsrfCookie({ signal });
  const auth = getAuthHeader();
  const headers = withCsrfHeaders(auth ? { Authorization: auth } : undefined);
  const res = await fetch(buildApiUrl(`${FILES_URL}/${encodeURIComponent(id)}`), {
    method: "DELETE",
    signal,
    credentials: "include",
    headers,
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, { ok: true });
}
