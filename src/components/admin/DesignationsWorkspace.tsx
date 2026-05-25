// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import SearchField from "../shared/SearchField";
import AdminPageHeader, { AdminPageShell } from "./AdminPageHeader";
import EntityCsvToolbar from "../shared/EntityCsvToolbar";
import Toast from "../shared/Toast";
import { fetchAllDesignations, seedDesignations } from "../../api/designations";
import { exportDesignationsCsv } from "../../utils/entityCsvExport";

export default function DesignationsWorkspace() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAllDesignations({ search: search.trim(), limit: 500 });
      setRows(res.rows || []);
    } catch (err) {
      const msg = String(err?.message ?? "");
      if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
        try {
          await seedDesignations();
          const retry = await fetchAllDesignations({ search: search.trim(), limit: 500 });
          setRows(retry.rows || []);
          setToast({
            title: "Sample designations loaded",
            message: "Seeded lookup rows. Import your CSV to replace them.",
            tone: "success",
          });
          return;
        } catch (seedErr) {
          setRows([]);
          setToast({
            title: "Designations API unavailable",
            message:
              seedErr?.message ||
              "Restart the Webtrak backend, then refresh. Endpoints: GET /api/v1/designations/list",
            tone: "error",
          });
          return;
        }
      }
      setRows([]);
      setToast({
        title: "Could not load designations",
        message: err?.message || "Try again after importing bands, streams, and lookups.",
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const band = String(row?.band?.name ?? row?.band ?? "").toLowerCase();
      const stream = String(row?.department ?? row?.stream ?? "").toLowerCase();
      const title = String(row?.name ?? row?.designation ?? "").toLowerCase();
      return band.includes(q) || stream.includes(q) || title.includes(q);
    });
  }, [rows, search]);

  return (
    <AdminPageShell className="space-y-6">
      <AdminPageHeader
        title="Designations"
        subtitle="Band × department job titles used in employee profiles and promotion paths."
      >
        <EntityCsvToolbar
          entityKey="designation-lookups"
          importLabel="Import lookups"
          exportLabel="Export CSV"
          replaceCatalog
          onExport={() => exportDesignationsCsv(rows)}
          onImportComplete={load}
          confirmImportMessage="Replace designation lookups from CSV? Rows not in the file are removed. Import bands and streams first."
          showToast={(t) => setToast(t)}
        />
        <button type="button" className="rt-btn-soft" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </AdminPageHeader>

      <div className="rt-toolbar-panel">
        <SearchField
          label="Find a job title"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch("")}
          placeholder="Department, band, or title name"
          hint={`${filtered.length} row${filtered.length === 1 ? "" : "s"} shown`}
        />
      </div>

      <div className="rt-panel flex flex-col max-h-[min(72vh,720px)] overflow-hidden">
        <div className="shrink-0 px-4 py-3 border-b border-[rgb(var(--border))]">
          <h2 className="text-sm font-semibold">Lookup table</h2>
          <p className="rt-section-subtitle mt-0.5">{filtered.length} rows · scroll inside this panel</p>
        </div>
        <div className="min-w-0 flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-left text-sm min-w-[520px]">
          <thead className="sticky top-0 z-10 bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">
            <tr>
              <th className="p-4">Stream</th>
              <th className="p-4">Band</th>
              <th className="p-4">Designation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--border))]">
            {loading ? (
              <tr>
                <td colSpan={3} className="p-12 text-center">
                  <Loader2 className="animate-spin mx-auto" size={24} />
                </td>
              </tr>
            ) : null}
            {!loading &&
              filtered.map((row) => (
                <tr key={row.id ?? `${row.department}-${row.band?.name}-${row.name}`} className="hover:bg-[rgb(var(--surface-2))]">
                  <td className="p-4">{row.department || row.stream || "—"}</td>
                  <td className="p-4 font-mono text-xs">{row.band?.name || row.band || "—"}</td>
                  <td className="p-4 font-medium">{row.name || row.designation || "—"}</td>
                </tr>
              ))}
            {!loading && !filtered.length ? (
              <tr>
                <td colSpan={3} className="p-10 text-center text-[rgb(var(--muted))]">
                  No designations yet. Import bands and streams, then import designation lookups CSV.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        </div>
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </AdminPageShell>
  );
}
