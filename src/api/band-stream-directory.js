import { getAuthHeader } from "./auth.js";
import { buildApiUrl, ensureCsrfCookie, parseResponse, toHttpError, withCsrfHeaders } from "./http.js";

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

function normalizeDirectoryRows(data) {
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
      const obj = raw && typeof raw === "object" ? raw : {};
      const code = [
        obj.code,
        obj.name,
        obj.departmentCode,
        obj.streamCode,
        obj.stream,
        obj.band,
        obj.department,
        obj.name,
        obj.id,
      ]
        .map((v) => String(v ?? "").trim())
        .find((v) => v);
      if (!code) return null;
      return {
        id:
          obj.id != null
            ? String(obj.id)
            : obj.bandId != null
              ? String(obj.bandId)
              : obj.bandID != null
                ? String(obj.bandID)
                : obj.departmentId != null
                  ? String(obj.departmentId)
                  : obj.streamId != null
                    ? String(obj.streamId)
                    : null,
        code,
        label: String(
          obj.designation ?? obj.label ?? obj.departmentName ?? obj.streamName ?? obj.name ?? obj.stream ?? obj.band ?? code
        ).trim() || code,
        bandType: String(obj.bandType ?? obj.type ?? "BOTH").trim().toUpperCase() || "BOTH",
        active: Boolean(obj.active ?? obj.listed ?? true),
        sortOrder: Number.isFinite(Number(obj.sortOrder)) ? Number(obj.sortOrder) : null,
        createdAt: obj.createdAt ? String(obj.createdAt) : null,
        updatedAt: obj.updatedAt ? String(obj.updatedAt) : null,
      };
    })
    .filter(Boolean);
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

export async function fetchBands(options = {}) {
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

  const endpoints = [`/api/v1/band-list${suffix}`];

  let lastRouteErr = null;
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
  throw lastRouteErr || new Error("Band list endpoint not found.");
}

export async function fetchStreams(options = {}) {
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

  // Webtrak exposes enum departments at /api/v1/departments and a compatibility
  // streams endpoint at /api/v1/streams.
  // Some controllers paginate with `size` instead of `limit`.
  const qsSize = new URLSearchParams(qs);
  if (qsSize.has("limit")) {
    qsSize.set("size", qsSize.get("limit"));
  }
  const suffixSize = qsSize.toString() ? `?${qsSize.toString()}` : "";

  const endpoints = [
    `/api/v1/departments${suffix}`,
    `/api/v1/streams${suffix}`,
    `/api/v1/streams${suffixSize}`,
  ];

  let lastRouteErr = null;
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

export async function addBand(payload, options = {}) {
  const { signal } = options || {};
  const auth = getAuthHeader();
  const p = payload && typeof payload === "object" ? payload : {};
  const bandType = String(p.bandType ?? "BOTH").trim().toUpperCase() || "BOTH";
  const body = JSON.stringify({
    name: String(p.name ?? p.code ?? p.band ?? "").trim(),
    designation: String(p.designation ?? p.label ?? "").trim(),
    bandType,
  });
  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });
  const endpoints = ["/api/v1/band", "/api/v1/bands", "/bands/add"];
  let lastRouteErr = null;
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
    if (res.ok) return parseResponse(res, {});
    const err = await toHttpError(res);
    if (res.status === 403 || res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }
  throw lastRouteErr || new Error("Band add endpoint not found.");
}

export async function addStream(payload, options = {}) {
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

export async function updateBand(code, payload, options = {}) {
  const { signal } = options || {};
  const p = payload && typeof payload === "object" ? payload : {};
  const auth = getAuthHeader();
  const target = String(code ?? "").trim();
  const safeCode = encodeURIComponent(target);
  if (!safeCode) throw new Error("band code or id is required.");
  const numericId = Number.parseInt(target, 10);
  const parsedSortOrder = Number.isFinite(Number(p.sortOrder)) ? Number(p.sortOrder) : null;

  const bodyObj = {
    ...(Number.isFinite(numericId) ? { id: numericId, bandId: numericId } : {}),
    code: String(p.code ?? p.name ?? target ?? "").trim(),
    name: String(p.name ?? p.code ?? target ?? "").trim(),
    band: String(p.code ?? p.name ?? target ?? "").trim(),
    oldCode: String(target).trim(),
    previousCode: String(target).trim(),
    newCode: String(p.code ?? p.name ?? target ?? "").trim(),
    designation: String(p.designation ?? p.label ?? "").trim(),
    label: String(p.label ?? p.designation ?? "").trim(),
    bandType: String(p.bandType ?? "BOTH").trim().toUpperCase() || "BOTH",
    type: String(p.bandType ?? "BOTH").trim().toUpperCase() || "BOTH",
    ...(parsedSortOrder != null ? { sortOrder: parsedSortOrder } : {}),
  };

  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });

  const endpoints = [
    { method: "PATCH", path: `/api/v1/band/${safeCode}` },
    { method: "POST", path: `/api/v1/band/${safeCode}` },
    { method: "PATCH", path: `/api/v1/bands/${safeCode}` },
    { method: "POST", path: `/api/v1/bands/${safeCode}` },
    { method: "POST", path: `/bands/update/${safeCode}` },
    { method: "PATCH", path: `/bands/update/${safeCode}` },
    { method: "POST", path: `/api/v1/band/update/${safeCode}` },
    { method: "PATCH", path: `/api/v1/band/update/${safeCode}` },
    { method: "POST", path: `/api/v1/bands/update/${safeCode}` },
    { method: "PATCH", path: `/api/v1/bands/update/${safeCode}` },
    { method: "POST", path: "/api/v1/band/update" },
    { method: "PATCH", path: "/api/v1/band/update" },
    { method: "POST", path: "/api/v1/band" },
    { method: "PUT", path: `/api/v1/band/${safeCode}` },
    { method: "PUT", path: `/api/v1/bands/${safeCode}` },
    { method: "PUT", path: `/bands/update/${safeCode}` },
    { method: "PUT", path: `/api/v1/band/update/${safeCode}` },
    { method: "PUT", path: `/api/v1/bands/update/${safeCode}` },
  ];

  let lastRouteErr = null;
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
    if (res.ok) return parseResponse(res, {});
    const err = await toHttpError(res);
    if (res.status === 400 || res.status === 403 || res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }
  throw lastRouteErr || new Error("Band update endpoint not found.");
}

