// @ts-nocheck
import type { ApiOptions } from "../types/api-options";
import { getAuthHeader } from "./auth";
import { buildApiUrl, ensureCsrfCookie, parseResponse, toHttpError, withCsrfHeaders } from "./http";

/**
 * Certification registry (REST).
 * List/create/update/delete target `/api/v1/certifications` (and a few aliases) so admin and
 * employee portals share the same server-backed catalog. When no route responds successfully,
 * `fetchCertifications` returns `{ remoteCatalogAvailable: false }` without throwing so the admin
 * UI can fall back to the browser-local registry.
 */

function toNullableBoolean(value) {
  if (value == null) return null;
  if (typeof value === "boolean") return value;
  const s = String(value).trim().toLowerCase();
  if (!s) return null;
  if (["1", "true", "yes", "on", "enabled", "active", "listed"].includes(s)) return true;
  if (["0", "false", "no", "off", "disabled", "inactive", "unlisted"].includes(s)) return false;
  if (s.includes("inactive") || s.includes("disabled")) return false;
  if (s.includes("active") || s.includes("enabled") || s.includes("listed")) return true;
  return null;
}

function extractCertificationName(raw) {
  if (typeof raw === "string") return raw.trim();
  if (!raw || typeof raw !== "object") return "";

  const direct = String(raw.name ?? raw.certificationName ?? raw.title ?? "").trim();
  if (direct) return direct;

  if (raw.certification && typeof raw.certification === "object") {
    const nested = String(
      raw.certification.name ?? raw.certification.certificationName ?? raw.certification.title ?? ""
    ).trim();
    if (nested) return nested;
  }

  if (typeof raw.certification === "string") {
    const nestedText = raw.certification.trim();
    if (nestedText) return nestedText;
  }

  return "";
}

/** Synthetic ids from older local-only catalog — never send to REST. */
function isLocalSyntheticCertId(id) {
  const s = String(id ?? "").trim();
  return /^CERT_/i.test(s);
}

/** True when we have a non-placeholder id suitable for REST `{id}` paths. */
export function certificationIdIsApiBacked(id) {
  const s = String(id ?? "").trim();
  if (!s || isLocalSyntheticCertId(s)) return false;
  return true;
}

function resolveServerCertificationId(obj) {
  if (!obj || typeof obj !== "object") return null;
  const candidates = [
    obj.id,
    obj.certificationId,
    obj.certId,
    obj.certificationUuid,
    obj.uuid,
    obj.publicId,
    obj.certification?.id,
    obj.certification?.certificationId,
    obj.certification?.certId,
    obj.data?.id,
    obj.data?.certificationId,
  ];
  for (const c of candidates) {
    if (c == null) continue;
    const s = typeof c === "number" && Number.isFinite(c) ? String(Math.trunc(c)) : String(c).trim();
    if (!s || isLocalSyntheticCertId(s)) continue;
    return s;
  }
  return null;
}

export function normalizeCertifications(data) {
  const root = data && typeof data === "object" ? data : {};
  const nested = root?.data && typeof root.data === "object" ? root.data : null;
  const arr =
    (Array.isArray(data) && data) ||
    (Array.isArray(root?.data) && root.data) ||
    (Array.isArray(root?.items) && root.items) ||
    (Array.isArray(root?.content) && root.content) ||
    (Array.isArray(root?.results) && root.results) ||
    (Array.isArray(root?.list) && root.list) ||
    (Array.isArray(nested?.items) && nested.items) ||
    (Array.isArray(nested?.content) && nested.content) ||
    (Array.isArray(nested?.results) && nested.results) ||
    (Array.isArray(nested?.list) && nested.list) ||
    (Array.isArray(nested?.certifications) && nested.certifications) ||
    [];

  return arr
    .map((raw) => {
      const obj = raw && typeof raw === "object" ? raw : { name: raw };
      const id = resolveServerCertificationId(obj);
      const name = extractCertificationName(obj);
      const idStr = id != null ? String(id).trim() : "";
      if (!name && !idStr) return null;
      const listedRaw =
        obj.active ??
        obj.isActive ??
        obj.listed ??
        obj.isListed ??
        obj.enabled ??
        obj.status ??
        obj.state ??
        obj.certification?.active ??
        obj.certification?.isActive ??
        obj.certification?.status ??
        true;
      const statusText = String(listedRaw || "").trim().toLowerCase();
      const listedParsed = toNullableBoolean(listedRaw);
      const statusParsed =
        statusText.includes("inactive") || statusText.includes("disabled") || statusText.includes("unlisted")
          ? false
          : statusText.includes("active") || statusText.includes("listed") || statusText.includes("enabled")
            ? true
            : null;
      const listed = listedParsed != null ? listedParsed : (statusParsed != null ? statusParsed : true);
      const displayName = name || idStr || "Certification";
      return { id: id != null ? String(id) : null, name: displayName, listed };
    })
    .filter(Boolean);
}

