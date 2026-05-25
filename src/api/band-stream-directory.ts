import type { ApiOptions } from "../types/api-options";
import { getAuthHeader } from "./auth";
import { buildApiUrl, ensureCsrfCookie, parseResponse, toHttpError, withCsrfHeaders } from "./http";

/**
 * Band REST (Webtrak BandController):
 * List: GET /api/v1/band-list, GET /api/v1/bands
 * By id: GET /api/v1/band/{id} | /api/v1/bands/{id}
 * Create: POST /api/v1/band | /api/v1/bands (+ legacy create/add paths)
 * Update: PUT/PATCH /api/v1/band/{id} | /api/v1/bands/{id} (+ legacy)
 * Delete: DELETE /api/v1/band/{id} | /api/v1/bands/{id}
 *
 * Departments / streams: GET /api/v1/department-list (Webtrak)
 */

export interface DirectoryListOptions {
  search?: string | null;
  page?: number;
  limit?: number | null;
  cursor?: string | null;
  signal?: AbortSignal;
}

export interface FetchStreamsOptions extends DirectoryListOptions {
  activeOnly?: boolean | null;
}

export interface SignalOptions {
  signal?: AbortSignal;
}

/** JSON body for band create/update APIs */
export type BandPayload = Record<string, unknown>;

