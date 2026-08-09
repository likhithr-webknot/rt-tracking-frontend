// @ts-nocheck
import React, { useState } from "react";
import { FileBarChart2, Download, Loader2, FileText } from "lucide-react";
import { downloadMonthlySubmissionAudit, downloadReport, fetchReports } from "../../api/reports";
import { fetchEmployees, normalizeEmployees } from "../../api/employees";
import { fetchAdminAllSubmissions } from "../../api/monthly-submissions";
import { fetchValues, normalizeWebknotValuesList } from "../../api/webknotValueApi";
import WebknotValueHeatmap from "./WebknotValueHeatmap";
import { fetchAllocations, normalizeAllocations } from "../../api/allocations";
import { fetchKpiDefinitions, normalizeKpiDefinitions } from "../../api/kpi-definitions";
import Toast from "../shared/Toast";
import AdminPageHeader, { AdminPageShell } from "./AdminPageHeader";

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  a.remove();
}

function csvEscape(s) {
  const t = String(s ?? "");
  if (/[",\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

const DEFAULT_REPORTS = [
  { id: "monthly_audit", name: "Monthly Submission Audit", description: "Full workflow audit: scores, statuses, manager and admin actions.", type: "CSV" },
  { id: "monthly_summary", name: "Monthly Performance Summary", description: "Consolidated KPI and value ratings for the active cycle.", type: "CSV" },
  { id: "employee_audit", name: "Employee Talent Audit", description: "Directory snapshot: roles, bands, departments.", type: "CSV" },
  { id: "allocation_report", name: "Resource Utilization", description: "Project assignments from the allocation API.", type: "CSV" },
  { id: "submission_track", name: "Submission Compliance", description: "Employee submission flags from the directory.", type: "CSV" },
];

export default function ReportsDashboard() {
  const [reports, setReports] = useState(DEFAULT_REPORTS);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [heatmapRows, setHeatmapRows] = useState([]);
  const [valuesIndex, setValuesIndex] = useState({});
  const [heatmapLoading, setHeatmapLoading] = useState(true);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await fetchReports();
        const list = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
        if (!mounted || !list.length) return;
        const merged = [...DEFAULT_REPORTS];
        for (const row of list) {
          const id = String(row?.id || "").trim();
          if (!id || merged.some((r) => r.id === id)) continue;
          merged.unshift({
            id,
            name: row.name || id,
            description: "Server-generated export.",
            type: row.type || "CSV",
          });
        }
        setReports(merged);
      } catch {
        void 0;
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      setHeatmapLoading(true);
      try {
        const [subs, empRes, valuesRaw] = await Promise.all([
          fetchAdminAllSubmissions({}),
          fetchEmployees({ limit: 2000 }),
          fetchValues().catch(() => []),
        ]);
        if (!mounted) return;
        const employees = normalizeEmployees(empRes);
        const empById = new Map(employees.map((e) => [String(e.id), e]));
        const values = normalizeWebknotValuesList(valuesRaw);
        const idx = {};
        for (const v of values) {
          const id = String(v?.id ?? "").trim();
          if (id) idx[id] = String(v?.title || v?.name || id);
        }
        setValuesIndex(idx);
        const rows = (Array.isArray(subs) ? subs : []).map((item) => {
          const sub = item?.submission || item;
          const emp = empById.get(String(sub?.employeeId || item?.employeeId || "")) || {};
          const payload = sub?.payload || sub;
          const mgr = sub?.managerEvaluation?.webknotValueRatings || payload?.managerEvaluation?.webknotValueRatings || {};
          return {
            employeeId: emp.id || sub?.employeeId,
            employeeName: emp.name,
            band: emp.band || sub?.band,
            stream: emp.stream || sub?.stream,
            valueRatings: Object.keys(mgr).length ? mgr : sub?.webknotValueRatings || payload?.webknotValueRatings || {},
          };
        }).filter((r) => Object.keys(r.valueRatings || {}).length > 0);
        setHeatmapRows(rows);
      } catch {
        if (mounted) {
          setHeatmapRows([]);
          setValuesIndex({});
        }
      } finally {
        if (mounted) setHeatmapLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function buildClientExport(report) {
    if (report.id === "monthly_summary") {
      const raw = await fetchKpiDefinitions({ limit: null });
      const kpis = normalizeKpiDefinitions(Array.isArray(raw?.items) ? raw.items : []);
      const empRes = await fetchEmployees({ limit: 2000 });
      const employees = normalizeEmployees(empRes);
      const lines = [
        "Type,Summary export",
        `Generated,${new Date().toISOString()}`,
        "",
        "KPIs",
        "Id,Title,Stream,Band,Weight",
        ...kpis.map((k) => [k.id, k.title, k.stream, k.band, k.weight].map(csvEscape).join(",")),
        "",
        "Employees",
        "Id,Name,Email,Role,Band,Department,Submitted",
        ...employees.map((e) =>
          [e.id, e.name, e.email, e.role, e.band, e.stream, e.submitted ? "Yes" : "No"].map(csvEscape).join(","),
        ),
      ];
      return new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    }

    if (report.id === "employee_audit" || report.id === "submission_track") {
      const empRes = await fetchEmployees({ limit: 2000 });
      const employees = normalizeEmployees(empRes);
      const lines = [
        "Id,Name,Email,Role,Band,Department,Submitted,Status",
        ...employees.map((e) =>
          [e.id, e.name, e.email, e.role, e.band, e.stream, e.submitted ? "Yes" : "No", e.status || ""]
            .map(csvEscape)
            .join(","),
        ),
      ];
      return new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    }

    if (report.id === "allocation_report") {
      const raw = await fetchAllocations();
      const rows = normalizeAllocations(raw);
      const lines = [
        "EmployeeId,EmployeeName,ProjectId,ProjectName,Type,Percentage",
        ...rows.map((r) =>
          [r.employeeId, r.employeeName, r.projectId, r.projectName, r.allocationType, r.percentage].map(csvEscape).join(","),
        ),
      ];
      return new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    }

    return null;
  }

  async function handleDownload(report) {
    setLoading(true);
    try {
      let blob = null;
      if (report.id === "monthly_audit") {
        try {
          blob = await downloadMonthlySubmissionAudit();
        } catch (e) {
          void e;
        }
      }
      if (!blob || blob.size === 0) {
        try {
          blob = await buildClientExport(report);
        } catch (e) {
          void e;
        }
      }
      if (!blob || blob.size === 0) {
        try {
          blob = await downloadReport(report.id);
        } catch (e) {
          void e;
        }
      }
      if (!blob || blob.size === 0) {
        throw new Error("Nothing to export.");
      }

      const ext = String(report.type || "CSV").toLowerCase();
      downloadBlob(blob, `${report.name.toLowerCase().replace(/ /g, "_")}.${ext}`);
      setToast({ title: "Downloaded", message: report.name });
    } catch (err) {
      setToast({
        title: "Download failed",
        message: err?.message || "Could not generate this export.",
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminPageShell className="space-y-8">
      <AdminPageHeader
        title="Reports"
        subtitle="Export live data as server reports or browser-built CSV files."
      />

      {heatmapLoading ? (
        <div className="rt-panel p-8 flex items-center justify-center gap-2 text-sm text-[rgb(var(--muted))]">
          <Loader2 className="animate-spin" size={18} /> Building value heatmap…
        </div>
      ) : (
        <WebknotValueHeatmap rows={heatmapRows} valuesIndex={valuesIndex} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {reports.map((r) => (
          <section key={r.id} className="rt-panel group hover:border-[rgb(var(--primary))]/40 hover:shadow-2xl hover:shadow-[rgb(var(--primary))/0.05]">
            <div className="p-8 h-full flex flex-col">
              <div className="flex items-start justify-between">
                <div className="h-12 w-12 rounded-2xl bg-[rgb(var(--primary))/0.1] text-[rgb(var(--primary))] flex items-center justify-center group-hover:scale-110 transition-transform">
                  <FileBarChart2 size={24} />
                </div>
                <span className="rt-badge rt-badge--neutral">
                  {r.type}
                </span>
              </div>

              <div className="mt-6 flex-1">
                <h3 className="text-lg font-black text-[rgb(var(--text))]">{r.name}</h3>
                <p className="text-sm text-[rgb(var(--muted))] mt-2 leading-relaxed font-medium">{r.description}</p>
              </div>

              <div className="mt-8 pt-6 border-t border-[rgb(var(--border))] flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[rgb(var(--muted))]">
                  <FileText size={14} /> Export
                </div>
                <button
                  onClick={() => handleDownload(r)}
                  disabled={loading}
                  className="rt-btn-primary !py-2 !px-4 text-xs"
                >
                  {loading ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />}
                  Export
                </button>
              </div>
            </div>
          </section>
        ))}
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </AdminPageShell>
  );
}
