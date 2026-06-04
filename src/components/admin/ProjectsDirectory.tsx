// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FolderKanban,
  Plus,
  Search,
  Edit3,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  CalendarOff,
} from "lucide-react";
import ImportExportActions from "../shared/ImportExportActions";
import CursorPagination from "../shared/CursorPagination";
import { fetchProjects, normalizeProjects } from "../../api/projects";
import { fetchEmployees, normalizeEmployees } from "../../api/employees";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../hooks/queries";
import ModalOverlay from "../shared/ModalOverlay";
import Toast from "../shared/Toast";
import {
  catalogRowToApiShape,
  formatProjectDate,
  isProjectListedActive,
  isProjectVisibleToEmployee,
  loadProjectsCatalog,
  mergeProjectCatalogRows,
  parseProjectsCsv,
  parseProjectDate,
  saveProjectsCatalog,
  validateProjectDates,
} from "../../utils/projectsCatalog";

const SEED_CSV_URL = "/sample-csv/projects-directory.csv";
const PAGE_SIZE_OPTIONS = [10, 20, 50];

function rowFromApiProject(p) {
  const desc = String(p?.description || "");
  const pmMatch = /PM:\s*([^·]+)/i.exec(desc);
  const amMatch = /AM:\s*([^·]+)/i.exec(desc);
  return {
    id: String(p.id || p.code || "").trim(),
    name: String(p.name || "").trim(),
    startDate: p.startDate || null,
    endDate: p.endDate || null,
    pm: p.pm || pmMatch?.[1]?.trim() || p.managerName || "",
    am: p.am || amMatch?.[1]?.trim() || "",
    active: p.active !== false,
    updatedAt: p.updatedAt || null,
  };
}

