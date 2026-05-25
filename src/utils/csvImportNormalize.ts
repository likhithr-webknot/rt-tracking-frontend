// @ts-nocheck

/**
 * Canonical CSV schemas aligned with public/sample-csv/*.csv and backend import parsers.
 * Headers are normalized (aliases → canonical) before upload.
 */

export const CSV_ENTITY_SCHEMAS = {
  employees: {
    label: "Employees",
    samplePath: "/sample-csv/employees.csv",
    required: ["employeeName", "email"],
    columns: {
      employeeId: ["employeeid", "emp_id", "emp id", "id"],
      employeeName: ["employeename", "employee_name", "name", "full_name", "fullname"],
      email: ["email", "email_address", "mail"],
      empRole: ["emprole", "emp_role", "role", "user_role", "profile"],
      designation: ["designation", "title", "job_title", "job title"],
      stream: ["stream", "department", "dept", "team", "department_name"],
      band: ["band", "bandcode", "band_code", "level", "grade"],
      managerId: ["managerid", "manager_id", "manager"],
    },
  },
  bands: {
    label: "Bands",
    samplePath: "/sample-csv/bands.csv",
    required: ["code"],
    columns: {
      code: ["code", "band", "bandcode", "band_code", "name"],
    },
  },
  streams: {
    label: "Departments",
    samplePath: "/sample-csv/streams.csv",
    required: ["code"],
    columns: {
      code: ["code", "stream", "department", "dept", "name", "department_name"],
    },
  },
  "webknot-values": {
    label: "Webknot Values",
    samplePath: "/sample-csv/webknot-values.csv",
    required: ["title"],
    columns: {
      title: ["title", "name", "value", "value_title", "valuetitle"],
      evaluationCriteria: [
        "evaluationcriteria",
        "evaluation_criteria",
        "criteria",
        "pillar",
        "category",
        "group",
        "value_pillar",
      ],
      description: ["description", "desc", "details"],
    },
  },
  "kpi-definitions": {
    label: "KPI Definitions",
    samplePath: "/sample-csv/kpi-definitions.csv",
    required: ["band", "stream", "kpiName", "weightage"],
    columns: {
      band: ["band", "bandcode", "band_code", "level"],
      stream: ["stream", "department", "dept", "team"],
      evaluationCriteria: [
        "evaluationcriteria",
        "evaluation_criteria",
        "roles",
        "role",
        "criteria",
        "competency",
      ],
      kpiName: ["kpiname", "kpi_name", "kpi", "name", "title", "objective"],
      weightage: ["weightage", "weight", "weight_pct", "weightpercent", "weight_percent"],
    },
  },
  certifications: {
    label: "Certifications",
    samplePath: "/sample-csv/certifications.csv",
    required: ["name"],
    columns: {
      name: ["name", "certification", "certification_name", "title"],
    },
  },
  "designation-lookups": {
    label: "Designation Lookups",
    samplePath: "/sample-csv/designation-lookups.csv",
    required: ["stream", "band", "designation"],
    columns: {
      stream: ["stream", "department", "dept", "team"],
      band: ["band", "bandcode", "band_code", "level"],
      designation: ["designation", "title", "job_title", "role_title"],
    },
  },
  "monthly-submissions": {
    label: "Monthly Submissions",
    samplePath: "/sample-csv/monthly-submissions.csv",
    required: ["employeeEmail", "submissionMonth"],
    columns: {
      employeeEmail: ["employeeemail", "employee_email", "email"],
      managerEmail: ["manageremail", "manager_email"],
      cycleKey: ["cyclekey", "cycle_key", "cycle"],
      submissionMonth: ["submissionmonth", "submission_month", "month", "year_month"],
      employeeScore: ["employeescore", "employee_score", "score"],
      managerScore: ["managerscore", "manager_score"],
      employeeComment: ["employeecomment", "employee_comment", "comment"],
      managerComment: ["managercomment", "manager_comment", "review_comment"],
    },
  },
};

/** Header-only CSV template from canonical column keys. */
export function csvTemplateHeadersForEntity(entityKey) {
  const schema = CSV_ENTITY_SCHEMAS[entityKey];
  if (!schema?.columns) return [];
  return Object.keys(schema.columns);
}

export function csvTemplateContentForEntity(entityKey) {
  const headers = csvTemplateHeadersForEntity(entityKey);
  if (!headers.length) return "";
  return `${headers.join(",")}\n`;
}