/** Normalized band / department row for directory UIs */
export interface DirectoryRow {
  id: string | null;
  code: string;
  label: string;
  bandType: string;
  active: boolean;
  sortOrder: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

type HttpRoute = { method: string; path: string; body?: string };

type RouteErr = Error & { status?: number };

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
          : Array.isArray(root.departments)
            ? root.departments
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

/** "Band 1 - Band 1 - Band 1" → "Band 1" when every segment is identical (common noisy API labels). */
function collapseDuplicateDelimitedParts(text, delimiter = " - ") {
  const raw = String(text ?? "").trim();
  if (!raw) return raw;
  const parts = raw.split(delimiter).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return raw;
  const first = parts[0];
  return parts.every((p) => p === first) ? first : raw;
}

/** "A - B - A - B - A - B" → ["A", "B"] when the list is a repeating pattern. */
function collapseRepeatingSequence(parts) {
  if (!Array.isArray(parts) || parts.length < 2) return parts;
  for (let period = 1; period <= Math.floor(parts.length / 2); period += 1) {
    const head = parts.slice(0, period);
    let matches = true;
    for (let i = period; i < parts.length; i += 1) {
      if (parts[i] !== head[i % period]) {
        matches = false;
        break;
      }
    }
    if (matches) return head;
  }
  return parts;
}

export function collapseRepeatedSegments(text) {
  let t = String(text ?? "").trim();
  if (!t) return t;
  for (const delimiter of [" - ", " — ", " | "]) {
    const parts = t.split(delimiter).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const identical = collapseDuplicateDelimitedParts(t, delimiter);
    const sequenced = collapseRepeatingSequence(parts).join(delimiter.trim());
    if (sequenced.length < t.length) t = sequenced;
    else if (identical.length < t.length) t = identical;
  }
  return t;
}

/** Band code for tables (B4, B5L) even when API stored a long combined label. */
export function formatEmployeeBandCode(raw) {
  const cleaned = collapseRepeatedSegments(String(raw ?? "").trim());
  if (!cleaned) return "";
  const firstSeg = cleaned.split(/\s*[-—]\s*/)[0]?.trim() || cleaned;
  if (/^B\d+[A-Z]?$/i.test(firstSeg)) return firstSeg.toUpperCase();
  const m = cleaned.match(/\b(B\d+[A-Z]?)\b/i);
  return m ? m[1].toUpperCase() : firstSeg;
}

/** Designation label with repeating "B1 - Developer - …" segments collapsed. */
export function formatEmployeeDesignation(raw, bandRaw = "") {
  let t = collapseRepeatedSegments(String(raw ?? "").trim());
  if (!t) return "";
  const bandCode = formatEmployeeBandCode(bandRaw);
  if (bandCode) {
    const re = new RegExp(`^${bandCode}\\s*[-—]\\s*`, "i");
    t = t.replace(re, "").trim();
    t = collapseRepeatedSegments(t);
  }
  const parts = t.split(/\s*[-—]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2 && /^B\d+[A-Z]?$/i.test(parts[0])) {
    return parts.slice(1).join(" · ") || parts[0];
  }
  return t;
}

/** Webtrak band-list rows use `{ id, band: "B1 - Developer", designation }`. */
function webtrakBandCodeFromRow(obj: Record<string, unknown>) {
  const bandDisplay = String(obj.band ?? "").trim();
  if (!bandDisplay) return null;
  const first = bandDisplay.split(/\s*-\s*/)[0]?.trim() || bandDisplay;
  if (/^B\d+[A-Z]?$/i.test(first)) return first.toUpperCase();
  return first;
}

function normalizeDirectoryRows(data: unknown): DirectoryRow[] {
  const arr = Array.isArray(data) ? data : [];
  return arr
    .map((raw) => {
      if (typeof raw === "string" || typeof raw === "number") {
        const code = String(raw ?? "").trim();
        return code
          ? {
              id: null,
              code,
              label: code,
              bandType: "BOTH",
              active: true,
              sortOrder: null,
              createdAt: null,
              updatedAt: null,
            }
          : null;
      }
      const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

      /** Webtrak department list rows: id + name (+ active). */
      if (obj.id != null && obj.name != null && obj.department == null && typeof obj.band !== "string") {
        const name = String(obj.name).trim();
        if (name) {
          return {
            id: String(obj.id),
            code: name,
            label: collapseRepeatedSegments(name),
            bandType: "BOTH",
            active: obj.active === false ? false : true,
            sortOrder: Number.isFinite(Number(obj.sortOrder)) ? Number(obj.sortOrder) : null,
            createdAt: obj.createdAt ? String(obj.createdAt) : null,
            updatedAt: obj.updatedAt ? String(obj.updatedAt) : null,
          };
        }
      }

      /** Webtrak GET band-list returns {@link BandSelectDto}: id + band display string. */
      if (obj.id != null && typeof obj.band === "string") {
        const display = String(obj.band).trim();
        const first = display.split(/\s*-\s*/)[0]?.trim() || display;
        const code = /^B\d+[A-Z]?$/i.test(first) ? first.toUpperCase() : first || display;
        return {
          id: String(obj.id),
          code,
          label: collapseRepeatedSegments(display),
          bandType: String(obj.bandType ?? obj.type ?? "BOTH").trim().toUpperCase() || "BOTH",
          active: true,
          sortOrder: Number.isFinite(Number(obj.sortOrder)) ? Number(obj.sortOrder) : null,
          createdAt: obj.createdAt ? String(obj.createdAt) : null,
          updatedAt: obj.updatedAt ? String(obj.updatedAt) : null,
        };
      }

      const bandRef = obj.band;
      const bandFromNested =
        bandRef && typeof bandRef === "object"
          ? String(
              (bandRef as Record<string, unknown>).code ??
                (bandRef as Record<string, unknown>).bandCode ??
                (bandRef as Record<string, unknown>).level ??
                ""
            ).trim()
          : "";
      const bandAsString = typeof bandRef === "string" ? String(bandRef).trim() : "";
      const webtrakBandCode = webtrakBandCodeFromRow(obj);
      // Prefer machine codes before display names so `code` stays "B1", not "B1 - Developer".
      const code = [
        obj.code,
        obj.bandCode,
        obj.level,
        webtrakBandCode,
        bandFromNested,
        bandAsString,
        obj.name,
        obj.departmentCode,
        obj.streamCode,
        obj.stream,
        obj.department,
      ]
        .map((v) => String(v ?? "").trim())
        .find((v) => v);
      if (!code) return null;
      const bandLabelFromNested =
        bandRef && typeof bandRef === "object"
          ? String(
              (bandRef as Record<string, unknown>).label ??
                (bandRef as Record<string, unknown>).name ??
                (bandRef as Record<string, unknown>).designation ??
                ""
            ).trim()
          : "";
      const nestedBandIdRaw =
        bandRef && typeof bandRef === "object"
          ? (bandRef as Record<string, unknown>).id ??
            (bandRef as Record<string, unknown>).bandId ??
            (bandRef as Record<string, unknown>).bandID
          : null;
      const rawLabel = String(
        obj.designation ??
          obj.label ??
          obj.departmentName ??
          obj.streamName ??
          obj.name ??
          (typeof bandRef === "string" ? bandRef : "") ??
          bandLabelFromNested ??
          code
      ).trim() || code;
      return {
        id:
          obj.id != null
            ? String(obj.id)
            : obj.bandId != null
              ? String(obj.bandId)
              : obj.bandID != null
                ? String(obj.bandID)
                : nestedBandIdRaw != null
                  ? String(nestedBandIdRaw)
                  : obj.departmentId != null
                    ? String(obj.departmentId)
                    : obj.streamId != null
                      ? String(obj.streamId)
                      : null,
        code,
        label: collapseRepeatedSegments(rawLabel),
        bandType: String(obj.bandType ?? obj.type ?? "BOTH").trim().toUpperCase() || "BOTH",
        active: obj.active === false || obj.listed === false ? false : true,
        sortOrder: Number.isFinite(Number(obj.sortOrder)) ? Number(obj.sortOrder) : null,
        createdAt: obj.createdAt ? String(obj.createdAt) : null,
        updatedAt: obj.updatedAt ? String(obj.updatedAt) : null,
      };
    })
    .filter((row): row is DirectoryRow => row != null);
}

/**
 * Band list / department list envelope:
 * { message, data: { totalElement, totalPage, currentPage, pageSize, data: [...] } }
 */
function extractPagedListEnvelope(raw) {
  if (!raw || typeof raw !== "object") return null;
  const inner = raw.data;
  if (!inner || typeof inner !== "object" || Array.isArray(inner)) return null;

  const arr = inner.data ?? inner.items ?? inner.content ?? inner.results;
  if (!Array.isArray(arr)) return null;

  const hasPaging =
    inner.totalPage != null ||
    inner.totalPages != null ||
    inner.totalElement != null ||
    inner.totalElements != null ||
    inner.totalCount != null ||
    inner.currentPage != null ||
    inner.page != null ||
    inner.number != null ||
    inner.pageSize != null ||
    inner.size != null;

  if (!hasPaging) return null;

  const currentPageRaw = inner.currentPage ?? inner.page ?? inner.number;
  const totalPageRaw = inner.totalPage ?? inner.totalPages;
  const totalElementRaw = inner.totalElement ?? inner.totalElements ?? inner.totalCount;
  const pageSizeRaw = inner.pageSize ?? inner.size ?? inner.limit;

  return {
    items: arr,
    currentPage: Number.isFinite(Number(currentPageRaw)) ? Number(currentPageRaw) : null,
    totalPage: Number.isFinite(Number(totalPageRaw)) ? Number(totalPageRaw) : null,
    totalElement: Number.isFinite(Number(totalElementRaw)) ? Number(totalElementRaw) : null,
    pageSize: Number.isFinite(Number(pageSizeRaw)) ? Number(pageSizeRaw) : null,
  };
}

function nextPageCursorFromEnvelope(envelope) {
  if (!envelope || envelope.currentPage == null) return null;
  const cp = envelope.currentPage;
  if (!Number.isFinite(cp)) return null;

  const tp = envelope.totalPage;
  if (tp != null && Number.isFinite(tp) && tp > 0) {
    // Spring-style 0-based page index (currentPage: 0 .. totalPage-1)
    if (cp + 1 < tp) return String(cp + 1);
    return null;
  }

  const te = envelope.totalElement;
  const ps = envelope.pageSize;
  if (te != null && ps != null && Number.isFinite(te) && Number.isFinite(ps) && ps > 0) {
    if ((cp + 1) * ps < te) return String(cp + 1);
    return null;
  }

  return null;
}

function extractListFromResponse(raw) {
  const paged = extractPagedListEnvelope(raw);
  if (paged) return paged.items;

  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray(raw)) return raw;

