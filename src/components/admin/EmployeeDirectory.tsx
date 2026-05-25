// @ts-nocheck
import type { ApiOptions } from "../../types/api-options";
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
import Toast from "../shared/Toast";
import SearchField from "../shared/SearchField";
import CursorPagination from "../shared/CursorPagination";
import ConfirmDialog from "../shared/ConfirmDialog";
import AdminPageHeader, { AdminPageShell } from "./AdminPageHeader";
import ModalOverlay from "../shared/ModalOverlay";
import EntityCsvToolbar from "../shared/EntityCsvToolbar";
import { exportEmployeesCsv } from "../../utils/entityCsvExport";

import {
  addEmployee,
  deleteEmployee,
  promoteEmployee as promoteEmployeeApi,
  resolveBandCodeFromDisplay,
  resolveEmployeeEmpId,
  updateEmployee,
  normalizeEmployees,
  resolveRoleStatsBucket,
} from "../../api/employees";
import {
  fetchBands,
  fetchStreams,
  fetchBandDesignation,
  normalizeDirectoryPage,
  collapseRepeatedSegments,
  formatEmployeeBandCode,
  formatEmployeeDesignation,
} from "../../api/band-stream-directory";
import { designationLabelFromRow, fetchDesignations } from "../../api/designations";
import { isWebknotWorkEmail, WEBKNOT_WORK_EMAIL_SUFFIX } from "../../utils/webknotEmail";
import { resolveEmployeeApiId } from "../../utils/employeeId";
import { getAuthHeader } from "../../api/auth";
import { buildApiUrl, friendlyProxyUnreachableMessage, parseResponse } from "../../api/http";
import {
  getPromotionPreview,
  normalizePromotionErrorMessage,
  TECH_MAX_BAND,
  NON_TECH_MAX_BAND,
} from "../../utils/careerPromotion";

