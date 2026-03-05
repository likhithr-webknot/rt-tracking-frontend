import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FolderKanban,
  Plus,
  Search,
  Edit3,
  Trash2,
  X,
  UserCheck,
  Users,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  fetchProjects,
  normalizeProjects,
  addProject,
  updateProject,
  deleteProject,
} from "../../api/projects.js";
import ModalOverlay from "../shared/ModalOverlay.jsx";
import ConfirmDialog from "../shared/ConfirmDialog.jsx";
import Toast from "../shared/Toast.jsx";

/* ── helpers ── */
function getManagersList(employees) {
  if (!Array.isArray(employees)) return [];
  return employees
    .filter((e) => {
      const role = String(e?.role || "").trim().toLowerCase();
      return role === "manager" || role === "admin";
    })
    .map((e) => ({
      id: String(e?.id ?? e?.employeeId ?? "").trim(),
      name: String(e?.name ?? e?.employeeName ?? "").trim() || String(e?.email ?? "").trim() || "Unknown",
      email: String(e?.email ?? "").trim(),
    }))
    .filter((m) => m.id);
}

function getAllEmployeesList(employees) {
  if (!Array.isArray(employees)) return [];
  return employees
    .map((e) => ({
      id: String(e?.id ?? e?.employeeId ?? "").trim(),
      name: String(e?.name ?? e?.employeeName ?? "").trim() || String(e?.email ?? "").trim() || "Unknown",
      email: String(e?.email ?? "").trim(),
      role: String(e?.role || "").trim(),
      project: String(e?.project ?? e?.projectName ?? "").trim(),
    }))
    .filter((e) => e.id);
}

