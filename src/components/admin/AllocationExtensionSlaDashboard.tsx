// @ts-nocheck
import React, { useState, useEffect, useMemo } from "react";
import { Clock, CheckCircle2, XCircle, Search, Loader2, AlertTriangle } from "lucide-react";
import {
  fetchAllocationExtensions,
  normalizeAllocationExtensionsResponse,
  updateExtensionStatus,
} from "../../api/allocation-extensions";
import { summarizeExtensionSla } from "../../utils/allocationExtensionSla";
import AdminPageHeader, { AdminPageShell } from "./AdminPageHeader";
import Toast from "../shared/Toast";

export default function AllocationExtensionSlaDashboard() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function loadData() {
    setLoading(true);
    try {
      const data = await fetchAllocationExtensions({ search, size: 100 });
      const { items } = normalizeAllocationExtensionsResponse(data);
      setRequests(items);
    } catch (err) {
      setRequests([]);
      setToast({ title: "Load failed", message: err?.message || "Could not load extension requests.", tone: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const sla = useMemo(() => summarizeExtensionSla(requests), [requests]);

  async function handleAction(requestId, status) {
    const id = String(requestId ?? "").trim();
    if (!id) return;
    setBusyId(id);
    try {
      await updateExtensionStatus({
        allocationExtensionRequestId: id,
        id,
        status,
        hrComments: status === "APPROVED" ? "Approved by HR" : "Rejected by HR",
      });
      setToast({ title: "Updated", message: `Request ${status.toLowerCase()}` });
      loadData();
    } catch (err) {
      setToast({ title: "Error", message: err.message, tone: "error" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminPageShell className="space-y-6">
      <AdminPageHeader
        title="Allocation extensions"
        subtitle="SLA tracking for manager project extension requests — warning at 3 days, critical at 7 days."
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Open", value: sla.pending.length },
          { label: "Warning (3d+)", value: sla.warning.length },
          { label: "Critical (7d+)", value: sla.critical.length },
          { label: "Total", value: sla.enriched.length },
        ].map((s) => (
          <div key={s.label} className="rt-stat">
            <div className="rt-field-label">{s.label}</div>
            <div className="mt-2 text-xl font-bold tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="rt-panel overflow-hidden">
        <div className="p-4 border-b border-[rgb(var(--border))] flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" size={16} />
            <input
              className="rt-input w-full pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadData()}
              placeholder="Search talent or project…"
            />
          </div>
          <button type="button" className="rt-btn-secondary" onClick={loadData}>
            Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">
                <th className="p-4">SLA</th>
                <th className="p-4">Manager</th>
                <th className="p-4">Talent / Project</th>
                <th className="p-4">Extension date</th>
                <th className="p-4">Reason</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-[rgb(var(--muted))]">
                    <Loader2 className="animate-spin inline mr-2" size={18} />
                    Loading…
                  </td>
                </tr>
              ) : null}
              {!loading && sla.enriched.map((req, idx) => (
                <tr key={req.id || `ext-${idx}`} className="border-t border-[rgb(var(--border))] hover:bg-[rgb(var(--surface-2))]/50">
                  <td className="p-4">
                    <span
                      className={[
                        "rt-badge uppercase",
                        req.slaTier === "critical"
                          ? "rt-badge--danger"
                          : req.slaTier === "warning"
                            ? "rt-badge--warning"
                            : req.status === "APPROVED"
                              ? "rt-badge--success"
                              : req.status === "REJECTED"
                                ? "rt-badge--neutral"
                                : "rt-badge--primary",
                      ].join(" ")}
                    >
                      {req.slaTier === "critical" ? <AlertTriangle size={10} className="inline mr-1" /> : null}
                      {req.slaLabel}
                    </span>
                  </td>
                  <td className="p-4 font-medium">{req.managerName}</td>
                  <td className="p-4">
                    <div>{req.employeeName}</div>
                    <div className="text-xs text-[rgb(var(--muted))]">{req.projectCode}</div>
                  </td>
                  <td className="p-4">
                    <span className="inline-flex items-center gap-1">
                      <Clock size={12} /> {req.extensionDate}
                    </span>
                  </td>
                  <td className="p-4 text-xs text-[rgb(var(--muted))] max-w-xs">{req.reason || "—"}</td>
                  <td className="p-4 text-right">
                    {busyId === req.id ? (
                      <Loader2 className="animate-spin inline" size={18} />
                    ) : req.status === "PENDING" ? (
                      <div className="flex justify-end gap-1">
                        <button type="button" className="rt-btn-ghost p-2 text-red-500" onClick={() => handleAction(req.id, "REJECTED")}>
                          <XCircle size={16} />
                        </button>
                        <button type="button" className="rt-btn-ghost p-2 text-[rgb(var(--success))]" onClick={() => handleAction(req.id, "APPROVED")}>
                          <CheckCircle2 size={16} />
                        </button>
                      </div>
                    ) : (
                      <span className="rt-badge rt-badge--neutral">{req.status}</span>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && !sla.enriched.length ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-[rgb(var(--muted))]">
                    No extension requests.
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
