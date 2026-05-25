// @ts-nocheck
import React, { useState, useEffect } from "react";
import { Plus, History, Loader2, Calendar, AlertCircle, X, CheckCircle2 } from "lucide-react";
import { fetchAllocationExtensions, createAllocationExtension } from "../../api/allocation-extensions";
import { fetchManagerReportees, normalizeEmployees } from "../../api/employees";
import { fetchProjects } from "../../api/projects";
import Toast from "../shared/Toast";
import ModalOverlay from "../shared/ModalOverlay";

export default function ManagerExtensionsView({ managerId }) {
  const [requests, setRequests] = useState([]);
  const [reportees, setReportees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);

  const [draft, setDraft] = useState({
    employeeId: "",
    projectCode: "",
    extensionDate: new Date().toISOString().split('T')[0],
    reason: ""
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [reqData, repData, projData] = await Promise.all([
        fetchAllocationExtensions(),
        fetchManagerReportees(managerId),
        fetchProjects()
      ]);
      setRequests(reqData.items || reqData.data?.data || []);
      setReportees(normalizeEmployees(repData));
      setProjects(projData.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await createAllocationExtension(draft);
      setToast({ title: "Request Sent", message: "Extension request submitted for HR approval." });
      setIsAdding(false);
      loadData();
    } catch (err) {
      setToast({ title: "Error", message: err.message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="rt-title text-[rgb(var(--text))]">Project Extensions</h2>
          <p className="text-sm text-[rgb(var(--muted))] mt-1 font-medium">Request timeline adjustments for your team's project allocations.</p>
        </div>
        <button onClick={() => setIsAdding(true)} className="rt-btn-primary">
          <Plus size={18} /> Request Extension
        </button>
      </header>

      <section className="rt-panel overflow-hidden">
        <div className="p-6 border-b border-[rgb(var(--border))] flex items-center gap-3">
           <History size={20} className="text-[rgb(var(--primary))]" />
           <h3 className="font-bold text-[rgb(var(--text))]">Recent Requests</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-[rgb(var(--muted))] border-b border-[rgb(var(--border))]">
              <tr>
                <th className="p-6 font-bold">Employee</th>
                <th className="p-6 font-bold">Project</th>
                <th className="p-6 font-bold">Target Date</th>
                <th className="p-6 font-bold">Status</th>
                <th className="p-6 font-bold">HR Feedback</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {requests.map((req) => (
                <tr key={req.id} className="hover:bg-[rgb(var(--surface-2))] transition-colors">
                  <td className="p-6 font-bold text-[rgb(var(--text))]">{req.employeeName}</td>
                  <td className="p-6 text-sm font-medium text-[rgb(var(--primary))] uppercase tracking-tight">{req.projectCode}</td>
                  <td className="p-6">
                     <div className="flex items-center gap-2 text-xs font-black text-[rgb(var(--text))]">
                        <Calendar size={12} className="text-amber-600 dark:text-amber-400" />
                        {req.extensionDate}
                     </div>
                  </td>
                  <td className="p-6">
                     <span className={`rt-badge ${req.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25' : req.status === 'PENDING' ? 'bg-amber-500/10 text-amber-800 dark:text-amber-400 border border-amber-500/25' : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/25'}`}>
                        {req.status}
                     </span>
                  </td>
                  <td className="p-6 text-xs text-[rgb(var(--muted))] italic max-w-[250px] truncate" title={req.hrComments}>
                     {req.hrComments || 'No feedback yet.'}
                  </td>
                </tr>
              ))}
              {loading && (
                <tr>
                  <td colSpan={5} className="p-16 text-center">
                     <Loader2 className="animate-spin mx-auto text-teal-500" size={32} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ModalOverlay
        open={isAdding}
        onClose={() => setIsAdding(false)}
        maxWidth="max-w-lg"
        zIndex={110}
        title="Provision extension"
        subtitle="Request an allocation extension for a team member."
        footer={
          <>
            <button type="button" onClick={() => setIsAdding(false)} className="rt-btn-ghost">
              Cancel
            </button>
            <button type="submit" form="extension-request-form" disabled={busy} className="rt-btn-primary inline-flex items-center gap-2">
              {busy ? <Loader2 className="animate-spin" size={18} /> : null}
              {busy ? "Submitting…" : "Submit request"}
            </button>
          </>
        }
      >
              <form id="extension-request-form" onSubmit={handleSubmit} className="space-y-6 -mt-1">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[rgb(var(--muted))]">Employee</label>
                    <select 
                      value={draft.employeeId} 
                      onChange={(e) => setDraft(d => ({ ...d, employeeId: e.target.value }))}
                      className="rt-input w-full p-3 rounded-xl text-sm font-bold"
                    >
                       <option value="">Select Team Member</option>
                       {reportees.map(e => <option key={e.empId} value={e.empId}>{e.name}</option>)}
                    </select>
                 </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-[rgb(var(--muted))]">Project</label>
                       <select 
                         value={draft.projectCode} 
                         onChange={(e) => setDraft(d => ({ ...d, projectCode: e.target.value }))}
                         className="rt-input w-full p-3 rounded-xl text-sm font-bold"
                       >
                          <option value="">Select Project</option>
                          {projects.map(p => <option key={p.projectCode} value={p.projectCode}>{p.name}</option>)}
                       </select>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-[rgb(var(--muted))]">Target Date</label>
                       <input 
                         type="date" 
                         value={draft.extensionDate} 
                         onChange={(e) => setDraft(d => ({ ...d, extensionDate: e.target.value }))}
                         className="rt-input w-full p-3 rounded-xl text-sm font-bold" 
                       />
                    </div>
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[rgb(var(--muted))]">Justification</label>
                    <textarea 
                      rows={3} 
                      value={draft.reason}
                      onChange={(e) => setDraft(d => ({ ...d, reason: e.target.value }))}
                      className="rt-input w-full p-4 rounded-xl text-sm font-medium leading-relaxed" 
                      placeholder="Why is this extension necessary?"
                    />
                 </div>
              </form>
      </ModalOverlay>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