export default function ProjectsDirectory({ employees }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedRow, setExpandedRow] = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formManagerId, setFormManagerId] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [toast, setToast] = useState(null);
  const showToast = useCallback((t) => setToast(t), []);

  const managers = useMemo(() => getManagersList(employees), [employees]);
  const allEmps = useMemo(() => getAllEmployeesList(employees), [employees]);

  /* ── load ── */
  const loadProjects = useCallback(async (opts = {}) => {
    setLoading(true);
    setError("");
    try {
      const raw = await fetchProjects(opts);
      setProjects(normalizeProjects(raw));
    } catch (err) {
      if (err?.name === "AbortError") return;
      setError(err?.message || "Failed to load projects.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadProjects({ signal: controller.signal });
    return () => controller.abort();
  }, [loadProjects]);

  /* ── filtered ── */
  const filtered = useMemo(() => {
    let list = projects;
    if (statusFilter === "active") list = list.filter((p) => p.active);
    if (statusFilter === "inactive") list = list.filter((p) => !p.active);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.managerName.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q),
    );
  }, [projects, search, statusFilter]);

  /* ── stats ── */
  const stats = useMemo(() => {
    const active = projects.filter((p) => p.active).length;
    return { total: projects.length, active, inactive: projects.length - active, uniqueManagers: new Set(projects.map((p) => p.managerId).filter(Boolean)).size };
  }, [projects]);

  /* ── employees per project (matched by emp.project field) ── */
  const empsByProject = useMemo(() => {
    const map = new Map();
    for (const p of projects) map.set(p.id, []);
    for (const emp of allEmps) {
      const projField = emp.project.toLowerCase();
      if (!projField) continue;
      for (const p of projects) {
        if (p.name.toLowerCase() === projField || p.id === projField) {
          map.get(p.id)?.push(emp);
        }
      }
    }
    return map;
  }, [projects, allEmps]);

  /* ── auto-generate next sequential project ID ── */
  const nextProjectId = useMemo(() => {
    const numericIds = projects
      .map((p) => {
        const match = String(p.id || "").match(/(\d+)/);
        return match ? Number.parseInt(match[1], 10) : 0;
      })
      .filter(Number.isFinite);
    const max = numericIds.length ? Math.max(...numericIds) : 0;
    return `PRJ-${String(max + 1).padStart(3, "0")}`;
  }, [projects]);

  /* ── form actions ── */
  function openAddForm() {
    setEditingProject(null);
    setFormName("");
    setFormDesc("");
    setFormManagerId("");
    setFormActive(true);
    setFormError("");
    setFormOpen(true);
  }

  function openEditForm(project) {
    setEditingProject(project);
    setFormName(project.name);
    setFormDesc(project.description);
    setFormManagerId(project.managerId);
    setFormActive(project.active);
    setFormError("");
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingProject(null);
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    const name = formName.trim();
    if (!name) { setFormError("Project name is required."); return; }
    if (!formManagerId) { setFormError("Please assign a manager."); return; }

    setFormBusy(true);
    setFormError("");
    try {
      if (editingProject) {
        await updateProject(editingProject.id, { name, description: formDesc.trim(), managerId: formManagerId, active: formActive });
        showToast({ title: "Project updated", message: `${name} has been updated.` });
      } else {
        await addProject({ id: nextProjectId, name, description: formDesc.trim(), managerId: formManagerId });
        showToast({ title: "Project created", message: `${nextProjectId} — ${name} has been added.` });
      }
      closeForm();
      await loadProjects();
    } catch (err) {
      setFormError(err?.message || "Operation failed.");
    } finally {
      setFormBusy(false);
    }
  }

  async function handleToggleActive(project) {
    try {
      await updateProject(project.id, { active: !project.active });
      showToast({ title: project.active ? "Project deactivated" : "Project activated", message: `${project.name} is now ${project.active ? "inactive" : "active"}.` });
      await loadProjects();
    } catch (err) {
      showToast({ title: "Update failed", message: err?.message || "Please try again." });
    }
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    setDeleteBusy(true);
    try {
      await deleteProject(deleteConfirm.id);
      showToast({ title: "Project deleted", message: `${deleteConfirm.name} removed.` });
      setDeleteConfirm(null);
      await loadProjects();
    } catch (err) {
      showToast({ title: "Delete failed", message: err?.message || "Please try again." });
    } finally {
      setDeleteBusy(false);
    }
  }

  const managerNameById = useMemo(() => {
    const map = new Map();
    for (const m of managers) map.set(m.id, m.name);
    return map;
  }, [managers]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* header */}
      <header className="rt-panel p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-9 w-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                <FolderKanban size={18} strokeWidth={1.8} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[rgb(var(--muted))]">Projects</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-[rgb(var(--text))]">Project Directory</h2>
            <p className="text-sm text-[rgb(var(--muted))] mt-1">
              Create and manage projects. Each project is assigned a manager who reviews employee contributions.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <button onClick={() => loadProjects()} className="rt-btn-secondary" title="Refresh">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
            <button onClick={openAddForm} className="rt-btn-primary">
              <Plus size={16} /> Add Project
            </button>
          </div>
        </div>

        {/* stat cards */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total", value: stats.total, color: "blue" },
            { label: "Active", value: stats.active, color: "emerald" },
            { label: "Inactive", value: stats.inactive, color: "red" },
            { label: "Managers", value: stats.uniqueManagers, color: "violet" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">{s.label}</div>
              <div className={`mt-1 text-xl font-bold text-${s.color}-600 dark:text-${s.color}-400`}>{s.value}</div>
            </div>
          ))}
        </div>
      </header>

      {/* search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects…"
            className="rt-input pl-10 w-full"
          />
        </div>
        <div className="flex items-center gap-2">
          {["all", "active", "inactive"].map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={[
                "px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all border",
                statusFilter === f
                  ? "bg-[rgb(var(--primary)/.1)] text-[rgb(var(--primary))] border-[rgb(var(--primary)/.3)]"
                  : "bg-[rgb(var(--surface))] text-[rgb(var(--muted))] border-[rgb(var(--border))] hover:text-[rgb(var(--text))]",
              ].join(" ")}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* error */}
      {error && (
        <div className="rt-panel p-4 border-l-4 border-red-500 bg-red-500/5 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* table */}
      <section className="rt-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-[rgb(var(--muted))] border-b border-[rgb(var(--border))]">
              <tr>
                <th className="py-3 px-3 font-semibold w-8"></th>
                <th className="py-3 px-4 font-semibold">Project</th>
                <th className="py-3 px-4 font-semibold">Description</th>
                <th className="py-3 px-4 font-semibold">Manager</th>
                <th className="py-3 px-4 font-semibold">Members</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {loading && !projects.length ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[rgb(var(--muted))]">
                    <RefreshCw size={20} className="animate-spin inline-block mr-2" />
                    Loading projects…
                  </td>
                </tr>
              ) : !filtered.length ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[rgb(var(--muted))]">
                    <FolderKanban size={32} className="inline-block mb-2 opacity-40" />
                    <div className="text-sm">
                      {search || statusFilter !== "all" ? "No projects match your filters." : "No projects yet. Click Add Project to get started."}
                    </div>
                  </td>
                </tr>
              ) : (
                <AnimatePresence>
                  {filtered.map((project) => {
                    const members = empsByProject.get(project.id) || [];
                    const isExpanded = expandedRow === project.id;
                    return (
                      <React.Fragment key={project.id}>
                        <motion.tr
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="hover:bg-[rgb(var(--surface-2)/.5)] transition-colors"
                        >
                          <td className="py-3.5 px-3">
                            <button
                              onClick={() => setExpandedRow(isExpanded ? null : project.id)}
                              className="p-1 rounded text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] transition-colors"
                              title={isExpanded ? "Collapse" : "Expand"}
                            >
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center flex-shrink-0">
                                <FolderKanban size={16} />
                              </div>
                              <div className="font-semibold text-sm text-[rgb(var(--text))]">{project.name}</div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-sm text-[rgb(var(--muted))] max-w-[220px] truncate">
                            {project.description || "—"}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <UserCheck size={14} className="text-emerald-500 flex-shrink-0" />
                              <span className="text-sm text-[rgb(var(--text))]">
                                {managerNameById.get(project.managerId) || project.managerName || project.managerId || "Unassigned"}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center gap-1.5 text-sm text-[rgb(var(--text))]">
                              <Users size={13} className="text-[rgb(var(--muted))]" />
                              {members.length}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <button
                              onClick={() => handleToggleActive(project)}
                              className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase px-2 py-0.5 rounded border transition-colors hover:opacity-80 ${
                                project.active
                                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                                  : "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20"
                              }`}
                              title={project.active ? "Click to deactivate" : "Click to activate"}
                            >
                              {project.active ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
                              {project.active ? "Active" : "Inactive"}
                            </button>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => openEditForm(project)}
                                className="p-1.5 rounded-md hover:bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] hover:text-blue-500 transition-colors"
                                title="Edit"
                              >
                                <Edit3 size={15} />
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(project)}
                                className="p-1.5 rounded-md hover:bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] hover:text-red-500 transition-colors"
                                title="Delete"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </motion.tr>

                        {/* expanded row — team members */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="bg-[rgb(var(--surface-2)/.25)] px-4 py-4">
                              <div className="ml-8 max-w-2xl">
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))] mb-2">
                                  Team Members ({members.length})
                                </div>
                                {members.length > 0 ? (
                                  <div className="space-y-1.5">
                                    {members.map((emp) => (
                                      <div key={emp.id} className="flex items-center gap-3 text-sm py-1.5 px-3 rounded-lg hover:bg-[rgb(var(--surface))] transition-colors">
                                        <div className="h-7 w-7 rounded-full bg-[rgb(var(--primary)/.1)] flex items-center justify-center text-xs font-bold text-[rgb(var(--primary))]">
                                          {(emp.name || "?")[0]?.toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <span className="font-medium text-[rgb(var(--text))]">{emp.name}</span>
                                          <span className="ml-2 text-[rgb(var(--muted))] text-xs">{emp.email}</span>
                                        </div>
                                        <span className="text-[10px] uppercase font-semibold text-[rgb(var(--muted))]">{emp.role}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-xs text-[rgb(var(--muted))] py-2">No employees assigned to this project.</div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>

        {/* summary bar */}
        <div className="px-4 py-3 border-t border-[rgb(var(--border))] bg-[rgb(var(--surface-2)/.3)] flex items-center justify-between text-xs text-[rgb(var(--muted))]">
          <span>{filtered.length} project{filtered.length !== 1 ? "s" : ""}{statusFilter !== "all" ? ` (${statusFilter})` : ""}</span>
          <span className="flex items-center gap-1.5">
            <Users size={13} />
            {managers.length} available manager{managers.length !== 1 ? "s" : ""}
          </span>
        </div>
      </section>

      {/* add / edit modal */}
      <AnimatePresence>
        {formOpen && (
          <ModalOverlay onClose={closeForm}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="rt-panel w-full max-w-lg mx-4 overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-[rgb(var(--border))] flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-[rgb(var(--text))]">
                    {editingProject ? "Edit Project" : "Add Project"}
                  </h3>
                  <p className="text-xs text-[rgb(var(--muted))] mt-0.5">
                    {editingProject ? "Update project details and manager assignment." : "Create a new project and assign a manager."}
                  </p>
                </div>
                <button onClick={closeForm} className="p-1.5 rounded-md hover:bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))]">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleFormSubmit} className="px-6 py-5 space-y-4">
                {!editingProject && (
                  <div>
                    <label className="text-xs font-semibold text-[rgb(var(--text))] block mb-1.5">Project ID</label>
                    <div className="rt-input w-full bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] cursor-not-allowed px-3 py-2 text-sm font-mono">
                      {nextProjectId}
                    </div>
                    <p className="text-[10px] text-[rgb(var(--muted))] mt-1">Auto-assigned sequential ID</p>
                  </div>
                )}
                <div>
                  <label className="text-xs font-semibold text-[rgb(var(--text))] block mb-1.5">Project Title *</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. RT Tracking"
                    className="rt-input w-full"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-[rgb(var(--text))] block mb-1.5">Description</label>
                  <textarea
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    placeholder="Brief project description…"
                    rows={3}
                    className="rt-input w-full resize-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-[rgb(var(--text))] block mb-1.5">Assign Manager *</label>
                  <select
                    value={formManagerId}
                    onChange={(e) => setFormManagerId(e.target.value)}
                    className="rt-input w-full"
                  >
                    <option value="">Select a manager…</option>
                    {managers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}{m.email ? ` (${m.email})` : ""}
                      </option>
                    ))}
                  </select>
                  {!managers.length && (
                    <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                      No managers found. Add employees with manager role first.
                    </p>
                  )}
                </div>

                {/* active toggle — only in edit mode */}
                {editingProject && (
                  <div className="flex items-center justify-between py-2 border-t border-[rgb(var(--border)/.5)]">
                    <div>
                      <label className="text-xs font-semibold text-[rgb(var(--text))] block">Status</label>
                      <p className="text-[11px] text-[rgb(var(--muted))] mt-0.5">Inactive projects won't appear in employee selection.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormActive(!formActive)}
                      className={[
                        "relative inline-flex items-center h-7 w-12 rounded-full transition-colors",
                        formActive ? "bg-emerald-500" : "bg-[rgb(var(--border))]",
                      ].join(" ")}
                    >
                      <span className={[
                        "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                        formActive ? "translate-x-6" : "translate-x-1",
                      ].join(" ")} />
                    </button>
                  </div>
                )}

                {formError && (
                  <div className="text-sm text-red-600 dark:text-red-400 bg-red-500/5 rounded-lg px-3 py-2 border border-red-500/20">
                    {formError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button type="button" onClick={closeForm} className="rt-btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" disabled={formBusy} className="rt-btn-primary">
                    {formBusy ? (
                      <><RefreshCw size={14} className="animate-spin" /> Saving…</>
                    ) : editingProject ? (
                      "Update Project"
                    ) : (
                      <><Plus size={14} /> Create Project</>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </ModalOverlay>
        )}
      </AnimatePresence>

      {/* delete confirm */}
      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete Project"
        message={`Are you sure you want to delete "${deleteConfirm?.name}"? This cannot be undone.`}
        confirmLabel={deleteBusy ? "Deleting…" : "Delete"}
        confirmDestructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
