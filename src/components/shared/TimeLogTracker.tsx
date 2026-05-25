// @ts-nocheck
import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Clock, Plus, Loader2, AlertCircle, Trash2, X } from "lucide-react";
import { fetchTimeLogs, addTimeLog, normalizeTimeLogs } from "../../api/timelogs";
import { fetchProjects, fetchSelectedProjects, normalizeProjects } from "../../api/projects";
import ProjectTimeAlignmentPanel from "./ProjectTimeAlignmentPanel";
import { useMe } from "../../hooks/queries/useAuth";
import Toast from "../shared/Toast";
import ModalOverlay from "./ModalOverlay";

export default function TimeLogTracker() {
  const { data: me, isLoading: meLoading } = useMe();
  const [logs, setLogs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [assignedProjectIds, setAssignedProjectIds] = useState([]);
  const [assignedProjectCodes, setAssignedProjectCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [projectsError, setProjectsError] = useState("");
  const [toast, setToast] = useState(null);
  const [isAdding, setIsAdding] = useState(false);

  const [draft, setDraft] = useState({
    projectId: "",
    logDate: new Date().toISOString().split("T")[0],
    hours: 8,
    description: "",
  });

  const userEmail = String(me?.email ?? "").trim();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    setProjectsError("");
    if (!userEmail) {
      setLogs([]);
      setProjects([]);
      setLoading(false);
      return;
    }
    try {
      const logRaw = await fetchTimeLogs({
        email: userEmail,
        lookbackDays: 90,
      });
      setLogs(normalizeTimeLogs(logRaw));
    } catch (err) {
      setLogs([]);
      setError(err.message || "Failed to load timelogs.");
      setLoading(false);
      return;
    }
    try {
      const [projRaw, assignedRaw] = await Promise.all([
        fetchProjects(),
        fetchSelectedProjects().catch(() => null),
      ]);
      setProjects(normalizeProjects(projRaw));
      const assigned = normalizeProjects(assignedRaw);
      setAssignedProjectIds(assigned.map((p) => String(p.id || "")).filter(Boolean));
      setAssignedProjectCodes(assigned.map((p) => String(p.code || "")).filter(Boolean));
    } catch (err) {
      setProjects([]);
      setAssignedProjectIds([]);
      setAssignedProjectCodes([]);
      setProjectsError(err.message || "Could not load projects.");
    }
    setLoading(false);
  }, [userEmail]);

  useEffect(() => {
    if (meLoading) return;
    loadData();
  }, [meLoading, loadData]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!draft.projectId || !draft.description) {
      setToast({ title: "Missing info", message: "Please select a project and enter a description.", tone: "error" });
      return;
    }
    try {
      const selected = projects.find((p) => String(p.id) === String(draft.projectId));
      await addTimeLog({
        projectId: draft.projectId,
        projectCode: selected?.code || "",
        logDate: draft.logDate,
        hours: Number(draft.hours) || 0,
        description: draft.description,
      });
      setToast({ title: "Success", message: "Time log added." });
      setIsAdding(false);
      loadData();
    } catch (err) {
      setToast({ title: "Failed", message: err.message, tone: "error" });
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1">
          <h2 className="rt-title">Time Tracker</h2>
          <p className="text-sm text-[rgb(var(--muted))] mt-1 max-w-2xl">
            Log and manage your daily effort across projects.
          </p>
        </div>
        <div className="flex w-full shrink-0 sm:w-auto sm:justify-end">
          <button type="button" onClick={() => setIsAdding(true)} className="rt-btn-primary w-full sm:w-auto justify-center">
            <Plus size={18} /> New Entry
          </button>
        </div>
      </header>

      {error ? (
        <div className="rt-panel-subtle p-4 border-red-500/25 text-red-600 dark:text-red-400 flex items-start gap-3">
          <AlertCircle size={20} className="shrink-0" />
          <div className="min-w-0 text-sm">{error}</div>
        </div>
      ) : null}

      {projectsError ? (
        <div className="rt-panel-subtle p-4 border-amber-500/25 bg-amber-500/5 text-[rgb(var(--text))] flex items-start gap-3">
          <AlertCircle size={20} className="shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 text-sm">
            <span className="font-semibold text-amber-800 dark:text-amber-200">Projects: </span>
            <span className="text-[rgb(var(--muted))]">{projectsError}</span>
            <p className="mt-2 text-xs text-[rgb(var(--muted))]">
              Your backend allows{" "}
              <code className="text-[11px] rounded bg-[rgb(var(--surface-2))] px-1">GET /api/v1/project-assigned-to-user</code> more
              often than the full catalog. If the list is empty, no projects are assigned to this account yet.
            </p>
          </div>
        </div>
      ) : null}

      <ProjectTimeAlignmentPanel
        logs={logs}
        assignedProjectIds={assignedProjectIds}
        assignedProjectCodes={assignedProjectCodes}
      />

      <div className="grid grid-cols-1 gap-6">
        <section className="rt-panel">
          <div className="p-6 border-b border-[rgb(var(--border))] flex items-center justify-between">
             <div className="flex items-center gap-3">
                <Clock size={20} className="text-[rgb(var(--primary))]" />
                <h3 className="font-bold">Recent Logs</h3>
             </div>
             <div className="text-xs font-bold text-[rgb(var(--muted))] uppercase tracking-widest">
                {logs.length} Entries
             </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-[rgb(var(--muted))] border-b border-[rgb(var(--border))]">
                <tr>
                  <th className="p-5 font-bold">Date</th>
                  <th className="p-5 font-bold">Project</th>
                  <th className="p-5 font-bold">Hours</th>
                  <th className="p-5 font-bold">Description</th>
                  <th className="p-5 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgb(var(--border))]">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[rgb(var(--surface-2))]/50 transition-colors">
                    <td className="p-5 text-sm font-bold text-[rgb(var(--text))]">{log.logDate}</td>
                    <td className="p-5 text-sm font-medium text-[rgb(var(--muted))]">{log.projectName || "General"}</td>
                    <td className="p-5">
                       <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-[rgb(var(--primary))/0.1] text-[rgb(var(--primary))] text-xs font-black">
                         {log.hours}h
                       </span>
                    </td>
                    <td className="p-5 text-sm text-[rgb(var(--text))] italic opacity-80">{log.description}</td>
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
                {!loading && logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-[rgb(var(--muted))] font-medium">
                       No logs found for this period.
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
        maxWidth="max-w-md"
        zIndex={110}
        title="Log effort"
        subtitle="Record hours against a project."
        footer={
          <>
            <button type="button" onClick={() => setIsAdding(false)} className="rt-btn-ghost">
              Cancel
            </button>
            <button type="submit" form="timelog-add-form" className="rt-btn-primary">
              Save entry
            </button>
          </>
        }
      >
              <form id="timelog-add-form" onSubmit={handleAdd} className="space-y-5 -mt-1">
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
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-[rgb(var(--muted))]">Date</label>
                       <input 
                         type="date" 
                         value={draft.logDate} 
                         onChange={(e) => setDraft(d => ({ ...d, logDate: e.target.value }))}
                         className="rt-input w-full p-3 rounded-xl text-sm font-bold" 
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-[rgb(var(--muted))]">Hours</label>
                       <input 
                         type="number" 
                         step="0.5" 
                         value={draft.hours} 
                         onChange={(e) => setDraft(d => ({ ...d, hours: Number(e.target.value) }))}
                         className="rt-input w-full p-3 rounded-xl text-sm font-bold" 
                       />
                    </div>
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[rgb(var(--muted))]">Description</label>
                    <textarea 
                      rows={3} 
                      value={draft.description}
                      onChange={(e) => setDraft(d => ({ ...d, description: e.target.value }))}
                      className="rt-input w-full p-3 rounded-xl text-sm font-medium leading-relaxed" 
                      placeholder="What did you achieve?"
                    />
                 </div>
              </form>
      </ModalOverlay>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
