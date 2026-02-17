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

export function normalizeCertifications(data) {
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.items)
        ? data.items
        : [];

  return arr
    .map((raw, i) => {
      const obj = raw && typeof raw === "object" ? raw : { name: raw };
      const id = obj.id ?? obj.certificationId ?? obj.certId ?? `CERT_${i}`;
      const name = String(obj.name ?? obj.certificationName ?? obj.title ?? raw ?? "").trim();
      if (!name) return null;
      const listedRaw = obj.active ?? obj.isActive ?? obj.listed ?? obj.enabled ?? true;
      const listed = Boolean(listedRaw);
      return { id: String(id), name, listed };
    })
    .filter(Boolean);
}

export async function fetchCertifications({ activeOnly = true, signal } = {}) {
  const auth = getAuthHeader();
  const qs = new URLSearchParams();
  qs.set("activeOnly", String(Boolean(activeOnly)));

  const res = await fetch(buildApiUrl(`/certifications/list?${qs.toString()}`), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => []);
}

export async function addCertification({ name, listed = true }, { signal } = {}) {
  const auth = getAuthHeader();
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
      active: Boolean(listed),
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
  const res = await fetch(buildApiUrl(`/certifications/update/${safeId}`), {
    method: "PUT",
    signal,
    credentials: "include",
    headers: withCsrfHeaders({
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    }),
    body: JSON.stringify({
      name: String(name || "").trim(),
      active: Boolean(listed),
    }),
  });
  if (!res.ok) throw await toHttpError(res);
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json().catch(() => ({}));
  return res.text().catch(() => "");
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
