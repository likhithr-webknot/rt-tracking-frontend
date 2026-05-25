// @ts-nocheck
import { buildApiUrl, ensureCsrfCookie, readError, withCsrfHeaders } from "./http";
import { normalizeCsvFileForEntity } from "../utils/csvImportNormalize";

const ENTITY_PATH_ALIASES = {
  streams: ["streams", "departments"],
  "kpi-definitions": ["kpi-definitions", "kpi-directions"],
  "webknot-values": ["webknot-values", "webknot-value"],
  "designation-lookups": ["designation-lookups", "designations"],
};

function csvSingleImportPaths(entityPath) {
  const paths = [];

  if (entityPath === "employees") {
    paths.unshift(
      "/api/v1/employees/import-csv?sync=true",
      "/api/v1/employees/import-csv",
      "/api/v1/employee/import-csv?sync=true",
      "/api/v1/employee/import-csv",
      "/employees/import-csv",
    );
    paths.push(
      "/api/v1/upload/user-data/csv",
      "/api/v1/upload/user-data",
      "/api/v1/employees/batch",
    );
  }

  if (entityPath === "streams") {
    paths.unshift("/api/v1/department/import-csv");
  }

  const segments = ENTITY_PATH_ALIASES[entityPath] || [entityPath];
  for (const seg of segments) {
    paths.push(
      `/api/v1/admin/imports/csv/${seg}`,
      `/api/v1/admin/import/csv/${seg}`,
      `/api/v1/imports/csv/${seg}`,
      `/api/v1/admin/csv/import/${seg}`,
      `/api/v1/${seg}/import-csv`,
      `/${seg}/import-csv`,
    );
  }

  if (entityPath === "designation-lookups") {
    paths.unshift(
      "/api/v1/designation-lookups/import-csv",
      "/api/v1/designations/import-csv",
      "/designations/import-csv",
    );
  }

  if (entityPath === "kpi-definitions") {
    paths.unshift(
      "/api/v1/kpi-definitions/import-csv",
      "/api/v1/kpi-definition/import-csv",
      "/api/v1/kpi-directions/import-csv",
    );
  }

  return [...new Set(paths)];
}

/** For employees, a 500 on one route may mean that handler is broken — try the next path. */
function shouldTryNextImportPath(entityPath, status) {
  if (status === 404 || status === 405) return true;
  if (entityPath === "employees" && status >= 500) return true;
  return false;
}

function csvBulkImportPaths() {
  return [
    "/api/v1/admin/imports/csv/all",
    "/api/v1/admin/import/csv/all",
    "/api/v1/imports/csv/all",
    "/api/v1/admin/csv/import/all",
    "/api/v1/admin/import/csv/bulk",
    "/imports/csv/all",
  ];
}

/**
 * Supported entity types for single-entity CSV import.
 */
export const CSV_ENTITY_MAP = {
  employees: "employees",
  bands: "bands",
  streams: "streams",
  "webknot-values": "webknot-values",
  "kpi-definitions": "kpi-definitions",
  certifications: "certifications",
  "designation-lookups": "designation-lookups",
  "monthly-submissions": "monthly-submissions",
  projects: "projects",
};

export const CSV_BULK_FIELD_MAP = {
  employees: "employees",
  bands: "bands",
  streams: "streams",
  webknotValues: "webknotValues",
  kpiDefinitions: "kpiDefinitions",
  certifications: "certifications",
  designationLookups: "designationLookups",
  monthlySubmissions: "monthlySubmissions",
  projects: "projects",
};

/** UI entity key → bulk multipart field name */
export const CSV_ENTITY_TO_BULK_FIELD = {
  employees: "employees",
  bands: "bands",
  streams: "streams",
  "webknot-values": "webknotValues",
  "kpi-definitions": "kpiDefinitions",
  certifications: "certifications",
  "designation-lookups": "designationLookups",
  "monthly-submissions": "monthlySubmissions",
  projects: "projects",
};

/** Bulk multipart field → entity key for header normalization */
export const CSV_BULK_FIELD_TO_ENTITY = Object.fromEntries(
  Object.entries(CSV_ENTITY_TO_BULK_FIELD).map(([entity, field]) => [field, entity]),
);

function withReplaceQuery(path, replaceCatalog) {
  if (!replaceCatalog) return path;
  return path.includes("?") ? `${path}&replace=true` : `${path}?replace=true`;
}

async function postCsvMultipart(path, file, { signal, headers, fieldName = "file" }) {
  const formData = new FormData();
  formData.append(fieldName, file, file.name || "import.csv");

  const res = await fetch(buildApiUrl(path), {
    method: "POST",
    signal,
    credentials: "include",
    headers,
    body: formData,
  });

  if (res.ok) {
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) return res.json().catch(() => ({ success: true }));
    return { success: true };
  }

  const msg = await readError(res);
  const err = new Error(msg);
  err.status = res.status;
  err.path = path;
  return { err, retryable: res.status === 404 || res.status === 405 };
}

/**
 * Import a single CSV file for one entity type.
 * Normalizes headers to match sample templates, then tries admin + legacy import routes.
 */