  const root = raw?.data != null ? raw.data : raw;
  if (Array.isArray(root)) return root;

  const candidates = [
    root?.items,
    root?.data,
    root?.results,
    root?.content,
    root?.streams,
    root?.bands,
    root?.departments,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  return [];
}

function resolveNextListCursor(raw, { resolvedPage, itemsLength, limit }) {
  const envelope = extractPagedListEnvelope(raw);
  if (envelope) {
    const fromMeta = nextPageCursorFromEnvelope(envelope);
    if (fromMeta != null) return fromMeta;
    const cp = envelope.currentPage;
    const tp = envelope.totalPage;
    // Some backends expose 1-based currentPage; handle that without dropping the last page.
    if (
      cp != null &&
      tp != null &&
      Number.isFinite(cp) &&
      Number.isFinite(tp) &&
      cp >= 1 &&
      cp < tp
    ) {
      return String(cp + 1);
    }
  }
  const lim = limit != null ? Number.parseInt(String(limit), 10) : null;
  if (lim != null && Number.isFinite(lim) && lim > 0 && itemsLength >= lim) {
    return String(resolvedPage + 1);
  }
  return null;
}

export async function fetchBands(options: DirectoryListOptions = {}) {
  const { search = null, page = 0, limit = null, cursor = null, signal } = options || {};
  const auth = getAuthHeader();

  const resolvedPage =
    cursor != null && cursor !== ""
      ? (Number.isFinite(Number(cursor)) ? Number.parseInt(String(cursor), 10) : 0)
      : Number.parseInt(String(page ?? "0"), 10) || 0;

  const qs = new URLSearchParams();
  if (search != null && String(search).trim()) qs.set("search", String(search).trim());
  qs.set("page", String(resolvedPage));
  if (limit != null) qs.set("limit", String(limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  const endpoints = [`/api/v1/band-list${suffix}`, `/api/v1/bands${suffix}`];

  let lastRouteErr: RouteErr | null = null;
  for (const endpoint of endpoints) {
    const res = await fetch(buildApiUrl(endpoint), {
      signal,
      credentials: "include",
      cache: "no-store",
      headers: auth ? { Authorization: auth } : undefined,
    });
    if (res.ok) {
      const raw = await res.json().catch(() => ({}));
      const items = extractListFromResponse(raw);
      const nextCursor = resolveNextListCursor(raw, {
        resolvedPage,
        itemsLength: Array.isArray(items) ? items.length : 0,
        limit,
      });
      return { items, nextCursor };
    }
    const err = await toHttpError(res);
    if (res.status === 500 || res.status === 403 || res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }
  throw lastRouteErr || new Error("Band list endpoint not found.");
}

export async function fetchBandById(id: string | number | null | undefined, options: SignalOptions = {}) {
  const { signal } = options || {};
  const raw = String(id ?? "").trim();
  const safeId = encodeURIComponent(raw);
  if (!safeId) throw new Error("band id is required.");
  const auth = getAuthHeader();

  const endpoints = [`/api/v1/band/${safeId}`, `/api/v1/bands/${safeId}`];
  let lastRouteErr: RouteErr | null = null;
  for (const path of endpoints) {
    const res = await fetch(buildApiUrl(path), {
      signal,
      credentials: "include",
      headers: auth ? { Authorization: auth } : undefined,
    });
    if (res.ok) return parseResponse(res, {});
    const err = await toHttpError(res);
    if (res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }
  throw lastRouteErr || new Error("Band fetch by id endpoint not found.");
}

export async function fetchStreams(options: FetchStreamsOptions = {}) {
  const { activeOnly = null, search = null, page = 0, limit = null, cursor = null, signal } = options || {};
  const auth = getAuthHeader();

  const resolvedPage =
    cursor != null && cursor !== ""
      ? (Number.isFinite(Number(cursor)) ? Number.parseInt(String(cursor), 10) : 0)
      : Number.parseInt(String(page ?? "0"), 10) || 0;

  const qs = new URLSearchParams();
  if (activeOnly != null) qs.set("activeOnly", String(Boolean(activeOnly)));
  if (search != null && String(search).trim()) qs.set("search", String(search).trim());
  qs.set("page", String(resolvedPage));
  if (limit != null) qs.set("limit", String(limit));

  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  const endpoints = [
    `/api/v1/department-list${suffix}`,
    `/api/v1/department${suffix}`,
  ];

  let lastRouteErr: RouteErr | null = null;
  for (const endpoint of endpoints) {
    const res = await fetch(buildApiUrl(endpoint), {
      signal,
      credentials: "include",
      headers: auth ? { Authorization: auth } : undefined,
    });
    if (res.ok) {
      const raw = await res.json().catch(() => ({}));
      const items = extractListFromResponse(raw);
      const nextCursor = resolveNextListCursor(raw, {
        resolvedPage,
        itemsLength: Array.isArray(items) ? items.length : 0,
        limit,
      });
      return { items, nextCursor };
    }
    const err = await toHttpError(res);
    if (res.status === 500 || res.status === 403 || res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }

  throw lastRouteErr || new Error("Department list endpoint not found.");
}

function extractCreatedBandIdFromResponse(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const nested =
    root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : root;
  for (const k of ["id", "bandId", "bandID"]) {
    const s = String(nested[k] ?? "").trim();
    if (/^\d+$/.test(s)) return s;
  }
  return null;
}

export async function addBand(payload: BandPayload, options: SignalOptions = {}) {
  const { signal } = options || {};
  const auth = getAuthHeader();
  const p = payload && typeof payload === "object" ? payload : {};
  const bandType = String(p.bandType ?? "BOTH").trim().toUpperCase() || "BOTH";
  const code = String(p.code ?? "").trim();
  const name = String(p.name ?? p.label ?? p.code ?? p.band ?? "").trim() || code;
  const designation = String(p.designation ?? p.label ?? "").trim() || name;
  const bodyObj: Record<string, unknown> = {
    name,
    designation,
    bandType,
    type: bandType,
    band_type: bandType,
  };
  if (code) {
    bodyObj.code = code;
    bodyObj.bandCode = code;
    bodyObj.level = code;
  }
  const body = JSON.stringify(bodyObj);
  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });
  // Prefer plural collection POST first — many Spring controllers expose POST on `/bands` only,
  // while GET-by-id lives on `/band/{id}`; singular POST `/band` then 404s on those apps.
  const endpoints = [
    "/api/v1/bands",
    "/api/v1/band",
    "/api/v1/bands/create",
    "/api/v1/band/create",
    "/api/v1/bands/add",
    "/api/v1/band/add",
    "/bands/add",
  ];
  const attempts: { endpoint: string; status: number; message: string }[] = [];
  let lastRouteErr: RouteErr | null = null;
  for (const endpoint of endpoints) {
    let res = await fetch(buildApiUrl(endpoint), {
      method: "POST",
      signal,
      credentials: "include",
      headers,
      body,
    });
    if (res.status === 403) {
      await ensureCsrfCookie({
        signal,
        headers: auth ? { Authorization: auth } : undefined,
        forceRefresh: true,
      }).catch(() => {});
      res = await fetch(buildApiUrl(endpoint), {
        method: "POST",
        signal,
        credentials: "include",
        headers,
        body,
      });
    }
    if (res.ok) {
      const parsed = await parseResponse(res, {});
      const newId = extractCreatedBandIdFromResponse(parsed);
      if (newId) {
        try {
          await updateBandType(String(newId), bandType, { signal });
        } catch {
          void 0;
        }
      }
      return parsed;
    }
    const err = await toHttpError(res, { method: "POST", path: endpoint });
    attempts.push({ endpoint, status: res.status, message: err.message });
    if (res.status === 403 || res.status === 404 || res.status === 405 || res.status === 400) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }
  const tried = attempts.map((a) => `POST ${a.endpoint} → ${a.status}`).join("; ");
  const hint =
    attempts.length && attempts.every((a) => a.status === 404)
      ? " The API returned 404 for every path — confirm the backend exposes POST create (e.g. /api/v1/bands) and that Settings → API base URL matches the server (avoid a base that already duplicates /api/v1)."
      : "";
  const detail = new Error(
    `${lastRouteErr?.message || "Band add failed."} Tried: ${tried}.${hint}`
  ) as RouteErr;
  detail.status = lastRouteErr?.status ?? attempts[attempts.length - 1]?.status;
  throw detail;
}

export async function addStream(payload: BandPayload, options: SignalOptions = {}) {
  const { signal } = options || {};
  const auth = getAuthHeader();
  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });

  let res = await fetch(buildApiUrl("/api/v1/department"), {
    method: "POST",
    signal,
    credentials: "include",
    headers,
    body: JSON.stringify({
      name: String(
        payload?.name ?? payload?.code ?? payload?.label ?? payload?.stream ?? ""
      ).trim(),
    }),
  });
  if (res.status === 403) {
    await ensureCsrfCookie({
      signal,
      headers: auth ? { Authorization: auth } : undefined,
      forceRefresh: true,
    }).catch(() => {});
    res = await fetch(buildApiUrl("/api/v1/department"), {
      method: "POST",
      signal,
      credentials: "include",
      headers,
      body: JSON.stringify(payload ?? {}),
    });
  }
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}

function resolvePositiveIntId(...candidates) {
  for (const c of candidates) {
    if (c == null) continue;
    const s = String(c).trim();
    if (!/^\d+$/.test(s)) continue;
    const n = Number.parseInt(s, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export async function updateBand(
  codeOrId: string | number | null | undefined,
  payload: BandPayload,
  options: SignalOptions = {}
) {
  const { signal } = options || {};
  const p = payload && typeof payload === "object" ? payload : {};
  const auth = getAuthHeader();
  const target = String(codeOrId ?? "").trim();
  if (!target) throw new Error("band id is required.");

  const resolvedId = resolvePositiveIntId(p.id, p.bandId, target);
  if (resolvedId == null) {
    throw new Error(
      "Band update requires a numeric server id (reload the directory list and try again).",
    );
  }

  const displayName = String(p.name ?? p.label ?? "").trim();
  const designationVal = String(p.designation ?? p.label ?? p.name ?? "").trim() || displayName;
  if (!displayName) throw new Error("Band name is required.");
  const bandTypeVal = String(p.bandType ?? "BOTH").trim().toUpperCase() || "BOTH";

  const bodyObj: Record<string, unknown> = {
    name: displayName,
    designation: designationVal || displayName,
    bandType: bandTypeVal,
    type: bandTypeVal,
    band_type: bandTypeVal,
  };

  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });

  const safeId = encodeURIComponent(String(resolvedId));
  const endpoints: HttpRoute[] = [
    { method: "PUT", path: `/api/v1/bands/${safeId}` },
    { method: "PUT", path: `/api/v1/band/${safeId}` },
    { method: "PATCH", path: `/api/v1/bands/${safeId}` },
    { method: "PATCH", path: `/api/v1/band/${safeId}` },
  ];

  let lastRouteErr: RouteErr | null = null;
  const body = JSON.stringify(bodyObj);
  for (const endpoint of endpoints) {
    let res = await fetch(buildApiUrl(endpoint.path), {
      method: endpoint.method,
      signal,
      credentials: "include",
      headers,
      body,
    });
    if (res.status === 403) {
      await ensureCsrfCookie({
        signal,
        headers: auth ? { Authorization: auth } : undefined,
        forceRefresh: true,
      }).catch(() => {});
      res = await fetch(buildApiUrl(endpoint.path), {
        method: endpoint.method,
        signal,
        credentials: "include",
        headers,
        body,
      });
    }
    if (res.ok) {
      const parsed = await parseResponse(res, {});
      try {
        await updateBandType(String(resolvedId), bandTypeVal, { signal });
      } catch {
        void 0;
      }
      return parsed;
    }
    const err = await toHttpError(res);
    if (res.status === 400 || res.status === 403 || res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }
  throw lastRouteErr || new Error("Band update endpoint not found.");
}

export async function updateBandType(
  id: string | number | null | undefined,
  bandType: string | null | undefined,
  options: SignalOptions = {}
) {
  const { signal } = options || {};
  const auth = getAuthHeader();
  const rawId = String(id ?? "").trim();
  const safeId = encodeURIComponent(rawId);
  if (!rawId) throw new Error("band id is required.");
  const safeBandType = String(bandType ?? "").trim().toUpperCase();
  if (!safeBandType) throw new Error("bandType is required.");

  const patchBody = JSON.stringify({ bandType: safeBandType, type: safeBandType });

  const endpoints = [
    { method: "PUT", path: `/api/v1/band/${safeId}`, body: patchBody },
    { method: "PUT", path: `/api/v1/bands/${safeId}`, body: patchBody },
    { method: "PATCH", path: `/api/v1/band/${safeId}`, body: patchBody },
    { method: "PATCH", path: `/api/v1/bands/${safeId}`, body: patchBody },
    { method: "PUT", path: `/api/v1/band/${safeId}?bandType=${encodeURIComponent(safeBandType)}` },
    { method: "PUT", path: `/api/v1/bands/${safeId}?bandType=${encodeURIComponent(safeBandType)}` },
    { method: "PUT", path: `/api/v1/band/${safeId}/type?bandType=${encodeURIComponent(safeBandType)}` },
    { method: "PATCH", path: `/api/v1/band/${safeId}/type?bandType=${encodeURIComponent(safeBandType)}` },
    { method: "POST", path: `/api/v1/band/${safeId}/type?bandType=${encodeURIComponent(safeBandType)}` },
    { method: "POST", path: `/api/v1/band/type`, body: JSON.stringify({ id: rawId, bandType: safeBandType }) },
  ];

  let lastRouteErr: RouteErr | null = null;
  for (const endpoint of endpoints) {
    const jsonHeaders = withCsrfHeaders({
      ...(auth ? { Authorization: auth } : {}),
      ...(endpoint.body ? { "Content-Type": "application/json" } : {}),
    });
    let res = await fetch(buildApiUrl(endpoint.path), {
      method: endpoint.method,
      signal,
      credentials: "include",
      headers: endpoint.body ? jsonHeaders : withCsrfHeaders(auth ? { Authorization: auth } : undefined),
      ...(endpoint.body ? { body: endpoint.body } : {}),
    });
    if (res.status === 403) {
      await ensureCsrfCookie({
        signal,
        headers: auth ? { Authorization: auth } : undefined,
        forceRefresh: true,
      }).catch(() => {});
      res = await fetch(buildApiUrl(endpoint.path), {
        method: endpoint.method,
        signal,
        credentials: "include",
        headers: endpoint.body ? jsonHeaders : withCsrfHeaders(auth ? { Authorization: auth } : undefined),
        ...(endpoint.body ? { body: endpoint.body } : {}),
      });
    }
    if (res.ok) return parseResponse(res, {});
    const err = await toHttpError(res);
    if (res.status === 400 || res.status === 403 || res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }
  throw lastRouteErr || new Error("Band type update endpoint not found.");
}

/** True when the server rejected a band DELETE because rows still reference it (e.g. users.band_id). */
export function isBandDeleteForeignKeyError(err: unknown): boolean {
  const m = String(err instanceof Error ? err.message : err ?? "").toLowerCase();
  if (!m) return false;
  const fk =
    m.includes("foreign key") ||
    m.includes("violates foreign key constraint") ||
    m.includes("still referenced") ||
    (m.includes("constraint") && (m.includes("referenced") || m.includes("users")));
  const inUse =
    m.includes("in use") ||
    m.includes("cannot be deleted") ||
    m.includes("cannot delete") ||
    m.includes("band is in use");
  return fk || inUse;
}

/**
 * Hide a band when it cannot be hard-deleted (employees still reference it).
 * Tries lightweight /status routes, then a full PATCH with listed/active false.
 */
export async function deactivateBand(row: Record<string, unknown>, options: SignalOptions = {}) {
  const { signal } = options || {};
  const rowObj = row && typeof row === "object" ? row : {};
  const id = String(rowObj.id ?? "").trim();
  const code = String(rowObj.code ?? "").trim();
  if (!/^\d+$/.test(id)) {
    throw new Error("Band needs a numeric server id to deactivate.");
  }
  const auth = getAuthHeader();
  const safeId = encodeURIComponent(id);
  const statusEndpoints = [
    `/api/v1/band/${safeId}/status?active=false`,
    `/api/v1/bands/${safeId}/status?active=false`,
    `/api/v1/band/${safeId}/status?listed=false`,
    `/api/v1/bands/${safeId}/status?listed=false`,
    `/api/v1/band/${safeId}/status?active=false&listed=false`,
    `/api/v1/bands/${safeId}/status?active=false&listed=false`,
  ];
  for (const endpoint of statusEndpoints) {
    let res = await fetch(buildApiUrl(endpoint), {
      method: "PATCH",
      signal,
      credentials: "include",
      headers: withCsrfHeaders(auth ? { Authorization: auth } : undefined),
    });
    if (res.status === 403) {
      await ensureCsrfCookie({
        signal,
        headers: auth ? { Authorization: auth } : undefined,
        forceRefresh: true,
      }).catch(() => {});
      res = await fetch(buildApiUrl(endpoint), {
        method: "PATCH",
        signal,
        credentials: "include",
        headers: withCsrfHeaders(auth ? { Authorization: auth } : undefined),
      });
    }
    if (res.ok) return parseResponse(res, {});
  }

  if (!code) {
    throw new Error("Band code is required to deactivate when /status is not supported.");
  }

  return updateBand(code, {
    id,
    bandId: id,
    code,
    originalCode: code,
    label: String(rowObj.label ?? "").trim() || code,
    designation: String(rowObj.label ?? "").trim() || code,
    bandType: String(rowObj.bandType ?? "BOTH").trim().toUpperCase() || "BOTH",
    active: false,
    listed: false,
  }, options);
}

/**
 * DELETE the band when possible; if the DB blocks removal because users still reference it,
 * deactivate (hide) the band instead.
 */
export async function resolveBandNumericId(
  row: Record<string, unknown>,
  options: SignalOptions = {},
): Promise<string> {
  const direct = String(row?.id ?? row?.bandId ?? "").trim();
  if (/^\d+$/.test(direct)) return direct;

  const code = String(row?.code ?? row?.name ?? row?.label ?? "").trim();
  if (!code) throw new Error("Band id or code is required.");

  const { signal } = options;
  const auth = getAuthHeader();
  const listPaths = ["/api/v1/bands", "/api/v1/band", "/bands"];
  for (const path of listPaths) {
    const res = await fetch(buildApiUrl(path), {
      method: "GET",
      signal,
      credentials: "include",
      headers: auth ? { Authorization: auth } : undefined,
    });
    if (!res.ok) continue;
    const data = await res.json().catch(() => ({}));
    const rows = normalizeBands(data);
    const key = code.toLowerCase();
    const match = rows.find(
      (r) =>
        String(r.code || "").trim().toLowerCase() === key ||
        String(r.label || "").trim().toLowerCase() === key ||
        String(r.id || "").trim() === code,
    );
    if (match?.id && /^\d+$/.test(String(match.id))) return String(match.id);
  }

  throw new Error(`Could not resolve band id for "${code}". Refresh the directory and try again.`);
}

export async function deleteBandOrDeactivate(row: Record<string, unknown>, options: SignalOptions = {}) {
  const directId = String(row?.id ?? row?.bandId ?? "").trim();
  let numericId = /^\d+$/.test(directId) ? directId : null;
  if (!numericId) {
    try {
      numericId = await resolveBandNumericId(row, options);
    } catch (resolveErr) {
      const code = String(row?.code ?? row?.name ?? row?.label ?? "").trim();
      if (!code) throw resolveErr;
      try {
        const result = await deleteBand(code, options);
        return { hardDeleted: true, result };
      } catch (codeErr) {
        if (!isBandDeleteForeignKeyError(codeErr)) throw codeErr;
        const result = await deactivateBand({ ...row, code }, options);
        return { hardDeleted: false, deactivated: true, result };
      }
    }
  }
  const enriched = { ...row, id: numericId };
  try {
    const result = await deleteBand(numericId, options);
    return { hardDeleted: true, result };
  } catch (err) {
    if (!isBandDeleteForeignKeyError(err)) throw err;
    try {
      const result = await deactivateBand(enriched, options);
      return { hardDeleted: false, deactivated: true, result };
    } catch (deactivateErr) {
      throw new Error(
        `${err instanceof Error ? err.message : String(err)}. ` +
          `Could not hide the band either: ${deactivateErr instanceof Error ? deactivateErr.message : String(deactivateErr)}`,
      );
    }
  }
}

/** Prefer numeric department id for REST `{departmentKey}` paths; fall back to name. */
export function resolveDepartmentRestKey(rowOrKey, payload = {}) {
  const p = payload && typeof payload === "object" ? payload : {};
  const row = rowOrKey && typeof rowOrKey === "object" && !Array.isArray(rowOrKey) ? rowOrKey : null;
  for (const k of ["id", "departmentId", "streamId"]) {
    const fromPayload = String(p[k] ?? "").trim();
    if (/^\d+$/.test(fromPayload)) return fromPayload;
    if (row) {
      const fromRow = String(row[k] ?? row.id ?? "").trim();
      if (/^\d+$/.test(fromRow)) return fromRow;
    }
  }
  const t = String(row?.code ?? row?.name ?? rowOrKey ?? "").trim();
  if (!t) throw new Error("department id or name is required.");
  return t;
}

function resolveDepartmentRestSegment(targetKey, payload = {}) {
  return resolveDepartmentRestKey(targetKey, payload);
}

function isActiveOnlyDepartmentPayload(payload) {
  if (!payload || typeof payload !== "object") return false;
  const meta = new Set(["id", "departmentId", "streamId", "code", "originalCode", "bandType", "sortOrder"]);
  const keys = Object.keys(payload).filter((k) => !meta.has(k));
  if (!keys.length) return false;
  if (!keys.every((k) => ["active", "listed", "isActive", "isListed"].includes(k))) return false;
  return keys.some((k) => ["active", "listed", "isActive", "isListed"].includes(k));
}

function departmentActiveValue(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(payload, "active")) return Boolean(payload.active);
  if (Object.prototype.hasOwnProperty.call(payload, "isActive")) return Boolean(payload.isActive);
  if (Object.prototype.hasOwnProperty.call(payload, "listed")) return Boolean(payload.listed);
  if (Object.prototype.hasOwnProperty.call(payload, "isListed")) return Boolean(payload.isListed);
  return false;
}

export async function updateStream(
  targetKey: string | number | null | undefined,
  payload: BandPayload,
  options: SignalOptions = {}
) {
  const { signal } = options || {};
  const segment = resolveDepartmentRestSegment(String(targetKey ?? "").trim(), payload);
  const safeId = encodeURIComponent(segment);
  if (!safeId) throw new Error("department id is required.");

  const auth = getAuthHeader();

  if (isActiveOnlyDepartmentPayload(payload)) {
    const activeVal = departmentActiveValue(payload);
    const statusPaths = [
      `/api/v1/department/${safeId}/status?active=${activeVal}`,
      `/api/v1/department/${safeId}/status?listed=${activeVal}`,
      `/api/v1/departments/${safeId}/status?active=${activeVal}`,
      `/api/v1/departments/${safeId}/status?listed=${activeVal}`,
      `/api/v1/streams/${safeId}/status?active=${activeVal}`,
      `/api/v1/streams/${safeId}/status?listed=${activeVal}`,
      `/api/v1/stream/${safeId}/status?active=${activeVal}`,
      `/api/v1/stream/${safeId}/status?listed=${activeVal}`,
    ];

    let lastRouteErr: RouteErr | null = null;
    for (const endpoint of statusPaths) {
      let res = await fetch(buildApiUrl(endpoint), {
        method: "PATCH",
        signal,
        credentials: "include",
        headers: withCsrfHeaders(auth ? { Authorization: auth } : undefined),
      });
      if (res.status === 403) {
        await ensureCsrfCookie({
          signal,
          headers: auth ? { Authorization: auth } : undefined,
          forceRefresh: true,
        }).catch(() => {});
        res = await fetch(buildApiUrl(endpoint), {
          method: "PATCH",
          signal,
          credentials: "include",
          headers: withCsrfHeaders(auth ? { Authorization: auth } : undefined),
        });
      }
      if (res.ok) return res.json().catch(() => ({}));
      const err = await toHttpError(res);
      if (res.status === 403 || res.status === 404 || res.status === 405) {
        lastRouteErr = err;
        continue;
      }
      throw err;
    }

    const flagBody = JSON.stringify({
      active: activeVal,
      listed: activeVal,
      isActive: activeVal,
      isListed: activeVal,
    });
    const jsonHeaders = withCsrfHeaders({
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    });
    const patchPaths = [
      `/api/v1/department/${safeId}`,
      `/api/v1/departments/${safeId}`,
      `/api/v1/streams/${safeId}`,
      `/api/v1/stream/${safeId}`,
    ];
    for (const path of patchPaths) {
      for (const method of ["PATCH", "PUT"]) {
        let res = await fetch(buildApiUrl(path), {
          method,
          signal,
          credentials: "include",
          headers: jsonHeaders,
          body: flagBody,
        });
        if (res.status === 403) {
          await ensureCsrfCookie({
            signal,
            headers: auth ? { Authorization: auth } : undefined,
            forceRefresh: true,
          }).catch(() => {});
          res = await fetch(buildApiUrl(path), {
            method,
            signal,
            credentials: "include",
            headers: jsonHeaders,
            body: flagBody,
          });
        }
        if (res.ok) return res.json().catch(() => ({}));
        const err = await toHttpError(res);
        if (res.status === 403 || res.status === 404 || res.status === 405 || res.status === 400) {
          lastRouteErr = err;
          continue;
        }
        throw err;
      }
    }

    throw lastRouteErr || new Error("Department status endpoint not found.");
  }

  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });
  const displayName = String(payload?.name ?? payload?.label ?? payload?.code ?? segment ?? "").trim();
  const bodyObj: Record<string, unknown> = {
    name: displayName,
    departmentName: displayName,
    streamName: displayName,
    label: String(payload?.label ?? displayName).trim(),
  };
  if (String(payload?.code ?? "").trim()) bodyObj.code = String(payload.code).trim();
  if (typeof payload?.active === "boolean") {
    bodyObj.active = payload.active;
    bodyObj.listed = payload.active;
    bodyObj.isActive = payload.active;
    bodyObj.isListed = payload.active;
  }
  const body = JSON.stringify(bodyObj);

  const writePaths = [
    `/api/v1/department/${safeId}`,
    `/api/v1/departments/${safeId}`,
    `/api/v1/streams/${safeId}`,
    `/api/v1/stream/${safeId}`,
  ];

  let lastRouteErr: RouteErr | null = null;
  for (const path of writePaths) {
    for (const method of ["PUT", "PATCH"]) {
      let res = await fetch(buildApiUrl(path), {
        method,
        signal,
        credentials: "include",
        headers,
        body,
      });
      if (res.status === 403) {
        await ensureCsrfCookie({
          signal,
          headers: auth ? { Authorization: auth } : undefined,
          forceRefresh: true,
        }).catch(() => {});
        res = await fetch(buildApiUrl(path), {
          method,
          signal,
          credentials: "include",
          headers,
          body,
        });
      }
      if (res.ok) return res.json().catch(() => ({}));
      const err = await toHttpError(res);
      if (res.status === 403 || res.status === 404 || res.status === 405 || res.status === 400) {
        lastRouteErr = err;
        continue;
      }
      throw err;
    }
  }

  throw lastRouteErr || new Error("Department update endpoint not found.");
}

export async function deleteBand(id: string | number | null | undefined, options: SignalOptions = {}) {
  const { signal } = options || {};
  const raw = String(id ?? "").trim();
  const safeId = encodeURIComponent(raw);
  const auth = getAuthHeader();
  if (!safeId) throw new Error("band id is required.");
  const headers = withCsrfHeaders(auth ? { Authorization: auth } : undefined);
  const restByNumericId = /^\d+$/.test(raw);
  const endpoints = restByNumericId
    ? [
        `/api/v1/bands/${safeId}`,
        `/api/v1/band/${safeId}`,
        `/api/v1/bands/${safeId}/delete`,
        `/api/v1/band/${safeId}/delete`,
        `/bands/delete/${safeId}`,
      ]
    : [
        `/bands/delete/${safeId}`,
        `/api/v1/bands/${safeId}`,
        `/api/v1/band/${safeId}`,
        `/api/v1/bands/${safeId}/delete`,
        `/api/v1/band/${safeId}/delete`,
      ];
  let lastRouteErr: RouteErr | null = null;
  for (const endpoint of endpoints) {
    let res = await fetch(buildApiUrl(endpoint), {
      method: "DELETE",
      signal,
      credentials: "include",
      headers,
    });
    if (res.status === 403) {
      await ensureCsrfCookie({
        signal,
        headers: auth ? { Authorization: auth } : undefined,
        forceRefresh: true,
      }).catch(() => {});
      res = await fetch(buildApiUrl(endpoint), {
        method: "DELETE",
        signal,
        credentials: "include",
        headers,
      });
    }
    if (res.ok) return parseResponse(res, {});
    const err = await toHttpError(res);
    if (res.status === 403 || res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }

  /** Some deployments only expose POST-based delete. */
  const postEndpoints = restByNumericId
    ? [
        `/api/v1/bands/${safeId}/delete`,
        `/api/v1/band/${safeId}/delete`,
        `/bands/delete/${safeId}`,
      ]
    : [`/bands/delete/${safeId}`, `/api/v1/bands/${safeId}/delete`, `/api/v1/band/${safeId}/delete`];
  const postHeaders = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });
  const emptyBody = "{}";
  for (const endpoint of postEndpoints) {
    let res = await fetch(buildApiUrl(endpoint), {
      method: "POST",
      signal,
      credentials: "include",
      headers: postHeaders,
      body: emptyBody,
    });
    if (res.status === 403) {
      await ensureCsrfCookie({
        signal,
        headers: auth ? { Authorization: auth } : undefined,
        forceRefresh: true,
      }).catch(() => {});
      res = await fetch(buildApiUrl(endpoint), {
        method: "POST",
        signal,
        credentials: "include",
        headers: postHeaders,
        body: emptyBody,
      });
    }
    if (res.ok) return parseResponse(res, {});
    const err = await toHttpError(res);
    if (res.status === 403 || res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }

  throw lastRouteErr || new Error("Band delete endpoint not found.");
}

export async function deleteStream(target: string | Record<string, unknown>, options: SignalOptions = {}) {
  const { signal } = options || {};
  const row = target && typeof target === "object" && !Array.isArray(target) ? target : null;
  const segment = row
    ? resolveDepartmentRestSegment(String(row.code ?? "").trim(), {
        id: row.id,
        departmentId: row.id,
        streamId: row.id,
      })
    : resolveDepartmentRestSegment(String(target ?? "").trim(), {});
  const safeId = encodeURIComponent(segment);
  if (!safeId) throw new Error("department id is required.");

  const auth = getAuthHeader();
  const headers = withCsrfHeaders(auth ? { Authorization: auth } : undefined);

  const endpoints = [
    `/api/v1/department/${safeId}`,
    `/api/v1/departments/${safeId}`,
    `/api/v1/streams/${safeId}`,
    `/api/v1/stream/${safeId}`,
    `/api/v1/department/${safeId}?hardDelete=false`,
    `/api/v1/departments/${safeId}?hardDelete=false`,
    `/api/v1/department/${safeId}?hardDelete=true`,
    `/api/v1/departments/${safeId}?hardDelete=true`,
    `/streams/delete/${safeId}`,
  ];

  let lastRouteErr: RouteErr | null = null;
  for (const endpoint of endpoints) {
    let res = await fetch(buildApiUrl(endpoint), {
      method: "DELETE",
      signal,
      credentials: "include",
      headers,
    });
    if (res.status === 403) {
      await ensureCsrfCookie({
        signal,
        headers: auth ? { Authorization: auth } : undefined,
        forceRefresh: true,
      }).catch(() => {});
      res = await fetch(buildApiUrl(endpoint), {
        method: "DELETE",
        signal,
        credentials: "include",
        headers,
      });
    }
    if (res.ok) return parseResponse(res, {});
    const err = await toHttpError(res);
    if (res.status === 403 || res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }

  throw lastRouteErr || new Error("Department delete endpoint not found.");
}

export function normalizeBands(data: unknown) {
  return normalizeDirectoryRows(normalizePage(data).items);
}

export function normalizeStreams(data: unknown) {
  return normalizeDirectoryRows(normalizePage(data).items);
}

export function normalizeDirectoryPage(data: unknown) {
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

async function fetchDesignation(
  path: string,
  {
    band,
    stream,
    signal,
  }: { band?: string | null; stream?: string | null; signal?: AbortSignal } = {}
) {
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

export async function fetchBandDesignation(options: {
  band?: string | null;
  stream?: string | null;
  signal?: AbortSignal;
} = {} as ApiOptions) {
  const { band, stream, signal } = options;
  return fetchDesignation("/bands", { band, stream, signal });
}

export async function fetchStreamDesignation(options: {
  stream?: string | null;
  band?: string | null;
  signal?: AbortSignal;
} = {} as ApiOptions) {
  const { stream, band, signal } = options;
  return fetchDesignation("/streams", { band, stream, signal });
}
