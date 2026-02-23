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

export function normalizeKpiDefinitions(data) {
  const root = data && typeof data === "object" ? data : {};
  const nested = root?.data && typeof root.data === "object" ? root.data : null;
  const arr =
    (Array.isArray(data) && data) ||
    (Array.isArray(root?.data) && root.data) ||
    (Array.isArray(root?.items) && root.items) ||
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

function toAddRequestBody(input) {
  const obj = input && typeof input === "object" ? input : {};
  const kpiName = obj.kpiName ?? obj.title ?? obj.name ?? obj.objective ?? "";
  const weightage = normalizeWeightage(obj.weightage ?? obj.weight ?? obj.weightPct);

  return {
    kpiName: String(kpiName).trim(),
    weightage,
    stream: obj.stream ?? obj.context ?? null,
    band: obj.band ?? obj.level ?? null,
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
  const stream = obj.stream ?? obj.context ?? fallback.stream ?? "";
  const band = obj.band ?? obj.level ?? fallback.band ?? "";
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
  const res = await fetch(buildApiUrl("/kpi-definitions/add"), {
    method: "POST",
    signal,
    credentials: "include",
    headers: withCsrfHeaders({
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await toHttpError(res);

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  return null;
}

export async function fetchKpiDefinitions({ limit = null, cursor = null, signal } = {}) {
  const auth = getAuthHeader();
  const qs = new URLSearchParams();
  if (limit != null) qs.set("limit", String(limit));
  if (cursor) qs.set("cursor", String(cursor));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const headers = auth ? { Authorization: auth } : undefined;

  const endpoints = [
    `/kpi-definitions/getall${suffix}`,
    `/kpi-definition/getall${suffix}`,
    `/kpi-definitions/list${suffix}`,
  ];

  let lastRouteErr = null;
  for (const endpoint of endpoints) {
    const res = await fetch(buildApiUrl(endpoint), {
      signal,
      credentials: "include",
      headers,
    });
    if (res.ok) return res.json().catch(() => ({}));

    const err = await toHttpError(res);
    if (res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }

  throw lastRouteErr || new Error("KPI definitions endpoint not found.");
}

export async function updateKpiDefinition(payload, { signal } = {}) {
  const id = resolveKpiId(payload);
  if (!id) throw new Error("Missing KPI id for update.");

  const body = toUpdateRequestBody(payload);
  const auth = getAuthHeader();
  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });

  const endpoints = [
    { method: "POST", path: "/kpi-definitions/update" },
    { method: "POST", path: "/kpi-definitions/update" },
    { method: "PUT", path: "/kpi-definitions/update" },
    { method: "PUT", path: "/kpi-definitions/update" },
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
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) return res.json().catch(() => ({}));
      return null;
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

  const endpoints = [
    `/kpi-definitions/delete/${safeId}`,
    `/kpi-definition/delete/${safeId}`,
  ];

  let lastRouteErr = null;
  for (const endpoint of endpoints) {
    const res = await fetch(buildApiUrl(endpoint), {
      method: "DELETE",
      signal,
      credentials: "include",
      headers,
    });

    if (res.ok) {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) return res.json().catch(() => ({}));
      return true;
    }

    const err = await toHttpError(res);
    if (res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }

  throw lastRouteErr || new Error("KPI delete endpoint not found.");
}
