#!/usr/bin/env node
/**
 * Builds public/sample-csv/*.csv from Downloads HR source files.
 * Run: node scripts/build-hr-csv-samples.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "sample-csv");

const STREAM_MAP = {
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

const ROLE_MAP = {
  employee: "Employee",
  manager: "Manager",
  admin: "Admin",
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQ = false;
  const raw = String(text).replace(/^\uFEFF/, "");
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inQ) {
      if (c === '"') {
        if (raw[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && raw[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((x) => String(x).trim())) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => String(x).trim())) rows.push(row);
  return rows;
}

function esc(v) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(name, header, dataRows) {
  const lines = [header.join(","), ...dataRows.map((r) => header.map((h, i) => esc(r[i])).join(","))];
  fs.writeFileSync(path.join(OUT, name), lines.join("\n") + "\n", "utf8");
}

function mapStream(raw) {
  const key = String(raw || "").trim().toLowerCase();
  return STREAM_MAP[key] || String(raw || "").trim();
}

function mapRole(raw) {
  const key = String(raw || "").trim().toLowerCase();
  return ROLE_MAP[key] || String(raw || "").trim() || "Employee";
}

function buildEmployees(srcPath) {
  const parsed = parseCsv(fs.readFileSync(srcPath, "utf8"));
  const header = parsed[0].map((h) => String(h).trim().toLowerCase());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const out = [["employeeId", "employeeName", "email", "empRole", "designation", "stream", "band"]];
  for (let r = 1; r < parsed.length; r++) {
    const row = parsed[r];
    const get = (k) => String(row[idx[k]] ?? "").trim();
    const employeeId = get("employeeid") || get("employee id");
    const employeeName = get("employeename") || get("employee name");
    const email = get("email").toLowerCase();
    const empRole = mapRole(get("emprole") || get("emp role") || get("role"));
    const designation = get("designation");
    const stream = mapStream(get("stream"));
    const band = get("band").toUpperCase().replace(/\s+/g, "");
    if (!email || !employeeName) continue;
    out.push([employeeId, employeeName, email, empRole, designation, stream, band]);
  }
  writeCsv("employees.csv", out[0], out.slice(1));
  return out.length - 1;
}

function buildKpis(srcPath) {
  const parsed = parseCsv(fs.readFileSync(srcPath, "utf8"));
  const header = parsed[0].map((h) => String(h).trim().toLowerCase());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const out = [["Band", "Designation", "Department", "Parameter", "KPI", "Description", "Weightage"]];
  for (let r = 1; r < parsed.length; r++) {
    const row = parsed[r];
    const get = (k) => String(row[idx[k]] ?? "").trim();
    const band = get("band").toUpperCase();
    const designation = get("designation") || get("role");
    const department = get("department") || mapStream(get("stream")) || get("dept");
    const parameter = get("parameter") || get("evaluationcriteria") || get("evaluation criteria");
    const kpiName = get("kpi") || get("kpiname") || get("kpi name");
    const description = get("description") || get("desc");
    const weight = get("weightage");
    if (!band || !designation || !kpiName) continue;
    out.push([band, designation, department, parameter, kpiName, description, weight]);
  }
  writeCsv("kpi-definitions.csv", out[0], out.slice(1));
  return out.length - 1;
}

function buildWebknotValues(srcPath) {
  const parsed = parseCsv(fs.readFileSync(srcPath, "utf8"));
  const out = [["title", "evaluation_criteria"]];
  let pillar = "";
  for (let r = 1; r < parsed.length; r++) {
    const row = parsed[r];
    const col0 = String(row[0] ?? "").trim();
    const col1 = String(row[1] ?? "").trim();
    if (col0) {
      pillar = col0;
      if (col1) out.push([col1, pillar]);
    } else if (col1 && pillar) {
      out.push([col1, pillar]);
    }
  }
  writeCsv("webknot-values.csv", out[0], out.slice(1));
  return out.length - 1;
}

function buildDesignationLookups(srcPath) {
  const parsed = parseCsv(fs.readFileSync(srcPath, "utf8"));
  const header = parsed[0].map((h) => String(h).trim().toLowerCase());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const seen = new Set();
  const out = [["name", "band", "department"]];
  for (let r = 1; r < parsed.length; r++) {
    const row = parsed[r];
    const get = (k) => String(row[idx[k]] ?? "").trim();
    const designation = get("designation");
    const stream = mapStream(get("stream"));
    const band = get("band").toUpperCase().replace(/\s+/g, "");
    const key = `${stream}|${band}|${designation}`.toLowerCase();
    if (!designation || !stream || !band || seen.has(key)) continue;
    seen.add(key);
    out.push([designation, band, stream]);
  }
  writeCsv("designation-lookups.csv", out[0], out.slice(1));
  return out.length - 1;
}

const empSrc =
  process.env.EMPLOYEES_CSV ||
  path.join(process.env.HOME || "", "Downloads", "employees.csv");
const kpiSrc =
  process.env.KPI_CSV ||
  path.join(process.env.HOME || "", "Downloads", "kpi-definitions - kpi-definitions (3).csv");
const wvSrc =
  process.env.WV_CSV ||
  path.join(process.env.HOME || "", "Downloads", "webknot-values - webknot-values.csv");

const employeeData = buildEmployees(empSrc);
const kpiCount = buildKpis(kpiSrc);
const wvCount = buildWebknotValues(wvSrc);
const desigCount = buildDesignationLookups(empSrc);

console.log(`employees: ${employeeData} -> employees.csv`);
console.log(`kpis: ${kpiCount}`);
console.log(`webknot values: ${wvCount}`);
console.log(`designation lookups: ${desigCount}`);