function buildPersonOptions(employees) {
  const seen = new Set();
  const rows = [];
  for (const e of employees || []) {
    const name = String(e?.name ?? e?.employeeName ?? "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const email = String(e?.email ?? "").trim();
    rows.push({
      value: name,
      label: email ? `${name} · ${email}` : name,
    });
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

function matchPersonToOption(raw, options) {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  const lower = text.toLowerCase();
  const exact = options.find((o) => o.value.toLowerCase() === lower);
  if (exact) return exact.value;
  const partial = options.find(
    (o) =>
      o.value.toLowerCase().includes(lower) ||
      lower.includes(o.value.toLowerCase()) ||
      o.label.toLowerCase().includes(lower),
  );
  return partial?.value || "";
}

export default function ProjectsDirectory({ employees: employeesProp, employeesLoading: employeesLoadingProp }) {
  const [catalog, setCatalog] = useState(() => loadProjectsCatalog());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [seeded, setSeeded] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [formName, setFormName] = useState("");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [formPm, setFormPm] = useState("");
  const [formAm, setFormAm] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const [toast, setToast] = useState(null);
  const showToast = useCallback((t) => setToast(t), []);

  const employeesQuery = useQuery({
    queryKey: queryKeys.employees.list({ scope: "projects-directory" }),
    queryFn: async ({ signal }) => normalizeEmployees(await fetchEmployees({ signal })),
    staleTime: 5 * 60_000,
  });
  const personOptions = useMemo(
    () => buildPersonOptions(employeesProp?.length ? employeesProp : employeesQuery.data ?? []),
    [employeesProp, employeesQuery.data],
  );

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects.list({ all: true }),
    queryFn: async ({ signal }) => normalizeProjects(await fetchProjects({ signal })),
    staleTime: 60_000,
  });
  const apiProjects = projectsQuery.data ?? [];
  const apiLoading = projectsQuery.isLoading || projectsQuery.isFetching;

  useEffect(() => {
    if (seeded || catalog.length) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(SEED_CSV_URL);
        if (!res.ok) return;
        const text = await res.text();
        const rows = parseProjectsCsv(text);
        if (!rows.length || cancelled) return;
        const merged = mergeProjectCatalogRows([], rows);
        setCatalog(merged);
        saveProjectsCatalog(merged);
        setSeeded(true);
      } catch {
        /* optional seed */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [catalog.length, seeded]);

  const projects = useMemo(() => {
    const fromApi = apiProjects.map(rowFromApiProject);
    const fromCatalog = catalog.length ? catalog : [];
    const merged = mergeProjectCatalogRows(fromCatalog, fromApi);
    return merged.map((row) => {
      const shaped = catalogRowToApiShape(row);
      return {
        ...shaped,
        listedActive: isProjectListedActive(row),
        employeeVisible: isProjectVisibleToEmployee(row),
      };
    });
  }, [apiProjects, catalog]);

  const persistCatalog = useCallback((rows) => {
    setCatalog(rows);
    saveProjectsCatalog(rows);
  }, []);

  const filtered = useMemo(() => {
    let list = projects;
    if (statusFilter === "active") list = list.filter((p) => p.listedActive);
    if (statusFilter === "inactive") list = list.filter((p) => !p.listedActive);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        String(p.pm || "").toLowerCase().includes(q) ||
        String(p.am || "").toLowerCase().includes(q),
    );
  }, [projects, search, statusFilter]);

  const totalFiltered = filtered.length;
  const maxPage = Math.max(1, Math.ceil(totalFiltered / pageSize) || 1);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, pageSize]);

  useEffect(() => {
    if (page > maxPage) setPage(maxPage);
  }, [page, maxPage]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const rangeLabel = useMemo(() => {
    if (!totalFiltered) return "No projects";
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, totalFiltered);
    return `Showing ${start}–${end} of ${totalFiltered}`;
  }, [page, pageSize, totalFiltered]);

  const stats = useMemo(() => {
    const active = projects.filter((p) => p.listedActive).length;
    const withPm = projects.filter((p) => String(p.pm || "").trim()).length;
    return { total: projects.length, active, inactive: projects.length - active, withPm };
  }, [projects]);

  function openAddForm() {
    setEditingRow(null);
    setFormName("");
    setFormStart("");
    setFormEnd("");
    setFormPm("");
    setFormAm("");
    setFormActive(true);
    setFormError("");
    setFormOpen(true);
  }

  function openEditForm(row) {
    setEditingRow(row);
    setFormName(row.name || "");
    setFormStart(row.startDate || "");
    setFormEnd(row.endDate || "");
    setFormPm(matchPersonToOption(row.pm, personOptions) || "");
    setFormAm(matchPersonToOption(row.am, personOptions) || "");
    setFormActive(row.active !== false);
    setFormError("");
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingRow(null);
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    const name = formName.trim();
    if (!name) {
      setFormError("Project name is required.");
      return;
    }
    if (!formPm.trim()) {
      setFormError("Select a project manager (PM) from the list.");
      return;
    }
    if (!formAm.trim()) {
      setFormError("Select an account manager (AM) from the list.");
      return;
    }
    if (personOptions.length === 0) {
      setFormError("Load employees first — PM and AM must be chosen from the directory.");
      return;
    }
    setFormBusy(true);
    setFormError("");
    const startDate = formStart ? parseProjectDate(formStart) || formStart : null;
    const endDate = formEnd ? parseProjectDate(formEnd) || formEnd : null;
    const dateCheck = validateProjectDates({ startDate, endDate });
    if (!dateCheck.ok) {
      setFormError(dateCheck.errors[0]);
      setFormBusy(false);
      return;
    }
    let active = formActive;
    if (endDate) {
      const end = new Date(endDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      if (end < today) active = false;
    }
    const row = {
      id: editingRow?.id || name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase(),
      name,
      startDate,
      endDate,
      pm: formPm.trim(),
      am: formAm.trim(),
      active,
      updatedAt: new Date().toISOString(),
    };
    const next = editingRow
      ? catalog.map((r) => (r.id === editingRow.id || r.name === editingRow.name ? { ...r, ...row } : r))
      : mergeProjectCatalogRows(catalog, [row]);
    persistCatalog(next);
    showToast({
      title: editingRow ? "Project updated" : "Project added",
      message: `${name} saved to the directory.`,
    });
    closeForm();
    setFormBusy(false);
  }

  function handleToggleActive(project) {
    const listedActive = project.listedActive ?? isProjectListedActive(project);
    const nextActive = !listedActive;
    const todayIso = new Date().toISOString().slice(0, 10);
    const todayStart = new Date(todayIso);
    todayStart.setHours(0, 0, 0, 0);

    let endDate = project.endDate || null;
    let active = nextActive;

    if (!nextActive) {
      active = false;
      const end = endDate ? new Date(endDate) : null;
      if (end && !Number.isNaN(end.getTime())) {
        end.setHours(0, 0, 0, 0);
        if (end < todayStart) {
          endDate = end.toISOString().slice(0, 10);
        } else {
          endDate = todayIso;
        }
      } else {
        endDate = todayIso;
      }
    }

    const next = catalog.map((r) => {
      if (r.id !== project.id && r.name !== project.name) return r;
      return {
        ...r,
        active,
        endDate: endDate ?? r.endDate,
        updatedAt: new Date().toISOString(),
      };
    });
    if (!catalog.find((r) => r.id === project.id || r.name === project.name)) {
      next.push({
        id: project.id,
        name: project.name,
        startDate: project.startDate,
        endDate: endDate ?? project.endDate,
        pm: project.pm,
        am: project.am,
        active,
        updatedAt: new Date().toISOString(),
      });
    }
    persistCatalog(next);
    showToast({
      title: "Status updated",
      message: nextActive
        ? `${project.name} is active.`
        : `${project.name} is inactive${endDate ? ` (end date ${formatProjectDate(endDate)})` : ""}.`,
    });
  }

  function handleEndProject() {
    if (!formEnd.trim()) {
      setFormError("Set an end date before ending the project.");
      return;
    }
    const endDate = parseProjectDate(formEnd) || formEnd;
    const startDate = formStart ? parseProjectDate(formStart) || formStart : null;
    const dateCheck = validateProjectDates({ startDate, endDate });
    if (!dateCheck.ok) {
      setFormError(dateCheck.errors[0]);
      return;
    }
    setFormActive(false);
    setFormError("");
    showToast({
      title: "Ready to end",
      message: "End date validated. Save the project to apply inactive status.",
    });
  }

  function handleImportFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseProjectsCsv(String(reader.result || ""));
        if (!parsed.length) {
          showToast({ title: "Import failed", message: "No rows found in CSV.", tone: "error" });
          return;
        }
        const rows = parsed.map((row) => ({
          ...row,
          pm: matchPersonToOption(row.pm, personOptions) || "",
          am: matchPersonToOption(row.am, personOptions) || "",
        }));
        const merged = mergeProjectCatalogRows(catalog, rows);
        persistCatalog(merged);
        showToast({ title: "Import complete", message: `${rows.length} row(s) merged into the directory.` });
      } catch (err) {
        showToast({ title: "Import failed", message: err?.message || "Could not parse CSV.", tone: "error" });
      }
    };
    reader.readAsText(file);
  }

  function exportCsv() {
    const header = "Project,Strt date,End date,PM,AM\n";
    const lines = projects.map((p) => {
      const start = p.startDate ? formatProjectDate(p.startDate) : "";
      const end = p.endDate ? formatProjectDate(p.endDate) : "";
      const esc = (v) => `"${String(v || "").replace(/"/g, '""')}"`;
      return [esc(p.name), esc(start), esc(end), esc(p.pm), esc(p.am)].join(",");
    });
    const blob = new Blob([header + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "projects-directory.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="rt-panel p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-lg)] bg-[rgb(var(--accent-soft))] text-[rgb(var(--accent))]">
                <FolderKanban size={18} strokeWidth={1.8} />
              </div>
              <span className="rt-kicker">Portfolio</span>
            </div>
            <h2 className="rt-page-title">Projects Directory</h2>
            <p className="text-sm text-[rgb(var(--muted))] mt-1 max-w-2xl">
              Project portfolio with start/end dates and PM / AM ownership — aligned to your operations sheet.
              Import CSV to update the portfolio; edits are stored locally and merged with API data when available.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => projectsQuery.refetch()} className="rt-btn-secondary" title="Refresh API">
              <RefreshCw size={16} className={apiLoading ? "animate-spin" : ""} />
            </button>
            <ImportExportActions
              onExport={exportCsv}
              onFileSelected={handleImportFile}
              importLabel="Import"
              exportLabel="Export"
            />
            <button type="button" onClick={openAddForm} className="rt-btn-primary">
              <Plus size={16} /> Add project
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total", value: stats.total },
            { label: "Active", value: stats.active },
            { label: "Inactive", value: stats.inactive },
            { label: "With PM", value: stats.withPm },
          ].map((s) => (
            <div key={s.label} className="rt-stat">
              <div className="rt-field-label">{s.label}</div>
              <div className="mt-2 text-xl font-bold tabular-nums text-[rgb(var(--text))]">{s.value}</div>
            </div>
          ))}
        </div>
      </header>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search project, PM, or AM…"
            className="rt-input pl-10 w-full"
          />
        </div>
        <div className="rt-segmented">
          {["all", "active", "inactive"].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={[
                "rt-segmented-item capitalize",
                statusFilter === f ? "rt-segmented-item--active" : "",
              ].join(" ")}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="rt-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]">
                {["Project", "Start", "End", "PM", "AM", "Status", ""].map((h) => (
                  <th
                    key={h || "actions"}
                    className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map((p) => (
                <tr key={p.id} className="border-b border-[rgb(var(--border))] hover:bg-[rgb(var(--surface-2)/.5)]">
                  <td className="px-4 py-3 font-medium text-[rgb(var(--text))]">{p.name}</td>
                  <td className="px-4 py-3 text-[rgb(var(--muted))]">{formatProjectDate(p.startDate)}</td>
                  <td className="px-4 py-3 text-[rgb(var(--muted))]">{formatProjectDate(p.endDate)}</td>
                  <td className="px-4 py-3">{p.pm || "—"}</td>
                  <td className="px-4 py-3">{p.am || "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={[
                        "rt-badge uppercase",
                        p.listedActive ? "rt-badge--success" : "rt-badge--neutral",
                      ].join(" ")}
                      title={
                        p.listedActive && !p.employeeVisible
                          ? "Marked active but hidden from employees (outside date range)"
                          : undefined
                      }
                    >
                      {p.listedActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" onClick={() => openEditForm(p)} className="rt-btn-ghost p-2" title="Edit dates, PM/AM, end project">
                        <Edit3 size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(p)}
                        className="rt-btn-ghost p-2"
                        title={p.listedActive ? "Set inactive" : "Set active"}
                      >
                        {p.listedActive ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[rgb(var(--muted))]">
                    No projects match your filters. Import the portfolio CSV to get started.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {totalFiltered > 0 ? (
          <div className="flex flex-col gap-3 border-t border-[rgb(var(--border))] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-[rgb(var(--muted))]">{rangeLabel}</div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <label className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[rgb(var(--muted))]">
                Rows
                <select
                  value={String(pageSize)}
                  onChange={(e) => {
                    const next = Number.parseInt(e.target.value, 10);
                    if (Number.isFinite(next) && next > 0) setPageSize(next);
                  }}
                  className="rt-input h-9 min-h-0 rounded-lg px-2 py-1 text-[11px] font-semibold normal-case text-[rgb(var(--text))]"
                  aria-label="Rows per page"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={String(size)}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => setPage(1)}
                disabled={page <= 1 || apiLoading}
                className={[
                  "rt-btn-ghost rt-btn-sm",
                  page <= 1 || apiLoading ? "opacity-50 cursor-not-allowed" : "",
                ].join(" ")}
              >
                First
              </button>
              <CursorPagination
                canPrev={page > 1}
                canNext={page < maxPage}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => Math.min(maxPage, p + 1))}
                onPageChange={(p) => setPage(p)}
                page={page}
                maxPage={maxPage}
                loading={apiLoading}
                pageInputLabel="Page"
              />
            </div>
          </div>
        ) : null}
      </div>

      <ModalOverlay
        open={formOpen}
        onClose={closeForm}
        title={editingRow ? "Edit project" : "Add project"}
        subtitle="Project directory entry for allocations and time logs."
      >
        <form onSubmit={handleFormSubmit} className="space-y-4 p-1">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Project</label>
            <input
              className="rt-input w-full mt-1"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
              placeholder="e.g. WebTrak"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">Start date</label>
              <input
                type="date"
                className="rt-input w-full mt-1"
                value={formStart}
                onChange={(e) => setFormStart(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">End date</label>
              <input
                type="date"
                className="rt-input w-full mt-1"
                value={formEnd}
                onChange={(e) => setFormEnd(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">PM</label>
              <select
                className="rt-input w-full mt-1"
                value={formPm}
                onChange={(e) => setFormPm(e.target.value)}
                required
                disabled={!personOptions.length}
              >
                <option value="">{employeesLoadingProp || employeesQuery.isLoading ? "Loading people…" : "Select PM…"}</option>
                {personOptions.map((p) => (
                  <option key={`pm-${p.value}`} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">AM</label>
              <select
                className="rt-input w-full mt-1"
                value={formAm}
                onChange={(e) => setFormAm(e.target.value)}
                required
                disabled={!personOptions.length}
              >
                <option value="">{employeesLoadingProp || employeesQuery.isLoading ? "Loading people…" : "Select AM…"}</option>
                {personOptions.map((p) => (
                  <option key={`am-${p.value}`} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-4 py-3 space-y-3">
            <p className="text-xs text-[rgb(var(--muted))]">
              Status is <strong>Active</strong> or <strong>Inactive</strong> only. To end a project, set a valid end date
              (on or after start), then save — past end dates mark the project inactive and hide it from employees.
            </p>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={formActive}
                onChange={(e) => setFormActive(e.target.checked)}
              />
              Active (visible to employees when within start/end dates)
            </label>
            {editingRow ? (
              <button type="button" className="rt-btn-secondary text-xs" onClick={handleEndProject}>
                <CalendarOff size={14} /> Validate end date & mark inactive
              </button>
            ) : null}
          </div>
          {formError ? <p className="text-sm text-red-500">{formError}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="rt-btn-secondary" onClick={closeForm}>
              Cancel
            </button>
            <button type="submit" className="rt-btn-primary" disabled={formBusy}>
              {formBusy ? "Saving…" : "Save project"}
            </button>
          </div>
        </form>
      </ModalOverlay>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
