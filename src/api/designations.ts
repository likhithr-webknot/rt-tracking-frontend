// @ts-nocheck
import { getAuthHeader } from "./auth";
import { buildApiUrl, requestWithFallbacks, toHttpError } from "./http";

export function normalizeDesignationsList(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const root = data;
  const nested = root.data && typeof root.data === "object" ? root.data : null;
  return (
    (Array.isArray(root.data) && root.data) ||
    (Array.isArray(root.items) && root.items) ||
    (Array.isArray(root.designations) && root.designations) ||
    (Array.isArray(root.results) && root.results) ||
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

  const paths = [`/designations${suffix}`];

  const raw = await requestWithFallbacks(paths, {
    signal,
    headers: auth ? { Authorization: auth } : undefined,
    fallbackStatuses: [400, 404, 405],
    notFoundMessage: "Designations lookup not found.",
  });
  return normalizeDesignationsList(raw);
}

export async function importDesignations(file, options = {}) {
  const { signal } = options;
  const auth = getAuthHeader();
  const form = new FormData();
  form.append("file", file);

  return requestWithFallbacks(
    [
      { method: "POST", path: "/designations/import-csv", body: form },
      { method: "POST", path: "/api/v1/designations/import-csv", body: form },
    ],
    {
      signal,
      headers: auth ? { Authorization: auth } : undefined,
      fallbackStatuses: [404, 405],
      notFoundMessage: "Designation CSV import endpoint not found.",
    },
  );
}
