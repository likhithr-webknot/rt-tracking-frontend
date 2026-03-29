import { getAuthHeader } from "./auth.js";
import { buildApiUrl, parseResponse, toHttpError, withCsrfHeaders } from "./http.js";

export function normalizeKpiDefinitions(data) {
  const root = data && typeof data === "object" ? data : {};
  const nested = root?.data && typeof root.data === "object" ? root.data : null;
  const arr =
    (Array.isArray(data) && data) ||
    (Array.isArray(root?.items) && root.items) ||
    (Array.isArray(root?.data) && root.data) ||
    (Array.isArray(root?.results) && root.results) ||
    (Array.isArray(root?.content) && root.content) ||
    (Array.isArray(root?.list) && root.list) ||
    (Array.isArray(nested?.items) && nested.items) ||
    (Array.isArray(nested?.results) && nested.results) ||
    (Array.isArray(nested?.content) && nested.content) ||
    (Array.isArray(nested?.list) && nested.list) ||
    [];

  return arr.map((kpi, i) => normalizeKpiDefinition(kpi, { id: `KPI_${i}` }));
}

function normalizeWeightage(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const numericText = trimmed.endsWith("%") ? trimmed.slice(0, -1).trim() : trimmed;
  const parsed = Number.parseFloat(numericText);
  if (!Number.isNaN(parsed) && Number.isFinite(parsed)) return parsed;

  return trimmed;
}

function normalizeRelationText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value !== "object") return String(value ?? "").trim();

  const obj = value;
  const candidate = [
    obj.name,
    obj.code,
    obj.key,
    obj.title,
    obj.label,
    obj.value,
    obj.departmentName,
    obj.streamName,
    obj.bandName,
    obj.band,
    obj.stream,
    obj.id,
  ]
    .map((v) => String(v ?? "").trim())
    .find(Boolean);
  return candidate || "";
}

function toAddRequestBody(input) {
  const obj = input && typeof input === "object" ? input : {};
  const kpiName = obj.kpiName ?? obj.title ?? obj.name ?? obj.objective ?? "";
  const weightage = normalizeWeightage(obj.weightage ?? obj.weight ?? obj.weightPct);
  const stream = normalizeRelationText(obj.stream ?? obj.department ?? obj.context ?? null);
  const band = normalizeRelationText(obj.band ?? obj.level ?? null);

  return {
    kpiName: String(kpiName).trim(),
    weightage,
    stream: stream || null,
    department: stream || null,
    band: band || null,
    bandName: band || null,
    bandCode: band || null,
  };
}

function resolveKpiId(input) {
  const obj = input && typeof input === "object" ? input : {};
  const id = obj.kpiDefinitionId ?? obj.definitionId ?? obj.kpiId ?? obj.id ?? null;
  const raw = String(id ?? "").trim();
  return raw || null;
}

function toUpdateRequestBody(input) {
  const id = resolveKpiId(input);
  return {
    id: id == null ? null : Number.parseInt(id, 10),
    kpiDefinitionId: id == null ? null : String(id),
    ...toAddRequestBody(input),
  };
}

export function normalizeKpiDefinition(data, fallback = {}) {
  const obj = data && typeof data === "object" ? data : {};
  const id =
    obj.kpiDefinitionId ?? obj.definitionId ?? obj.kpiId ?? obj.id ?? fallback.id ?? `KPI_${Date.now()}`;

  const title = obj.kpiName ?? obj.title ?? obj.kpiTitle ?? obj.objective ?? fallback.title ?? "";
  const stream = normalizeRelationText(
    obj.stream ?? obj.department ?? obj.departmentName ?? obj.context ?? fallback.stream ?? ""
  );
  const band = normalizeRelationText(obj.band ?? obj.level ?? fallback.band ?? "");
  const rawWeight = obj.weightage ?? obj.weight ?? obj.weightPct ?? fallback.weight ?? "";
  const weight =
    typeof rawWeight === "number" && Number.isFinite(rawWeight)
      ? `${rawWeight}%`
      : String(rawWeight);

  return {
    id: String(id),
    title: String(title),
    stream: String(stream),
    band: String(band),
    weight: String(weight),
  };
}

export async function addKpiDefinition(payload, { signal } = {}) {
  const body = toAddRequestBody(payload);
  const auth = getAuthHeader();
  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });
  const res = await fetch(buildApiUrl("/api/v1/add-kpi-definition"), {
    method: "POST",
    signal,
    credentials: "include",
    headers,
    body: JSON.stringify(body),
  });
  if (res.ok) return parseResponse(res, null);
  throw await toHttpError(res);
}

function extractKpiDefinitionsItemsFromResponse(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];

  const root = raw;
  const nested = root?.data && typeof root.data === "object" ? root.data : null;

  const candidates = [
    root?.items,
    root?.results,
    root?.content,
    root?.list,
    root?.kpiDefinitions,
    root?.data,
    nested?.data,
    nested?.items,
    nested?.results,
    nested?.content,
    nested?.list,
    nested?.kpiDefinitions,
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }

  return [];
}

function readTotalElementsFromListResponse(raw) {
  if (!raw || typeof raw !== "object") return null;
  const nested = raw?.data && typeof raw.data === "object" ? raw.data : null;
  const vals = [
    raw?.totalElement,
    raw?.totalElements,
    raw?.totalCount,
    nested?.totalElement,
    nested?.totalElements,
    nested?.totalCount,
  ];
  for (const v of vals) {
    const p = Number.parseInt(String(v), 10);
    if (Number.isFinite(p) && p >= 0) return p;
  }
  return null;
}