function extractItemsArrayFromResponse(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];

  const root = raw;
  const nested = root?.data && typeof root.data === "object" ? root.data : null;

  const candidates = [
    root?.content,
    root?.items,
    root?.results,
    root?.list,
    root?.certifications,
    nested?.content,
    nested?.data,
    nested?.items,
    nested?.results,
    nested?.list,
    nested?.certifications,
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }

  if (Array.isArray(root?.data)) return root.data;

  return [];
}

function readEnvelopeNextCursor(raw) {
  const root = raw && typeof raw === "object" ? raw : {};
  const nested = root?.data && typeof root.data === "object" ? root.data : null;
  const candidates = [
    root?.nextCursor,
    root?.next,
    root?.nextToken,
    root?.nextPageToken,
    nested?.nextCursor,
    nested?.next,
    nested?.nextToken,
    root?.page?.nextCursor,
    root?.pageInfo?.nextCursor,
  ];
  for (const c of candidates) {
    if (c == null) continue;
    const s = String(c).trim();
    if (s) return s;
  }
  return null;
}

function resolveSpringPageNextCursor(raw, { safeOffset, safeLimit, itemsLength }) {
  const root = raw && typeof raw === "object" ? raw : {};
  const last = root.last;
  const totalPages = Number(root.totalPages);
  const pageNumber = Number(root.number ?? root.page ?? root.currentPage);
  const size = Number(root.size ?? root.pageSize ?? safeLimit) || safeLimit;

  if (last === false) return String(safeOffset + itemsLength);
  if (Number.isFinite(totalPages) && Number.isFinite(pageNumber) && totalPages > 0 && pageNumber < totalPages - 1) {
    return String(safeOffset + itemsLength);
  }
  if (Number.isFinite(size) && itemsLength >= size && itemsLength === safeLimit) {
    return String(safeOffset + safeLimit);
  }
  return null;
}

function resolveListNextCursor(raw, { safeOffset, safeLimit, itemsLength }) {
  const fromEnvelope = readEnvelopeNextCursor(raw);
  if (fromEnvelope) return fromEnvelope;
  return resolveSpringPageNextCursor(raw, { safeOffset, safeLimit, itemsLength });
}

async function fetchWithCsrfRetry(url, init, { auth } = {} as ApiOptions) {
  let res = await fetch(url, init);
  if (res.status === 403) {
    await ensureCsrfCookie({
      signal: init.signal,
      headers: auth ? { Authorization: auth } : undefined,
      forceRefresh: true,
    }).catch(() => {});
    res = await fetch(url, init);
  }
  return res;
}

function buildSpringPageQuery(safePage, safeLimit) {
  const qs = new URLSearchParams();
  qs.set("page", String(safePage));
  qs.set("size", String(safeLimit));
  return qs.toString();
}

function buildOffsetQuery({ safeLimit, safeOffset, activeOnly }) {
  const qs = new URLSearchParams();
  qs.set("limit", String(safeLimit));
  qs.set("offset", String(safeOffset));
  if (activeOnly != null) qs.set("activeOnly", String(Boolean(activeOnly)));
  return qs.toString();
}

/**
 * @param {{ limit?: number|null, cursor?: string|null, signal?: AbortSignal, activeOnly?: boolean|null }} options
 * activeOnly: true (employee), false (admin shows all), null (omit param)
 */