export async function updateBandType(id, bandType, options = {}) {
  const { signal } = options || {};
  const auth = getAuthHeader();
  const rawId = String(id ?? "").trim();
  const safeId = encodeURIComponent(rawId);
  if (!rawId) throw new Error("band id is required.");
  const safeBandType = String(bandType ?? "").trim().toUpperCase();
  if (!safeBandType) throw new Error("bandType is required.");

  const endpoints = [
    { method: "PUT", path: `/api/v1/band/${safeId}?bandType=${encodeURIComponent(safeBandType)}` },
    { method: "PUT", path: `/api/v1/band/${safeId}/type?bandType=${encodeURIComponent(safeBandType)}` },
    { method: "PATCH", path: `/api/v1/band/${safeId}/type?bandType=${encodeURIComponent(safeBandType)}` },
    { method: "POST", path: `/api/v1/band/${safeId}/type?bandType=${encodeURIComponent(safeBandType)}` },
    { method: "POST", path: `/api/v1/band/type`, body: JSON.stringify({ id: rawId, bandType: safeBandType }) },
  ];

  let lastRouteErr = null;
  for (const endpoint of endpoints) {
    let res = await fetch(buildApiUrl(endpoint.path), {
      method: endpoint.method,
      signal,
      credentials: "include",
      headers: withCsrfHeaders({
        ...(auth ? { Authorization: auth } : {}),
        ...(endpoint.body ? { "Content-Type": "application/json" } : {}),
      }),
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
        headers: withCsrfHeaders({
          ...(auth ? { Authorization: auth } : {}),
          ...(endpoint.body ? { "Content-Type": "application/json" } : {}),
        }),
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

export async function updateStream(code, payload, options = {}) {
  const { signal } = options || {};
  const safeId = encodeURIComponent(String(code ?? "").trim());
  if (!safeId) throw new Error("department id is required.");

  const auth = getAuthHeader();

  const hasOnlyActive =
    payload != null &&
    typeof payload === "object" &&
    Object.keys(payload).length > 0 &&
    Object.keys(payload).every((k) => k === "active") &&
    Object.prototype.hasOwnProperty.call(payload, "active");

  // If we're only toggling active/listed status, use PATCH /status?active=true|false.
  if (hasOnlyActive) {
    const activeVal = Boolean(payload?.active);
    const endpoints = [
      `/api/v1/department/${safeId}/status?active=${activeVal}`,
      `/api/v1/department/${safeId}/status?listed=${activeVal}`,
    ];

    let lastRouteErr = null;
    for (const endpoint of endpoints) {
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

    throw lastRouteErr || new Error("Department status endpoint not found.");
  }

  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });
  const body = JSON.stringify({
    name: String(payload?.name ?? payload?.label ?? payload?.code ?? code ?? "").trim(),
  });

  let lastRouteErr = null;
  for (const endpoint of [`/api/v1/department/${safeId}`]) {
    let res = await fetch(buildApiUrl(endpoint), {
      method: "PUT",
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
        method: "PUT",
        signal,
        credentials: "include",
        headers,
        body,
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

  throw lastRouteErr || new Error("Department update endpoint not found.");
}

export async function deleteBand(id, options = {}) {
  const { signal } = options || {};
  const safeId = encodeURIComponent(String(id ?? "").trim());
  const auth = getAuthHeader();
  if (!safeId) throw new Error("band id is required.");
  const headers = withCsrfHeaders(auth ? { Authorization: auth } : undefined);
  const endpoints = [`/api/v1/band/${safeId}`, `/api/v1/bands/${safeId}`, `/bands/delete/${safeId}`];
  let lastRouteErr = null;
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
  throw lastRouteErr || new Error("Band delete endpoint not found.");
}

export async function deleteStream(code, options = {}) {
  const { signal } = options || {};
  const safeId = encodeURIComponent(String(code ?? "").trim());
  if (!safeId) throw new Error("department id is required.");

  const auth = getAuthHeader();
  const headers = withCsrfHeaders(auth ? { Authorization: auth } : undefined);
  const hardDelete = false;

  const endpoints = [
    `/api/v1/department/${safeId}?hardDelete=${hardDelete}`,
    `/streams/delete/${safeId}`, // fallback for older backend
  ];

  let lastRouteErr = null;
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
