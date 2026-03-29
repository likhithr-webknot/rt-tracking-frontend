import { getAuthHeader } from "./auth.js";
import { getApiBaseUrl, parseResponse, toHttpError, withCsrfHeaders } from "./http.js";

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

export function normalizeCertifications(data) {
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

  return arr
    .map((raw, i) => {
      const obj = raw && typeof raw === "object" ? raw : { name: raw };
      const id =
        obj.id ??
        obj.certificationId ??
        obj.certId ??
        obj.certification?.id ??
        obj.certification?.certificationId ??
        `CERT_${i}`;
      const name = extractCertificationName(obj);
      if (!name) return null;
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
      const statusParsed = statusText.includes("inactive") || statusText.includes("disabled") || statusText.includes("unlisted")
        ? false
        : statusText.includes("active") || statusText.includes("listed") || statusText.includes("enabled")
          ? true
          : null;
      const listed = listedParsed != null ? listedParsed : (statusParsed != null ? statusParsed : true);
      return { id: String(id), name, listed };
    })
    .filter(Boolean);
}

function extractItemsArrayFromResponse(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];

  const root = raw;
  const nested = root?.data && typeof root.data === "object" ? root.data : null;

  const candidates = [
    root?.items,
    root?.results,
    root?.content,
    root?.list,
    root?.certifications,
    nested?.data,
    nested?.items,
    nested?.results,
    nested?.content,
    nested?.list,
    nested?.certifications,
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }

  // Some backends wrap list directly under data without further nesting.
  if (Array.isArray(root?.data)) return root.data;

  return [];
}

function buildCertificationsUrl(path) {
  const base = getApiBaseUrl();
  const normalizedPath = String(path || "").startsWith("/") ? String(path) : `/${path}`;
  if (!base) return normalizedPath;

  // Some backend endpoints are mounted at `/certifications` (no `/api/v1`),
  // while our app setting may include `/api/v1`. Strip `/api/v1` when present.
  const suffix = "/api/v1";
  const baseNoApiV1 = base.endsWith(suffix) ? base.slice(0, -suffix.length) : base;
  return `${baseNoApiV1}${normalizedPath}`;
}

export async function fetchCertifications({ limit = null, cursor = null, signal } = {}) {
  const auth = getAuthHeader();

  // Your backend mapping uses: GET /certifications?limit={limit}&offset={offset}
  // The UI pager passes `cursor`, so we interpret cursor as `offset`.
  const fallbackLimit = 20;
  const resolvedLimit = limit != null ? Number.parseInt(String(limit), 10) : fallbackLimit;
  const safeLimit = Number.isFinite(resolvedLimit) && resolvedLimit > 0 ? resolvedLimit : fallbackLimit;
  const resolvedOffset = cursor != null ? Number.parseInt(String(cursor), 10) : 0;
  const safeOffset = Number.isFinite(resolvedOffset) && resolvedOffset >= 0 ? resolvedOffset : 0;

  const suffix = `?limit=${encodeURIComponent(String(safeLimit))}&offset=${encodeURIComponent(String(safeOffset))}`;
  const res = await fetch(buildCertificationsUrl(`/certifications${suffix}`), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });

  if (!res.ok) {
    throw await toHttpError(res);
  }

  const raw = await res.json().catch(() => ({}));
  const items = extractItemsArrayFromResponse(raw);
  const nextCursor = items.length === safeLimit ? String(safeOffset + safeLimit) : null;
  return { items, nextCursor };
}

export async function fetchCertification(id, { signal } = {}) {
  const safeId = encodeURIComponent(String(id ?? "").trim());
  if (!safeId) throw new Error("Certification id is required.");

  const auth = getAuthHeader();
  const res = await fetch(buildCertificationsUrl(`/certifications/get/${safeId}`), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, {});
}

export async function addCertification({ name, listed = true }, { signal } = {}) {
  const auth = getAuthHeader();
  const active = toNullableBoolean(listed);
  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });
  const body = JSON.stringify({
    name: String(name || "").trim(),
    ...(active != null ? { active } : {}),
  });
  const res = await fetch(buildCertificationsUrl("/certifications/add-certification"), {
    method: "POST",
    signal,
    credentials: "include",
    headers,
    body,
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, "");
}

export async function updateCertification(id, { name, listed = true }, { signal } = {}) {
  const safeId = encodeURIComponent(String(id));
  const auth = getAuthHeader();
  const active = toNullableBoolean(listed);
  const payload = {
    name: String(name || "").trim(),
    ...(active != null
      ? {
          active,
          listed: active,
          isActive: active,
          isListed: active,
          enabled: active,
          status: active ? "ACTIVE" : "INACTIVE",
        }
      : {}),
  };
  const body = JSON.stringify(payload);
  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });

  const res = await fetch(buildCertificationsUrl(`/certifications/update/${safeId}`), {
    method: "PUT",
    signal,
    credentials: "include",
    headers,
    body,
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, "");
}

export async function deleteCertification(id, { signal } = {}) {
  const safeId = encodeURIComponent(String(id));
  const auth = getAuthHeader();
  const headers = withCsrfHeaders(auth ? { Authorization: auth } : {});
  const res = await fetch(buildCertificationsUrl(`/certifications/delete/${safeId}`), {
    method: "DELETE",
    signal,
    credentials: "include",
    headers,
  });
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, "");
}
