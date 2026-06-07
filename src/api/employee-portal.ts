import type { ApiOptions } from "../types/api-options";
import { getAuthHeader } from "./auth";
import { buildApiUrl, toHttpError } from "./http";
import { sanitizeEmployeeIdForApi } from "../utils/employeeId";

function unwrapRoot(data) {
  if (!data || typeof data !== "object") return {};
  if (data?.data && typeof data.data === "object" && !Array.isArray(data.data)) return data.data;
  return data;
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
  if (typeof value === "bigint") {
    return String(value);
  }
  return null;
}

function normalizeStreamKeyForQuery(value: unknown) {
  const key = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!key) return "";
  if (
    key === "development" ||
    key === "developer" ||
    key === "developers" ||
    key === "dev" ||
    key === "engineering" ||
    key === "backend" ||
    key === "frontend" ||
    key === "fullstack" ||
    key === "mobile"
  ) {
    return "development";
  }
  return key;
}

/** Backend KPI filters use exact department strings; try common aliases (e.g. Development vs Developer). */
function streamQueryLabels(stream: unknown) {
  const raw = String(stream ?? "").trim();
  if (!raw) return [];
  const labels = new Set<string>([raw]);
  if (normalizeStreamKeyForQuery(raw) === "development") {
    labels.add("Development");
    labels.add("Developer");
  }
  return [...labels];
}

function countCursorItems(data: unknown) {
  return normalizeCursorPage(data).items.length;
}

export function normalizeCursorPage(data) {
  const root = unwrapRoot(data);
  const items =
    Array.isArray(root.items)
      ? root.items
      : Array.isArray(root.results)
        ? root.results
        : Array.isArray(root.content)
          ? root.content
          : Array.isArray(root.data)
            ? root.data
            : Array.isArray(root.list)
              ? root.list
              : Array.isArray(data)
                ? data
                : [];

  const nextCursor = normalizeCursorToken(
    root?.nextCursor ??
      root?.next ??
      root?.nextToken ??
      root?.nextPageToken ??
      root?.page?.nextCursor ??
      root?.pageInfo?.nextCursor ??
      null
  );

  return { items, nextCursor: nextCursor ? String(nextCursor) : null, raw: root };
}

