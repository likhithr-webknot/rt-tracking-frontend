// @ts-nocheck
import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, Briefcase, Loader2, Trash2, X } from "lucide-react";
import { fetchAllocations, addAllocation, normalizeAllocations } from "../../api/allocations";
import { fetchEmployees, normalizeEmployees } from "../../api/employees";
import { fetchProjects, normalizeProjects } from "../../api/projects";
import Toast from "../shared/Toast";
import ModalOverlay from "../shared/ModalOverlay";
import AdminPageHeader, { AdminPageShell } from "./AdminPageHeader";

export default function AllocationsPanel() {
  const [allocations, setAllocations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  
  const [draft, setDraft] = useState({
    employeeId: "",
    projectId: "",
    allocationType: "FULLTIME",
    startDate: new Date().toISOString().split('T')[0],
    percentage: 100
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [allocRaw, empRes, projRaw] = await Promise.all([
        fetchAllocations(),
        fetchEmployees({ limit: 1000 }),
        fetchProjects(),
      ]);
      setAllocations(normalizeAllocations(allocRaw));
      setEmployees(normalizeEmployees(empRes));
      setProjects(normalizeProjects(projRaw));
    } catch (err) {
      console.error(err);
      setToast({ title: "Load failed", message: err?.message || "Could not load allocations.", tone: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    try {
      await addAllocation(draft);
      setToast({ title: "Success", message: "Employee allocated successfully." });
      setIsAdding(false);
      loadData();
    } catch (err) {
      setToast({ title: "Error", message: err.message, tone: "error" });
    }
  }

  return (
    <AdminPageShell className="space-y-6">
      <AdminPageHeader
        title="Project Allocations"
        subtitle="Manage employee assignments and utilization across projects."
      >
        <button type="button" onClick={() => setIsAdding(true)} className="rt-btn-primary">
          <Plus size={18} /> Add Allocation
        </button>
      </AdminPageHeader>

      <div className="grid grid-cols-1 gap-6">
        <section className="rt-panel">
          <div className="p-6 border-b border-[rgb(var(--border))] flex items-center justify-between">
             <div className="flex items-center gap-3">
                <Briefcase size={20} className="text-[rgb(var(--primary))]" />
                <h3 className="font-bold">Active Assignments</h3>
             </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-[rgb(var(--muted))] border-b border-[rgb(var(--border))]">
                <tr>
                  <th className="p-5 font-bold">Employee</th>
                  <th className="p-5 font-bold">Project</th>
                  <th className="p-5 font-bold">Type</th>
                  <th className="p-5 font-bold">Utilization</th>
                  <th className="p-5 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--border))]">
                {allocations.map((alloc) => (
                  <tr key={alloc.id} className="hover:bg-[rgb(var(--surface-2))]/50 transition-colors">
                    <td className="p-5">
                       <div className="font-bold text-[rgb(var(--text))]">{alloc.employeeName}</div>
                       <div className="text-[10px] font-mono text-[rgb(var(--muted))]">{alloc.employeeId}</div>
                    </td>
                    <td className="p-5 text-sm font-medium text-[rgb(var(--text))]">{alloc.projectName}</td>
                    <td className="p-5">
                       <span className="rt-badge bg-blue-500/10 text-blue-400 border border-blue-500/20">
                         {alloc.allocationType}
                       </span>
                    </td>
                    <td className="p-5">
                       <div className="w-24 h-1.5 bg-[rgb(var(--surface-3))] rounded-full overflow-hidden">
                          <div className="h-full bg-[rgb(var(--primary))]" style={{ width: `${alloc.percentage}%` }} />
                       </div>
                       <div className="mt-1 text-[10px] font-black text-[rgb(var(--muted))]">{alloc.percentage}%</div>
                    </td>
                    <td className="p-5 text-right">
                       <button className="p-2 text-[rgb(var(--muted))] hover:text-red-500 transition-colors">
                          <Trash2 size={16} />
                       </button>
                    </td>
                  </tr>
                ))}
                {loading && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center">
                       <Loader2 className="animate-spin mx-auto text-[rgb(var(--primary))]" size={24} />
                    </td>
                  </tr>
                )}
                {!loading && allocations.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-[rgb(var(--muted))] font-medium">
                       No active allocations found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <ModalOverlay
        open={isAdding}
        onClose={() => setIsAdding(false)}
        maxWidth="max-w-lg"
        zIndex={110}
        title="Create allocation"
        subtitle="Assign an employee to a project."
        footer={
          <>
            <button type="button" onClick={() => setIsAdding(false)} className="rt-btn-ghost">
              Cancel
            </button>
            <button type="submit" form="allocation-add-form" className="rt-btn-primary">
              Finalize allocation
            </button>
          </>
        }
      >
              <form id="allocation-add-form" onSubmit={handleAdd} className="space-y-6 -mt-1">
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-[rgb(var(--muted))]">Employee</label>
                       <select 
                         value={draft.employeeId} 
                         onChange={(e) => setDraft(d => ({ ...d, employeeId: e.target.value }))}
                         className="rt-input w-full p-3 rounded-xl text-sm font-bold"
                       >
                          <option value="">Select employee</option>
                          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                       </select>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-[rgb(var(--muted))]">Project</label>
                       <select 
                         value={draft.projectId} 
                         onChange={(e) => setDraft(d => ({ ...d, projectId: e.target.value }))}
                         className="rt-input w-full p-3 rounded-xl text-sm font-bold"
                       >
                          <option value="">Select Project</option>
                          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                       </select>
                    </div>
                 </div>
                 
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-[rgb(var(--muted))]">Start Date</label>
                       <input 
                         type="date" 
                         value={draft.startDate} 
                         onChange={(e) => setDraft(d => ({ ...d, startDate: e.target.value }))}
                         className="rt-input w-full p-3 rounded-xl text-sm font-bold" 
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-[rgb(var(--muted))]">Utilization (%)</label>
                       <input 
                         type="number" 
                         value={draft.percentage} 
                         onChange={(e) => setDraft(d => ({ ...d, percentage: Number(e.target.value) }))}
                         className="rt-input w-full p-3 rounded-xl text-sm font-bold" 
                       />
                    </div>
                 </div>

              </form>
      </ModalOverlay>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </AdminPageShell>
  );
}
