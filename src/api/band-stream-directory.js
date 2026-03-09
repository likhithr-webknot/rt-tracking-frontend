import { getAuthHeader } from "./auth.js";
import { buildApiUrl, withCsrfHeaders } from "./http.js";

async function readError(res) {
  const text = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(text);
    if (parsed?.message) return String(parsed.message);
    if (parsed?.error) return String(parsed.error);
  } catch { void 0; }
  return text || `Request failed: ${res.status} ${res.statusText}`;
}

async function toHttpError(res) {
  const message = await readError(res);
  const err = new Error(message);
  err.status = res.status;
  return err;
}

function normalizeCursorToken(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }
  return null;
}

function normalizePage(data) {
  const root = data && typeof data === "object" ? data : {};
  const items =
    Array.isArray(root.items)
      ? root.items
      : Array.isArray(root.data)
        ? root.data
        : Array.isArray(root.results)
          ? root.results
          : Array.isArray(root.streams)
            ? root.streams
            : Array.isArray(root.bands)
              ? root.bands
              : Array.isArray(data)
                ? data
                : [];
  const nextCursor = normalizeCursorToken(root.nextCursor ?? root.next ?? null);
  return { items, nextCursor };
}

function normalizeDirectoryRows(data) {
  const arr = Array.isArray(data) ? data : [];
  return arr
    .map((raw) => {
      const obj = raw && typeof raw === "object" ? raw : {};
      const code = [obj.code, obj.stream, obj.band, obj.name]
        .map((v) => String(v ?? "").trim())
        .find((v) => v);
      if (!code) return null;
      return {
        code,
        label: String(obj.label ?? obj.name ?? obj.stream ?? obj.band ?? code).trim() || code,
        active: Boolean(obj.active ?? true),
        sortOrder: Number.isFinite(Number(obj.sortOrder)) ? Number(obj.sortOrder) : null,
        createdAt: obj.createdAt ? String(obj.createdAt) : null,
        updatedAt: obj.updatedAt ? String(obj.updatedAt) : null,
      };
    })
    .filter(Boolean);
}

async function fetchDirectory(path, { activeOnly = null, limit = null, cursor = null, signal } = {}) {
  const auth = getAuthHeader();
  const qs = new URLSearchParams();
  if (activeOnly != null) qs.set("activeOnly", String(Boolean(activeOnly)));
  if (limit != null) qs.set("limit", String(limit));
  if (cursor) qs.set("cursor", String(cursor));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(buildApiUrl(`${path}/list${suffix}`), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}

async function addDirectoryRow(path, payload, { signal } = {}) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl(`${path}/add`), {
    method: "POST",
    signal,
    credentials: "include",
    headers: withCsrfHeaders({
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    }),
    body: JSON.stringify(payload ?? {}),
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}

async function updateDirectoryRow(path, code, payload, { signal } = {}) {
  const safeCode = encodeURIComponent(String(code ?? "").trim());
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl(`${path}/update/${safeCode}`), {
    method: "PUT",
    signal,
    credentials: "include",
    headers: withCsrfHeaders({
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    }),
    body: JSON.stringify(payload ?? {}),
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}

async function deleteDirectoryRow(path, code, { signal } = {}) {
  const safeCode = encodeURIComponent(String(code ?? "").trim());
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl(`${path}/delete/${safeCode}`), {
    method: "DELETE",
    signal,
    credentials: "include",
    headers: withCsrfHeaders(auth ? { Authorization: auth } : undefined),
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}

export async function fetchBands(options = {}) {
  return fetchDirectory("/bands", options);
}

export async function fetchStreams(options = {}) {
  return fetchDirectory("/streams", options);
}

export async function addBand(payload, options = {}) {
  return addDirectoryRow("/bands", payload, options);
}

export async function addStream(payload, options = {}) {
  return addDirectoryRow("/streams", payload, options);
}

export async function updateBand(code, payload, options = {}) {
  return updateDirectoryRow("/bands", code, payload, options);
}

export async function updateStream(code, payload, options = {}) {
  return updateDirectoryRow("/streams", code, payload, options);
}

export async function deleteBand(code, options = {}) {
  return deleteDirectoryRow("/bands", code, options);
}

export async function deleteStream(code, options = {}) {
  return deleteDirectoryRow("/streams", code, options);
}

export function normalizeBands(data) {
  return normalizeDirectoryRows(normalizePage(data).items);
}

export function normalizeStreams(data) {
  return normalizeDirectoryRows(normalizePage(data).items);
}

export function normalizeDirectoryPage(data) {
  const page = normalizePage(data);
  return {
    items: normalizeDirectoryRows(page.items),
    nextCursor: page.nextCursor,
  };
}

function normalizeDesignation(raw) {
  const obj = raw && typeof raw === "object" ? raw : {};
  return {
    stream: obj.stream ? String(obj.stream) : null,
    band: obj.band ? String(obj.band) : null,
    designation: obj.designation ? String(obj.designation) : null,
    designationTitles: obj.designationTitles ? String(obj.designationTitles) : null,
    timePeriod: obj.timePeriod ? String(obj.timePeriod) : null,
    responsibilities: obj.responsibilities ? String(obj.responsibilities) : null,
  };
}

async function fetchDesignation(path, { band, stream, signal } = {}) {
  const qs = new URLSearchParams();
  if (band) qs.set("band", String(band));
  if (stream) qs.set("stream", String(stream));
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl(`${path}/designation?${qs.toString()}`), {
    method: "GET",
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  const data = await res.json().catch(() => ({}));
  return normalizeDesignation(data);
}

export async function fetchBandDesignation({ band, stream, signal } = {}) {
  return fetchDesignation("/bands", { band, stream, signal });
}

export async function fetchStreamDesignation({ stream, band, signal } = {}) {
  return fetchDesignation("/streams", { band, stream, signal });
}

