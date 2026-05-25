// @ts-nocheck
import { getAuthHeader } from "./auth";
import { buildApiUrl, requestWithFallbacks, toHttpError } from "./http";

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
