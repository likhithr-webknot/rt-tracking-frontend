import { getAuthHeader } from "./auth.js";
import { buildApiUrl, withCsrfHeaders } from "./http.js";

async function readError(res) {
  const text = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(text);
    if (parsed?.message) return String(parsed.message);
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

export function normalizeKpiDefinitions(data) {
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : [];

  return arr.map((kpi, i) =>
    normalizeKpiDefinition(kpi, { id: `KPI_${i}` })
  );
}

function normalizeWeightage(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed) return null;

  // Accept "30%" / "30" / "30.5" and send a number when parseable.
  const numericText = trimmed.endsWith("%") ? trimmed.slice(0, -1).trim() : trimmed;
  const parsed = Number.parseFloat(numericText);
  if (!Number.isNaN(parsed) && Number.isFinite(parsed)) return parsed;

  // Fall back to the raw string if backend accepts it as text.
  return trimmed;
}

function toAddRequestBody(input) {
  const obj = input && typeof input === "object" ? input : {};

  // Backend expects: kpiName (required), weightage (required).
  const kpiName = obj.kpiName ?? obj.title ?? obj.name ?? obj.objective ?? "";
  const weightage = normalizeWeightage(obj.weightage ?? obj.weight ?? obj.weightPct);

  return {
    kpiName: String(kpiName).trim(),
    weightage,
    // Pass-through common optional fields (names may vary by backend).
    stream: obj.stream ?? obj.context ?? null,
    band: obj.band ?? obj.level ?? null,
  };
}

function toUpdateRequestBody(input) {
  const obj = input && typeof input === "object" ? input : {};
  const id = obj.kpiDefinitionId ?? obj.definitionId ?? obj.kpiId ?? obj.id ?? null;

  return {
    kpiDefinitionId: id == null ? null : String(id),
    ...toAddRequestBody(obj),
  };
}

export function normalizeKpiDefinition(data, fallback = {}) {
  const obj = data && typeof data === "object" ? data : {};
  const id = obj.kpiDefinitionId ?? obj.definitionId ?? obj.kpiId ?? obj.id ?? fallback.id ?? `KPI_${Date.now()}`;

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

// POST /kpi-definitions/add
// UI sends { title, stream, band, weight }, backend expects { kpiName, weightage, ... }.
export async function addKpiDefinition(payload) {
  const body = toAddRequestBody(payload);
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/kpi-definitions/add"), {
    method: "POST",
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

// GET /kpi-definition/getall
export async function fetchKpiDefinitions({ signal } = {}) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/kpi-definitions/getall"), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json();
}

// POST /kpi-definition/update
export async function updateKpiDefinition(payload) {
  const body = toUpdateRequestBody(payload);
  if (!body.kpiDefinitionId) throw new Error("Missing KPI id for update.");

  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/kpi-definition/update"), {
    method: "POST",
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
