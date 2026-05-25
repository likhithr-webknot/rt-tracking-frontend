// @ts-nocheck
import React, { useState, useEffect } from "react";
import { History, CheckCircle2, XCircle, Search, Loader2, User, Clock, AlertTriangle, MoreVertical } from "lucide-react";
import { fetchAllocationExtensions, updateExtensionStatus } from "../../api/allocation-extensions";
import Toast from "../shared/Toast";

export default function AllocationExtensionsDashboard() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const data = await fetchAllocationExtensions({ search });
      setRequests(data.items || data.data?.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(requestId, status, comment = "") {
    setBusyId(requestId);
    try {
      await updateExtensionStatus({
        allocationExtensionRequestId: requestId,
        status,
        hrComments: comment || (status === "APPROVED" ? "Approved by HR" : "Rejected by HR")
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
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h2 className="rt-title text-[rgb(var(--text))]">Extension Requests</h2>
        <p className="text-sm text-[rgb(var(--muted))] mt-2 font-medium">Review and moderate project allocation extension requests from managers.</p>
      </header>

      <div className="rt-panel overflow-hidden">
        <div className="p-6 border-b border-[rgb(var(--border))] flex items-center justify-between gap-4 flex-wrap">
           <div className="relative max-w-sm w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" size={16} />
              <input 
                type="text" 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadData()}
                placeholder="Search by talent or project..." 
                className="rt-input w-full pl-10 pr-4 py-2 text-sm rounded-xl" 
              />
           </div>
           <div className="text-xs font-black text-[rgb(var(--muted))] uppercase tracking-widest">
              {requests.length} Pending Actions
           </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-[rgb(var(--muted))] border-b border-[rgb(var(--border))]">
              <tr>
                <th className="p-6 font-bold">Manager</th>
                <th className="p-6 font-bold">Talent / Project</th>
                <th className="p-6 font-bold">Timeline</th>
                <th className="p-6 font-bold">Reason</th>
                <th className="p-6 text-right font-bold">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {requests.map((req) => (
                <tr key={req.id} className="hover:bg-[rgb(var(--surface-2))] transition-colors group">
                  <td className="p-6">
                     <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 flex items-center justify-center text-[10px] font-black">
                           {req.managerName?.substring(0, 2).toUpperCase() || "M"}
                        </div>
                        <div>
                           <div className="text-sm font-bold text-[rgb(var(--text))]">{req.managerName}</div>
                           <div className="text-[10px] text-[rgb(var(--muted))] font-medium">Requester</div>
                        </div>
                     </div>
                  </td>
                  <td className="p-6">
                     <div className="font-bold text-[rgb(var(--text))]">{req.employeeName}</div>
                     <div className="mt-1 flex items-center gap-2">
                        <span className="text-[10px] font-black text-teal-700 dark:text-teal-400 uppercase tracking-tight px-1.5 py-0.5 rounded bg-teal-500/10 border border-teal-500/25">
                           {req.projectCode}
                        </span>
                        <span className="text-[10px] text-[rgb(var(--muted))] font-medium truncate max-w-[120px]">{req.projectName}</span>
                     </div>
                  </td>
                  <td className="p-6">
                     <div className="flex items-center gap-2 text-xs font-black text-[rgb(var(--text))]">
                        <Clock size={12} className="text-amber-600 dark:text-amber-400" />
                        {req.extensionDate}
                     </div>
                     <div className="text-[10px] text-[rgb(var(--muted))] mt-1 font-medium">Target End Date</div>
                  </td>
                  <td className="p-6">
                     <p className="text-xs text-[rgb(var(--muted))] max-w-[200px] italic line-clamp-2 group-hover:line-clamp-none transition-all">
                        "{req.reason || 'No reason provided.'}"
                     </p>
                  </td>
                  <td className="p-6 text-right">
                     {busyId === req.id ? (
                        <Loader2 className="animate-spin ml-auto text-teal-500" size={20} />
                     ) : req.status === "PENDING" ? (
                        <div className="flex justify-end gap-2">
                           <button 
                             onClick={() => handleAction(req.id, "REJECTED")}
                             className="p-2 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-all"
                             title="Reject Extension"
                           >
                              <XCircle size={18} />
                           </button>
                           <button 
                             onClick={() => handleAction(req.id, "APPROVED")}
                             className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-all"
                             title="Approve Extension"
                           >
                              <CheckCircle2 size={18} />
                           </button>
                        </div>
                     ) : (
                        <span className={`rt-badge ${req.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25' : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/25'}`}>
                           {req.status}
                        </span>
                     )}
                  </td>
                </tr>
              ))}
              {loading && (
                <tr>
                  <td colSpan={5} className="p-16 text-center">
                     <Loader2 className="animate-spin mx-auto text-teal-500 mb-3" size={32} />
                     <div className="text-xs font-black text-[rgb(var(--muted))] uppercase tracking-[0.2em]">Syncing Intelligence...</div>
                  </td>
                </tr>
              )}
              {!loading && requests.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-20 text-center">
                     <History size={48} className="mx-auto text-[rgb(var(--muted))] opacity-50 mb-6" />
                     <h3 className="text-lg font-bold text-[rgb(var(--text))] opacity-70">Clear Queue</h3>
                     <p className="text-xs text-[rgb(var(--muted))] mt-2 uppercase tracking-widest font-black">All extension requests have been processed.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