export async function fetchEmployeePortalKpiDefinitions({
  limit = 10,
  cursor = null,
  employeeId = null,
  band = null,
  stream = null,
  signal,
} = {} as ApiOptions) {
  const auth = getAuthHeader();
  const headers = auth ? { Authorization: auth } : undefined;
  const emp = sanitizeEmployeeIdForApi(employeeId);
  const pageLimit =
    band && stream ? Math.max(Number(limit) || 0, 100) : limit;
  const streamLabels = stream ? streamQueryLabels(stream) : [null];
  const listPaths = (suffix: string) => [
    `/api/v1/kpi-directions${suffix}`,
    `/api/v1/list-kpi-directions${suffix}`,
    `/api/v1/kpi-definitions${suffix}`,
    `/api/v1/list-kpi-definitions${suffix}`,
  ];

  let lastErr: Error | null = null;
  let lastEmpty: unknown = null;

  for (const streamLabel of streamLabels) {
    const qs = new URLSearchParams();
    if (pageLimit != null) qs.set("limit", String(pageLimit));
    if (cursor) qs.set("offset", String(cursor));
    if (emp) qs.set("employeeId", emp);
    if (band) qs.set("band", String(band));
    if (streamLabel) {
      qs.set("department", String(streamLabel));
      qs.set("stream", String(streamLabel));
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : "";

    for (const path of listPaths(suffix)) {
      const res = await fetch(buildApiUrl(path), {
        signal,
        credentials: "include",
        headers,
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (countCursorItems(data) > 0 || streamLabel === streamLabels[streamLabels.length - 1]) {
          return data;
        }
        lastEmpty = data;
        break;
      }
      if (res.status === 404 || res.status === 405) {
        lastErr = await toHttpError(res);
        continue;
      }
      throw await toHttpError(res);
    }
  }

  if (lastEmpty != null) return lastEmpty;
  throw lastErr || new Error("KPI definitions list not found.");
}

export async function fetchEmployeePortalWebknotValues({ limit = 10, cursor = null, signal } = {} as ApiOptions) {
  const auth = getAuthHeader();
  const qs = new URLSearchParams();
  if (limit != null) qs.set("limit", String(limit));
  if (cursor) qs.set("offset", String(cursor));
  qs.set("activeOnly", "true");
  qs.set("_ts", Date.now().toString());
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const paths = [
    `/api/v1/webknot-value/list${suffix}`,
  ];
  let lastErr = null;
  for (const path of paths) {
    const res = await fetch(buildApiUrl(path), {
      signal,
      credentials: "include",
      cache: "no-store",
      headers: auth ? { Authorization: auth } : undefined,
    });
    if (res.ok) return res.json().catch(() => ({}));
    if (res.status === 404 || res.status === 405) {
      lastErr = await toHttpError(res);
      continue;
    }
    throw await toHttpError(res);
  }
  throw lastErr || new Error("Webknot values list not found.");
}

function toCleanString(value, depth = 0) {
  if (value == null) return "";
  if (depth > 3) return "";
  if (Array.isArray(value)) {
    return value
      .map((v) => toCleanString(v, depth + 1))
      .filter(Boolean)
      .join(", ");
  }
  const t = typeof value;
  if (t === "string") return value.trim();
  if (t === "number" || t === "boolean" || t === "bigint") return String(value);
  if (t === "object") {
    const obj = value;
    const candidates = [
      obj?.title,
      obj?.name,
      obj?.label,
      obj?.value,
      obj?.text,
      obj?.code,
      obj?.id,
    ];
    for (const c of candidates) {
      const s = toCleanString(c, depth + 1);
      if (s) return s;
    }
    return "";
  }
  return "";
}

function pickDeep(obj, keys, depth = 0) {
  if (!obj || typeof obj !== "object") return "";
  if (depth > 3) return "";
  const keyList = Array.isArray(keys) ? keys : [];

  const actualKeys = Object.keys(obj);
  const lowerToActual = new Map(actualKeys.map((k) => [k.toLowerCase(), k]));
  for (const k of keyList) {
    const s1 = toCleanString(obj[k], depth + 1);
    if (s1) return s1;
    const mapped = lowerToActual.get(String(k).toLowerCase());
    if (mapped && mapped !== k) {
      const s2 = toCleanString(obj[mapped], depth + 1);
      if (s2) return s2;
    }
  }

  for (const v of Object.values(obj)) {
    if (!v || typeof v !== "object") continue;
    const s = pickDeep(v, keyList, depth + 1);
    if (s) return s;
  }
  return "";
}

function makeFallbackId(title, index) {
  const base = toCleanString(title).toLowerCase();
  const slug = base
    ? base
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80)
    : "";
  return slug || `value_${index}`;
}

export function normalizeWebknotValues(items) {
  const arr = Array.isArray(items) ? items : [];
  const out = [];
  const seen = new Set();
  for (let i = 0; i < arr.length; i++) {
    const raw = arr[i];
    const obj = raw && typeof raw === "object" ? raw : {};

    const inactive =
      obj.active === false ||
      obj.isActive === false ||
      obj.deleted === true ||
      obj.isDeleted === true ||
      String(obj.status || "").toLowerCase() === "inactive";
    if (inactive) continue;

    const id =
      pickDeep(obj, ["id", "valueId", "webknotValueId", "code", "key"]) ||
      toCleanString(raw);

    const title =
      pickDeep(obj, ["title", "valueTitle", "valueName", "name", "value", "label"]) || "";

    const pillar =
      pickDeep(obj, [
        "evaluationCriteria",
        "evaluation_criteria",
        "evaluationcriteria",
        "pillar",
        "valuePillar",
        "valuePillarName",
        "pillarName",
        "pillarType",
        "category",
        "group",
        "domain",
      ]) || "";

    const stableId = id || makeFallbackId(title, i);
    if (!stableId) continue;
    if (seen.has(stableId)) continue;
    seen.add(stableId);
    out.push({ id: stableId, title: title || stableId, pillar: pillar || title || "—" });
  }
  return out;
}
