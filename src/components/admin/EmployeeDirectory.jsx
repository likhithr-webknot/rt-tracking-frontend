import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Trash2,
  ArrowUpCircle,
  Edit3,
  X,
  Plus,
  Play,
  Square,
} from "lucide-react";
import Toast from "../shared/Toast.jsx";
import CursorPagination from "../shared/CursorPagination.jsx";
import ConfirmDialog from "../shared/ConfirmDialog.jsx";

import {
  addEmployeeWithManager,
  deleteEmployee,
  fetchManagers,
  normalizeManagers,
  promoteEmployee as promoteEmployeeApi,
  updateEmployee,
} from "../../api/employees.js";

function computeNextEmployeeId(employees) {
  let maxEmp = -1;
  let empWidth = 3;
  let maxNumeric = -1;

  for (const e of employees) {
    const id = String(e?.id ?? "").trim();
    if (!id) continue;

    const empMatch = /^EMP(\d+)$/i.exec(id);
    if (empMatch) {
      const num = Number.parseInt(empMatch[1], 10);
      if (Number.isFinite(num) && num > maxEmp) {
        maxEmp = num;
        empWidth = Math.max(empWidth, empMatch[1].length);
      }
      continue;
    }

    const numericMatch = /^\d+$/.exec(id);
    if (numericMatch) {
      const num = Number.parseInt(id, 10);
      if (Number.isFinite(num) && num > maxNumeric) maxNumeric = num;
    }
  }

  if (maxEmp >= 0) return `EMP${String(maxEmp + 1).padStart(empWidth, "0")}`;
  if (maxNumeric >= 0) return String(maxNumeric + 1);
  return "EMP001";
}

function buildOptionStats(employees, key, { emptyLabel = "Unassigned" } = {}) {
  const map = new Map(); // value -> { count }
  for (const emp of employees) {
    const raw = emp?.[key];
    const value = String(raw ?? "").trim() || emptyLabel;
    const prev = map.get(value) || { count: 0 };
    prev.count += 1;
    map.set(value, prev);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([value, stats]) => ({ value, count: stats.count }));
}