export async function fetchCertifications({ limit = null, cursor = null, signal, activeOnly = null } = {} as ApiOptions) {
  const auth = getAuthHeader();

  const fallbackLimit = 20;
  const resolvedLimit = limit != null ? Number.parseInt(String(limit), 10) : fallbackLimit;
  const safeLimit = Number.isFinite(resolvedLimit) && resolvedLimit > 0 ? resolvedLimit : fallbackLimit;
  const resolvedOffset = cursor != null ? Number.parseInt(String(cursor), 10) : 0;
  const safeOffset = Number.isFinite(resolvedOffset) && resolvedOffset >= 0 ? resolvedOffset : 0;
  const safePage = Math.floor(safeOffset / safeLimit);

  const springQ = buildSpringPageQuery(safePage, safeLimit);
  const offsetQ = buildOffsetQuery({ safeLimit, safeOffset, activeOnly });

  const listPaths = [
    `/api/v1/certifications?${springQ}`,
    `/api/v1/certification-list?${springQ}`,
    `/api/v1/certification?${springQ}`,
    `/api/v1/certifications?${offsetQ}`,
    `/api/v1/certification-list?${offsetQ}`,
    `/api/v1/certification?${offsetQ}`,
  ];

  for (const path of listPaths) {
    const res = await fetch(buildApiUrl(path), {
      signal,
      credentials: "include",
      cache: "no-store",
      headers: auth ? { Authorization: auth } : undefined,
    });
    if (res.ok) {
      const raw = await res.json().catch(() => ({}));
      const items = extractItemsArrayFromResponse(raw);
      const nextFromEnvelope = readEnvelopeNextCursor(raw);
      const nextFromSpring = resolveListNextCursor(raw, { safeOffset, safeLimit, itemsLength: items.length });
      const nextCursor =
        nextFromEnvelope ??
        nextFromSpring ??
        (items.length === safeLimit ? String(safeOffset + safeLimit) : null);
      return { items, nextCursor, remoteCatalogAvailable: true };
    }
    if (res.status === 404 || res.status === 405) {
      continue;
    }
    throw await toHttpError(res);
  }

  return {
    items: [],
    nextCursor: null,
    remoteCatalogAvailable: false,
    _offlineReason:
      "No certification list endpoint responded. Ensure GET `/api/v1/certifications` (or an alias) is exposed, or continue using the on-device registry.",
  };
}

/**
 * Walks paginated list endpoints until `nextCursor` is absent.
 * @param {{ activeOnly?: boolean|null, signal?: AbortSignal, pageSize?: number, maxPages?: number }} options
 */
export async function fetchAllCertifications({ activeOnly = null, signal, pageSize = 100, maxPages = 100 } = {} as ApiOptions) {
  const aggregated = [];
  let cursor = null;
  for (let i = 0; i < maxPages; i += 1) {
    const data = await fetchCertifications({
      limit: pageSize,
      cursor,
      signal,
      activeOnly,
    });
    if (data.remoteCatalogAvailable === false) {
      return { items: [], remoteCatalogAvailable: false };
    }
    const batch = Array.isArray(data.items) ? data.items : [];
    aggregated.push(...batch);
    const next = data.nextCursor != null ? String(data.nextCursor).trim() : "";
    if (!next) break;
    if (String(cursor ?? "") === next && batch.length === 0) break;
    cursor = next;
    if (batch.length === 0) break;
  }
  return { items: aggregated, remoteCatalogAvailable: true };
}

