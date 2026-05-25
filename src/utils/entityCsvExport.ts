// @ts-nocheck

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

export function exportKpisCsv(kpis) {
  const header = ["band", "department", "evaluation_criteria", "kpi_name", "weightage"];
  const rows = (kpis || []).map((k) => {
    let w = String(k.weight ?? k.weightage ?? "").replace(/%/g, "").trim();
    return [
      k.band || "",
      k.stream || k.department || "",
      k.evaluationCriteria || "",
      k.title || k.kpiName || "",
      w,
    ];
  });
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