export async function importCsvSingle(entity, file, opts = {}) {
  const entityPath = CSV_ENTITY_MAP[entity];
  if (!entityPath) throw new Error(`Unsupported entity: ${entity}`);

  const { file: uploadFile, warnings, missingRequired } = await normalizeCsvFileForEntity(
    entity,
    file,
  );

  if (missingRequired?.length && !opts.allowMissingRequired) {
    throw new Error(
      warnings?.[0] ||
        `CSV is missing required columns: ${missingRequired.join(", ")}`,
    );
  }

  await ensureCsrfCookie({ signal: opts.signal });

  const paths = csvSingleImportPaths(entityPath).map((path) =>
    withReplaceQuery(path, Boolean(opts.replaceCatalog)),
  );
  const headers = withCsrfHeaders({});
  const fieldNames = ["file", "csv", "csvFile"];
  let lastErr = null;

  for (const path of paths) {
    for (const fieldName of fieldNames) {
      const result = await postCsvMultipart(path, uploadFile, {
        signal: opts.signal,
        headers,
        fieldName,
      });
      if (result && !result.err) {
        return {
          ...result,
          normalized: true,
          warnings: warnings || [],
        };
      }
      if (result?.err && shouldTryNextImportPath(entityPath, result.err.status)) {
        lastErr = result.err;
        continue;
      }
      if (result?.err) throw result.err;
    }
  }

  const err = new Error(
    `${lastErr?.message || "CSV import failed."} No import route succeeded for "${entity}". ` +
      `Last attempt: POST ${lastErr?.path || paths[paths.length - 1]}. ` +
      (warnings?.length ? ` ${warnings.join(" ")}` : ""),
  );
  err.status = lastErr?.status || 404;
  err.path = lastErr?.path;
  err.attemptedPaths = paths;
  err.warnings = warnings;
  throw err;
}

/**
 * Bulk-import multiple CSV files at once.
 */
export async function importCsvBulk(filesByField, opts = {}) {
  const validFields = new Set(Object.values(CSV_BULK_FIELD_MAP));
  const entries = Object.entries(filesByField).filter(([, f]) => f instanceof File);
  const prepared = [];

  for (const [field, file] of entries) {
    if (!validFields.has(field)) throw new Error(`Unsupported bulk field: ${field}`);
    const entityKey = CSV_BULK_FIELD_TO_ENTITY[field] || field;
    const norm = await normalizeCsvFileForEntity(entityKey, file);
    if (norm.missingRequired?.length && !opts.allowMissingRequired) {
      throw new Error(
        norm.warnings?.[0] ||
          `${field}: missing required columns ${norm.missingRequired.join(", ")}`,
      );
    }
    prepared.push([field, norm.file]);
  }

  if (!prepared.length) throw new Error("No files selected for bulk import.");

  await ensureCsrfCookie({ signal: opts.signal });

  const paths = csvBulkImportPaths();
  const headers = withCsrfHeaders({});
  let lastErr = null;

  for (const path of paths) {
    const formData = new FormData();
    for (const [field, file] of prepared) {
      formData.append(field, file, file.name || `${field}.csv`);
    }

    const res = await fetch(buildApiUrl(path), {
      method: "POST",
      credentials: "include",
      headers,
      body: formData,
      signal: opts.signal,
    });

    if (res.ok) {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) return res.json().catch(() => ({ success: true }));
      return { success: true };
    }

    const msg = await readError(res);
    const err = new Error(msg);
    err.status = res.status;
    err.path = path;
    lastErr = err;

    if (res.status !== 404 && res.status !== 405) throw err;
  }

  const err = new Error(
    `${lastErr?.message || "Bulk CSV import failed."} No bulk import route matched. ` +
      "Expected POST /api/v1/admin/imports/csv/all on the API.",
  );
  err.status = lastErr?.status || 404;
  err.attemptedPaths = paths;
  throw err;
}

export async function importLeaveDataCsv(file, opts = {}) {
  if (!(file instanceof File)) throw new Error("leave file must be a File object");
  await ensureCsrfCookie({ signal: opts.signal });
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(buildApiUrl("/api/v1/upload"), {
    method: "POST",
    credentials: "include",
    headers: withCsrfHeaders({}),
    body: formData,
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json().catch(() => ({ success: true }));
}

export async function importAllocationsCsv(file, opts = {}) {
  if (!(file instanceof File)) throw new Error("allocation file must be a File object");
  await ensureCsrfCookie({ signal: opts.signal });
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(buildApiUrl("/api/v1/upload-allocation"), {
    method: "POST",
    credentials: "include",
    headers: withCsrfHeaders({}),
    body: formData,
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json().catch(() => ({ success: true }));
}

export async function importUserDataCsv(file, opts = {}) {
  if (!(file instanceof File)) throw new Error("user data file must be a File object");
  const norm = await normalizeCsvFileForEntity("employees", file);
  await ensureCsrfCookie({ signal: opts.signal });
  const formData = new FormData();
  formData.append("file", norm.file);
  const res = await fetch(buildApiUrl("/api/v1/upload/user-data"), {
    method: "POST",
    credentials: "include",
    headers: withCsrfHeaders({}),
    body: formData,
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json().catch(() => ({ success: true }));
}
