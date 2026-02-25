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

function withQueryParams({ activeOnly = null, limit = null, cursor = null } = {}) {
  const qs = new URLSearchParams();
  const active = toNullableBoolean(activeOnly);
  if (active != null) qs.set("activeOnly", String(active));
  else if (activeOnly === false) qs.set("activeOnly", "false");
  if (limit != null) qs.set("limit", String(limit));
  if (cursor != null && String(cursor).trim()) qs.set("cursor", String(cursor).trim());
  return qs.toString();
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

export async function fetchCertifications({ activeOnly = null, limit = null, cursor = null, signal } = {}) {
  const auth = getAuthHeader();
  const query = withQueryParams({ activeOnly, limit, cursor });

  const path = query ? `/certifications/list?${query}` : "/certifications/list";
  const res = await fetch(buildApiUrl(path), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}

export async function addCertification({ name, listed = true }, { signal } = {}) {
  const auth = getAuthHeader();
  const active = toNullableBoolean(listed);
  const res = await fetch(buildApiUrl("/certifications/add"), {
    method: "POST",
    signal,
    credentials: "include",
    headers: withCsrfHeaders({
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    }),
    body: JSON.stringify({
      name: String(name || "").trim(),
      ...(active != null ? { active } : {}),
    }),
  });
  if (!res.ok) throw await toHttpError(res);
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json().catch(() => ({}));
  return res.text().catch(() => "");
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

  const methods = ["PUT", "PATCH", "POST"];
  const endpoints = [
    `/certifications/update/${safeId}`,
    `/certifications/${safeId}`,
    `/certifications/edit/${safeId}`,
    `/certifications/set-active/${safeId}`,
    `/certifications/set-listed/${safeId}`,
    `/certifications/${safeId}/active`,
  ];
  let lastErr = null;
  for (const endpoint of endpoints) {
    for (const method of methods) {
      const res = await fetch(buildApiUrl(endpoint), {
        method,
        signal,
        credentials: "include",
        headers,
        body,
      });
      if (res.ok) {
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) return res.json().catch(() => ({}));
        return res.text().catch(() => "");
      }
      const err = await toHttpError(res);
      if (res.status === 404 || res.status === 405) {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
}

export async function deleteCertification(id, { signal } = {}) {
  const safeId = encodeURIComponent(String(id));
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl(`/certifications/delete/${safeId}`), {
    method: "DELETE",
    signal,
    credentials: "include",
    headers: withCsrfHeaders(auth ? { Authorization: auth } : {}),
  });
  if (!res.ok) throw await toHttpError(res);
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json().catch(() => ({}));
  return res.text().catch(() => "");
}
