import { getAuthHeader } from "./auth.js";
import { buildApiUrl } from "./http.js";

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

function unwrapRoot(data) {
  if (!data || typeof data !== "object") return {};
  if (data?.data && typeof data.data === "object" && !Array.isArray(data.data)) return data.data;
  return data;
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

  const nextCursor =
    (typeof root.nextCursor === "string" && root.nextCursor) ||
    (typeof root.next === "string" && root.next) ||
    (typeof root.nextToken === "string" && root.nextToken) ||
    (typeof root.nextPageToken === "string" && root.nextPageToken) ||
    null;

  return { items, nextCursor: nextCursor ? String(nextCursor) : null, raw: root };
}

export async function fetchEmployeePortalKpiDefinitions({ limit = 10, cursor = null, signal } = {}) {
  const auth = getAuthHeader();
  const qs = new URLSearchParams();
  if (limit != null) qs.set("limit", String(limit));
  if (cursor) qs.set("cursor", String(cursor));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(buildApiUrl(`/employee-portal/kpi-definitions${suffix}`), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}

export async function fetchEmployeePortalWebknotValues({ limit = 10, cursor = null, signal } = {}) {
  const auth = getAuthHeader();
  const qs = new URLSearchParams();
  if (limit != null) qs.set("limit", String(limit));
  if (cursor) qs.set("cursor", String(cursor));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(buildApiUrl(`/employee-portal/webknot-values${suffix}`), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
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
    const id =
      pickDeep(obj, ["id", "valueId", "webknotValueId", "code", "key"]) ||
      toCleanString(raw);

    const title =
      pickDeep(obj, ["title", "valueTitle", "valueName", "name", "value", "label"]) || "";

    const pillar =
      pickDeep(obj, [
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
