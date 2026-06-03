// @ts-nocheck
import { getAuthHeader } from "./auth";
import {
  buildApiUrl,
  ensureCsrfCookie,
  parseResponse,
  requestWithFallbacks,
  toHttpError,
  withCsrfHeaders,
} from "./http";

export function normalizeDesignationsList(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const root = data;
  const nested = root.data && typeof root.data === "object" ? root.data : null;
  const pageData = nested?.data ?? nested;
  return (
    (Array.isArray(root.data) && root.data) ||
    (Array.isArray(root.items) && root.items) ||
    (Array.isArray(root.designations) && root.designations) ||
    (Array.isArray(root.results) && root.results) ||
    (Array.isArray(pageData) && pageData) ||
    (Array.isArray(nested?.data) && nested.data) ||
    (Array.isArray(nested?.items) && nested.items) ||
    []
  );
}

export function designationLabelFromRow(row) {
  if (typeof row === "string") return String(row).trim();
  if (!row || typeof row !== "object") return "";
  return String(row.designation ?? row.name ?? row.title ?? row.label ?? "").trim();
}

export async function fetchAllDesignations({ search, page = 0, limit = 500, signal } = {}) {
  const auth = getAuthHeader();
  const qs = new URLSearchParams();
  if (String(search ?? "").trim()) qs.set("search", String(search).trim());
  qs.set("page", String(page));
  qs.set("limit", String(limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  const paths = [
    `/api/v1/designation-lookups/list${suffix}`,
    `/api/v1/designation-lookups/all${suffix}`,
    `/api/v1/designations/list${suffix}`,
    `/api/v1/designations/all${suffix}`,
    `/designations/list${suffix}`,
    `/designations/all${suffix}`,
  ];

  const raw = await requestWithFallbacks(paths, {
    signal,
    headers: auth ? { Authorization: auth } : undefined,
    fallbackStatuses: [404, 405],
    notFoundMessage: "Designations list endpoint not found.",
  });

  const nested = raw?.data && typeof raw.data === "object" ? raw.data : raw;
  return {
    rows: normalizeDesignationsList(nested),
    total: Number(nested?.totalElement ?? nested?.totalElements ?? nested?.total ?? 0) || 0,
  };
}

export async function fetchDesignations({ bandId, department, stream, signal } = {}) {
  const auth = getAuthHeader();
  const qs = new URLSearchParams();
  const bandRaw = bandId != null ? String(bandId).trim() : "";
  const numericBandId = /^\d+$/.test(bandRaw) ? bandRaw : "";
  const dept = String(department ?? stream ?? "").trim();
  if (numericBandId) qs.set("bandId", numericBandId);
  if (dept) qs.set("department", dept);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  if (!numericBandId || !dept) return [];

  const paths = [
    `/api/v1/designations${suffix}`,
    `/api/v1/designation-lookups${suffix}`,
    `/designations${suffix}`,
  ];

  const raw = await requestWithFallbacks(paths, {
    signal,
    headers: auth ? { Authorization: auth } : undefined,
    fallbackStatuses: [400, 404, 405],
    notFoundMessage: "Designations lookup not found.",
  });
  return normalizeDesignationsList(raw);
}

export async function seedDesignations({ signal } = {}) {
  const auth = getAuthHeader();
  return requestWithFallbacks(
    [
      { method: "POST", path: "/api/v1/designation-lookups/seed" },
      { method: "POST", path: "/api/v1/designations/seed" },
      { method: "POST", path: "/designations/seed" },
    ],
    {
      signal,
      headers: auth ? { Authorization: auth } : undefined,
      fallbackStatuses: [404, 405],
      notFoundMessage: "Designation seed endpoint not found.",
    },
  );
}

function designationLookupBody(payload = {}) {
  const p = payload && typeof payload === "object" ? payload : {};
  const designation = String(p.designation ?? p.name ?? p.title ?? "").trim();
  const department = String(p.department ?? p.stream ?? "").trim();
  const bandIdRaw = p.bandId != null ? String(p.bandId).trim() : "";
  const bandId = /^\d+$/.test(bandIdRaw) ? bandIdRaw : "";
  const band = String(p.band ?? p.bandCode ?? "").trim();
  const body = {
    designation,
    name: designation,
    department,
    stream: department,
  };
  if (bandId) body.bandId = bandId;
  if (band) {
    body.band = band;
    body.bandCode = band;
  }
  return body;
}

async function mutateDesignationLookup(method, { id, body, signal } = {}) {
  const auth = getAuthHeader();
  await ensureCsrfCookie({ signal });
  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });
  const safeId = id != null ? encodeURIComponent(String(id).trim()) : "";
  const jsonBody = body != null ? JSON.stringify(body) : undefined;

  const idPaths = safeId
    ? [
        `/api/v1/designation-lookups/${safeId}`,
        `/api/v1/designations/${safeId}`,
        `/api/v1/designation-lookup/${safeId}`,
        `/designations/${safeId}`,
      ]
    : [];
  const collectionPaths = [
    "/api/v1/designation-lookups",
    "/api/v1/designations",
    "/api/v1/designation-lookup",
    "/designations",
  ];

  const endpoints = [];
  for (const path of idPaths) {
    endpoints.push({ method, path, body: jsonBody });
  }
  if (method === "POST") {
    for (const path of collectionPaths) {
      endpoints.push({ method: "POST", path, body: jsonBody });
    }
  }

  let lastErr = null;
  for (const endpoint of endpoints) {
    const res = await fetch(buildApiUrl(endpoint.path), {
      method: endpoint.method,
      signal,
      credentials: "include",
      headers,
      ...(endpoint.body ? { body: endpoint.body } : {}),
    });
    if (res.ok) return parseResponse(res, {});
    const err = await toHttpError(res);
    if (res.status === 404 || res.status === 405) {
      lastErr = err;
      continue;
    }
    throw err;
  }
  throw lastErr || new Error(`Designation ${method} endpoint not found.`);
}

