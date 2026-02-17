import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Trash2,
  ArrowUpCircle,
  Edit3,
  X,
  Plus
} from "lucide-react";
import Toast from "./Toast.jsx";
import CursorPagination from "./CursorPagination.jsx";

import {
  addEmployeeWithManager,
  fetchManagers,
  normalizeManagers,
  promoteEmployee as promoteEmployeeApi
} from "../api/employees.js";

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
}) {
  const pageSize = 10;
  const [query, setQuery] = useState("");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]); // string[]
  const [roleFilter, setRoleFilter] = useState("all"); // "all" | role value
  const [designationFilter, setDesignationFilter] = useState("all"); // "all" | designation value
  const [bandFilter, setBandFilter] = useState("all"); // "all" | band value
  const [pageIndex, setPageIndex] = useState(0); // 0-based

  const [toast, setToast] = useState(null); // { title: string, message?: string }
  const toastTimerRef = useRef(null);

  const [mutating, setMutating] = useState(false);
  const [promotingId, setPromotingId] = useState(null);

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

  async function safeReloadEmployees() {
    if (!reloadEmployees) return false;
    try {
      await reloadEmployees();
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

  useEffect(() => {
    setPageIndex(0);
  }, [query, roleFilter, designationFilter, bandFilter]);

  const totalPages = useMemo(() => {
    const total = Math.ceil(filtered.length / pageSize);
    return Math.max(1, total);
  }, [filtered.length]);

  useEffect(() => {
    setPageIndex((prev) => Math.min(prev, totalPages - 1));
  }, [totalPages]);

  const isSelf = useCallback(
    (emp) => Boolean(currentEmployeeId) && String(emp?.id) === String(currentEmployeeId),
    [currentEmployeeId]
  );

  const visibleEmployees = useMemo(() => {
    const start = pageIndex * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageIndex]);

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

  function removeEmployee(employeeId) {
    if (currentEmployeeId && String(employeeId) === String(currentEmployeeId)) {
      showToast({ title: "Not allowed", message: "You can't delete your own user." });
      return;
    }
    // NOTE: same as above—needs a backend delete endpoint to persist.
    setSelectedEmployeeIds((prev) => prev.filter((id) => id !== employeeId));
    setEmployees((prev) => prev.filter((e) => e.id !== employeeId));
    showToast({ title: "Employee removed", message: `Removed ${employeeId}` });
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

    const ok = window.confirm(`Delete ${ids.length} employee(s)? This currently removes them from the UI only.`);
    if (!ok) return;

    const idSet = new Set(ids);
    setEmployees((prev) => prev.filter((e) => !idSet.has(e.id)));
    setSelectedEmployeeIds((prev) => prev.filter((id) => !idSet.has(id)));
    showToast({ title: "Employees removed", message: `Removed ${ids.length} employee(s).` });
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

    // NOTE: needs your update endpoint to persist.
    setEmployees((prev) =>
      prev.map((emp) =>
        emp.id === editingEmployeeId
          ? {
              ...emp,
              name: draft.name.trim() || emp.name,
              role: draft.role,
              designation: draft.designation.trim(),
              band: draft.band,
            }
          : emp
      )
    );

    showToast({ title: "Employee updated", message: "Changes saved (local demo)." });
    closeEdit();
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
          <h2 className="text-3xl font-black uppercase tracking-tighter italic">
            Personnel Directory
          </h2>
          <p className="text-gray-500 text-sm mt-1">Search and manage employees.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-2xl bg-purple-600 text-white px-5 py-3 font-black text-xs uppercase tracking-widest hover:bg-purple-500 transition-all"
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
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
          Failed to load employees: <span className="font-mono">{employeesError}</span>
        </div>
      ) : null}

      <div className="relative max-w-2xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
        <input
          type="text"
          placeholder="Search by name, id, role, designation, band..."
          className="w-full bg-[#111] border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm focus:border-purple-500 outline-none transition-all"
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
            className="w-full bg-[#111] border border-white/10 rounded-2xl py-4 px-4 text-sm focus:border-purple-500 outline-none transition-all"
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
            className="w-full bg-[#111] border border-white/10 rounded-2xl py-4 px-4 text-sm focus:border-purple-500 outline-none transition-all"
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
            className="w-full bg-[#111] border border-white/10 rounded-2xl py-4 px-4 text-sm focus:border-purple-500 outline-none transition-all"
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

      <div className="bg-[#111] border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl">
        <table className="w-full text-left">
          <thead className="bg-white/[0.02] text-[10px] uppercase tracking-[0.2em] text-gray-500 border-b border-white/5">
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
              <th className="p-6 text-right font-black px-8">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {visibleEmployees.map((emp) => (
              <tr key={emp.id} className="hover:bg-white/[0.01] transition-colors">
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
                  <div className="text-xs text-gray-500 font-mono mt-1">{emp.id}</div>
                </td>
                <td className="p-6">{emp.role}</td>
                <td className="p-6 text-gray-200">{emp.designation ?? emp.role}</td>
                <td className="p-6 font-mono text-purple-300">{emp.band}</td>
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
                <td className="p-10 text-center text-gray-500" colSpan={6}>
                  No employees to show.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {filtered.length > pageSize ? (
        <div className="pt-4">
          <CursorPagination
            canPrev={pageIndex > 0}
            canNext={pageIndex < totalPages - 1}
            onPrev={() => setPageIndex((prev) => Math.max(0, prev - 1))}
            onNext={() => setPageIndex((prev) => Math.min(totalPages - 1, prev + 1))}
            loading={employeesLoading}
            label={`Page ${pageIndex + 1} / ${totalPages}`}
          />
        </div>
      ) : null}

      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Add Employee Modal */}
      {showAddModal ? (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 z-[60] overflow-y-auto">
          <div className="w-full max-w-lg bg-[#111] border border-white/10 rounded-3xl p-4 sm:p-6 my-4 sm:my-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black uppercase tracking-tight">Add Employee</h3>
                <p className="text-gray-500 text-sm mt-1">Creates a new employee record.</p>
              </div>
              <button
                onClick={closeAdd}
                className="p-2 rounded-xl hover:bg-white/5"
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
	                    "mt-2 w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all font-mono",
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
	                  <span className="text-xs text-gray-300">
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
                  className="mt-2 w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all"
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
                  className="mt-2 w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all"
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
                    className="mt-2 w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all"
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
                    className="mt-2 w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all"
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
                  className="mt-2 w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all"
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
                    className="mt-2 w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all"
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
                    className="mt-2 w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all"
                    placeholder="Search managers by name, id, or email..."
                  />
                  <select
                    value={addDraft.managerId}
                    onChange={(e) => setAddDraft((d) => ({ ...d, managerId: e.target.value }))}
                    disabled={managersLoading}
                    className={[
                      "mt-3 w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all",
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
                  className="rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest border border-white/10 text-gray-200 hover:bg-white/5 transition-all"
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

      {/* Edit Modal (kept as-is below in your file) */}
      {editingEmployee ? (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 z-[60] overflow-y-auto">
          <div className="w-full max-w-lg bg-[#111] border border-white/10 rounded-3xl p-4 sm:p-6 my-4 sm:my-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black uppercase tracking-tight">Edit Employee</h3>
                <p className="text-gray-500 text-sm mt-1 font-mono">{editingEmployee.id}</p>
              </div>
              <button
                onClick={closeEdit}
                className="p-2 rounded-xl hover:bg-white/5"
                aria-label="Close"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={saveEdit} className="mt-6 space-y-4">
              {/* ... keep your existing edit form fields here ... */}
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
