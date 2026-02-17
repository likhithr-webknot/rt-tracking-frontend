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

export function normalizeWebknotValues(items) {
  const arr = Array.isArray(items) ? items : [];
  const out = [];
  const seen = new Set();
  for (const raw of arr) {
    const obj = raw && typeof raw === "object" ? raw : null;
    const id = String(obj?.id ?? obj?.valueId ?? obj?.code ?? raw ?? "").trim();
    const title = String(obj?.title ?? obj?.name ?? obj?.value ?? obj?.label ?? "").trim();
    const pillar = String(obj?.pillar ?? obj?.category ?? obj?.group ?? "").trim();
    const stableId = id || (title ? title.toLowerCase() : "");
    if (!stableId) continue;
    if (seen.has(stableId)) continue;
    seen.add(stableId);
    out.push({ id: stableId, title: title || stableId, pillar: pillar || "—" });
  }
  return out;
}
