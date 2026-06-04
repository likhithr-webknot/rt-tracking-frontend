// @ts-nocheck

import { KPI_DEFINITIONS_CSV_HEADER } from "./csvImportNormalize";

/** Canonical department label → short code used on WebTrack KPI sheets. */
const STREAM_EXPORT_SHORT = {
  development: "Dev",
  developer: "Dev",
  qualityassurance: "QA",
  projectmanager: "PM",
  accountmanager: "AM",
  humanresources: "HR",
  businessanalyst: "BA",
  "ui/ux": "UI/UX",
  deliverymanager: "DM",
  executive: "CXO",
  "ai/ml": "AI/ML",
  admin: "Admin",
};

function kpiDepartmentForExport(kpi) {
  const stream = String(kpi?.stream ?? kpi?.department ?? "").trim();
  if (!stream) return "";
  const key = stream.toLowerCase().replace(/[^a-z0-9/]+/g, "");
  return STREAM_EXPORT_SHORT[key] || stream;
}

export function downloadCsv(filename, headerRow, dataRows) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headerRow.join(","),
    ...dataRows.map((row) => headerRow.map((_, i) => esc(row[i])).join(",")),
  ];
  const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportEmployeesCsv(employees) {
  const header = ["employeeId", "employeeName", "email", "empRole", "designation", "stream", "band"];
  const rows = (employees || []).map((e) => [
    e.employeeId || e.empId || e.id || "",
    e.name || e.employeeName || "",
    e.email || "",
    e.portalRole || e.empRole || e.role || "Employee",
    e.designation || e.role || "",
    e.stream || e.department || "",
    e.band || e.bandCode || "",
  ]);
  downloadCsv("employees.csv", header, rows);
}

const KPI_DEPT_STREAM_KEYS = new Set([
  "development",
  "developer",
  "dev",
  "qualityassurance",
  "projectmanager",
  "accountmanager",
  "humanresources",
  "businessanalyst",
  "uiux",
  "deliverymanager",
  "executive",
  "aiml",
  "admin",
]);

function kpiRoleForExport(kpi) {
  const role = String(kpi?.role ?? kpi?.designation ?? kpi?.jobTitle ?? "").trim();
  if (role) return role;
  const stream = String(kpi?.stream ?? kpi?.department ?? "").trim();
  if (!stream) return "";
  const key = stream.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (KPI_DEPT_STREAM_KEYS.has(key)) return "";
  return stream;
}

function formatKpiWeightageExport(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.includes("%")) return raw;
  const n = Number.parseFloat(raw);
  if (Number.isFinite(n)) return `${n}%`;
  return raw;
}

export function exportKpisCsv(kpis) {
  const header = KPI_DEFINITIONS_CSV_HEADER.split(",");
  const rows = (kpis || []).map((k) => [
    k.band || "",
    String(k.designation ?? k.role ?? kpiRoleForExport(k) ?? "").trim(),
    kpiDepartmentForExport(k),
    k.evaluationCriteria || "",
    k.title || k.kpiName || k.name || "",
    k.description || "",
    formatKpiWeightageExport(k.weight ?? k.weightage),
  ]);
  downloadCsv("kpi-definitions.csv", header, rows);
}

export function exportPromotionsCsv(employees) {
  const header = ["employeeId", "employeeName", "email", "band", "stream", "lastPromotionDate"];
  const rows = (employees || [])
    .filter((e) => e.lastPromotionDate)
    .map((e) => [
      e.employeeId || e.empId || e.id || "",
      e.name || "",
      e.email || "",
      e.band || "",
      e.stream || e.department || "",
      e.lastPromotionDate || "",
    ]);
  downloadCsv("promotions.csv", header, rows);
}

export function exportCompanyValuesCsv(values) {
  const header = ["title", "evaluation_criteria"];
  const rows = (values || []).map((v) => [
    v.name || v.title || "",
    v.evaluationCriteria || v.pillar || "",
  ]);
  downloadCsv("webknot-values.csv", header, rows);
}

export function exportCertificationsCsv(certs) {
  const header = ["name"];
  const rows = (certs || []).map((c) => [c.name || c.title || ""]);
  downloadCsv("certifications.csv", header, rows);
}

export function exportBandsCsv(bands) {
  const header = ["code"];
  const rows = (bands || []).map((b) => [b.code || b.label || b.name || ""]);
  downloadCsv("bands.csv", header, rows);
}

export function exportDesignationsCsv(rows) {
  const header = ["stream", "band", "designation"];
  const data = (rows || []).map((d) => [
    d.department || d.stream || "",
    d.band?.name || d.bandCode || d.band || "",
    d.name || d.designation || "",
  ]);
  downloadCsv("designation-lookups.csv", header, data);
}

export function exportDepartmentsCsv(streams) {
  const header = ["code"];
  const rows = (streams || []).map((s) => [s.code || s.label || s.name || ""]);
  downloadCsv("streams.csv", header, rows);
}