export async function fetchCertification(id, { signal } = {} as ApiOptions) {
  const rawId = String(id ?? "").trim();
  const safeId = encodeURIComponent(rawId);
  if (!safeId) throw new Error("Certification id is required.");

  const auth = getAuthHeader();
  const paths = [`/api/v1/certifications/${safeId}`, `/api/v1/certification/${safeId}`];
  let lastRouteErr = null;
  for (const path of paths) {
    const res = await fetch(buildApiUrl(path), {
      signal,
      credentials: "include",
      cache: "no-store",
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
  throw lastRouteErr || new Error("Certification fetch endpoint not found.");
}

function toWritePayload({ name, listed }) {
  const trimName = String(name || "").trim();
  const active = toNullableBoolean(listed);
  const body = {};
  if (trimName) {
    body.name = trimName;
    body.certificationName = trimName;
  }
  if (active != null) {
    body.active = active;
    body.isActive = active;
    body.listed = active;
    body.isListed = active;
  }
  if (!trimName && active == null) {
    body.active = false;
    body.listed = false;
  }
  return JSON.stringify(body);
}

function toMinimalWritePayload({ name, listed }) {
  const trimName = String(name || "").trim();
  const active = toNullableBoolean(listed);
  const body = {};
  if (trimName) body.name = trimName;
  if (active != null) body.active = active;
  return JSON.stringify(body);
}

function toListedWritePayload({ name, listed }) {
  const trimName = String(name || "").trim();
  const active = toNullableBoolean(listed);
  const body = {};
  if (trimName) body.certificationName = trimName;
  if (active != null) body.listed = active;
  return JSON.stringify(body);
}

export async function addCertification({ name, listed = true }, { signal } = {} as ApiOptions) {
  const auth = getAuthHeader();
  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });
  const bodyVariants = [
    toWritePayload({ name, listed }),
    toMinimalWritePayload({ name, listed }),
    toListedWritePayload({ name, listed }),
  ];

  const paths = ["/api/v1/certifications", "/api/v1/certification"];

  let lastRouteErr = null;
  pathLoop: for (const path of paths) {
    for (const body of bodyVariants) {
      const url = buildApiUrl(path);
      let res = await fetchWithCsrfRetry(url, { method: "POST", signal, credentials: "include", headers, body }, { auth });
      if (res.ok) return parseResponse(res, {});
      const err = await toHttpError(res);
      if (res.status === 404 || res.status === 405) {
        lastRouteErr = err;
        continue pathLoop;
      }
      if (res.status === 400) {
        lastRouteErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastRouteErr || new Error("Certification create not supported.");
}

export async function updateCertification(id, { name, listed = true }, { signal } = {} as ApiOptions) {
  const rawId = String(id ?? "").trim();
  if (!rawId) throw new Error("Certification id is required.");
  if (isLocalSyntheticCertId(rawId)) {
    throw new Error("This certification has no server id. Refresh the list after the API loads.");
  }
  const safeId = encodeURIComponent(rawId);
  const auth = getAuthHeader();
  const jsonHeaders = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });

  const bodyVariants = [
    toWritePayload({ name, listed }),
    toMinimalWritePayload({ name, listed }),
    toListedWritePayload({ name, listed }),
  ];

  const paths = [`/api/v1/certifications/${safeId}`, `/api/v1/certification/${safeId}`];

  let lastRouteErr = null;
  pathLoop: for (const path of paths) {
    for (const body of bodyVariants) {
      for (const method of ["PATCH", "PUT"]) {
        const url = buildApiUrl(path);
        let res = await fetchWithCsrfRetry(
          url,
          { method, signal, credentials: "include", headers: jsonHeaders, body },
          { auth }
        );
        if (res.ok) return parseResponse(res, {});
        const err = await toHttpError(res);
        if (res.status === 404 || res.status === 405) {
          lastRouteErr = err;
          continue pathLoop;
        }
        if (res.status === 400) {
          lastRouteErr = err;
          continue;
        }
        throw err;
      }
    }
  }
  throw lastRouteErr || new Error("Certification update not supported.");
}

export async function deleteCertification(id, { signal } = {} as ApiOptions) {
  const rawId = String(id ?? "").trim();
  if (!rawId) throw new Error("Certification id is required.");
  if (isLocalSyntheticCertId(rawId)) {
    throw new Error("This certification has no server id. Refresh the list after the API loads.");
  }
  const safeId = encodeURIComponent(rawId);
  const auth = getAuthHeader();
  const deleteHeaders = withCsrfHeaders(auth ? { Authorization: auth } : undefined);

  const deletePaths = [`/api/v1/certifications/${safeId}`, `/api/v1/certification/${safeId}`];

  let lastRouteErr = null;
  for (const path of deletePaths) {
    const url = buildApiUrl(path);
    const init = { method: "DELETE", signal, credentials: "include", headers: deleteHeaders };
    let res = await fetchWithCsrfRetry(url, init, { auth });
    if (res.ok) {
      if (res.status === 204) return {};
      return parseResponse(res, {});
    }
    const err = await toHttpError(res);
    if (res.status === 404 || res.status === 405 || res.status === 400) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }

  try {
    const jsonHeaders = withCsrfHeaders({
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    });
    const softBody = JSON.stringify({ active: false, listed: false, isActive: false, isListed: false });
    for (const path of deletePaths) {
      const url = buildApiUrl(path);
      let res = await fetchWithCsrfRetry(
        url,
        { method: "PATCH", signal, credentials: "include", headers: jsonHeaders, body: softBody },
        { auth }
      );
      if (res.ok) {
        if (res.status === 204) return {};
        return parseResponse(res, {});
      }
    }
  } catch {
    void 0;
  }

  throw lastRouteErr || new Error("Certification delete not supported.");
}
