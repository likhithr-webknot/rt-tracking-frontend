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
import ModalOverlay from "../shared/ModalOverlay.jsx";

import {
  addEmployeeWithManager,
  deleteEmployee,
  promoteEmployee as promoteEmployeeApi,
  updateEmployee,
} from "../../api/employees.js";
import { fetchBands, fetchStreams, fetchBandDesignation, normalizeDirectoryPage } from "../../api/band-stream-directory.js";

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

function toWebtrakDate(value) {
  const raw = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return raw;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function toNumberOrNull(value) {
  const n = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

export default function EmployeeDirectory({
  employees,
  allEmployees = null,
  allEmployeesLoading = false,
  setEmployees,
  reloadEmployees,
  reloadAllEmployees = null,
  employeesLoading,
  employeesError,
  totalEmployeesCount = null,
  directoryTotals = null,
  currentEmployeeId,
  pager,
  onSetEmployeeSubmissionWindow,
  globalWindowOpen = false,
}) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all"); // "all" | role value
  const [designationFilter, setDesignationFilter] = useState("all"); // "all" | designation value
  const [bandFilter, setBandFilter] = useState("all"); // "all" | band value

  const [toast, setToast] = useState(null); // { title: string, message?: string }
  const toastTimerRef = useRef(null);

  const [mutating, setMutating] = useState(false);
  const [promotingId, setPromotingId] = useState(null);
  const [windowUpdatingId, setWindowUpdatingId] = useState(null);
  const [pendingDeleteEmployee, setPendingDeleteEmployee] = useState(null);
  const [pendingPromoteEmployee, setPendingPromoteEmployee] = useState(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addDraft, setAddDraft] = useState({
    employeeName: "",
    email: "",
    empRole: "Employee",
    userType: "FULLTIME",
    workMode: "HYBRID",
    startDate: todayInput(),
    designation: "",
    allowNoDesignationOverride: false,
    band: "B4",
    stream: "",
    salaryBase: "600000",
    salaryVariable: "100000",
    payoutCycle: "MONTHLY",
    stipend: "25000",
    payPerHour: "1000",
    projectDuration: "3 months",
    internshipDuration: "6",
    assetRequired: false,
    assetDetails: "",
  });
  const [addDesignation, setAddDesignation] = useState(null);
  const [addDesignationLoading, setAddDesignationLoading] = useState(false);
  const [directoryBands, setDirectoryBands] = useState([]);
  const [directoryStreams, setDirectoryStreams] = useState([]);

  const searchUniverse = useMemo(() => {
    if (query.trim() && Array.isArray(allEmployees) && allEmployees.length) return allEmployees;
    return employees;
  }, [allEmployees, employees, query]);

  useEffect(() => {
    if (!query.trim()) return;
    if (!reloadAllEmployees) return;
    if (allEmployeesLoading) return;
    if (Array.isArray(allEmployees) && allEmployees.length) return;
    reloadAllEmployees({ silent: true }).catch(() => {});
  }, [allEmployees, allEmployeesLoading, query, reloadAllEmployees]);

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
  const editingEmployee = useMemo(() => {
    if (!editingEmployeeId) return null;
    const findEmp = (list) =>
      Array.isArray(list)
        ? list.find((e) => String(e?.id) === String(editingEmployeeId)) ?? null
        : null;
    return findEmp(employees) ?? findEmp(allEmployees);
  }, [allEmployees, employees, editingEmployeeId]);

  const [draft, setDraft] = useState({
    name: "",
    role: "Employee",
    designation: "",
    band: "B4",
    stream: "",
  });
  const [editDesignation, setEditDesignation] = useState(null);
  const [editDesignationLoading, setEditDesignationLoading] = useState(false);

  const filtered = useMemo(() => {
    const pool = Array.isArray(searchUniverse) ? searchUniverse : [];
    const q = query.trim().toLowerCase();

    return pool.filter((e) => {
      const matchesText = !q
        ? true
        : e.name.toLowerCase().includes(q) ||
          e.id.toLowerCase().includes(q) ||
          e.role.toLowerCase().includes(q) ||
          e.band.toLowerCase().includes(q) ||
          String(e.stream || "").toLowerCase().includes(q) ||
          (e.designation ?? "").toLowerCase().includes(q);

      const roleValue = String(e.role ?? "").trim() || "Unassigned";
      const designationValue = String(e.designation ?? "").trim() || "Unassigned";
      const bandValue = String(e.band ?? "").trim() || "Unassigned";

      const roleOk = roleFilter === "all" ? true : roleValue === roleFilter;
      const designationOk = designationFilter === "all" ? true : designationValue === designationFilter;
      const bandOk = bandFilter === "all" ? true : bandValue === bandFilter;

      return matchesText && roleOk && designationOk && bandOk;
    });
  }, [searchUniverse, query, roleFilter, designationFilter, bandFilter]);

  const directoryStats = useMemo(() => {
    const list = Array.isArray(searchUniverse) ? searchUniverse : [];
    const uniqueBands = new Set(
      list
        .map((emp) => String(emp?.band ?? "").trim())
        .filter(Boolean)
    );
    const roleCounts = list.reduce(
      (acc, emp) => {
        const role = String(emp?.role ?? "").trim().toLowerCase();
        if (role === "manager") acc.managers += 1;
        else if (role === "admin") acc.admins += 1;
        else if (role === "employee") acc.employees += 1;
        return acc;
      },
      { managers: 0, admins: 0, employees: 0 }
    );

    return {
      totalEmployees: list.length,
      totalBands: uniqueBands.size,
      ...roleCounts,
    };
  }, [searchUniverse]);

  const isSelf = useCallback(
    (emp) => Boolean(currentEmployeeId) && String(emp?.id) === String(currentEmployeeId),
    [currentEmployeeId]
  );

  const visibleEmployees = filtered;

  const roleOptions = useMemo(() => buildOptionStats(searchUniverse, "role"), [searchUniverse]);
  const designationOptions = useMemo(
    () => buildOptionStats(searchUniverse, "designation"),
    [searchUniverse]
  );
  const bandOptions = useMemo(() => buildOptionStats(searchUniverse, "band"), [searchUniverse]);
  const bandLabelMap = useMemo(() => {
    const map = new Map();
    for (const row of directoryBands) {
      const code = String(row?.code || "").trim();
      if (!code) continue;
      const label = String(row?.label || row?.name || code).trim() || code;
      map.set(code, label);
    }
    return map;
  }, [directoryBands]);

  const streamLabelMap = useMemo(() => {
    const map = new Map();
    for (const row of directoryStreams) {
      const code = String(row?.code || "").trim();
      if (!code) continue;
      const label = String(row?.label || row?.name || code).trim() || code;
      map.set(code, label);
    }
    return map;
  }, [directoryStreams]);

  const bandSelectOptions = useMemo(() => {
    const fromDirectory = directoryBands
      .filter((row) => Boolean(row?.active))
      .map((row) => ({
        id: row?.id ?? null,
        value: String(row?.code || "").trim(),
        label: String(row?.code || "").trim(),
      }))
      .filter((row) => Boolean(row.value));
    if (fromDirectory.length) return fromDirectory;

    const defaults = ["B1", "B2", "B3", "B4", "B5", "B5H", "B5L", "B6H", "B6L", "B7H", "B7L", "B8"];
    const fromEmployees = searchUniverse
      .map((emp) => String(emp?.band ?? "").trim())
      .filter(Boolean)
      .map((value) => ({ value, label: value }));
    const withIds = fromEmployees.map((row) => ({ ...row, id: null }));
    return Array.from(
      new Map([
        ...defaults.map((value) => [value, { id: null, value, label: value }]),
        ...withIds.map((row) => [row.value, row]),
      ]).values()
    ).sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true }));
  }, [directoryBands, searchUniverse]);

  const streamSelectOptions = useMemo(() => {
    const fromDirectory = directoryStreams
      .filter((row) => Boolean(row?.active))
      .map((row) => ({
        value: String(row?.code || "").trim(),
        label: String(row?.label || row?.name || row?.code || "").trim() || String(row?.code || ""),
      }))
      .filter((row) => Boolean(row.value));
    if (fromDirectory.length) return fromDirectory;

    const fromEmployees = Array.from(
      new Set(
        searchUniverse
          .map((emp) => String(emp?.stream ?? "").trim())
          .filter(Boolean)
      )
    )
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((value) => ({ value, label: value }));
    if (fromEmployees.length > 0) return fromEmployees;
    return [{ value: "Development", label: "Development" }];
  }, [directoryStreams, searchUniverse]);

  const defaultAddBand = useMemo(
    () => (bandSelectOptions.find((opt) => opt.value === "B4")?.value || bandSelectOptions[0]?.value || "B4"),
    [bandSelectOptions]
  );
  const defaultAddStream = useMemo(
    () => streamSelectOptions[0]?.value || "",
    [streamSelectOptions]
  );
  const editRoleIsAdmin = String(draft.role || "").trim().toLowerCase() === "admin";
  const managerCount = useMemo(
    () => {
      const value = directoryTotals?.managerCount;
      if (typeof value === "number" && Number.isFinite(value)) return value;
      return employees.filter((emp) => String(emp?.role || "").trim().toLowerCase() === "manager").length;
    },
    [directoryTotals?.managerCount, employees]
  );
  const adminCount = useMemo(
    () => {
      const value = directoryTotals?.adminCount;
      if (typeof value === "number" && Number.isFinite(value)) return value;
      return directoryStats.admins;
    },
    [directoryStats.admins, directoryTotals?.adminCount]
  );
  const employeeCount = useMemo(
    () => {
      const value = directoryTotals?.employeeCount;
      if (typeof value === "number" && Number.isFinite(value)) return value;
      return directoryStats.employees;
    },
    [directoryStats.employees, directoryTotals?.employeeCount]
  );
  const bandCount = useMemo(
    () => {
      const value = directoryTotals?.bandCount;
      if (typeof value === "number" && Number.isFinite(value)) return value;
      return directoryStats.totalBands;
    },
    [directoryStats.totalBands, directoryTotals?.bandCount]
  );
  const totalEmployeesDisplay = useMemo(() => {
    if (typeof totalEmployeesCount === "number" && Number.isFinite(totalEmployeesCount)) {
      return totalEmployeesCount;
    }
    return directoryStats.totalEmployees;
  }, [directoryStats.totalEmployees, totalEmployeesCount]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    async function loadDirectory(fetcher) {
      const rows = [];
      let cursor = null;
      for (let i = 0; i < 20; i += 1) {
        const data = await fetcher({ limit: 100, cursor, activeOnly: true, signal: controller.signal });
        const page = normalizeDirectoryPage(data);
        rows.push(...page.items);
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }
      return rows;
    }

    (async () => {
      try {
        const [bands, streams] = await Promise.all([
          loadDirectory(fetchBands),
          loadDirectory(fetchStreams),
        ]);
        if (!mounted) return;
        setDirectoryBands(bands);
        setDirectoryStreams(streams);
      } catch {
        if (!mounted) return;
        setDirectoryBands([]);
        setDirectoryStreams([]);
      }
    })();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  // Auto-fetch designation for add modal based on selected band/stream
  useEffect(() => {
    const controller = new AbortController();
    const band = String(addDraft.band || "").trim();
    const stream = String(addDraft.stream || "").trim();
    if (!band || !stream) {
      setAddDesignation(null);
      setAddDesignationLoading(false);
      return () => controller.abort();
    }
    setAddDesignationLoading(true);
    (async () => {
      try {
        const res = await fetchBandDesignation({ band, stream, signal: controller.signal });
        if (!controller.signal.aborted) {
          setAddDesignation(res);
          if (res?.designation) {
            setAddDraft((d) => ({ ...d, designation: res.designation }));
          }
        }
      } catch {
        if (controller.signal.aborted) return;
        setAddDesignation(null);
      } finally {
        if (!controller.signal.aborted) setAddDesignationLoading(false);
      }
    })();
    return () => controller.abort();
  }, [addDraft.band, addDraft.stream]);

  // Auto-fetch designation for edit modal based on selected band/stream
  useEffect(() => {
    if (!editingEmployee) {
      setEditDesignation(null);
      setEditDesignationLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    const band = String(draft.band || "").trim();
    const stream = String(draft.stream || "").trim();
    if (editRoleIsAdmin || !band || !stream) {
      setEditDesignation(null);
      setEditDesignationLoading(false);
      return () => controller.abort();
    }
    setEditDesignationLoading(true);
    (async () => {
      try {
        const res = await fetchBandDesignation({ band, stream, signal: controller.signal });
        if (!controller.signal.aborted) {
          setEditDesignation(res);
          if (res?.designation) {
            setDraft((d) => ({ ...d, designation: res.designation }));
          }
        }
      } catch {
        if (controller.signal.aborted) return;
        setEditDesignation(null);
      } finally {
        if (!controller.signal.aborted) setEditDesignationLoading(false);
      }
    })();
    return () => controller.abort();
  }, [draft.band, draft.stream, editRoleIsAdmin, editingEmployee]);

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

  function requestPromoteEmployee(emp) {
    if (!emp?.id) return;
    setPendingPromoteEmployee({
      id: String(emp.id),
      name: String(emp.name || emp.id),
    });
  }

  async function confirmPromoteEmployee() {
    if (!pendingPromoteEmployee?.id) return;
    try {
      await promoteEmployee(pendingPromoteEmployee.id);
    } finally {
      setPendingPromoteEmployee(null);
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

  function requestRemoveEmployee(emp) {
    const employeeId = String(emp?.id || "").trim();
    if (!employeeId) return;
    if (currentEmployeeId && String(employeeId) === String(currentEmployeeId)) {
      showToast({ title: "Not allowed", message: "You can't delete your own user." });
      return;
    }
    setPendingDeleteEmployee({
      id: employeeId,
      name: String(emp?.name || employeeId),
    });
  }

  async function removeEmployee(employeeId, employeeName) {
    try {
      setMutating(true);
      await deleteEmployee(employeeId);
      const reloaded = await safeReloadEmployees();
      if (!reloaded) {
        setEmployees((prev) => prev.filter((e) => e.id !== employeeId));
      }
      showToast({ title: "Employee removed", message: `Removed ${employeeName || employeeId}` });
    } catch (err) {
      showToast({ title: "Delete failed", message: err?.message || "Please try again." });
    } finally {
      setMutating(false);
    }
  }

  async function confirmDeleteEmployee() {
    if (!pendingDeleteEmployee?.id) return;
    try {
      await removeEmployee(pendingDeleteEmployee.id, pendingDeleteEmployee.name);
    } finally {
      setPendingDeleteEmployee(null);
    }
  }

  function openEdit(emp) {
    setEditingEmployeeId(emp.id);
    setDraft({
      name: emp.name ?? "",
      role: emp.role ?? "Employee",
      designation: emp.designation ?? "",
      band: emp.band ?? "B4",
      stream: emp.stream ?? "",
    });
  }

  function closeEdit() {
    setEditingEmployeeId(null);
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editingEmployeeId) return;

    const current =
      (Array.isArray(employees)
        ? employees.find((emp) => String(emp?.id) === String(editingEmployeeId))
        : null) ||
      (Array.isArray(allEmployees)
        ? allEmployees.find((emp) => String(emp?.id) === String(editingEmployeeId))
        : null) ||
      null;
    if (!current) {
      showToast({ title: "Update failed", message: "Employee not found." });
      return;
    }

    const roleKey = String(draft.role || "").trim().toLowerCase();
    const isAdminRole = roleKey === "admin";

    const payload = {
      employeeId: String(current.id ?? editingEmployeeId),
      employeeName: draft.name.trim(),
      email: String(current.email ?? "").trim(),
      empRole: draft.role,
      stream: isAdminRole ? null : (String(draft.stream ?? current.stream ?? "").trim() || null),
      designation: draft.designation.trim() || null,
      band: isAdminRole ? null : (draft.band || null),
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
                  stream: payload.stream || emp.stream,
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
      employeeName: "",
      email: "",
      empRole: "Employee",
      userType: "FULLTIME",
      workMode: "HYBRID",
      startDate: todayInput(),
      designation: "",
      allowNoDesignationOverride: false,
      band: defaultAddBand,
      stream: defaultAddStream,
      salaryBase: "600000",
      salaryVariable: "100000",
      payoutCycle: "MONTHLY",
      stipend: "25000",
      payPerHour: "1000",
      projectDuration: "3 months",
      internshipDuration: "6",
      assetRequired: false,
      assetDetails: "",
    });
    setShowAddModal(true);
  }

  function closeAdd() {
    setShowAddModal(false);
  }

  async function submitAdd(e) {
    e.preventDefault();

    const designationValue = addDraft.designation.trim();
    const missingDesignation = !designationValue;
    if (missingDesignation && !addDraft.allowNoDesignationOverride) {
      showToast({ title: "Designation required", message: "Select a designation or tick override to proceed." });
      return;
    }
    const selectedBand = bandSelectOptions.find((band) => band.value === addDraft.band) || null;
    const bandId = Number.parseInt(String(selectedBand?.id ?? ""), 10);
    if (!Number.isFinite(bandId) || bandId <= 0) {
      showToast({ title: "Band required", message: "Select a backend band from Band List before adding an employee." });
      return;
    }

    const userType = String(addDraft.userType || "FULLTIME").trim().toUpperCase();
    const salaryDetails = {
      description: designationValue || addDraft.empRole,
    };
    if (userType === "FULLTIME") {
      salaryDetails.base = toNumberOrNull(addDraft.salaryBase);
      salaryDetails.variable = toNumberOrNull(addDraft.salaryVariable);
      salaryDetails.payoutCycle = String(addDraft.payoutCycle || "MONTHLY").trim();
      if (!salaryDetails.base || !salaryDetails.variable || !salaryDetails.payoutCycle) {
        showToast({ title: "Salary required", message: "Full-time employees need base, variable, and payout cycle." });
        return;
      }
    } else if (userType === "INTERN") {
      salaryDetails.stipend = toNumberOrNull(addDraft.stipend);
      if (salaryDetails.stipend == null) {
        showToast({ title: "Stipend required", message: "Interns need a stipend value." });
        return;
      }
    } else if (userType === "FREELANCER") {
      salaryDetails.payPerHour = toNumberOrNull(addDraft.payPerHour);
      salaryDetails.projectDuration = String(addDraft.projectDuration || "").trim();
      if (!salaryDetails.payPerHour) {
        showToast({ title: "Hourly rate required", message: "Freelancers need pay per hour." });
        return;
      }
    }

    const payload = {
      name: addDraft.employeeName.trim(),
      email: addDraft.email.trim(),
      role: addDraft.empRole.trim() || designationValue || "Employee",
      userType,
      workMode: String(addDraft.workMode || "HYBRID").trim().toUpperCase(),
      startDate: toWebtrakDate(addDraft.startDate || todayInput()),
      bandId,
      department: addDraft.stream.trim() || "Development",
      salaryDetails,
      assetRequired: Boolean(addDraft.assetRequired),
      assetDetails: addDraft.assetRequired ? String(addDraft.assetDetails || "").trim() : "",
      ...(userType === "INTERN"
        ? { internshipDuration: Number.parseInt(String(addDraft.internshipDuration || "0"), 10) || 1 }
        : {}),
    };

    if (!payload.name) {
      showToast({ title: "Missing field", message: "Employee name is required." });
      return;
    }

    if (!payload.email) {
      showToast({ title: "Missing field", message: "Email is required." });
      return;
    }

    try {
      setMutating(true);
      await addEmployeeWithManager(payload);

      showToast({ title: "Employee added", message: `${payload.name} created successfully.` });

      closeAdd();
      await safeReloadEmployees(); // refresh list
    } catch (err) {
      showToast({ title: "Add failed", message: err?.message || "Please try again." });
    } finally {
      setMutating(false);
    }
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="rt-title">
            Employee Directory
          </h2>
          <p className="text-[rgb(var(--muted))] text-sm mt-1">Search and manage employees across your organisation.</p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <button
            onClick={openAdd}
            className="rt-btn-primary text-sm"
            title="Add employee"
          >
            <Plus size={15} />Add Employee
          </button>

        </div>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        <div className="rt-panel-subtle rounded-xl px-4 py-3">
          <div className="rt-kicker">Total</div>
          <div className="mt-1 text-xl sm:text-2xl font-bold tabular-nums text-[rgb(var(--text))]">{totalEmployeesDisplay}</div>
        </div>
        <div className="rt-panel-subtle rounded-xl px-4 py-3">
          <div className="rt-kicker">Managers</div>
          <div className="mt-1 text-xl sm:text-2xl font-bold tabular-nums text-[rgb(var(--text))]">{managerCount}</div>
        </div>
        <div className="rt-panel-subtle rounded-xl px-4 py-3">
          <div className="rt-kicker">Filtered</div>
          <div className="mt-1 text-xl sm:text-2xl font-bold tabular-nums text-[rgb(var(--primary))]">{visibleEmployees.length}</div>
        </div>
        <div className="rt-panel-subtle rounded-xl px-4 py-3">
          <div className="rt-kicker">Bands</div>
          <div className="mt-1 text-xl sm:text-2xl font-bold tabular-nums text-[rgb(var(--text))]">{bandCount}</div>
        </div>
        <div className="rt-panel-subtle rounded-xl px-4 py-3">
          <div className="rt-kicker">Admins</div>
          <div className="mt-1 text-xl sm:text-2xl font-bold tabular-nums text-[rgb(var(--text))]">{adminCount}</div>
        </div>
        <div className="rt-panel-subtle rounded-xl px-4 py-3">
          <div className="rt-kicker">Employees</div>
          <div className="mt-1 text-xl sm:text-2xl font-bold tabular-nums text-[rgb(var(--text))]">{employeeCount}</div>
        </div>
      </section>

      {employeesError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-200">
          Failed to load employees: <span className="font-mono">{employeesError}</span>
        </div>
      ) : null}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" size={16} />
          <input
            type="text"
            placeholder="Search by name, id, role, designation, band..."
            className="w-full rt-input py-3 pl-11 pr-4 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-3 gap-2 sm:flex sm:gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full sm:w-auto rt-input py-3 px-3 text-xs sm:text-sm"
            title="Filter by role"
          >
            <option value="all">All roles</option>
            {roleOptions.map((opt) => (
              <option key={`role:${opt.value}`} value={opt.value}>
                {opt.value} ({opt.count})
              </option>
            ))}
          </select>

          <select
            value={designationFilter}
            onChange={(e) => setDesignationFilter(e.target.value)}
            className="w-full sm:w-auto rt-input py-3 px-3 text-xs sm:text-sm"
            title="Filter by designation"
          >
            <option value="all">All designations</option>
            {designationOptions.map((opt) => (
              <option key={`designation:${opt.value}`} value={opt.value}>
                {opt.value} ({opt.count})
              </option>
            ))}
          </select>

          <select
            value={bandFilter}
            onChange={(e) => setBandFilter(e.target.value)}
            className="w-full sm:w-auto rt-input py-3 px-3 text-xs sm:text-sm"
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

      {/* ── Desktop Table View (hidden below lg) ── */}
      <div className="rt-panel overflow-hidden hidden lg:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-[rgb(var(--muted))] border-b border-[rgb(var(--border))]">
              <tr>
                <th className="px-4 py-3 font-semibold">Emp ID</th>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Designation</th>
                <th className="px-4 py-3 font-semibold">Band</th>
                <th className="px-4 py-3 font-semibold">Department</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {visibleEmployees.map((emp) => (
                <tr key={emp.id} className="hover:bg-[rgb(var(--surface-2))]/60 transition-colors group">
                  <td className="px-4 py-3 text-sm font-mono text-[rgb(var(--text))]">{emp.id || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[rgb(var(--text))]">{emp.name}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-[rgb(var(--text))]">{emp.email || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={[
                      "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold border",
                      emp.role === "Admin" ? "bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/20" :
                      emp.role === "Manager" ? "bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/20" :
                      "bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] border-[rgb(var(--border))]"
                    ].join(" ")}>
                      {emp.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-[rgb(var(--text))]">{emp.designation ?? emp.role}</td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-sm font-semibold text-[rgb(var(--text))]">{emp.band}</div>
                    {bandLabelMap.get(emp.band) && bandLabelMap.get(emp.band) !== emp.band ? (
                      <div className="text-[11px] text-[rgb(var(--muted))]">{bandLabelMap.get(emp.band)}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-sm font-semibold text-[rgb(var(--text))]">{emp.stream || "—"}</div>
                    {emp.stream && streamLabelMap.get(emp.stream) && streamLabelMap.get(emp.stream) !== emp.stream ? (
                      <div className="text-[11px] text-[rgb(var(--muted))]">{streamLabelMap.get(emp.stream)}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEdit(emp)}
                        className="p-2 rounded-md text-[rgb(var(--muted))] hover:text-[rgb(var(--primary))] hover:bg-[rgb(var(--primary))]/10 transition-all"
                        title="Edit"
                      >
                        <Edit3 size={16} />
                      </button>

                      <button
                        onClick={() => requestPromoteEmployee(emp)}
                        disabled={promotingId === emp.id}
                        className="p-2 rounded-md text-purple-600 dark:text-purple-300 hover:bg-purple-500/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Promote"
                      >
                        <ArrowUpCircle size={16} />
                      </button>

                      <button
                        onClick={() => requestRemoveEmployee(emp)}
                        disabled={isSelf(emp)}
                        className="p-2 rounded-md text-red-500 hover:bg-red-500/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Remove"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!employeesLoading && filtered.length === 0 ? (
                <tr>
                  <td className="py-16 text-center" colSpan={8}>
                    <div className="flex flex-col items-center gap-3">
                      <Search size={32} className="text-[rgb(var(--muted))]/40" />
                      <p className="text-[rgb(var(--muted))] text-sm">No employees match your filters.</p>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Mobile Card View (visible below lg) ── */}
      <div className="lg:hidden space-y-3">
        {visibleEmployees.map((emp) => (
          <div key={emp.id} className="rt-panel rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-[rgb(var(--text))] truncate">{emp.name}</div>
                <div className="text-[11px] text-[rgb(var(--muted))] truncate">{emp.email || "—"}</div>
              </div>
              <span className={[
                "shrink-0 inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold border",
                emp.role === "Admin" ? "bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/20" :
                emp.role === "Manager" ? "bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/20" :
                "bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] border-[rgb(var(--border))]"
              ].join(" ")}>
                {emp.role}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div>
                <div className="text-[rgb(var(--muted))] uppercase tracking-wider font-medium mb-0.5">Designation</div>
                <div className="text-[rgb(var(--text))] font-medium truncate">{emp.designation ?? emp.role}</div>
              </div>
              <div>
                <div className="text-[rgb(var(--muted))] uppercase tracking-wider font-medium mb-0.5">Band</div>
                <div className="text-[rgb(var(--text))] font-mono font-semibold">{emp.band}</div>
              </div>
              <div>
                <div className="text-[rgb(var(--muted))] uppercase tracking-wider font-medium mb-0.5">Stream</div>
                <div className="text-[rgb(var(--text))] font-mono font-semibold">{emp.stream || "—"}</div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1 border-t border-[rgb(var(--border))]">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setEmployeeSubmissionWindow(emp, "open")}
                  disabled={windowUpdatingId === emp.id || globalWindowOpen}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-300 transition-all hover:bg-emerald-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Play size={10} /> Open
                </button>
                <button
                  onClick={() => setEmployeeSubmissionWindow(emp, "close")}
                  disabled={windowUpdatingId === emp.id || !globalWindowOpen || emp.submissionWindowForceClosed}
                  className="inline-flex items-center gap-1 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-2 py-1 text-[10px] font-semibold text-[rgb(var(--muted))] transition-all disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Square size={9} /> Close
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => openEdit(emp)}
                  className="p-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-300 hover:bg-blue-500 hover:text-white rounded-md transition-all border border-blue-500/20"
                  title="Edit"
                >
                  <Edit3 size={14} />
                </button>
                <button
                  onClick={() => requestPromoteEmployee(emp)}
                  disabled={promotingId === emp.id}
                  className="p-1.5 bg-purple-500/10 text-purple-600 dark:text-purple-300 hover:bg-purple-500 hover:text-white rounded-md transition-all border border-purple-500/20"
                  title="Promote"
                >
                  <ArrowUpCircle size={14} />
                </button>
                <button
                  onClick={() => requestRemoveEmployee(emp)}
                  disabled={isSelf(emp)}
                  className="p-1.5 bg-red-500/10 text-red-600 dark:text-red-300 hover:bg-red-500 hover:text-white rounded-md transition-all border border-red-500/20"
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}

        {!employeesLoading && filtered.length === 0 ? (
          <div className="rt-panel rounded-xl p-10 flex flex-col items-center gap-3">
            <Search size={28} className="text-[rgb(var(--muted))]/40" />
            <p className="text-[rgb(var(--muted))] text-sm">No employees match your filters.</p>
          </div>
        ) : null}
      </div>

      {pager ? (
        <div className="pt-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button
              type="button"
              onClick={pager.onReset}
              disabled={Boolean(pager.loading) || !pager.onReset}
              className={[
                "rt-btn-ghost transition-all text-sm",
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
              onPageChange={pager.onPageChange}
              page={pager.page}
              maxPage={pager.maxPage}
              loading={Boolean(pager.loading)}
              label={pager.label}
            />
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingDeleteEmployee)}
        title="Remove Employee"
        message={
          pendingDeleteEmployee
            ? `Delete ${pendingDeleteEmployee.name}? Warning: once this employee is deleted, they will be deleted from the WebTrak application as well.`
            : "Delete this employee?"
        }
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        busy={mutating}
        onCancel={() => setPendingDeleteEmployee(null)}
        onConfirm={confirmDeleteEmployee}
      />

      <ConfirmDialog
        open={Boolean(pendingPromoteEmployee)}
        title="Promote Employee"
        message={
          pendingPromoteEmployee
            ? `Promote ${pendingPromoteEmployee.name} to the next band?`
            : "Promote this employee?"
        }
        confirmText="Promote"
        cancelText="Cancel"
        confirmVariant="primary"
        busy={Boolean(promotingId)}
        onCancel={() => setPendingPromoteEmployee(null)}
        onConfirm={confirmPromoteEmployee}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />

      
      {showAddModal ? (
        <ModalOverlay
          open={showAddModal}
          onClose={closeAdd}
          maxWidth="max-w-lg"
          zIndex={60}
          header={
            <div>
              <h3 className="font-semibold uppercase tracking-tight">Add Employee</h3>
              <p className="text-gray-500 text-sm mt-1">Creates a new employee record.</p>
            </div>
          }
        >
	            <form onSubmit={submitAdd} className="mt-1 space-y-4">
	              <div>
	                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
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
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  Email
                </label>
                <input
                  value={addDraft.email}
                  onChange={(e) => setAddDraft((d) => ({ ...d, email: e.target.value }))}
                  className="mt-2 rt-input text-sm"
                  placeholder="name@company.com"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    User Type
                  </label>
                  <select
                    value={addDraft.userType}
                    onChange={(e) => setAddDraft((d) => ({ ...d, userType: e.target.value }))}
                    className="mt-2 rt-input text-sm"
                  >
                    <option value="FULLTIME">Full-time</option>
                    <option value="INTERN">Intern</option>
                    <option value="FREELANCER">Freelancer</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    Work Mode
                  </label>
                  <select
                    value={addDraft.workMode}
                    onChange={(e) => setAddDraft((d) => ({ ...d, workMode: e.target.value }))}
                    className="mt-2 rt-input text-sm"
                  >
                    <option value="HYBRID">Hybrid</option>
                    <option value="INOFFICE">In office</option>
                    <option value="REMOTE">Remote</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={addDraft.startDate}
                    onChange={(e) => setAddDraft((d) => ({ ...d, startDate: e.target.value }))}
                    className="mt-2 rt-input text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    Role / Bench Allocation Role
                  </label>
                  <input
                    value={addDraft.empRole}
                    onChange={(e) => setAddDraft((d) => ({ ...d, empRole: e.target.value }))}
                    className="mt-2 rt-input text-sm"
                    placeholder="Employee, PM, DM, Software Engineer"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    Band
                  </label>
                  <select
                    value={addDraft.band}
                    onChange={(e) => setAddDraft((d) => ({ ...d, band: e.target.value }))}
                    className="mt-2 rt-input text-sm"
                  >
                    {bandSelectOptions.map((band) => (
                      <option key={`add-band:${band.value}`} value={band.value}>
                        {band.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  Designation
                </label>
                <input
                  value={addDraft.designation}
                  onChange={(e) => setAddDraft((d) => ({ ...d, designation: e.target.value }))}
                  className="mt-2 rt-input text-sm"
                  placeholder="e.g., Software Engineer"
                />
                <label className="mt-3 inline-flex items-center gap-3 select-none cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addDraft.allowNoDesignationOverride}
                    onChange={(e) => setAddDraft((d) => ({ ...d, allowNoDesignationOverride: e.target.checked }))}
                    className="h-4 w-4 accent-purple-600"
                  />
                  <span className="text-xs text-[rgb(var(--text))]">
                    Override and allow adding without a designation
                  </span>
                </label>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  Department
                </label>
                <select
                  value={addDraft.stream}
                  onChange={(e) => setAddDraft((d) => ({ ...d, stream: e.target.value }))}
                  className="mt-2 rt-input text-sm"
                >
                  {streamSelectOptions.map((stream) => (
                    <option key={`add-stream:${stream.value}`} value={stream.value}>
                      {stream.label}
                    </option>
                  ))}
                </select>
                {addDraft.band && addDraft.stream ? (
                  <div className="mt-2 text-xs text-[rgb(var(--muted))]">
                    {addDesignationLoading
                      ? "Loading designation…"
                      : addDesignation?.designation
                        ? `Designation: ${addDesignation.designation}`
                        : "No designation found for this band/department."}
                  </div>
                ) : null}
              </div>

              {addDraft.userType === "FULLTIME" ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Base</label>
                    <input
                      value={addDraft.salaryBase}
                      onChange={(e) => setAddDraft((d) => ({ ...d, salaryBase: e.target.value }))}
                      className="mt-2 rt-input text-sm"
                      inputMode="decimal"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Variable</label>
                    <input
                      value={addDraft.salaryVariable}
                      onChange={(e) => setAddDraft((d) => ({ ...d, salaryVariable: e.target.value }))}
                      className="mt-2 rt-input text-sm"
                      inputMode="decimal"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Payout Cycle</label>
                    <input
                      value={addDraft.payoutCycle}
                      onChange={(e) => setAddDraft((d) => ({ ...d, payoutCycle: e.target.value }))}
                      className="mt-2 rt-input text-sm"
                    />
                  </div>
                </div>
              ) : null}

              {addDraft.userType === "INTERN" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Stipend</label>
                    <input
                      value={addDraft.stipend}
                      onChange={(e) => setAddDraft((d) => ({ ...d, stipend: e.target.value }))}
                      className="mt-2 rt-input text-sm"
                      inputMode="decimal"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Internship Months</label>
                    <input
                      value={addDraft.internshipDuration}
                      onChange={(e) => setAddDraft((d) => ({ ...d, internshipDuration: e.target.value }))}
                      className="mt-2 rt-input text-sm"
                      inputMode="numeric"
                    />
                  </div>
                </div>
              ) : null}

              {addDraft.userType === "FREELANCER" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Pay Per Hour</label>
                    <input
                      value={addDraft.payPerHour}
                      onChange={(e) => setAddDraft((d) => ({ ...d, payPerHour: e.target.value }))}
                      className="mt-2 rt-input text-sm"
                      inputMode="decimal"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Project Duration</label>
                    <input
                      value={addDraft.projectDuration}
                      onChange={(e) => setAddDraft((d) => ({ ...d, projectDuration: e.target.value }))}
                      className="mt-2 rt-input text-sm"
                    />
                  </div>
                </div>
              ) : null}

              <div className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-3">
                <label className="inline-flex items-center gap-3 select-none cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addDraft.assetRequired}
                    onChange={(e) => setAddDraft((d) => ({ ...d, assetRequired: e.target.checked }))}
                    className="h-4 w-4 accent-purple-600"
                  />
                  <span className="text-xs font-semibold text-[rgb(var(--text))]">Asset required</span>
                </label>
                {addDraft.assetRequired ? (
                  <textarea
                    value={addDraft.assetDetails}
                    onChange={(e) => setAddDraft((d) => ({ ...d, assetDetails: e.target.value }))}
                    className="mt-3 rt-input min-h-[72px] text-sm"
                    placeholder="Laptop, monitor, access card, or other details"
                  />
                ) : null}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeAdd}
                  className="rt-btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={employeesLoading || mutating || (!addDraft.allowNoDesignationOverride && !addDraft.designation.trim())}
                  className={[
                    "rt-btn-primary transition-all",
                    employeesLoading || mutating || (!addDraft.allowNoDesignationOverride && !addDraft.designation.trim())
                      ? "opacity-60 cursor-not-allowed"
                      : "",
                  ].join(" ")}
                >
                  {mutating ? "Adding…" : "Add employee"}
                </button>
              </div>
            </form>
        </ModalOverlay>
      ) : null}

      
      {editingEmployee ? (
        <ModalOverlay
          open={Boolean(editingEmployee)}
          onClose={closeEdit}
          maxWidth="max-w-lg"
          zIndex={60}
          header={
            <div>
              <h3 className="font-semibold uppercase tracking-tight">Edit Employee</h3>
              <p className="text-gray-500 text-sm mt-1 font-mono">{editingEmployee.id}</p>
            </div>
          }
        >

            <form onSubmit={saveEdit} className="mt-6 space-y-4">
              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  Employee ID
                </label>
                <input
                  value={String(editingEmployee.id || "")}
                  readOnly
                  className="mt-2 rt-input text-sm font-mono opacity-70 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
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
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                      Role
                    </label>
                    <select
                      value={draft.role}
                      onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
                      className="mt-2 rt-input text-sm"
                    >
                      <option value="Employee">Employee</option>
                      <option value="Manager">Manager</option>
                      <option value="HR">HR</option>
                      <option value="Finance">Finance</option>
                      <option value="Admin">Admin</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                      Band
                    </label>
                    <select
                      value={draft.band}
                      onChange={(e) => setDraft((d) => ({ ...d, band: e.target.value }))}
                      className="mt-2 rt-input text-sm"
                    >
                      {bandSelectOptions.map((band) => (
                        <option key={`edit-band:${band.value}`} value={band.value}>
                          {band.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                      Stream
                    </label>
                    <select
                      value={draft.stream}
                      onChange={(e) => setDraft((d) => ({ ...d, stream: e.target.value }))}
                      className="mt-2 rt-input text-sm"
                    >
                      <option value="">Unassigned</option>
                      {streamSelectOptions.map((stream) => (
                        <option key={`edit-stream:${stream.value}`} value={stream.value}>
                          {stream.label}
                        </option>
                      ))}
                    </select>
                    {draft.band && draft.stream ? (
                      <div className="mt-2 text-xs text-[rgb(var(--muted))]">
                        {editDesignationLoading
                          ? "Loading designation…"
                          : editDesignation?.designation
                            ? `Designation: ${editDesignation.designation}`
                            : "No designation found for this band/stream."}
                      </div>
                    ) : null}
                  </div>
                </div>

              <div>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
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
                  className="rt-btn-ghost disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={mutating}
                  className={[
                    "rt-btn-primary transition-all",
                    mutating ? "opacity-60 cursor-not-allowed" : "",
                  ].join(" ")}
                >
                  {mutating ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
        </ModalOverlay>
      ) : null}
    </div>
  );
}