export async function createDesignationLookup(payload, { signal } = {}) {
  const body = designationLookupBody(payload);
  if (!body.designation) throw new Error("Designation title is required.");
  if (!body.department) throw new Error("Department is required.");
  if (!body.bandId && !body.band) throw new Error("Band is required.");
  return mutateDesignationLookup("POST", { body, signal });
}

export async function updateDesignationLookup(id, payload, { signal } = {}) {
  const safeId = String(id ?? "").trim();
  if (!safeId) throw new Error("Designation id is required.");
  const body = designationLookupBody(payload);
  if (!body.designation) throw new Error("Designation title is required.");
  if (!body.department) throw new Error("Department is required.");
  return mutateDesignationLookup("PUT", { id: safeId, body, signal });
}

export async function deleteDesignationLookup(id, { signal } = {}) {
  const safeId = String(id ?? "").trim();
  if (!safeId) throw new Error("Designation id is required.");
  return mutateDesignationLookup("DELETE", { id: safeId, signal });
}

export async function importDesignations(file, options = {}) {
  const { signal, replaceCatalog = false } = options;
  const auth = getAuthHeader();
  const form = new FormData();
  form.append("file", file);
  const replaceQs = replaceCatalog ? "?replace=true" : "";

  return requestWithFallbacks(
    [
      { method: "POST", path: `/api/v1/designation-lookups/import-csv${replaceQs}`, body: form },
      { method: "POST", path: `/api/v1/designations/import-csv${replaceQs}`, body: form },
      { method: "POST", path: `/designations/import-csv${replaceQs}`, body: form },
    ],
    {
      signal,
      headers: auth ? { Authorization: auth } : undefined,
      fallbackStatuses: [404, 405],
      notFoundMessage: "Designation CSV import endpoint not found.",
    },
  );
}