/** Small label when account status is not active (so admins see inactive users in the list). */
function RoleBadge({ role }) {
  const r = String(role ?? "Employee").trim() || "Employee";
  const styles =
    r === "Admin"
      ? "bg-amber-500/10 text-amber-800 dark:text-amber-200 border-amber-500/25"
      : r === "Manager"
        ? "bg-blue-500/10 text-blue-800 dark:text-blue-200 border-blue-500/25"
        : "bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] border-[rgb(var(--border))]";
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold border truncate ${styles}`}
    >
      {r}
    </span>
  );
}

function DirectoryCell({ children, mono = false, title = null }) {
  return (
    <div
      className={[
        "max-w-[11rem] truncate text-sm",
        mono ? "font-mono tabular-nums" : "",
        "text-[rgb(var(--text))]",
      ].join(" ")}
      title={title ?? (typeof children === "string" ? children : undefined)}
    >
      {children}
    </div>
  );
}

function employeeBandCode(emp) {
  return formatEmployeeBandCode(emp?.band) || String(emp?.band ?? "").trim() || "—";
}

function employeeDesignation(emp) {
  return (
    formatEmployeeDesignation(emp?.designation, emp?.band) ||
    String(emp?.designation ?? emp?.role ?? "").trim() ||
    "—"
  );
}

function DirectoryStatusBadge({ status }) {
  const st = String(status ?? "").trim().toLowerCase();
  if (!st || st === "active" || st === "enabled" || st === "activated") return null;
  const label = st.replace(/_/g, " ");
  return (
    <span className="ml-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide border border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-100">
      {label}
    </span>
  );
}

function normalizeAllocationRoleRow(raw) {
  if (typeof raw === "string") {
    const v = raw.trim();
    return v ? { value: v, label: v } : null;
  }
  if (!raw || typeof raw !== "object") return null;
  const value = String(raw.code ?? raw.roleCode ?? raw.key ?? raw.name ?? raw.role ?? raw.id ?? "").trim();
  if (!value) return null;
  const label = String(raw.displayName ?? raw.label ?? raw.description ?? raw.name ?? value).trim();
  return { value, label: label || value };
}

async function fetchDesignationHintForBandStream({ band, stream, bandId, signal }) {
  const labels = new Set();
  const numericBandId =
    bandId != null && /^\d+$/.test(String(bandId)) ? String(bandId) : null;

  try {
    const list = numericBandId
      ? await fetchDesignations({
          bandId: numericBandId,
          department: stream,
          stream,
          signal,
        })
      : [];
    for (const row of Array.isArray(list) ? list : []) {
      const label = designationLabelFromRow(row);
      if (label) labels.add(label);
    }
  } catch {
    /* try legacy band designation route */
  }

  if (!labels.size) {
    try {
      const hint = await fetchBandDesignation({ band, stream, signal });
      const primary = String(hint?.designation ?? "").trim();
      if (primary) labels.add(primary);
      const titles = String(hint?.designationTitles ?? "")
        .split(/[,;|]/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const t of titles) labels.add(t);
    } catch {
      /* no designation hints */
    }
  }

  const designations = Array.from(labels);
  return {
    designation: designations[0] || null,
    designations,
    band,
    stream,
  };
}

function buildOptionStats(employees, key, { emptyLabel = "Unassigned" } = {} as ApiOptions) {
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

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function AddFormField({ label, required = false, hint = null, children, className = "" }) {
  return (
    <div className={className}>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
        {label}
        {required ? <span className="text-[rgb(var(--primary))] ml-0.5">*</span> : null}
      </label>
      <div className="mt-2">{children}</div>
      {hint ? <p className="mt-1.5 text-[10px] text-[rgb(var(--muted))] leading-relaxed">{hint}</p> : null}
    </div>
  );
}

function AddFormSection({ title, subtitle = null, children }) {
  return (
    <section className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]/50 p-4 sm:p-5 space-y-4">
      <div className="border-b border-[rgb(var(--border))]/80 pb-3">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-[rgb(var(--text))]">{title}</h4>
        {subtitle ? (
          <p className="mt-1 text-[11px] text-[rgb(var(--muted))] leading-relaxed">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
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
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState(() => new Set());
  const [pendingBulkDelete, setPendingBulkDelete] = useState(null);
  const [pendingSaveEdit, setPendingSaveEdit] = useState(false);
  const [pendingPromoteEmployee, setPendingPromoteEmployee] = useState(null);
  const [promoteBandType, setPromoteBandType] = useState("BOTH");
  const promoteDialogPreview = useMemo(
    () => getPromotionPreview(pendingPromoteEmployee?.band, promoteBandType, null),
    [pendingPromoteEmployee?.band, promoteBandType],
  );

  const promoteConfirmDisabled = promoteDialogPreview.isMaxBand;

  const [showAddModal, setShowAddModal] = useState(false);
  const [addDraft, setAddDraft] = useState({
    employeeName: "",
    email: "",
    empRole: "Employee",
    userType: "FULLTIME",
    workMode: "HYBRID",
    startDate: todayInput(),
    designation: "",
    band: "B4",
    stream: "",
  });
  const [addDesignation, setAddDesignation] = useState(null);
  const [addDesignationOptions, setAddDesignationOptions] = useState([]);
  const [addDesignationLoading, setAddDesignationLoading] = useState(false);
  const [directoryBands, setDirectoryBands] = useState([]);
  const [directoryStreams, setDirectoryStreams] = useState([]);
  const [allocationRoleOptions, setAllocationRoleOptions] = useState([]);

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

  /** After mutations, reload page 1 and refresh the full list used for search (cursor was left on page 2+, new rows never appeared). */
  async function refreshDirectoryAfterMutation() {
    const ok = await safeReloadEmployees({ cursor: null, pageAction: "reset" });
    if (reloadAllEmployees) {
      await reloadAllEmployees({ silent: true }).catch(() => {});
    }
    return ok;
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
    email: "",
    role: "Employee",
    designation: "",
    band: "B4",
    stream: "",
    userType: "FULLTIME",
    workMode: "HYBRID",
    userStatus: "ACTIVE",
    phoneNumber: "",
  });
  const [editDesignation, setEditDesignation] = useState(null);
  const [editDesignationOptions, setEditDesignationOptions] = useState([]);
  const [editDesignationLoading, setEditDesignationLoading] = useState(false);

  const filtered = useMemo(() => {
    const pool = Array.isArray(searchUniverse) ? searchUniverse : [];
    const q = query.trim().toLowerCase();

    return pool.filter((e) => {
      const emailLower = String(e.email ?? "").trim().toLowerCase();
      const matchesText = !q
        ? true
        : e.name.toLowerCase().includes(q) ||
          emailLower.includes(q) ||
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
        const bucket = resolveRoleStatsBucket(emp);
        if (bucket === "manager") acc.managers += 1;
        else if (bucket === "admin") acc.admins += 1;
        else acc.employees += 1;
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
      const label = collapseRepeatedSegments(String(row?.label || row?.name || code).trim()) || code;
      map.set(code, label);
    }
    return map;
  }, [directoryBands]);

  const streamLabelMap = useMemo(() => {
    const map = new Map();
    for (const row of directoryStreams) {
      const code = String(row?.code || "").trim();
      if (!code) continue;
      const label = collapseRepeatedSegments(String(row?.label || row?.name || code).trim()) || code;
      map.set(code, label);
    }
    return map;
  }, [directoryStreams]);

  const bandSelectOptions = useMemo(() => {
    const fromDirectory = directoryBands
      .filter((row) => row?.active !== false)
      .map((row) => {
        const value = String(row?.code ?? row?.band ?? "").trim();
        if (!value) return null;
        const id = row?.id != null && String(row.id).trim() !== "" ? row.id : null;
        const labelExtra = collapseRepeatedSegments(String(row?.label ?? "").trim());
        const displayCode = collapseRepeatedSegments(value);
        const label =
          labelExtra && labelExtra !== displayCode ? `${displayCode} — ${labelExtra}` : displayCode;
        return { id, value: displayCode, label };
      })
      .filter(Boolean);
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
      .filter((row) => row?.active !== false)
      .map((row) => {
        const code = String(row?.code || "").trim();
        const label =
          collapseRepeatedSegments(String(row?.label || row?.name || row?.code || "").trim()) ||
          code;
        return { value: label || code, label: label || code, code };
      })
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
    () =>
      bandSelectOptions.find((opt) => opt.id != null && opt.value === "B4")?.value ||
      bandSelectOptions.find((opt) => opt.id != null)?.value ||
      bandSelectOptions[0]?.value ||
      "B4",
    [bandSelectOptions]
  );
  const defaultAddStream = useMemo(
    () => streamSelectOptions[0]?.value || "",
    [streamSelectOptions]
  );
  const addRoleIsAdmin = String(addDraft.empRole || "").trim().toLowerCase() === "admin";
  const addFormCanSubmit = useMemo(() => {
    if (employeesLoading || mutating) return false;
    if (!addDraft.employeeName.trim() || !addDraft.email.trim() || !isWebknotWorkEmail(addDraft.email)) {
      return false;
    }
    if (!addRoleIsAdmin) {
      if (!addDraft.band.trim() || !addDraft.stream.trim()) return false;
      if (addDesignationOptions.length > 0 && !addDraft.designation.trim()) return false;
    }
    return true;
  }, [
    addDraft.band,
    addDraft.designation,
    addDraft.email,
    addDraft.employeeName,
    addDraft.stream,
    addDesignationOptions.length,
    addRoleIsAdmin,
    employeesLoading,
    mutating,
  ]);
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

  useEffect(() => {
    if (!showAddModal) return undefined;
    let cancelled = false;
    const auth = getAuthHeader();
    (async () => {
      try {
        const res = await fetch(buildApiUrl("/api/v1/allocation/roles"), {
          credentials: "include",
          headers: auth ? { Authorization: auth } : undefined,
        });
        if (!res.ok || cancelled) return;
        const raw = await parseResponse(res, {});
        const list = Array.isArray(raw) ? raw : raw?.data ?? raw?.roles ?? raw?.content ?? [];
        const opts = list.map(normalizeAllocationRoleRow).filter(Boolean);
        const dedup = [];
        const seen = new Set();
        for (const o of opts) {
          const k = o.value.toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          dedup.push(o);
        }
        if (!cancelled) setAllocationRoleOptions(dedup.slice(0, 100));
      } catch {
        if (!cancelled) setAllocationRoleOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showAddModal]);

  // Auto-fetch designation options for add modal based on selected band/department
  useEffect(() => {
    const controller = new AbortController();
    const band = String(addDraft.band || "").trim();
    const stream = String(addDraft.stream || "").trim();
    const bandRow = bandSelectOptions.find((opt) => opt.value === band) || null;
    if (!band || !stream) {
      setAddDesignation(null);
      setAddDesignationOptions([]);
      setAddDesignationLoading(false);
      return () => controller.abort();
    }
    setAddDesignationLoading(true);
    (async () => {
      try {
        const res = await fetchDesignationHintForBandStream({
          band,
          stream,
          bandId: bandRow?.id ?? band,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          const options = Array.isArray(res?.designations) ? res.designations : [];
          setAddDesignation(res);
          setAddDesignationOptions(options);
          setAddDraft((d) => {
            const current = String(d.designation || "").trim();
            if (current && options.includes(current)) return d;
            if (options.length === 1) return { ...d, designation: options[0] };
            if (options.length > 0 && !current) return { ...d, designation: options[0] };
            return d;
          });
        }
      } catch {
        if (controller.signal.aborted) return;
        setAddDesignation(null);
        setAddDesignationOptions([]);
      } finally {
        if (!controller.signal.aborted) setAddDesignationLoading(false);
      }
    })();
    return () => controller.abort();
  }, [addDraft.band, addDraft.stream, bandSelectOptions]);

  // Auto-fetch designation options for edit modal based on selected band/stream
  useEffect(() => {
    if (!editingEmployee) {
      setEditDesignation(null);
      setEditDesignationOptions([]);
      setEditDesignationLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    const band = String(draft.band || "").trim();
    const stream = String(draft.stream || "").trim();
    const bandRow = bandSelectOptions.find((opt) => opt.value === band) || null;
    if (editRoleIsAdmin || !band || !stream) {
      setEditDesignation(null);
      setEditDesignationOptions([]);
      setEditDesignationLoading(false);
      return () => controller.abort();
    }
    setEditDesignationLoading(true);
    (async () => {
      try {
        const res = await fetchDesignationHintForBandStream({
          band,
          stream,
          bandId: bandRow?.id ?? band,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          const options = Array.isArray(res?.designations) ? res.designations : [];
          setEditDesignation(res);
          setEditDesignationOptions(options);
          setDraft((d) => {
            const current = String(d.designation || "").trim();
            if (current && options.includes(current)) return d;
            if (options.length === 1) return { ...d, designation: options[0] };
            return d;
          });
        }
      } catch {
        if (controller.signal.aborted) return;
        setEditDesignation(null);
        setEditDesignationOptions([]);
      } finally {
        if (!controller.signal.aborted) setEditDesignationLoading(false);
      }
    })();
    return () => controller.abort();
  }, [draft.band, draft.stream, editRoleIsAdmin, editingEmployee, bandSelectOptions]);

  async function commitPromotion(employeeId, bandType, forceOverride = false) {
    const findEmp = (list) =>
      Array.isArray(list) ? list.find((e) => String(e?.id) === String(employeeId)) ?? null : null;
    const emp = findEmp(employees) ?? findEmp(allEmployees);
    if (!emp) {
      showToast({ title: "Promotion failed", message: "Employee not found in the current directory view.", tone: "error" });
      return;
    }
    setPromotingId(employeeId);
    try {
      const apiEmpId = await resolveEmployeeEmpId(emp);
      await promoteEmployeeApi(apiEmpId, bandType, { forceOverride });
      await refreshDirectoryAfterMutation();
      showToast({ title: "Promotion applied", message: `${emp.name} moved to the next band on this track.` });
    } catch (err) {
      showToast({
        title: "Promotion failed",
        message: normalizePromotionErrorMessage(err?.message),
        tone: "error",
      });
    } finally {
      setPromotingId(null);
    }
  }

  async function requestPromoteEmployee(emp) {
    if (!emp?.id) return;
    setPromoteBandType("BOTH");
    setPendingPromoteEmployee({
      id: String(emp.id),
      name: String(emp.name || emp.id),
      band: emp.band ?? "",
    });
  }

  async function confirmPromoteEmployee() {
    if (!pendingPromoteEmployee?.id) return;
    if (promoteConfirmDisabled) {
      setPendingPromoteEmployee(null);
      return;
    }
    try {
      await commitPromotion(pendingPromoteEmployee.id, promoteBandType, true);
    } finally {
      setPendingPromoteEmployee(null);
    }
  }

  async function setEmployeeSubmissionWindow(emp, mode) {
    const apiId = resolveEmployeeApiId(emp);
    if (!apiId || typeof onSetEmployeeSubmissionWindow !== "function") {
      showToast({ title: "Action unavailable", message: "Employee-level window control is not configured." });
      return;
    }

    const action = String(mode || "").trim().toLowerCase();
    if (action !== "open" && action !== "close") return;

    setWindowUpdatingId(emp.id);
    try {
      await onSetEmployeeSubmissionWindow(apiId, action);
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
    if (/^EMP_\d+$/i.test(employeeId)) {
      showToast({
        title: "Cannot delete",
        message: "This row has no server id. Refresh the directory or check the API payload.",
        tone: "error",
      });
      return;
    }
    if (currentEmployeeId && String(employeeId) === String(currentEmployeeId)) {
      showToast({ title: "Not allowed", message: "You can't delete your own user." });
      return;
    }
    setPendingDeleteEmployee({
      row: emp,
      name: String(emp?.name || employeeId),
    });
  }

  async function removeEmployee(employeeRow, employeeName, options = {}) {
    const { silent = false, skipRefresh = false } = options;
    try {
      if (!silent) setMutating(true);
      const apiEmpId = await resolveEmployeeEmpId(employeeRow);
      await deleteEmployee(apiEmpId);
      if (!skipRefresh) {
        const reloaded = await refreshDirectoryAfterMutation();
        if (!reloaded) {
          setEmployees((prev) =>
            prev.filter((e) => String(e.id) !== String(employeeRow?.id) && String(e.empId) !== apiEmpId),
          );
        }
        showToast({
          title: "Employee deactivated",
          message: `${employeeName || apiEmpId} is now inactive and hidden from active directory views.`,
        });
      }
    } catch (err) {
      if (!silent) {
        showToast({ title: "Delete failed", message: err?.message || "Please try again." });
      }
      throw err;
    } finally {
      if (!silent) setMutating(false);
    }
  }

  async function confirmDeleteEmployee() {
    if (!pendingDeleteEmployee?.row) return;
    try {
      await removeEmployee(pendingDeleteEmployee.row, pendingDeleteEmployee.name);
    } finally {
      setPendingDeleteEmployee(null);
    }
  }

  function openEdit(emp) {
    const bandCode = resolveBandCodeFromDisplay(emp.band, bandSelectOptions) || defaultAddBand;
    const streamValue =
      streamSelectOptions.find(
        (opt) =>
          opt.value === emp.stream ||
          opt.label === emp.stream ||
          opt.code === emp.stream,
      )?.value || emp.stream || defaultAddStream;

    setEditDesignationOptions([]);
    setEditDesignation(null);
    setEditingEmployeeId(emp.id);
    setDraft({
      name: emp.name ?? "",
      email: emp.email ?? "",
      role: emp.empRole ?? emp.role ?? "Employee",
      designation: emp.designation ?? "",
      band: bandCode,
      stream: streamValue,
      userType: String(emp.userType ?? "FULLTIME").toUpperCase() || "FULLTIME",
      workMode: String(emp.workMode ?? "HYBRID").toUpperCase() || "HYBRID",
      userStatus: String(emp.status ?? emp.userStatus ?? "ACTIVE").toUpperCase() || "ACTIVE",
      phoneNumber: emp.phoneNumber ?? "",
    });
  }

  function closeEdit() {
    setEditingEmployeeId(null);
    setEditDesignationOptions([]);
    setEditDesignation(null);
  }

  function toggleEmployeeSelected(empId, checked) {
    const id = String(empId ?? "").trim();
    if (!id) return;
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelectAllVisible(checked) {
    if (!checked) {
      setSelectedEmployeeIds(new Set());
      return;
    }
    const ids = visibleEmployees
      .map((e) => String(e?.id ?? "").trim())
      .filter((id) => id && !/^EMP_\d+$/i.test(id));
    setSelectedEmployeeIds(new Set(ids));
  }

  function requestBulkDelete() {
    const rows = visibleEmployees.filter((e) => selectedEmployeeIds.has(String(e?.id ?? "").trim()));
    if (!rows.length) return;
    setPendingBulkDelete(rows);
  }

  async function confirmBulkDelete() {
    if (!Array.isArray(pendingBulkDelete) || !pendingBulkDelete.length) return;
    setMutating(true);
    let ok = 0;
    let fail = 0;
    for (const row of pendingBulkDelete) {
      try {
        await removeEmployee(row, row.name, { silent: true, skipRefresh: true });
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    setPendingBulkDelete(null);
    setSelectedEmployeeIds(new Set());
    await refreshDirectoryAfterMutation();
    setMutating(false);
    showToast({
      title: fail ? "Bulk deactivate finished" : "Employees deactivated",
      message: `${ok} deactivated${fail ? `, ${fail} failed` : ""}.`,
      tone: fail && !ok ? "error" : fail ? "warning" : "success",
    });
  }

  function getEditingEmployeeRow() {
    if (!editingEmployeeId) return null;
    return (
      (Array.isArray(employees)
        ? employees.find((emp) => String(emp?.id) === String(editingEmployeeId))
        : null) ||
      (Array.isArray(allEmployees)
        ? allEmployees.find((emp) => String(emp?.id) === String(editingEmployeeId))
        : null) ||
      null
    );
  }

  function validateEditDraft() {
    const current = getEditingEmployeeRow();
    if (!current) {
      showToast({ title: "Update failed", message: "Employee not found." });
      return null;
    }
    const roleKey = String(draft.role || "").trim().toLowerCase();
    const isAdminRole = roleKey === "admin";
    const bandCode = String(draft.band || "").trim();
    const department = String(draft.stream ?? current.stream ?? "").trim();
    const bandRow = isAdminRole
      ? null
      : bandSelectOptions.find((opt) => opt.value === bandCode) || null;
    const bandId =
      bandRow?.id != null && /^\d+$/.test(String(bandRow.id))
        ? Number.parseInt(String(bandRow.id), 10)
        : null;
    if (!isAdminRole && bandId == null) {
      showToast({
        title: "Band not resolved",
        message:
          "Could not map the selected band to a server id. Open Band & Stream directory, ensure bands are loaded, then try again.",
      });
      return null;
    }
    if (!isAdminRole && !department) {
      showToast({ title: "Department required", message: "Choose a department from the list." });
      return null;
    }
    if (!String(draft.name ?? "").trim()) {
      showToast({ title: "Missing field", message: "Employee name is required." });
      return null;
    }
    return { current, isAdminRole, bandId, department };
  }

  function requestSaveEdit(e) {
    e.preventDefault();
    if (!editingEmployeeId) return;
    if (!validateEditDraft()) return;
    setPendingSaveEdit(true);
  }

  async function saveEdit() {
    if (!editingEmployeeId) return;
    const validated = validateEditDraft();
    if (!validated) return;
    const { current, isAdminRole, bandId, department } = validated;

    const payload = {
      name: draft.name.trim(),
      email: String(draft.email ?? current.email ?? "").trim(),
      portalRole: draft.role,
      empRole: draft.role,
      designation: String(draft.designation ?? "").trim(),
      department: isAdminRole ? department || null : department || null,
      bandId: isAdminRole ? null : bandId,
      userType: draft.userType,
      workMode: draft.workMode,
      userStatus: draft.userStatus,
      phoneNumber: String(draft.phoneNumber ?? "").trim(),
    };

    try {
      setMutating(true);
      const apiEmpId = await resolveEmployeeEmpId(current);
      await updateEmployee(apiEmpId, payload);
      const reloaded = await refreshDirectoryAfterMutation();
      if (!reloaded) {
        setEmployees((prev) =>
          prev.map((emp) =>
            emp.id === editingEmployeeId
              ? {
                  ...emp,
                  name: payload.name || emp.name,
                  role: payload.portalRole || emp.role,
                  empRole: payload.portalRole || emp.empRole,
                  email: payload.email || emp.email,
                  designation: draft.designation || emp.designation,
                  band: draft.band || emp.band,
                  stream: payload.department || emp.stream,
                }
              : emp
          )
        );
      }
      showToast({ title: "Employee updated", message: payload.name || String(editingEmployeeId) });
      setPendingSaveEdit(false);
      closeEdit();
    } catch (err) {
      showToast({ title: "Update failed", message: err?.message || "Please try again." });
    } finally {
      setMutating(false);
    }
  }

  function openAdd() {
    setAddDesignation(null);
    setAddDesignationOptions([]);
    setAddDraft({
      employeeName: "",
      email: "",
      empRole: "Employee",
      userType: "FULLTIME",
      workMode: "HYBRID",
      startDate: todayInput(),
      designation: "",
      band: defaultAddBand,
      stream: defaultAddStream,
    });
    setShowAddModal(true);
  }

  function closeAdd() {
    setShowAddModal(false);
    setAddDesignation(null);
    setAddDesignationOptions([]);
  }

  useEffect(() => {
    if (!showAddModal) return;
    setAddDraft((d) => ({
      ...d,
      band: d.band || defaultAddBand,
      stream: d.stream || defaultAddStream,
    }));
  }, [showAddModal, defaultAddBand, defaultAddStream]);

  async function submitAdd(e) {
    e.preventDefault();

    const employeeName = addDraft.employeeName.trim();
    const email = addDraft.email.trim().toLowerCase();
    const empRole = addDraft.empRole.trim() || "Employee";
    const roleKey = empRole.toLowerCase();
    const isAdminRole = roleKey === "admin";
    const bandCode = String(addDraft.band || "").trim();
    const stream = String(addDraft.stream || "").trim();

    if (!employeeName) {
      showToast({ title: "Missing field", message: "Employee name is required." });
      return;
    }
    if (!email) {
      showToast({ title: "Missing field", message: "Email is required." });
      return;
    }
    if (!isWebknotWorkEmail(email)) {
      showToast({
        title: "Invalid email",
        message: `Use a company address ending in ${WEBKNOT_WORK_EMAIL_SUFFIX}.`,
      });
      return;
    }
    if (!isAdminRole && !bandCode) {
      showToast({ title: "Band required", message: "Choose a band from the list." });
      return;
    }
    if (!isAdminRole && !stream) {
      showToast({ title: "Department required", message: "Choose a department from the list." });
      return;
    }

    const designationValue = String(
      addDraft.designation.trim() ||
        addDesignation?.designation ||
        addDesignationOptions[0] ||
        "",
    ).trim();

    if (!isAdminRole && addDesignationOptions.length > 0 && !designationValue) {
      showToast({
        title: "Designation required",
        message: "Select a designation that matches this band and department (import lookups first if the list is empty).",
      });
      return;
    }

    const resolvedDesignation = designationValue || empRole || "Employee";

    const bandRow = isAdminRole
      ? bandSelectOptions.find((opt) => opt.value === "B4") || bandSelectOptions[0]
      : bandSelectOptions.find((opt) => opt.value === bandCode);
    const bandId =
      bandRow?.id != null && /^\d+$/.test(String(bandRow.id))
        ? Number.parseInt(String(bandRow.id), 10)
        : null;

    if (bandId == null) {
      showToast({
        title: "Band not resolved",
        message:
          "Could not map the selected band to a server id. Open Band & Stream directory, ensure bands are loaded, then try again.",
      });
      return;
    }

    const payload = {
      employeeName,
      email,
      empRole,
      designation: resolvedDesignation,
      bandId,
      band: bandRow?.value ?? bandCode,
      stream: isAdminRole ? streamSelectOptions[0]?.value || "Development" : stream,
      department: isAdminRole ? streamSelectOptions[0]?.value || "Development" : stream,
      userType: addDraft.userType,
      workMode: addDraft.workMode,
      startDate: addDraft.startDate,
    };

    try {
      setMutating(true);
      const createdRaw = await addEmployee(payload);

      showToast({ title: "Employee added", message: `${employeeName} created successfully.` });

      closeAdd();
      await refreshDirectoryAfterMutation();

      const inner =
        createdRaw &&
        typeof createdRaw === "object" &&
        !Array.isArray(createdRaw) &&
        createdRaw.data &&
        typeof createdRaw.data === "object" &&
        !Array.isArray(createdRaw.data)
          ? createdRaw.data
          : createdRaw;
      const createdRows = Array.isArray(inner) ? normalizeEmployees(inner) : normalizeEmployees([inner]);
      const created = createdRows[0];
      if (created && setEmployees) {
        setEmployees((prev) => {
          if (prev.some((e) => String(e.id) === String(created.id))) return prev;
          return [created, ...prev];
        });
      }
    } catch (err) {
      const raw = friendlyProxyUnreachableMessage(err?.message || "");
      const pathNote = err?.path ? ` (${err.path})` : "";
      const lower = raw.toLowerCase();
      let message = `${raw || "Please try again."}${pathNote}`;
      if (
        lower.includes("email") &&
        (lower.includes("exist") || lower.includes("duplicate") || lower.includes("already") || lower.includes("taken"))
      ) {
        message =
          "That email is already registered. Use search (name or email) to find the existing profile in this list— they may be marked inactive. You can edit them instead of adding a duplicate.";
      } else if (
        lower.includes("httprequestmethodnotsupported") ||
        lower.includes("method not supported")
      ) {
        message =
          "Employee create failed on the server. Confirm Webtrak is running and POST /api/v1/employees accepts your payload (band id, department, salary placeholders).";
      } else if (
        lower.includes("designation") ||
        lower.includes("band") ||
        lower.includes("stream") ||
        lower.includes("department")
      ) {
        message =
          `${raw} Check that band, department, and designation match your designation lookup table (Bands & Departments → CSV Import).`;
      }
      showToast({ title: "Add failed", message });
    } finally {
      setMutating(false);
    }
  }

  return (
    <AdminPageShell className="space-y-6" maxWidth="max-w-[1600px]">
      <AdminPageHeader
        title="Employees"
        subtitle="Search people, edit profiles, promote bands, and open or close one person's review window. Import replaces the roster from CSV."
      >
        <div className="flex flex-wrap items-center gap-2">
          <EntityCsvToolbar
            entityKey="employees"
            onImportComplete={() => reloadEmployees?.()}
            onExport={() => exportEmployeesCsv(employees)}
            confirmImportMessage="Import the full employee roster from CSV? Anyone not listed will be marked inactive (admins are kept)."
            showToast={showToast}
          />
          <button type="button" onClick={openAdd} className="rt-btn-primary text-sm" title="Add employee">
            <Plus size={15} /> Add Employee
          </button>
        </div>
      </AdminPageHeader>

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Total", value: totalEmployeesDisplay },
          { label: "Managers", value: managerCount },
          { label: "Showing", value: visibleEmployees.length, accent: true },
          { label: "Bands", value: bandCount },
          { label: "Admins", value: adminCount },
          { label: "Employees", value: employeeCount },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 sm:px-4 sm:py-3"
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
              {stat.label}
            </div>
            <div
              className={[
                "mt-0.5 text-lg sm:text-xl font-bold tabular-nums leading-none",
                stat.accent ? "text-[rgb(var(--primary))]" : "text-[rgb(var(--text))]",
              ].join(" ")}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </section>

      {employeesError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-200">
          <div className="font-semibold">
            {/Could not reach the backend API from the dev proxy/i.test(employeesError)
              ? "API unavailable"
              : "Failed to load employees"}
          </div>
          <p className="mt-1.5 text-xs sm:text-sm opacity-95">{employeesError}</p>
        </div>
      ) : null}

      <div className="rt-toolbar-panel space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <SearchField
            className="flex-1"
            label="Find someone on the team"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery("")}
            placeholder="Name, email, or employee ID"
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 lg:flex lg:shrink-0">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rt-input h-10 min-w-[8.5rem] text-sm"
              aria-label="Filter by role"
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
              className="rt-input h-10 min-w-[9.5rem] text-sm"
              aria-label="Filter by designation"
            >
              <option value="all">All designations</option>
              {designationOptions.map((opt) => (
                <option key={`designation:${opt.value}`} value={opt.value}>
                  {collapseRepeatedSegments(opt.value)} ({opt.count})
                </option>
              ))}
            </select>
            <select
              value={bandFilter}
              onChange={(e) => setBandFilter(e.target.value)}
              className="rt-input h-10 min-w-[8rem] text-sm"
              aria-label="Filter by band"
            >
              <option value="all">All bands</option>
              {bandOptions.map((opt) => (
                <option key={`band:${opt.value}`} value={opt.value}>
                  {formatEmployeeBandCode(opt.value) || opt.value} ({opt.count})
                </option>
              ))}
            </select>
          </div>
        </div>
        {(query || roleFilter !== "all" || designationFilter !== "all" || bandFilter !== "all") && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-[rgb(var(--muted))]">
            <span>
              {visibleEmployees.length} of {searchUniverse.length} in view
            </span>
            <button
              type="button"
              className="rt-btn-secondary !py-1.5 !px-3 text-xs"
              onClick={() => {
                setQuery("");
                setRoleFilter("all");
                setDesignationFilter("all");
                setBandFilter("all");
              }}
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {selectedEmployeeIds.size > 0 ? (
        <div className="rt-panel px-4 py-3 flex flex-wrap items-center justify-between gap-3 border border-amber-500/30 bg-amber-500/5">
          <span className="text-sm font-medium">
            {selectedEmployeeIds.size} employee{selectedEmployeeIds.size === 1 ? "" : "s"} selected
          </span>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rt-btn-ghost text-xs" onClick={() => setSelectedEmployeeIds(new Set())}>
              Clear selection
            </button>
            <button type="button" className="rt-btn-primary !bg-red-600 hover:!bg-red-500 text-xs" onClick={requestBulkDelete}>
              Deactivate selected
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Desktop roster (scroll inside panel) ── */}
      <div className="rt-panel hidden lg:flex flex-col max-h-[min(72vh,720px)] overflow-hidden">
        <div className="shrink-0 px-4 py-3 border-b border-[rgb(var(--border))]">
          <h2 className="text-sm font-semibold text-[rgb(var(--text))]">Employee roster</h2>
          <p className="rt-section-subtitle mt-0.5">
            {visibleEmployees.length} in view · scroll inside this panel
          </p>
        </div>
        <div className="min-w-0 flex-1 overflow-auto custom-scrollbar">
          <div className="overflow-x-auto min-h-0">
          <table className="w-full text-left table-fixed min-w-[1100px]">
            <thead className="sticky top-0 z-10 bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-[rgb(var(--muted))] border-b border-[rgb(var(--border))]">
              <tr>
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    className="rounded border-[rgb(var(--border))]"
                    checked={
                      visibleEmployees.length > 0 &&
                      visibleEmployees.every((e) => selectedEmployeeIds.has(String(e?.id ?? "").trim()))
                    }
                    onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                    aria-label="Select all visible employees"
                  />
                </th>
                <th className="w-[5.5rem] px-4 py-3 font-semibold">Emp ID</th>
                <th className="w-[10rem] px-4 py-3 font-semibold">Name</th>
                <th className="w-[12rem] px-4 py-3 font-semibold">Email</th>
                <th className="w-[6.5rem] px-4 py-3 font-semibold">Role</th>
                <th className="w-[9rem] px-4 py-3 font-semibold">Designation</th>
                <th className="w-[5.5rem] px-4 py-3 font-semibold">Band</th>
                <th className="w-[8rem] px-4 py-3 font-semibold">Department</th>
                <th className="w-[5.5rem] px-4 py-3 font-semibold text-center">Last promo</th>
                <th className="w-[7.5rem] px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {visibleEmployees.map((emp) => {
                const promoteGate = getPromotionPreview(emp.band, "BOTH");
                const bandCode = employeeBandCode(emp);
                const bandLabel = bandLabelMap.get(emp.band) || bandLabelMap.get(bandCode);
                const streamLabel = streamLabelMap.get(emp.stream);
                return (
                <tr key={emp.id} className="h-14 hover:bg-[rgb(var(--surface-2))]/50 transition-colors">
                  <td className="px-3 py-2 align-middle">
                    <input
                      type="checkbox"
                      className="rounded border-[rgb(var(--border))]"
                      checked={selectedEmployeeIds.has(String(emp.id ?? "").trim())}
                      onChange={(e) => toggleEmployeeSelected(emp.id, e.target.checked)}
                      aria-label={`Select ${emp.name}`}
                    />
                  </td>
                  <td className="px-4 py-2 align-middle">
                    <DirectoryCell mono title={emp.id}>{emp.id || "—"}</DirectoryCell>
                  </td>
                  <td className="px-4 py-2 align-middle">
                    <div className="max-w-[10rem] truncate font-semibold text-sm text-[rgb(var(--text))]" title={emp.name}>
                      {emp.name}
                      <DirectoryStatusBadge status={emp.status} />
                    </div>
                  </td>
                  <td className="px-4 py-2 align-middle">
                    <DirectoryCell title={emp.email}>{emp.email || "—"}</DirectoryCell>
                  </td>
                  <td className="px-4 py-2 align-middle">
                    <RoleBadge role={emp.role} />
                  </td>
                  <td className="px-4 py-2 align-middle">
                    <DirectoryCell title={employeeDesignation(emp)}>{employeeDesignation(emp)}</DirectoryCell>
                  </td>
                  <td className="px-4 py-2 align-middle">
                    <div className="font-mono text-sm font-semibold tabular-nums">{bandCode}</div>
                    {bandLabel && bandLabel !== bandCode ? (
                      <div className="text-[10px] text-[rgb(var(--muted))] truncate max-w-[5rem]" title={bandLabel}>
                        {collapseRepeatedSegments(bandLabel)}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 align-middle">
                    <DirectoryCell title={streamLabel || emp.stream}>
                      {emp.stream || "—"}
                    </DirectoryCell>
                    {streamLabel && streamLabel !== emp.stream ? (
                      <div className="text-[10px] text-[rgb(var(--muted))] truncate max-w-[8rem]" title={streamLabel}>
                        {streamLabel}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 align-middle text-center">
                     {emp.lastPromotionDate ? (
                        <span className="inline-block text-[10px] font-semibold text-teal-700 dark:text-teal-300 bg-teal-500/10 px-2 py-0.5 rounded-md border border-teal-500/20 tabular-nums">
                           {new Date(emp.lastPromotionDate).toLocaleDateString(undefined, { month: "short", day: "2-digit" })}
                        </span>
                     ) : (
                        <span className="text-[rgb(var(--muted))]">—</span>
                     )}
                  </td>
                  <td className="px-4 py-2 align-middle text-right">
                    <div className="inline-flex items-center gap-0.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-0.5">
                      <button
                        type="button"
                        onClick={() => openEdit(emp)}
                        className="p-1.5 rounded-md text-[rgb(var(--muted))] hover:text-[rgb(var(--primary))] hover:bg-[rgb(var(--primary))]/10 transition-colors"
                        title="Edit employee"
                        aria-label={`Edit ${emp.name}`}
                      >
                        <Edit3 size={15} />
                      </button>

                      <button
                        type="button"
                        onClick={() => requestPromoteEmployee(emp)}
                        disabled={promotingId === emp.id || promoteGate.isMaxBand}
                        className="p-1.5 rounded-md text-blue-600 dark:text-blue-300 hover:bg-blue-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title={
                          promoteGate.isMaxBand
                            ? promoteGate.reasonIfBlocked || "Already at highest band on default track"
                            : "Promote to next band"
                        }
                        aria-label={`Promote ${emp.name}`}
                      >
                        <ArrowUpCircle size={15} />
                      </button>

                      <button
                        type="button"
                        onClick={() => requestRemoveEmployee(emp)}
                        disabled={isSelf(emp)}
                        className="p-1.5 rounded-md text-[rgb(var(--danger))] hover:bg-[rgb(var(--danger))]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Remove employee"
                        aria-label={`Remove ${emp.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}

              {!employeesLoading && filtered.length === 0 ? (
                <tr>
                  <td className="py-16 text-center" colSpan={9}>
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
      </div>

      {/* ── Mobile roster (scroll inside panel) ── */}
      <div className="rt-panel lg:hidden flex flex-col max-h-[min(72vh,640px)] overflow-hidden">
        <div className="shrink-0 px-4 py-3 border-b border-[rgb(var(--border))]">
          <h2 className="text-sm font-semibold">Employee roster</h2>
          <p className="rt-section-subtitle mt-0.5">{visibleEmployees.length} in view</p>
        </div>
        <div className="flex-1 overflow-auto custom-scrollbar p-4 space-y-3">
        {visibleEmployees.map((emp) => {
          const promoteGate = getPromotionPreview(emp.band, "BOTH");
          return (
          <div key={emp.id} className="rt-panel rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-[rgb(var(--text))] truncate flex flex-wrap items-center gap-x-1">
                  {emp.name}
                  <DirectoryStatusBadge status={emp.status} />
                </div>
                <div className="text-[11px] text-[rgb(var(--muted))] truncate">{emp.email || "—"}</div>
              </div>
              <RoleBadge role={emp.role} />
            </div>

            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div className="min-w-0">
                <div className="text-[rgb(var(--muted))] uppercase tracking-wider font-medium mb-0.5">Designation</div>
                <div className="text-[rgb(var(--text))] truncate" title={employeeDesignation(emp)}>
                  {employeeDesignation(emp)}
                </div>
              </div>
              <div>
                <div className="text-[rgb(var(--muted))] uppercase tracking-wider font-medium mb-0.5">Band</div>
                <div className="text-[rgb(var(--text))] font-mono font-semibold tabular-nums">{employeeBandCode(emp)}</div>
              </div>
              <div className="min-w-0">
                <div className="text-[rgb(var(--muted))] uppercase tracking-wider font-medium mb-0.5">Department</div>
                <div className="text-[rgb(var(--text))] truncate">{emp.stream || "—"}</div>
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
                  disabled={promotingId === emp.id || promoteGate.isMaxBand}
                  className="p-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-300 hover:bg-blue-500 hover:text-white rounded-md transition-all border border-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={
                    promoteGate.isMaxBand
                      ? promoteGate.reasonIfBlocked || "Already at highest band on default track"
                      : "Promote to next band"
                  }
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
          );
        })}

        {!employeesLoading && filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[rgb(var(--border))] p-10 flex flex-col items-center gap-3">
            <Search size={28} className="text-[rgb(var(--muted))]/40" />
            <p className="text-[rgb(var(--muted))] text-sm">No employees match your filters.</p>
          </div>
        ) : null}
        </div>
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
        title="Deactivate employee?"
        message={
          pendingDeleteEmployee
            ? `You are about to deactivate ${pendingDeleteEmployee.name}.\n\nThey will be marked inactive and hidden from active lists. Historical submissions and records are kept.\n\nThis cannot be undone from the directory UI without re-activating the profile.`
            : "Deactivate this employee?"
        }
        confirmText="Yes, deactivate"
        cancelText="Keep active"
        confirmVariant="danger"
        busy={mutating}
        onCancel={() => setPendingDeleteEmployee(null)}
        onConfirm={confirmDeleteEmployee}
      />

      <ConfirmDialog
        open={Boolean(pendingBulkDelete?.length)}
        title={`Deactivate ${pendingBulkDelete?.length || 0} employees?`}
        message={
          pendingBulkDelete?.length
            ? `You selected ${pendingBulkDelete.length} people to deactivate.\n\nEach will be marked inactive in WebTrak. This does not delete audit history.\n\nContinue?`
            : ""
        }
        confirmText={`Deactivate ${pendingBulkDelete?.length || 0}`}
        cancelText="Cancel"
        confirmVariant="danger"
        busy={mutating}
        onCancel={() => setPendingBulkDelete(null)}
        onConfirm={confirmBulkDelete}
      />

      <ConfirmDialog
        open={pendingSaveEdit}
        title="Save employee changes?"
        message={
          editingEmployee
            ? `Save updates for ${draft.name || editingEmployee.name}?\n\nPortal role, band, department, designation, and contact fields will be updated on the server. Employee ID will not change.`
            : "Save changes to this employee profile?"
        }
        confirmText="Save changes"
        cancelText="Keep editing"
        confirmVariant="primary"
        busy={mutating}
        onCancel={() => setPendingSaveEdit(false)}
        onConfirm={() => {
          setPendingSaveEdit(false);
          saveEdit();
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingPromoteEmployee)}
        title="Promote employee"
        message={
          pendingPromoteEmployee
            ? promoteDialogPreview.nextBand
              ? `Move ${pendingPromoteEmployee.name} from ${promoteDialogPreview.currentCode || pendingPromoteEmployee.band || "current band"} → ${promoteDialogPreview.nextBand}?`
              : `Promote ${pendingPromoteEmployee.name} one step on the Webtrak band ladder?`
            : "Promote this employee?"
        }
        confirmText={
          promoteDialogPreview.nextBand
            ? `Promote → ${promoteDialogPreview.nextBand}`
            : "Promote"
        }
        cancelText="Cancel"
        confirmVariant="primary"
        busy={Boolean(promotingId)}
        onCancel={() => setPendingPromoteEmployee(null)}
        onConfirm={confirmPromoteEmployee}
        confirmDisabled={promoteConfirmDisabled}
      >
        <div className="space-y-3">
          <p className="text-sm text-[rgb(var(--muted))] leading-relaxed">
            This is a manual HR promotion — review scores are not required on this step.
          </p>
          <div>
            <label className="rt-label">Career track</label>
            <select
              value={promoteBandType}
              onChange={(e) => setPromoteBandType(e.target.value)}
              className="rt-input w-full text-sm"
              disabled={Boolean(promotingId)}
            >
              <option value="BOTH">Auto — pick tech or non-tech ladder</option>
              <option value="TECH">Tech — up to {TECH_MAX_BAND}</option>
              <option value="NON_TECH">Non-tech — up to {NON_TECH_MAX_BAND}</option>
            </select>
          </div>
          {promoteDialogPreview.reasonIfBlocked ? (
            <div
              className={[
                "rounded-lg border px-3 py-2 text-xs",
                promoteDialogPreview.isMaxBand
                  ? "border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-100"
                  : "border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))]",
              ].join(" ")}
            >
              {promoteDialogPreview.reasonIfBlocked}
            </div>
          ) : null}
        </div>
      </ConfirmDialog>

      <Toast toast={toast} onDismiss={() => setToast(null)} />

      
      {showAddModal ? (
        <ModalOverlay
          open={showAddModal}
          onClose={closeAdd}
          maxWidth="max-w-xl"
          zIndex={60}
          header={
            <div>
              <h3 className="rt-section-title">Add Employee</h3>
              <p className="mt-1 text-sm text-[rgb(var(--muted))]">
                Register a new person in Pulse. Fields marked with * are required.
              </p>
            </div>
          }
        >
          <form onSubmit={submitAdd} className="space-y-5">
            <AddFormSection
              title="Identity"
              subtitle="How this person appears in the directory and signs in."
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <AddFormField label="Full name" required>
                  <input
                    value={addDraft.employeeName}
                    onChange={(e) => setAddDraft((d) => ({ ...d, employeeName: e.target.value }))}
                    className="rt-input w-full text-sm"
                    placeholder="e.g., Alice Johnson"
                    autoComplete="name"
                  />
                </AddFormField>
                <AddFormField
                  label="Work email"
                  required
                  hint={`Must be a ${WEBKNOT_WORK_EMAIL_SUFFIX} address.`}
                >
                  <input
                    type="email"
                    autoComplete="email"
                    value={addDraft.email}
                    onChange={(e) => setAddDraft((d) => ({ ...d, email: e.target.value }))}
                    className="rt-input w-full text-sm"
                    placeholder={`name${WEBKNOT_WORK_EMAIL_SUFFIX}`}
                  />
                </AddFormField>
              </div>
            </AddFormSection>

            <AddFormSection
              title="Role & access"
              subtitle="Portal permissions. Project allocations are set up after the person is created."
            >
              <AddFormField label="Portal role" required>
                <select
                  className="rt-input w-full text-sm"
                  value={addDraft.empRole}
                  onChange={(e) => setAddDraft((d) => ({ ...d, empRole: e.target.value }))}
                >
                  <option value="Employee">Employee</option>
                  <option value="Manager">Manager</option>
                  <option value="Admin">Admin</option>
                  {allocationRoleOptions.map((o) => (
                    <option key={`alloc-role:${o.value}`} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </AddFormField>
              {addRoleIsAdmin ? (
                <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 text-[11px] text-[rgb(var(--muted))] leading-relaxed">
                  Admin profiles do not require band, department, or designation.
                </div>
              ) : null}
            </AddFormSection>

            {!addRoleIsAdmin ? (
              <AddFormSection
                title="Organization"
                subtitle="Must match bands, departments, and designation lookups already in the system."
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <AddFormField label="Band" required>
                    <select
                      value={addDraft.band}
                      onChange={(e) =>
                        setAddDraft((d) => ({ ...d, band: e.target.value, designation: "" }))
                      }
                      className="rt-input w-full text-sm"
                    >
                      {bandSelectOptions.map((band) => (
                        <option key={`add-band:${band.value}`} value={band.value}>
                          {band.label}
                        </option>
                      ))}
                    </select>
                    {directoryBands.length === 0 ? (
                      <p className="mt-1.5 text-[10px] text-amber-600 dark:text-amber-400">
                        Band list not loaded — refresh Bands &amp; Departments if options look wrong.
                      </p>
                    ) : null}
                  </AddFormField>
                  <AddFormField label="Department" required>
                    <select
                      value={addDraft.stream}
                      onChange={(e) =>
                        setAddDraft((d) => ({ ...d, stream: e.target.value, designation: "" }))
                      }
                      className="rt-input w-full text-sm"
                    >
                      {streamSelectOptions.length === 0 ? (
                        <option value="">No departments loaded</option>
                      ) : null}
                      {streamSelectOptions.map((stream) => (
                        <option key={`add-stream:${stream.value}`} value={stream.value}>
                          {stream.label}
                        </option>
                      ))}
                    </select>
                  </AddFormField>
                </div>

                <AddFormField
                  label="Designation"
                  required={addDesignationOptions.length > 0}
                  hint={
                    addDesignationLoading
                      ? "Loading designations for this band and department…"
                      : addDesignationOptions.length > 0
                        ? "Pick a title from your designation lookup table."
                        : "No lookup for this band and department — enter a title or import designation lookups via CSV Import."
                  }
                >
                  {addDesignationOptions.length > 0 ? (
                    <select
                      value={addDraft.designation}
                      onChange={(e) => setAddDraft((d) => ({ ...d, designation: e.target.value }))}
                      className="rt-input w-full text-sm"
                      disabled={addDesignationLoading}
                    >
                      <option value="">Select designation</option>
                      {addDesignationOptions.map((label) => (
                        <option key={`add-des:${label}`} value={label}>
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={addDraft.designation}
                      onChange={(e) => setAddDraft((d) => ({ ...d, designation: e.target.value }))}
                      className="rt-input w-full text-sm"
                      placeholder="e.g., Software Engineer II"
                      disabled={addDesignationLoading}
                    />
                  )}
                </AddFormField>
              </AddFormSection>
            ) : null}

            <AddFormSection
              title="Employment details"
              subtitle="Optional metadata stored with the employee record."
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <AddFormField label="User type">
                  <select
                    value={addDraft.userType}
                    onChange={(e) => setAddDraft((d) => ({ ...d, userType: e.target.value }))}
                    className="rt-input w-full text-sm"
                  >
                    <option value="FULLTIME">Full-time</option>
                    <option value="INTERN">Intern</option>
                    <option value="FREELANCER">Freelancer</option>
                  </select>
                </AddFormField>
                <AddFormField label="Work mode">
                  <select
                    value={addDraft.workMode}
                    onChange={(e) => setAddDraft((d) => ({ ...d, workMode: e.target.value }))}
                    className="rt-input w-full text-sm"
                  >
                    <option value="HYBRID">Hybrid</option>
                    <option value="INOFFICE">In office</option>
                    <option value="REMOTE">Remote</option>
                  </select>
                </AddFormField>
                <AddFormField label="Start date">
                  <input
                    type="date"
                    value={addDraft.startDate}
                    onChange={(e) => setAddDraft((d) => ({ ...d, startDate: e.target.value }))}
                    className="rt-input w-full text-sm"
                  />
                </AddFormField>
              </div>
            </AddFormSection>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 border-t border-[rgb(var(--border))] pt-4">
              <button type="button" onClick={closeAdd} className="rt-btn-ghost w-full sm:w-auto">
                Cancel
              </button>
              <button
                type="submit"
                disabled={!addFormCanSubmit}
                className={[
                  "rt-btn-primary w-full sm:w-auto transition-all",
                  !addFormCanSubmit ? "opacity-60 cursor-not-allowed" : "",
                ].join(" ")}
              >
                {mutating ? "Adding…" : "Create employee"}
              </button>
            </div>
          </form>
        </ModalOverlay>
      ) : null}

      
      {editingEmployee ? (
        <ModalOverlay
          open={Boolean(editingEmployee)}
          onClose={closeEdit}
          maxWidth="max-w-xl"
          zIndex={60}
          header={
            <div>
              <h3 className="rt-section-title">Edit Employee</h3>
              <p className="mt-1 text-sm text-[rgb(var(--muted))]">
                Update directory details for{" "}
                <span className="font-mono text-[rgb(var(--text))]">{editingEmployee.id}</span>
                {editingEmployee.email ? (
                  <>
                    {" "}
                    · <span className="text-[rgb(var(--text))]">{editingEmployee.email}</span>
                  </>
                ) : null}
              </p>
            </div>
          }
        >
          <form onSubmit={requestSaveEdit} className="space-y-5">
            <AddFormSection title="Identity" subtitle="Name and work email. Employee ID cannot be changed.">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <AddFormField label="Employee ID">
                  <input
                    value={String(editingEmployee.id || "")}
                    readOnly
                    className="rt-input w-full text-sm font-mono opacity-70 cursor-not-allowed"
                  />
                </AddFormField>
                <AddFormField label="Work email">
                  <input
                    type="email"
                    value={draft.email}
                    onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                    className="rt-input w-full text-sm"
                    required
                  />
                </AddFormField>
              </div>
              <AddFormField label="Full name" required>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  className="rt-input w-full text-sm"
                  placeholder="e.g., Alice Johnson"
                  required
                />
              </AddFormField>
            </AddFormSection>

            <AddFormSection
              title="Role & access"
              subtitle="Portal role. Band and department apply to non-admin profiles."
            >
              <AddFormField label="Portal role" required>
                <select
                  value={draft.role}
                  onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
                  className="rt-input w-full text-sm"
                >
                  <option value="Employee">Employee</option>
                  <option value="Manager">Manager</option>
                  <option value="HR">HR</option>
                  <option value="Finance">Finance</option>
                  <option value="Admin">Admin</option>
                </select>
              </AddFormField>
              {editRoleIsAdmin ? (
                <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-3 py-2.5 text-[11px] text-[rgb(var(--muted))] leading-relaxed">
                  Admin profiles do not require band or department updates.
                </div>
              ) : null}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <AddFormField label="Employment type">
                  <select
                    value={draft.userType}
                    onChange={(e) => setDraft((d) => ({ ...d, userType: e.target.value }))}
                    className="rt-input w-full text-sm"
                  >
                    <option value="FULLTIME">Full-time</option>
                    <option value="INTERN">Intern</option>
                    <option value="FREELANCER">Freelancer</option>
                  </select>
                </AddFormField>
                <AddFormField label="Work mode">
                  <select
                    value={draft.workMode}
                    onChange={(e) => setDraft((d) => ({ ...d, workMode: e.target.value }))}
                    className="rt-input w-full text-sm"
                  >
                    <option value="HYBRID">Hybrid</option>
                    <option value="REMOTE">Remote</option>
                    <option value="OFFICE">Office</option>
                  </select>
                </AddFormField>
                <AddFormField label="Account status">
                  <select
                    value={draft.userStatus}
                    onChange={(e) => setDraft((d) => ({ ...d, userStatus: e.target.value }))}
                    className="rt-input w-full text-sm"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="ONBOARDING">Onboarding</option>
                  </select>
                </AddFormField>
                <AddFormField label="Phone">
                  <input
                    value={draft.phoneNumber}
                    onChange={(e) => setDraft((d) => ({ ...d, phoneNumber: e.target.value }))}
                    className="rt-input w-full text-sm"
                    placeholder="+91 …"
                  />
                </AddFormField>
              </div>
            </AddFormSection>

            {!editRoleIsAdmin ? (
              <AddFormSection
                title="Organization"
                subtitle="Band and department must match your directory lookups."
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <AddFormField label="Band" required>
                    <select
                      value={draft.band}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, band: e.target.value, designation: "" }))
                      }
                      className="rt-input w-full text-sm"
                    >
                      {bandSelectOptions.map((band) => (
                        <option key={`edit-band:${band.value}`} value={band.value}>
                          {band.label}
                        </option>
                      ))}
                    </select>
                  </AddFormField>
                  <AddFormField label="Department" required>
                    <select
                      value={draft.stream}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, stream: e.target.value, designation: "" }))
                      }
                      className="rt-input w-full text-sm"
                    >
                      <option value="">Select department</option>
                      {streamSelectOptions.map((stream) => (
                        <option key={`edit-stream:${stream.value}`} value={stream.value}>
                          {stream.label}
                        </option>
                      ))}
                    </select>
                  </AddFormField>
                </div>

                <AddFormField
                  label="Designation"
                  hint={
                    editDesignationLoading
                      ? "Loading designations for this band and department…"
                      : "Designation is derived from band on the server; shown here for reference."
                  }
                >
                  {editDesignationOptions.length > 0 ? (
                    <select
                      value={draft.designation}
                      onChange={(e) => setDraft((d) => ({ ...d, designation: e.target.value }))}
                      className="rt-input w-full text-sm"
                      disabled={editDesignationLoading}
                    >
                      <option value="">Select designation</option>
                      {editDesignationOptions.map((label) => (
                        <option key={`edit-des:${label}`} value={label}>
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={draft.designation}
                      onChange={(e) => setDraft((d) => ({ ...d, designation: e.target.value }))}
                      className="rt-input w-full text-sm"
                      placeholder={
                        editDesignation?.designation || "e.g., Software Engineer II"
                      }
                      disabled={editDesignationLoading}
                    />
                  )}
                </AddFormField>
              </AddFormSection>
            ) : null}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 border-t border-[rgb(var(--border))] pt-4">
              <button
                type="button"
                onClick={closeEdit}
                disabled={mutating}
                className="rt-btn-ghost w-full sm:w-auto disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={mutating}
                className={[
                  "rt-btn-primary w-full sm:w-auto transition-all",
                  mutating ? "opacity-60 cursor-not-allowed" : "",
                ].join(" ")}
              >
                {mutating ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </ModalOverlay>
      ) : null}
    </AdminPageShell>
  );
}