export default function EmployeeDirectory({
  employees,
  setEmployees,
  reloadEmployees,
  employeesLoading,
  employeesError,
  currentEmployeeId,
  pager,
  onSetEmployeeSubmissionWindow,
  globalWindowOpen = false,
}) {
  const [query, setQuery] = useState("");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]); // string[]
  const [roleFilter, setRoleFilter] = useState("all"); // "all" | role value
  const [designationFilter, setDesignationFilter] = useState("all"); // "all" | designation value
  const [bandFilter, setBandFilter] = useState("all"); // "all" | band value

  const [toast, setToast] = useState(null); // { title: string, message?: string }
  const toastTimerRef = useRef(null);

  const [mutating, setMutating] = useState(false);
  const [promotingId, setPromotingId] = useState(null);
  const [windowUpdatingId, setWindowUpdatingId] = useState(null);
  const [pendingBulkDeleteCount, setPendingBulkDeleteCount] = useState(0);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addDraft, setAddDraft] = useState({
    employeeId: "",
    useNextEmployeeId: false,
    employeeName: "",
    email: "",
    empRole: "Employee",
    designation: "",
    band: "B4",
    stream: "",
    managerId: "",
  });
  const [managers, setManagers] = useState([]);
  const [managersLoading, setManagersLoading] = useState(false);
  const [managersError, setManagersError] = useState("");
  const [managerSearch, setManagerSearch] = useState("");

  function showToast(nextToast) {
    setToast(nextToast);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  }

  async function safeReloadEmployees(options = {}) {
    if (!reloadEmployees) return false;
    try {
      await reloadEmployees(options);
      return true;
    } catch {
      return false;
    }
  }

  const [editingEmployeeId, setEditingEmployeeId] = useState(null);
  const editingEmployee = useMemo(
    () => employees.find((e) => e.id === editingEmployeeId) ?? null,
    [employees, editingEmployeeId]
  );

  const [draft, setDraft] = useState({
    name: "",
    role: "Employee",
    designation: "",
    band: "B4",
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return employees.filter((e) => {
      const matchesText = !q
        ? true
        : e.name.toLowerCase().includes(q) ||
          e.id.toLowerCase().includes(q) ||
          e.role.toLowerCase().includes(q) ||
          e.band.toLowerCase().includes(q) ||
          (e.designation ?? "").toLowerCase().includes(q);

      const roleValue = String(e.role ?? "").trim() || "Unassigned";
      const designationValue = String(e.designation ?? "").trim() || "Unassigned";
      const bandValue = String(e.band ?? "").trim() || "Unassigned";

      const roleOk = roleFilter === "all" ? true : roleValue === roleFilter;
      const designationOk = designationFilter === "all" ? true : designationValue === designationFilter;
      const bandOk = bandFilter === "all" ? true : bandValue === bandFilter;

      return matchesText && roleOk && designationOk && bandOk;
    });
  }, [employees, query, roleFilter, designationFilter, bandFilter]);

  const isSelf = useCallback(
    (emp) => Boolean(currentEmployeeId) && String(emp?.id) === String(currentEmployeeId),
    [currentEmployeeId]
  );

  const visibleEmployees = filtered;

  const selectedIdSet = useMemo(() => new Set(selectedEmployeeIds), [selectedEmployeeIds]);
  const filteredIdSet = useMemo(() => new Set(filtered.map((e) => e.id)), [filtered]);
  const allVisibleSelected = useMemo(() => {
    if (visibleEmployees.length === 0) return false;
    for (const emp of visibleEmployees) {
      if (isSelf(emp)) continue;
      if (!selectedIdSet.has(emp.id)) return false;
    }
    return true;
  }, [visibleEmployees, isSelf, selectedIdSet]);

  const deletableSelectedCount = useMemo(() => {
    if (!currentEmployeeId) return selectedEmployeeIds.length;
    return selectedEmployeeIds.filter((id) => String(id) !== String(currentEmployeeId)).length;
  }, [selectedEmployeeIds, currentEmployeeId]);

  const nextEmployeeId = useMemo(() => computeNextEmployeeId(employees), [employees]);
  const roleOptions = useMemo(() => buildOptionStats(employees, "role"), [employees]);
  const designationOptions = useMemo(
    () => buildOptionStats(employees, "designation"),
    [employees]
  );
  const bandOptions = useMemo(() => buildOptionStats(employees, "band"), [employees]);

  async function promoteEmployee(employeeId) {
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) return;
    setPromotingId(employeeId);
    try {
      await promoteEmployeeApi(employeeId);
      await safeReloadEmployees();
      showToast({ title: "Promotion applied", message: `${emp.name} promoted successfully.` });
    } catch (err) {
      showToast({ title: "Promotion failed", message: err?.message || "Please try again." });
    } finally {
      setPromotingId(null);
    }
  }

  async function setEmployeeSubmissionWindow(emp, mode) {
    if (!emp?.id || typeof onSetEmployeeSubmissionWindow !== "function") {
      showToast({ title: "Action unavailable", message: "Employee-level window control is not configured." });
      return;
    }

    const action = String(mode || "").trim().toLowerCase();
    if (action !== "open" && action !== "close") return;

    setWindowUpdatingId(emp.id);
    try {
      await onSetEmployeeSubmissionWindow(emp.id, action);
      showToast({
        title: action === "open" ? "Window opened" : "Window closed",
        message:
          action === "open"
            ? `${emp.name} can now submit.`
            : `${emp.name} can no longer submit.`,
      });
    } catch (err) {
      showToast({
        title: "Update failed",
        message: err?.message || "Please try again.",
      });
    } finally {
      setWindowUpdatingId(null);
    }
  }

  async function removeEmployee(employeeId) {
    if (currentEmployeeId && String(employeeId) === String(currentEmployeeId)) {
      showToast({ title: "Not allowed", message: "You can't delete your own user." });
      return;
    }
    try {
      setMutating(true);
      await deleteEmployee(employeeId);
      const reloaded = await safeReloadEmployees();
      if (!reloaded) {
        setSelectedEmployeeIds((prev) => prev.filter((id) => id !== employeeId));
        setEmployees((prev) => prev.filter((e) => e.id !== employeeId));
      }
      showToast({ title: "Employee removed", message: `Removed ${employeeId}` });
    } catch (err) {
      showToast({ title: "Delete failed", message: err?.message || "Please try again." });
    } finally {
      setMutating(false);
    }
  }

  function toggleRowSelected(employeeId) {
    setSelectedEmployeeIds((prev) => {
      const set = new Set(prev);
      if (set.has(employeeId)) set.delete(employeeId);
      else set.add(employeeId);
      return Array.from(set);
    });
  }

  function toggleSelectAllVisible() {
    setSelectedEmployeeIds((prev) => {
      const set = new Set(prev);
      const shouldSelectAll = !allVisibleSelected;
      if (shouldSelectAll) {
        for (const emp of visibleEmployees) {
          if (isSelf(emp)) continue;
          set.add(emp.id);
        }
      } else {
        for (const emp of visibleEmployees) set.delete(emp.id);
      }
      return Array.from(set);
    });
  }

  function deleteSelected() {
    const ids = selectedEmployeeIds
      .filter((id) => filteredIdSet.has(id) || employees.some((e) => e.id === id))
      .filter((id) => !currentEmployeeId || String(id) !== String(currentEmployeeId));
    if (ids.length === 0) return;
    setPendingBulkDeleteCount(ids.length);
  }

  async function confirmDeleteSelected() {
    const ids = selectedEmployeeIds
      .filter((id) => filteredIdSet.has(id) || employees.some((e) => e.id === id))
      .filter((id) => !currentEmployeeId || String(id) !== String(currentEmployeeId));
    if (ids.length === 0) {
      setPendingBulkDeleteCount(0);
      return;
    }

    try {
      setMutating(true);
      const results = await Promise.allSettled(ids.map((id) => deleteEmployee(id)));
      const successCount = results.filter((r) => r.status === "fulfilled").length;
      const failedCount = results.length - successCount;

      const reloaded = await safeReloadEmployees();
      if (!reloaded && successCount > 0) {
        const succeededIds = new Set(
          results
            .map((r, idx) => ({ r, id: ids[idx] }))
            .filter((x) => x.r.status === "fulfilled")
            .map((x) => x.id)
        );
        setEmployees((prev) => prev.filter((e) => !succeededIds.has(e.id)));
        setSelectedEmployeeIds((prev) => prev.filter((id) => !succeededIds.has(id)));
      }

      if (successCount > 0 && failedCount === 0) {
        showToast({ title: "Employees removed", message: `Removed ${successCount} employee(s).` });
      } else if (successCount > 0) {
        showToast({ title: "Partial delete", message: `Removed ${successCount}, failed ${failedCount}.` });
      } else {
        const firstError = results.find((r) => r.status === "rejected");
        showToast({ title: "Delete failed", message: firstError?.reason?.message || "Please try again." });
      }
    } catch (err) {
      showToast({ title: "Delete failed", message: err?.message || "Please try again." });
    } finally {
      setMutating(false);
      setPendingBulkDeleteCount(0);
    }
  }

  function openEdit(emp) {
    setEditingEmployeeId(emp.id);
    setDraft({
      name: emp.name ?? "",
      role: emp.role ?? "Employee",
      designation: emp.designation ?? "",
      band: emp.band ?? "B4",
    });
  }

  function closeEdit() {
    setEditingEmployeeId(null);
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editingEmployeeId) return;

    const current = employees.find((emp) => String(emp?.id) === String(editingEmployeeId)) || null;
    if (!current) {
      showToast({ title: "Update failed", message: "Employee not found." });
      return;
    }

    const payload = {
      employeeId: String(current.id ?? editingEmployeeId),
      employeeName: draft.name.trim(),
      email: String(current.email ?? "").trim(),
      empRole: draft.role,
      stream: String(current.stream ?? "").trim() || null,
      designation: draft.designation.trim() || null,
      band: draft.band,
      managerId: String(current.managerId ?? "").trim() || null,
      updatedById: currentEmployeeId ? String(currentEmployeeId) : null,
      createdAt: current.createdAt || null,
      updatedAt: new Date().toISOString(),
    };

    try {
      setMutating(true);
      await updateEmployee(editingEmployeeId, payload);
      const reloaded = await safeReloadEmployees();
      if (!reloaded) {
        setEmployees((prev) =>
          prev.map((emp) =>
            emp.id === editingEmployeeId
              ? {
                  ...emp,
                  name: payload.employeeName || emp.name,
                  role: payload.empRole || emp.role,
                  designation: payload.designation || "",
                  band: payload.band || emp.band,
                }
              : emp
          )
        );
      }
      showToast({ title: "Employee updated", message: payload.employeeName || String(editingEmployeeId) });
      closeEdit();
    } catch (err) {
      showToast({ title: "Update failed", message: err?.message || "Please try again." });
    } finally {
      setMutating(false);
    }
  }

  function openAdd() {
    setAddDraft({
      employeeId: "",
      useNextEmployeeId: false,
      employeeName: "",
      email: "",
      empRole: "Employee",
      designation: "",
      band: "B4",
      stream: "",
      managerId: "",
    });
    setManagersError("");
    setManagerSearch("");
    setShowAddModal(true);
  }

  function closeAdd() {
    setShowAddModal(false);
  }

  useEffect(() => {
    if (!showAddModal) return;
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      setManagersError("");
      setManagersLoading(true);
      try {
        const data = await fetchManagers({ signal: controller.signal });
        const list = normalizeManagers(data)
          .filter((m) => String(m?.id || "").trim())
          .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
        if (!mounted) return;
        setManagers(list);
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!mounted) return;
        setManagersError(err?.message || "Failed to load managers.");
        setManagers([]);
      } finally {
        if (mounted) setManagersLoading(false);
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [showAddModal]);

  const filteredManagers = useMemo(() => {
    const q = String(managerSearch || "").trim().toLowerCase();
    if (!q) return managers;
    return managers.filter((m) => {
      const name = String(m?.name || "").toLowerCase();
      const id = String(m?.id || "").toLowerCase();
      const email = String(m?.email || "").toLowerCase();
      return name.includes(q) || id.includes(q) || email.includes(q);
    });
  }, [managers, managerSearch]);

  async function submitAdd(e) {
    e.preventDefault();

    const employeeIdValue = (addDraft.useNextEmployeeId ? nextEmployeeId : addDraft.employeeId).trim();
    const payload = {
      ...(employeeIdValue ? { employeeId: employeeIdValue } : {}),
      employeeName: addDraft.employeeName.trim(),
      email: addDraft.email.trim(),
      empRole: addDraft.empRole,
      band: addDraft.band.trim(),
      stream: addDraft.stream.trim() || null,
      designation: addDraft.designation.trim() || null,
      managerId: addDraft.managerId.trim() || null,
    };

    if (!payload.employeeName) {
      showToast({ title: "Missing field", message: "Employee name is required." });
      return;
    }

    if (employeeIdValue) {
      const exists = employees.some(
        (emp) => String(emp?.id ?? "").trim().toLowerCase() === employeeIdValue.toLowerCase()
      );
      if (exists) {
        showToast({ title: "Duplicate ID", message: `Employee ID ${employeeIdValue} already exists.` });
        return;
      }
    }

    try {
      setMutating(true);
      await addEmployeeWithManager(payload);

      showToast({ title: "Employee added", message: `${payload.employeeName} created successfully.` });

      closeAdd();
      await safeReloadEmployees(); // refresh list
    } catch (err) {
      showToast({ title: "Add failed", message: err?.message || "Please try again." });
    } finally {
      setMutating(false);
    }
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h2 className="rt-title">
            Personnel Directory
          </h2>
          <p className="text-slate-500 text-sm mt-1">Search and manage employees.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={openAdd}
            className="rt-btn-primary inline-flex items-center gap-2 px-5 py-3 font-black text-xs uppercase tracking-widest"
            title="Add employee"
          >
            <Plus size={16} /> Add Employee
          </button>

          <button
            onClick={deleteSelected}
            disabled={deletableSelectedCount === 0 || mutating}
            className={[
              "inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest border transition-all",
              "border-red-500/20 bg-red-500/10 text-red-200 hover:bg-red-500 hover:text-white",
              deletableSelectedCount === 0 || mutating ? "opacity-60 cursor-not-allowed" : "",
            ].join(" ")}
            title="Delete selected employees"
          >
            <Trash2 size={16} /> Delete Selected{deletableSelectedCount ? ` (${deletableSelectedCount})` : ""}
          </button>
        </div>
      </header>

      {employeesError ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          Failed to load employees: <span className="font-mono">{employeesError}</span>
        </div>
      ) : null}

      <div className="relative max-w-2xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
        <input
          type="text"
          placeholder="Search by name, id, role, designation, band..."
          className="w-full rt-input py-4 pl-12 pr-4 text-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Filters (dropdowns) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-5xl">
        <div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full rt-input py-4 px-4 text-sm"
            title="Filter by role"
          >
            <option value="all">All roles</option>
            {roleOptions.map((opt) => (
              <option key={`role:${opt.value}`} value={opt.value}>
                {opt.value} ({opt.count})
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={designationFilter}
            onChange={(e) => setDesignationFilter(e.target.value)}
            className="w-full rt-input py-4 px-4 text-sm"
            title="Filter by designation"
          >
            <option value="all">All designations</option>
            {designationOptions.map((opt) => (
              <option key={`designation:${opt.value}`} value={opt.value}>
                {opt.value} ({opt.count})
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={bandFilter}
            onChange={(e) => setBandFilter(e.target.value)}
            className="w-full rt-input py-4 px-4 text-sm"
            title="Filter by band"
          >
            <option value="all">All bands</option>
            {bandOptions.map((opt) => (
              <option key={`band:${opt.value}`} value={opt.value}>
                {opt.value} ({opt.count})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rt-panel overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-[0.2em] text-slate-500 border-b border-[rgb(var(--border))]">
            <tr>
              <th className="p-6 font-black w-[64px]">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                  disabled={visibleEmployees.length === 0 || visibleEmployees.every((emp) => isSelf(emp))}
                  className="h-4 w-4 accent-purple-600"
                  aria-label="Select all visible employees"
                  title="Select all visible"
                />
              </th>
              <th className="p-6 font-black">Employee</th>
              <th className="p-6 font-black">Role</th>
              <th className="p-6 font-black">Designation</th>
              <th className="p-6 font-black">Band</th>
              <th className="p-6 font-black">Submission Window</th>
              <th className="p-6 text-right font-black px-8">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--border))]">
            {visibleEmployees.map((emp) => (
              <tr key={emp.id} className="hover:bg-[rgb(var(--surface-2))] transition-colors">
                <td className="p-6">
                  <input
                    type="checkbox"
                    checked={selectedIdSet.has(emp.id)}
                    onChange={() => toggleRowSelected(emp.id)}
                    disabled={isSelf(emp)}
                    className="h-4 w-4 accent-purple-600"
                    aria-label={`Select ${emp.name}`}
                    title="Select"
                  />
                </td>
                <td className="p-6">
                  <div className="font-bold">{emp.name}</div>
                  <div className="text-xs text-slate-500 font-mono mt-1">{emp.id}</div>
                </td>
                <td className="p-6">{emp.role}</td>
                <td className="p-6 text-[rgb(var(--text))]">{emp.designation ?? emp.role}</td>
                <td className="p-6 font-mono text-purple-300">{emp.band}</td>
                <td className="p-6">
                  <div className="space-y-3">
                    {globalWindowOpen ? (
                      emp.submissionWindowForceClosed ? (
                        <span className="inline-flex items-center rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-blue-500 dark:text-blue-300">
                          Closed for this employee
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[rgb(var(--text))]">
                          Open for all
                        </span>
                      )
                    ) : (
                      <span className="inline-flex items-center rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[rgb(var(--muted))]">
                        Closed for all
                      </span>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEmployeeSubmissionWindow(emp, "open")}
                        disabled={windowUpdatingId === emp.id || globalWindowOpen}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1.5 text-[11px] font-bold text-blue-600 dark:text-blue-300 transition-all hover:bg-blue-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        title={globalWindowOpen ? "Cannot start only one employee while global window is already open" : "Open submission window only for this employee"}
                      >
                        <Play size={14} /> Open Only This
                      </button>
                      <button
                        onClick={() => setEmployeeSubmissionWindow(emp, "close")}
                        disabled={windowUpdatingId === emp.id || !globalWindowOpen || emp.submissionWindowForceClosed}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-2.5 py-1.5 text-[11px] font-bold text-[rgb(var(--text))] transition-all hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                        title={globalWindowOpen ? "Close submission only for this employee" : "Global window is closed for all employees"}
                      >
                        <Square size={13} /> Close This
                      </button>
                    </div>
                  </div>
                </td>
                <td className="p-6 text-right px-8">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => openEdit(emp)}
                      className="p-2.5 bg-blue-500/10 text-blue-300 hover:bg-blue-500 hover:text-white rounded-xl transition-all border border-blue-500/20"
                      title="Edit"
                    >
                      <Edit3 size={18} />
                    </button>

                    <button
                      onClick={() => promoteEmployee(emp.id)}
                      disabled={promotingId === emp.id}
                      className="p-2.5 bg-purple-500/10 text-purple-300 hover:bg-purple-500 hover:text-white rounded-xl transition-all border border-purple-500/20"
                      title="Promote"
                    >
                      <ArrowUpCircle size={18} />
                    </button>

                    <button
                      onClick={() => removeEmployee(emp.id)}
                      disabled={isSelf(emp)}
                      className="p-2.5 bg-red-500/10 text-red-300 hover:bg-red-500 hover:text-white rounded-xl transition-all border border-red-500/20"
                      title="Remove"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {!employeesLoading && filtered.length === 0 ? (
              <tr>
                <td className="p-10 text-center text-slate-500" colSpan={7}>
                  No employees to show.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {pager ? (
        <div className="pt-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button
              type="button"
              onClick={pager.onReset}
              disabled={Boolean(pager.loading) || !pager.onReset}
              className={[
                "rt-btn-ghost inline-flex items-center gap-2 px-4 py-2 text-[11px] uppercase tracking-widest transition-all",
                Boolean(pager.loading) || !pager.onReset ? "opacity-50 cursor-not-allowed" : "",
              ].join(" ")}
              title="First page"
            >
              First Page
            </button>
            <CursorPagination
              canPrev={Boolean(pager.canPrev)}
              canNext={Boolean(pager.canNext)}
              onPrev={pager.onPrev}
              onNext={pager.onNext}
              loading={Boolean(pager.loading)}
              label={pager.label}
            />
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingBulkDeleteCount > 0}
        title="Remove Employees"
        message={`Delete ${pendingBulkDeleteCount} employee(s)? This currently removes them from the UI only.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        onCancel={() => setPendingBulkDeleteCount(0)}
        onConfirm={confirmDeleteSelected}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Add Employee Modal */}
      {showAddModal ? (
        <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 z-[60] overflow-y-auto">
          <div className="w-full max-w-lg rt-panel p-4 sm:p-6 my-4 sm:my-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black uppercase tracking-tight">Add Employee</h3>
                <p className="text-gray-500 text-sm mt-1">Creates a new employee record.</p>
              </div>
              <button
                onClick={closeAdd}
                className="p-2 rounded-xl hover:bg-[rgb(var(--surface-2))]"
                aria-label="Close"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

	            <form onSubmit={submitAdd} className="mt-6 space-y-4">
	              <div>
	                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
	                  Employee ID
	                </label>
	                <input
	                  value={addDraft.useNextEmployeeId ? nextEmployeeId : addDraft.employeeId}
	                  onChange={(e) => setAddDraft((d) => ({ ...d, employeeId: e.target.value, useNextEmployeeId: false }))}
	                  disabled={addDraft.useNextEmployeeId}
                    className={[
                      "mt-2 w-full rt-input text-sm font-mono",
                      addDraft.useNextEmployeeId ? "opacity-70 cursor-not-allowed" : "",
                    ].join(" ")}
	                  placeholder={`e.g., ${nextEmployeeId}`}
	                />
	
	                <label className="mt-3 inline-flex items-center gap-3 select-none cursor-pointer">
	                  <input
	                    type="checkbox"
	                    checked={addDraft.useNextEmployeeId}
	                    onChange={(e) =>
	                      setAddDraft((d) => ({
	                        ...d,
	                        useNextEmployeeId: e.target.checked,
	                        employeeId: e.target.checked ? nextEmployeeId : "",
	                      }))
	                    }
	                    className="h-4 w-4 accent-purple-600"
	                  />
                    <span className="text-xs text-[rgb(var(--text))]">
	                    Use next available ID (<span className="font-mono">{nextEmployeeId}</span>)
	                  </span>
	                </label>
	              </div>

	              <div>
	                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
	                  Employee Name *
	                </label>
	                <input
                  value={addDraft.employeeName}
                  onChange={(e) => setAddDraft((d) => ({ ...d, employeeName: e.target.value }))}
                  className="mt-2 rt-input text-sm"
                  placeholder="e.g., Alice Johnson"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                  Email
                </label>
                <input
                  value={addDraft.email}
                  onChange={(e) => setAddDraft((d) => ({ ...d, email: e.target.value }))}
                  className="mt-2 rt-input text-sm"
                  placeholder="name@company.com"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                    Role
                  </label>
                  <select
                    value={addDraft.empRole}
                    onChange={(e) => setAddDraft((d) => ({ ...d, empRole: e.target.value }))}
                    className="mt-2 rt-input text-sm"
                  >
                    <option value="Employee">Employee</option>
                    <option value="Manager">Manager</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                    Band
                  </label>
                  <input
                    value={addDraft.band}
                    onChange={(e) => setAddDraft((d) => ({ ...d, band: e.target.value }))}
                    className="mt-2 rt-input text-sm"
                    placeholder="e.g., B5L"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                  Designation
                </label>
                <input
                  value={addDraft.designation}
                  onChange={(e) => setAddDraft((d) => ({ ...d, designation: e.target.value }))}
                  className="mt-2 rt-input text-sm"
                  placeholder="e.g., Software Engineer"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                    Stream
                  </label>
                  <input
                    value={addDraft.stream}
                    onChange={(e) => setAddDraft((d) => ({ ...d, stream: e.target.value }))}
                    className="mt-2 rt-input text-sm"
                    placeholder="e.g., Engineering"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                    Manager (optional)
                  </label>
                  <input
                    value={managerSearch}
                    onChange={(e) => setManagerSearch(e.target.value)}
                    className="mt-2 rt-input text-sm"
                    placeholder="Search managers by name, id, or email..."
                  />
                  <select
                    value={addDraft.managerId}
                    onChange={(e) => setAddDraft((d) => ({ ...d, managerId: e.target.value }))}
                    disabled={managersLoading}
                    className={[
                      "mt-3 w-full rt-input text-sm",
                      managersLoading ? "opacity-60 cursor-not-allowed" : "",
                    ].join(" ")}
                  >
                    <option value="">No manager</option>
                    {filteredManagers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.id}{m.email ? `, ${m.email}` : ""})
                      </option>
                    ))}
                  </select>
                  {managersLoading ? (
                    <div className="mt-2 text-xs text-gray-500">Loading managers…</div>
                  ) : null}
                  {managersError ? (
                    <div className="mt-2 text-xs text-red-300">
                      {managersError}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeAdd}
                  className="rt-btn-ghost text-xs uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={employeesLoading || mutating}
                  className={[
                    "rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest bg-purple-600 text-white hover:bg-purple-500 transition-all",
                    employeesLoading || mutating ? "opacity-60 cursor-not-allowed" : "",
                  ].join(" ")}
                >
                  {mutating ? "Adding…" : "Add employee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Edit Employee Modal */}
      {editingEmployee ? (
        <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 z-[60] overflow-y-auto">
          <div className="w-full max-w-lg rt-panel p-4 sm:p-6 my-4 sm:my-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black uppercase tracking-tight">Edit Employee</h3>
                <p className="text-gray-500 text-sm mt-1 font-mono">{editingEmployee.id}</p>
              </div>
              <button
                onClick={closeEdit}
                className="p-2 rounded-xl hover:bg-[rgb(var(--surface-2))]"
                aria-label="Close"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={saveEdit} className="mt-6 space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                  Employee ID
                </label>
                <input
                  value={String(editingEmployee.id || "")}
                  readOnly
                  className="mt-2 rt-input text-sm font-mono opacity-70 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                  Employee Name *
                </label>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  className="mt-2 rt-input text-sm"
                  placeholder="e.g., Alice Johnson"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                    Role
                  </label>
                  <select
                    value={draft.role}
                    onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
                    className="mt-2 rt-input text-sm"
                  >
                    <option value="Employee">Employee</option>
                    <option value="Manager">Manager</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                    Band
                  </label>
                  <input
                    value={draft.band}
                    onChange={(e) => setDraft((d) => ({ ...d, band: e.target.value }))}
                    className="mt-2 rt-input text-sm"
                    placeholder="e.g., B5L"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                  Designation
                </label>
                <input
                  value={draft.designation}
                  onChange={(e) => setDraft((d) => ({ ...d, designation: e.target.value }))}
                  className="mt-2 rt-input text-sm"
                  placeholder="e.g., Software Engineer"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeEdit}
                  disabled={mutating}
                  className="rt-btn-ghost text-xs uppercase tracking-widest disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={mutating}
                  className={[
                    "rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest bg-purple-600 text-white hover:bg-purple-500 transition-all",
                    mutating ? "opacity-60 cursor-not-allowed" : "",
                  ].join(" ")}
                >
                  {mutating ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
