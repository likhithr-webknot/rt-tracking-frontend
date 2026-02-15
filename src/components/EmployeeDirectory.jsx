import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Trash2,
  ArrowUpCircle,
  Edit3,
  X,
  CheckCircle2,
  RefreshCw,
  Plus
} from "lucide-react";

function nextBand(band) {
    const ladder = ["B1", "B2", "B3", "B4", "B5L", "B5H", "B6L", "B6H", "B7", "B8", "B9"];
    const idx = ladder.indexOf(band);
    if (idx < 0) return band;
    return ladder[Math.min(idx + 1, ladder.length - 1)];
}

function normalizeEmployees(data) {
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : [];

  return arr.map((e, i) => ({
    id: String(e.employeeId ?? e.id ?? e.empId ?? `EMP_${i}`),
    name: String(e.employeeName ?? e.name ?? e.fullName ?? "Unknown"),
    role: String(e.empRole ?? e.role ?? e.userRole ?? "Employee"),
    designation: String(e.designation ?? e.title ?? e.jobTitle ?? e.empRole ?? ""),
    band: String(e.band ?? e.level ?? "B4"),

    // keep if you need it later; otherwise remove
    submitted: Boolean(e.submitted ?? e.hasSubmitted ?? false),
  }));
}

export default function EmployeeDirectory({ employees, setEmployees }) {
  const [query, setQuery] = useState("");

  const [toast, setToast] = useState(null); // { title: string, message?: string }
  const toastTimerRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [showAddModal, setShowAddModal] = useState(false);
  const [addDraft, setAddDraft] = useState({
    employeeName: "",
    email: "",
    empRole: "Employee",
    designation: "",
    band: "B4",
    stream: "",
    managerId: "",
  });

  function showToast(nextToast) {
    setToast(nextToast);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  }

  async function loadEmployees(signal) {
    setLoadError("");
    setLoading(true);

    try {
      const res = await fetch("/employees/getall", { signal });
      if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);

      const data = await res.json();
      setEmployees(normalizeEmployees(data));
    } catch (err) {
      if (err?.name === "AbortError") return;
      setLoadError(err?.message || "Failed to load employees.");
    } finally {
      setLoading(false);
    }
  }

  async function addEmployeeOnServer(payload) {
    const res = await fetch("/employees/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Add failed: ${res.status} ${res.statusText}`);
    }

    // backend may return the created employee; we don't rely on it
    return true;
  }

  useEffect(() => {
    const controller = new AbortController();
    loadEmployees(controller.signal);
    return () => controller.abort();
  }, []);

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
    if (!q) return employees;
    return employees.filter((e) =>
      e.name.toLowerCase().includes(q) ||
      e.id.toLowerCase().includes(q) ||
      e.role.toLowerCase().includes(q) ||
      e.band.toLowerCase().includes(q) ||
      (e.designation ?? "").toLowerCase().includes(q)
    );
  }, [employees, query]);

  async function promoteEmployee(employeeId) {
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) return;

    const from = emp.band;
    const to = nextBand(emp.band);

    if (to === from) {
      showToast({
        title: "Promotion not possible",
        message: `${emp.name} is already at the highest configured band (${from}).`,
      });
      return;
    }

    // NOTE: you told us add endpoint only. When you confirm promote endpoint,
    // we’ll write promotion to DB too. For now it stays local.
    setEmployees((prev) =>
      prev.map((e) => (e.id === employeeId ? { ...e, band: to } : e))
    );

    showToast({
      title: "Promotion applied",
      message: `${emp.name}: ${from} → ${to}`,
    });
  }

  function removeEmployee(employeeId) {
    // NOTE: same as above—needs a backend delete endpoint to persist.
    setEmployees((prev) => prev.filter((e) => e.id !== employeeId));
    showToast({ title: "Employee removed", message: `Removed ${employeeId}` });
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
      employeeName: "",
      email: "",
      empRole: "Employee",
      designation: "",
      band: "B4",
      stream: "",
      managerId: "",
    });
    setShowAddModal(true);
  }

  function closeAdd() {
    setShowAddModal(false);
  }

  async function submitAdd(e) {
    e.preventDefault();

    const payload = {
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

    try {
      setLoading(true);
      await addEmployeeOnServer(payload);

      showToast({ title: "Employee added", message: `${payload.employeeName} created successfully.` });

      closeAdd();
      await loadEmployees(); // refresh list
    } catch (err) {
      showToast({ title: "Add failed", message: err?.message || "Please try again." });
    } finally {
      setLoading(false);
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
            onClick={() => loadEmployees()}
            disabled={loading}
            className={[
              "inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest border transition-all",
              "border-white/10 text-gray-200 hover:bg-white/5",
              loading ? "opacity-60 cursor-not-allowed" : "",
            ].join(" ")}
            title="Reload employees"
          >
            <RefreshCw size={16} /> {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </header>

      {loadError ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
          Failed to load employees: <span className="font-mono">{loadError}</span>
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

      <div className="bg-[#111] border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl">
        <table className="w-full text-left">
          <thead className="bg-white/[0.02] text-[10px] uppercase tracking-[0.2em] text-gray-500 border-b border-white/5">
            <tr>
              <th className="p-6 font-black">Employee</th>
              <th className="p-6 font-black">Role</th>
              <th className="p-6 font-black">Designation</th>
              <th className="p-6 font-black">Band</th>
              <th className="p-6 text-right font-black px-8">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map((emp) => (
              <tr key={emp.id} className="hover:bg-white/[0.01] transition-colors">
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
                      className="p-2.5 bg-purple-500/10 text-purple-300 hover:bg-purple-500 hover:text-white rounded-xl transition-all border border-purple-500/20"
                      title="Promote"
                    >
                      <ArrowUpCircle size={18} />
                    </button>

                    <button
                      onClick={() => removeEmployee(emp.id)}
                      className="p-2.5 bg-red-500/10 text-red-300 hover:bg-red-500 hover:text-white rounded-xl transition-all border border-red-500/20"
                      title="Remove"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {!loading && filtered.length === 0 ? (
              <tr>
                <td className="p-10 text-center text-gray-500" colSpan={5}>
                  No employees to show.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Purple toast (top-right) */}
      {toast ? (
        <div className="fixed top-6 right-6 z-[80]">
          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-purple-600 px-4 py-3 shadow-2xl text-white">
            <div className="mt-0.5 text-white">
              <CheckCircle2 size={18} />
            </div>
            <div className="min-w-[220px]">
              <div className="text-sm font-black">{toast.title}</div>
              {toast.message ? (
                <div className="text-xs text-white/90 mt-1">{toast.message}</div>
              ) : null}
            </div>
            <button
              onClick={() => setToast(null)}
              className="ml-2 rounded-xl p-1 text-white/90 hover:bg-white/10 hover:text-white transition"
              aria-label="Dismiss notification"
              title="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ) : null}

      {/* Add Employee Modal */}
      {showAddModal ? (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm grid place-items-center p-6 z-[60]">
          <div className="w-full max-w-lg bg-[#111] border border-white/10 rounded-3xl p-6">
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
                    Manager ID
                  </label>
                  <input
                    value={addDraft.managerId}
                    onChange={(e) => setAddDraft((d) => ({ ...d, managerId: e.target.value }))}
                    className="mt-2 w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all"
                    placeholder="e.g., EMP001"
                  />
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
                  disabled={loading}
                  className={[
                    "rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest bg-purple-600 text-white hover:bg-purple-500 transition-all",
                    loading ? "opacity-60 cursor-not-allowed" : "",
                  ].join(" ")}
                >
                  {loading ? "Adding…" : "Add employee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Edit Modal (kept as-is below in your file) */}
      {editingEmployee ? (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm grid place-items-center p-6 z-[60]">
          <div className="w-full max-w-lg bg-[#111] border border-white/10 rounded-3xl p-6">
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