export function downloadCsvTemplate(entityKey, filename = null) {
  const content = csvTemplateContentForEntity(entityKey);
  if (!content) return;
  const name = filename || `${entityKey.replace(/[^a-z0-9]+/gi, "-")}-template.csv`;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Canonical department names (matches directoryCatalog / HR sheets). */
const STREAM_ALIASES = {
  dev: "Developer",
  developer: "Developer",
  qa: "Quality Assurance",
  pm: "Project Manager",
  am: "Account Manager",
  hr: "Human Resources",
  ba: "Business Analyst",
  "ui/ux": "UI/UX",
  dm: "Delivery Manager",
  cxo: "Executive",
  "ai/ml": "AI/ML",
  admin: "Admin",
};

/** UI canonical column → backend CSV header on upload. */
const BACKEND_UPLOAD_HEADERS = {
  employees: {
    employeeId: "emp_id",
    employeeName: "name",
    email: "email",
    stream: "department",
    band: "band",
    designation: "role",
    empRole: "portal_role",
  },
  "kpi-definitions": {
    band: "band",
    stream: "department",
    evaluationCriteria: "evaluation_criteria",
    kpiName: "kpi_name",
    weightage: "weightage",
  },
  "webknot-values": {
    title: "title",
    evaluationCriteria: "evaluation_criteria",
  },
  "designation-lookups": {
    stream: "department",
    band: "band",
    designation: "name",
  },
};

function mapStreamValue(raw) {
  const key = String(raw ?? "").trim().toLowerCase();
  return STREAM_ALIASES[key] || String(raw ?? "").trim();
}

function normHeader(cell) {
  return String(cell ?? "")
    .trim()
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** RFC-style CSV parse (supports quoted fields and escaped quotes). */
export function parseCsvRecords(text) {
  const raw = String(text ?? "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i];
    if (inQuotes) {
      if (c === '"') {
        if (raw[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      cur = "";
      if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);
      row = [];
    } else {
      cur += c;
    }
  }
  row.push(cur);
  if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);

  return rows;
}

function escapeCsvCell(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function serializeCsvRecords(records) {
  return records.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function resolveCanonicalHeader(rawHeader, columnMap) {
  const key = normHeader(rawHeader);
  if (!key) return null;
  for (const [canonical, aliases] of Object.entries(columnMap)) {
    if (normHeader(canonical) === key) return canonical;
    for (const alias of aliases) {
      if (normHeader(alias) === key) return canonical;
    }
  }
  return null;
}

/**
 * Normalize CSV text to canonical headers for an entity.
 * @returns {{ records: string[][], canonicalHeaders: string[], warnings: string[], missingRequired: string[] }}
 */
export function normalizeCsvTextForEntity(entityKey, text) {
  const schema = CSV_ENTITY_SCHEMAS[entityKey];
  if (!schema) {
    return {
      records: parseCsvRecords(text),
      canonicalHeaders: [],
      warnings: [`Unknown entity: ${entityKey}`],
      missingRequired: [],
    };
  }

  const parsed = parseCsvRecords(text);
  if (!parsed.length) {
    return {
      records: [],
      canonicalHeaders: [],
      warnings: ["CSV file is empty."],
      missingRequired: schema.required,
    };
  }

  const headerRow = parsed[0];
  const headerMap = [];
  const usedCanonical = new Set();

  for (let i = 0; i < headerRow.length; i += 1) {
    const canonical = resolveCanonicalHeader(headerRow[i], schema.columns);
    headerMap[i] = canonical;
    if (canonical) usedCanonical.add(canonical);
  }

  const canonicalHeaders = Object.keys(schema.columns).filter((col) => usedCanonical.has(col));
  if (!canonicalHeaders.length) {
    canonicalHeaders.push(
      ...headerRow
        .map((h) => String(h).trim())
        .filter(Boolean)
        .slice(0, 20),
    );
  }

  const dataRows = parsed.slice(1).map((row) => {
    const out = Object.fromEntries(canonicalHeaders.map((h) => [h, ""]));
    for (let i = 0; i < row.length; i += 1) {
      const canon = headerMap[i];
      if (!canon || !Object.prototype.hasOwnProperty.call(out, canon)) continue;
      out[canon] = String(row[i] ?? "").trim();
    }
    if (out.stream) out.stream = mapStreamValue(out.stream);
    if (out.band) out.band = String(out.band).trim().toUpperCase().replace(/\s+/g, "");
    if (out.weightage) out.weightage = String(out.weightage).replace(/%/g, "").trim();
    return canonicalHeaders.map((h) => out[h] ?? "");
  });

  const backendMap = BACKEND_UPLOAD_HEADERS[entityKey];
  const uploadHeaders = backendMap
    ? canonicalHeaders.map((h) => backendMap[h] || h)
    : canonicalHeaders;
  const uploadRows = dataRows
    .filter((row) => row.some((c) => String(c).trim()))
    .map((row) => row);

  const records = [uploadHeaders, ...uploadRows];

  const missingRequired = (schema.required || []).filter(
    (col) => !usedCanonical.has(col),
  );

  const warnings = [];
  if (missingRequired.length) {
    warnings.push(
      `Missing required column(s): ${missingRequired.join(", ")}. Expected headers like: ${schema.required.join(", ")}.`,
    );
  }

  const unknownHeaders = headerRow
    .map((h, i) => ({ raw: String(h).trim(), mapped: headerMap[i] }))
    .filter((x) => x.raw && !x.mapped)
    .map((x) => x.raw);
  if (unknownHeaders.length) {
    warnings.push(`Unmapped column(s) ignored: ${unknownHeaders.join(", ")}.`);
  }

  return { records, canonicalHeaders, warnings, missingRequired };
}

const EMPLOYEE_IMPORT_PREREQ_NOTE =
  "Import bands, departments (streams), and designation lookups before employees. " +
  "Each row needs a band + department + designation that already exists in the database.";

export function getEmployeeImportPrerequisiteNote() {
  return EMPLOYEE_IMPORT_PREREQ_NOTE;
}

/**
 * Lightweight row checks before upload (does not call the API).
 */
export function validateEmployeesCsvRecords(records) {
  const rows = Array.isArray(records) ? records : [];
  if (rows.length < 2) {
    return { ok: false, errors: ["CSV has no data rows."], warnings: [] };
  }
  const headers = rows[0].map((h) => String(h).trim());
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const errors = [];
  const warnings = [];
  const seenIds = new Set();
  const seenEmails = new Set();

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    const get = (col) => String(row[idx[col]] ?? "").trim();
    const line = r + 1;
    const employeeId = get("employeeId");
    const email = get("email");
    const band = get("band");
    const stream = get("stream");
    const designation = get("designation");

    if (!get("employeeName")) errors.push(`Row ${line}: employeeName is required.`);
    if (!email) errors.push(`Row ${line}: email is required.`);
    if (email && !email.includes("@")) errors.push(`Row ${line}: email looks invalid.`);
    if (!band) errors.push(`Row ${line}: band is required.`);
    if (!stream) errors.push(`Row ${line}: stream (department) is required.`);
    if (!designation) errors.push(`Row ${line}: designation is required.`);

    if (employeeId) {
      const key = employeeId.toLowerCase();
      if (seenIds.has(key)) errors.push(`Row ${line}: duplicate employeeId ${employeeId}.`);
      seenIds.add(key);
    }
    if (email) {
      const key = email.toLowerCase();
      if (seenEmails.has(key)) errors.push(`Row ${line}: duplicate email ${email}.`);
      seenEmails.add(key);
    }

    if (stream === "Engineering") {
      warnings.push(
        `Row ${line}: department "Engineering" is not used on this backend — use "Development" (see sample template).`,
      );
    }
  }

  if (!errors.length) {
    warnings.unshift(EMPLOYEE_IMPORT_PREREQ_NOTE);
  }

  return { ok: errors.length === 0, errors, warnings };
}

export async function normalizeCsvFileForEntity(entityKey, file) {
  if (!(file instanceof File)) throw new Error("Expected a CSV file.");
  const text = await file.text();
  const result = normalizeCsvTextForEntity(entityKey, text);
  const csvText = serializeCsvRecords(result.records);
  const baseName = String(file.name || "import.csv").replace(/\.csv$/i, "") || "import";
  const normalized = new File([csvText], `${baseName}.normalized.csv`, {
    type: "text/csv",
    lastModified: Date.now(),
  });
  return { ...result, file: normalized, csvText };
}

export function getCsvSchema(entityKey) {
  return CSV_ENTITY_SCHEMAS[entityKey] || null;
}
