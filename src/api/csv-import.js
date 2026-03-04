import { buildApiUrl, ensureCsrfCookie, withCsrfHeaders } from "./http.js";

/**
 * Supported entity types for single-entity CSV import.
 * Maps UI label → URL path segment.
 */
export const CSV_ENTITY_MAP = {
  employees: "employees",
  bands: "bands",
  streams: "streams",
  "webknot-values": "webknot-values",
  "kpi-definitions": "kpi-definitions",
  certifications: "certifications",
  "designation-lookups": "designation-lookups",
};

/**
 * Supported file-part names for the bulk /csv/all endpoint.
 * Maps UI label → multipart field name.
 */
export const CSV_BULK_FIELD_MAP = {
  employees: "employees",
  bands: "bands",
  streams: "streams",
  webknotValues: "webknotValues",
  kpiDefinitions: "kpiDefinitions",
  certifications: "certifications",
  designationLookups: "designationLookups",
};

/**
 * Import a single CSV file for one entity type.
 *
 * POST /admin/imports/csv/{entity}
 * Content-Type: multipart/form-data  (field name: "file")
 *
 * @param {string} entity  – one of CSV_ENTITY_MAP keys
 * @param {File}   file    – the CSV File object
 * @param {object} [opts]  – { signal }
 * @returns {Promise<object>} parsed JSON response
 */
export async function importCsvSingle(entity, file, opts = {}) {
  const entityPath = CSV_ENTITY_MAP[entity];
  if (!entityPath) throw new Error(`Unsupported entity: ${entity}`);

  await ensureCsrfCookie({ signal: opts.signal });

  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(buildApiUrl(`/admin/imports/csv/${entityPath}`), {
    method: "POST",
    credentials: "include",
    headers: withCsrfHeaders({}),
    body: formData,
    signal: opts.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = `Import failed (${res.status})`;
    try {
      const json = JSON.parse(text);
      msg = json?.message || json?.error || msg;
    } catch {
      if (text) msg = text.slice(0, 300);
    }
    throw new Error(msg);
  }

  return res.json().catch(() => ({ success: true }));
}

/**
 * Bulk-import multiple CSV files at once.
 *
 * POST /admin/imports/csv/all
 * Content-Type: multipart/form-data
 *
 * @param {Record<string, File>} filesByField – e.g. { employees: File, bands: File }
 *        Keys must be from CSV_BULK_FIELD_MAP values.
 * @param {object} [opts] – { signal }
 * @returns {Promise<object>} parsed JSON response
 */
export async function importCsvBulk(filesByField, opts = {}) {
  const validFields = new Set(Object.values(CSV_BULK_FIELD_MAP));
  const formData = new FormData();
  let count = 0;

  for (const [field, file] of Object.entries(filesByField)) {
    if (!validFields.has(field)) throw new Error(`Unsupported bulk field: ${field}`);
    if (file instanceof File) {
      formData.append(field, file);
      count++;
    }
  }

  if (count === 0) throw new Error("No files selected for bulk import.");

  await ensureCsrfCookie({ signal: opts.signal });

  const res = await fetch(buildApiUrl("/admin/imports/csv/all"), {
    method: "POST",
    credentials: "include",
    headers: withCsrfHeaders({}),
    body: formData,
    signal: opts.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = `Bulk import failed (${res.status})`;
    try {
      const json = JSON.parse(text);
      msg = json?.message || json?.error || msg;
    } catch {
      if (text) msg = text.slice(0, 300);
    }
    throw new Error(msg);
  }

  return res.json().catch(() => ({ success: true }));
}