function computeNextOffsetCursor({ itemsLength, safeLimit, safeOffset, totalElements }) {
  const nextOff = safeOffset + itemsLength;
  if (totalElements != null) {
    return nextOff < totalElements ? String(nextOff) : null;
  }
  if (safeLimit != null && itemsLength === safeLimit) return String(safeOffset + safeLimit);
  return null;
}

async function fetchKpiDefinitionsPage({ safeLimit, safeOffset, signal }) {
  const auth = getAuthHeader();
  const qs = new URLSearchParams();
  if (safeLimit != null && Number.isFinite(safeLimit) && safeLimit > 0) {
    qs.set("limit", String(safeLimit));
  }
  qs.set("offset", String(safeOffset));
  const suffix = `?${qs.toString()}`;
  const headers = auth ? { Authorization: auth } : undefined;

  const res = await fetch(buildApiUrl(`/api/v1/list-kpi-definitions${suffix}`), {
    signal,
    credentials: "include",
    headers,
  });
  if (!res.ok) throw await toHttpError(res);

  const raw = await parseResponse(res, {});
  const items = extractKpiDefinitionsItemsFromResponse(raw);
  const totalElements = readTotalElementsFromListResponse(raw);
  const nextCursor = computeNextOffsetCursor({
    itemsLength: items.length,
    safeLimit,
    safeOffset,
    totalElements,
  });
  return { items, nextCursor };
}

/**
 * Lists KPI definitions (GET /api/v1/list-kpi-definitions with limit + offset).
 * The UI pager passes `cursor`; it is sent as `offset`.
 * With `limit: null`, fetches all pages from offset 0 (for lookup maps).
 */
export async function fetchKpiDefinitions({ limit = null, cursor = null, offset = null, signal } = {}) {
  const fallbackPageSize = 100;
  const resolvedOffsetBase =
    offset != null
      ? Number.parseInt(String(offset), 10)
      : cursor != null
        ? Number.parseInt(String(cursor), 10)
        : 0;
  const safeOffsetBase =
    Number.isFinite(resolvedOffsetBase) && resolvedOffsetBase >= 0 ? resolvedOffsetBase : 0;

  if (limit != null) {
    const resolvedLimit = Number.parseInt(String(limit), 10);
    const safeLimit = Number.isFinite(resolvedLimit) && resolvedLimit > 0 ? resolvedLimit : fallbackPageSize;
    return fetchKpiDefinitionsPage({ safeLimit, safeOffset: safeOffsetBase, signal });
  }

  const collected = [];
  let off = safeOffsetBase;
  const pageLimit = fallbackPageSize;
  for (let i = 0; i < 500; i += 1) {
    const { items, nextCursor } = await fetchKpiDefinitionsPage({
      safeLimit: pageLimit,
      safeOffset: off,
      signal,
    });
    collected.push(...items);
    if (!nextCursor) break;
    off = Number.parseInt(String(nextCursor), 10);
    if (!Number.isFinite(off)) break;
  }
  return { items: collected, nextCursor: null };
}

export async function fetchKpiDefinition(id, { signal } = {}) {
  const safeId = encodeURIComponent(String(id ?? "").trim());
  if (!safeId) throw new Error("Missing KPI id.");

  const auth = getAuthHeader();
  const headers = auth ? { Authorization: auth } : undefined;
  const res = await fetch(buildApiUrl(`/api/v1/get-kpi-definition/${safeId}`), {
    method: "GET",
    signal,
    credentials: "include",
    headers,
  });
  if (res.ok) return parseResponse(res, {});
  throw await toHttpError(res);
}

export async function updateKpiDefinition(payload, { signal } = {}) {
  const id = resolveKpiId(payload);
  if (!id) throw new Error("Missing KPI id for update.");

  const body = toUpdateRequestBody(payload);
  const safeId = encodeURIComponent(id);
  const auth = getAuthHeader();
  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });

  const endpoints = [
    { method: "PUT", path: `/api/v1/update-kpi-definition/${safeId}` },
    { method: "PATCH", path: `/api/v1/update-kpi-definition/${safeId}` },
    { method: "POST", path: `/api/v1/update-kpi-definition/${safeId}` },
    { method: "PUT", path: `/api/v1/edit-kpi-definition/${safeId}` },
    { method: "PATCH", path: `/api/v1/edit-kpi-definition/${safeId}` },
    { method: "POST", path: `/api/v1/edit-kpi-definition/${safeId}` },
    { method: "PUT", path: "/api/v1/update-kpi-definition" },
    { method: "POST", path: "/api/v1/update-kpi-definition" },
  ];

  let lastRouteErr = null;
  for (const endpoint of endpoints) {
    const res = await fetch(buildApiUrl(endpoint.path), {
      method: endpoint.method,
      signal,
      credentials: "include",
      headers,
      body: JSON.stringify(body),
    });

    if (res.ok) {
      return parseResponse(res, null);
    }

    const err = await toHttpError(res);
    if (res.status === 404 || res.status === 405 || res.status === 403) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }

  throw lastRouteErr || new Error("KPI update endpoint not found.");
}

export async function deleteKpiDefinition(id, { signal } = {}) {
  const safeId = encodeURIComponent(String(id ?? "").trim());
  if (!safeId) throw new Error("Missing KPI id for delete.");

  const auth = getAuthHeader();
  const headers = withCsrfHeaders(auth ? { Authorization: auth } : undefined);

  const res = await fetch(buildApiUrl(`/api/v1/delete-kpi-definition/${safeId}`), {
    method: "DELETE",
    signal,
    credentials: "include",
    headers,
  });

  if (res.ok) {
    return parseResponse(res, true);
  }
  throw await toHttpError(res);
}
