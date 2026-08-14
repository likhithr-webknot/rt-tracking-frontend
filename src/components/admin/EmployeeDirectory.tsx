// @ts-nocheck
import type { ApiOptions } from "../../types/api-options";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  ArrowUpCircle,
  X,
  Play,
  Square,
  Edit3,
} from "lucide-react";
import Toast from "../shared/Toast";
import SearchField from "../shared/SearchField";
import ListPaginationBar from "../shared/ListPaginationBar";
import CursorPagination from "../shared/CursorPagination";
import ConfirmDialog from "../shared/ConfirmDialog";
import TableDensityToggle from "../shared/TableDensityToggle";
import { useClientPagination } from "../../hooks/useClientPagination";
import { useTableDensity } from "../../hooks/useTableDensity";
import AdminPageHeader, { AdminPageShell } from "./AdminPageHeader";
import { toUserFacingMessage } from "../../utils/userFacingError";
import { isHrPortalUser } from "../../utils/hrRatingsFilter";
import { canHrEditEmployee, isSuperAdminPortalUser } from "../../utils/portalAccess";
import {
  coercePortalRoleSelectValue,
  getPortalRoleSelectOptions,
  isAdminPortalRole,
  resolvePortalRoleLabel,
} from "../../utils/portalRole";
import ModalOverlay from "../shared/ModalOverlay";
import UserAvatar from "../shared/UserAvatar";

import {
  addEmployee,
  deleteEmployee,
  promoteEmployee as promoteEmployeeApi,
  resolveBandCodeFromDisplay,
  resolveEmployeeEmpId,
  setPortalRole,
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
import { resolveStreamSelectValue } from "../../utils/departmentStorage";
import { friendlyProxyUnreachableMessage } from "../../api/http";
import {
  ensurePromotionPathsLoaded,
  getPromotionPreview,
  getNonTechMaxBand,
  getTechMaxBand,
  normalizePromotionErrorMessage,
} from "../../utils/careerPromotion";

function portalRoleVariant(role) {
  const r = String(role ?? "Employee").trim() || "Employee";
  if (r === "Super Admin" || r === "Admin") return "admin";
  if (r === "HR") return "hr";
  if (r === "Finance") return "finance";
  if (r === "Manager") return "manager";
  return "employee";
}

function portalRoleClass(role) {
  return `rt-portal-role rt-portal-role--${portalRoleVariant(role)}`;
}

/** Small label when account status is not active (so admins see inactive users in the list). */
function RoleBadge({ role }) {
  const r = String(role ?? "Employee").trim() || "Employee";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${portalRoleClass(r)}`}
    >
      {r}
    </span>
  );
}

function DirectoryActionButton({ onClick, disabled, title, ariaLabel, variant = "default", children }) {
  const variants = {
    default: "text-[rgb(var(--muted))] hover:text-[rgb(var(--primary))] hover:bg-[rgb(var(--primary))]/10",
    promote: "text-blue-600 dark:text-blue-300 hover:bg-blue-500/10",
    danger: "text-[rgb(var(--danger))] hover:bg-[rgb(var(--danger))]/10",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={[
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-40",
        variants[variant] || variants.default,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function PortalRoleCell({
  emp,
  canEdit,
  portalRoleOptions,
  saving,
  onChange,
}) {
  const roleLabel = resolvePortalRoleLabel(emp?.empRole, emp?.portalRole, emp?.role);
  if (!canEdit) {
    return <RoleBadge role={roleLabel} />;
  }
  return (
    <select
      value={coercePortalRoleSelectValue(roleLabel, portalRoleOptions)}
      disabled={saving}
      onChange={(e) => onChange(emp, e.target.value)}
      className={[
        "rt-portal-role-select h-7 min-w-[8.75rem] shrink-0 cursor-pointer rounded-full border px-2.5 pr-7 text-[11px] font-semibold outline-none transition",
        "focus:ring-2 focus:ring-[rgb(var(--accent))]/20 disabled:cursor-not-allowed disabled:opacity-60",
        portalRoleClass(roleLabel),
      ].join(" ")}
      aria-label={`Portal role for ${emp?.name || emp?.id || "employee"}`}
    >
      {portalRoleOptions.map((role) => (
        <option key={`portal-role:${emp?.id}:${role}`} value={role}>
          {role}
        </option>
      ))}
    </select>
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
  return <span className="rt-status-chip mt-1">{label}</span>;
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
  auth = null,
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
  onOpenProfile = null,
}) {
  const { density, setDensity } = useTableDensity();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all"); // "all" | role value
  const [designationFilter, setDesignationFilter] = useState("all"); // "all" | designation value
  const [bandFilter, setBandFilter] = useState("all"); // "all" | band value

  const [toast, setToast] = useState(null); // { title: string, message?: string }
  const toastTimerRef = useRef(null);
  const [promotionPathsRevision, setPromotionPathsRevision] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    ensurePromotionPathsLoaded({ signal: ac.signal })
      .then(() => setPromotionPathsRevision((n) => n + 1))
      .catch(() => {});
    const onPathsUpdated = () => setPromotionPathsRevision((n) => n + 1);
    window.addEventListener("rt:promotion-paths-updated", onPathsUpdated);
    return () => {
      ac.abort();
      window.removeEventListener("rt:promotion-paths-updated", onPathsUpdated);
    };
  }, []);

  const [mutating, setMutating] = useState(false);
  const [portalRoleSavingId, setPortalRoleSavingId] = useState(null);
  const [promotingId, setPromotingId] = useState(null);
  const [windowUpdatingId, setWindowUpdatingId] = useState(null);
  const [pendingDeleteEmployee, setPendingDeleteEmployee] = useState(null);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState(() => new Set());
  const [pendingBulkDelete, setPendingBulkDelete] = useState(null);
  const [pendingSaveEdit, setPendingSaveEdit] = useState(false);
  const [pendingPortalRoleChange, setPendingPortalRoleChange] = useState(null);
  const [pendingPromoteEmployee, setPendingPromoteEmployee] = useState(null);
  const [promoteBandType, setPromoteBandType] = useState("BOTH");
  const promoteDialogPreview = useMemo(
    () => getPromotionPreview(pendingPromoteEmployee?.band, promoteBandType, null),
    [pendingPromoteEmployee?.band, promoteBandType, promotionPathsRevision],
  );

  const promoteConfirmDisabled = promoteDialogPreview.isMaxBand;
  const isSuperAdminViewer = useMemo(() => isSuperAdminPortalUser(auth), [auth]);
  const isHrViewer = useMemo(() => isHrPortalUser(auth), [auth]);
  const canEditPortalRoles = isSuperAdminViewer || isHrViewer;
  const canModifyEmployee = useCallback(
    (emp) => canHrEditEmployee(auth, emp),
    [auth],
  );

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

  const filterResetKey = `${query}|${roleFilter}|${designationFilter}|${bandFilter}`;
  const listPagination = useClientPagination(filtered, {
    pageSize: 25,
    pageSizeOptions: [25, 50, 100],
    resetKey: filterResetKey,
  });
  const visibleEmployees = listPagination.slice;

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

    const defaults = [
      "B1",
      "B2",
      "B3",
      "B4",
      "B4L",
      "B4H",
      "B5",
      "B5H",
      "B5L",
      "B6",
      "B6H",
      "B6L",
      "B7H",
      "B7L",
      "B8",
    ];
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
  const portalRoleOptions = useMemo(
    () => getPortalRoleSelectOptions({ includeSuperAdmin: isSuperAdminViewer }),
    [isSuperAdminViewer],
  );
  const addRoleIsAdmin = isAdminPortalRole(addDraft.empRole);
  const addFormCanSubmit = useMemo(() => {
    if (employeesLoading || mutating) return false;
    if (!addDraft.employeeName.trim() || !addDraft.email.trim() || !isWebknotWorkEmail(addDraft.email)) {
      return false;
    }
    if (!addRoleIsAdmin) {
      if (!addDraft.band.trim() || !addDraft.stream.trim()) return false;
      if (!addDraft.designation.trim()) return false;
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
  const editRoleIsAdmin = isAdminPortalRole(draft.role);
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

  function guardHrEdit(emp, actionLabel = "modify") {
    if (canModifyEmployee(emp)) return true;
    showToast({
      title: "Not allowed",
      message: `HR cannot ${actionLabel} Super Admin accounts.`,
      tone: "error",
    });
    return false;
  }

  async function handleInlinePortalRoleChange(emp, nextRole) {
    if (!canEditPortalRoles || !emp?.id) return;
    if (!canModifyEmployee(emp)) {
      showToast({
        title: "Portal role update failed",
        message: "HR cannot change Super Admin portal roles.",
        tone: "error",
      });
      return;
    }
    const resolved = resolvePortalRoleLabel(nextRole);
    const current = resolvePortalRoleLabel(emp.empRole, emp.portalRole, emp.role);
    if (resolved === current) return;

    const targetEmail = String(emp.email ?? "").trim().toLowerCase();
    if (!targetEmail || !targetEmail.includes("@")) {
      showToast({
        title: "Portal role update failed",
        message: "This employee has no email address, so the portal role cannot be set.",
        tone: "error",
      });
      return;
    }

    setPendingPortalRoleChange({
      emp,
      empKey: String(emp.id),
      email: targetEmail,
      current,
      resolved,
    });
  }

  async function confirmInlinePortalRoleChange() {
    const pending = pendingPortalRoleChange;
    if (!pending?.email || !pending?.resolved) {
      setPendingPortalRoleChange(null);
      return;
    }
    const { emp, empKey, email, resolved } = pending;
    setPendingPortalRoleChange(null);
    setPortalRoleSavingId(empKey);
    try {
      await setPortalRole({ email, role: resolved });
      // Always apply optimistic update first — directory reload can still return stale
      // multi-role rows until Webtrak replaces legacy GLOBAL/NULL portal roles.
      setEmployees((prev) =>
        prev.map((row) =>
          String(row.id) === empKey
            ? { ...row, role: resolved, empRole: resolved, portalRole: resolved }
            : row,
        ),
      );
      await refreshDirectoryAfterMutation();
      setEmployees((prev) =>
        prev.map((row) => {
          if (String(row.id) !== empKey) return row;
          const reloadedRole = resolvePortalRoleLabel(row.empRole, row.portalRole, row.role);
          // Keep the role we just saved if reload still shows a stale higher privilege.
          if (reloadedRole !== resolved) {
            return { ...row, role: resolved, empRole: resolved, portalRole: resolved };
          }
          return row;
        }),
      );
      showToast({
        title: "Portal role updated",
        message: `${emp.name || empKey} is now ${resolved}.`,
      });
    } catch (err) {
      showToast({
        title: "Portal role update failed",
        message: err?.message || "Please try again.",
        tone: "error",
      });
    } finally {
      setPortalRoleSavingId(null);
    }
  }

  async function requestPromoteEmployee(emp) {
    if (!emp?.id) return;
    if (!guardHrEdit(emp, "promote")) return;
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
    if (!guardHrEdit(emp, "delete")) return;
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
          title: "Employee removed",
          message: `${employeeName || apiEmpId} was deleted from the database.`,
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

  function openEmployeeProfile(emp) {
    if (typeof onOpenProfile === "function") {
      onOpenProfile(emp);
    }
  }

  function openEdit(emp) {
    if (!guardHrEdit(emp, "edit")) return;
    const bandCode = resolveBandCodeFromDisplay(emp.band, bandSelectOptions) || defaultAddBand;
    const streamValue =
      resolveStreamSelectValue(emp.stream, streamSelectOptions) || defaultAddStream;

    setEditDesignationOptions([]);
    setEditDesignation(null);
    setEditingEmployeeId(emp.id);
    setDraft({
      name: emp.name ?? "",
      email: emp.email ?? "",
      role: coercePortalRoleSelectValue(
        resolvePortalRoleLabel(emp.empRole, emp.portalRole, emp.role),
        portalRoleOptions,
      ),
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
      title: fail ? "Bulk delete finished" : "Employees removed",
      message: `${ok} deleted${fail ? `, ${fail} failed` : ""}.`,
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
    const isAdminRole = isAdminPortalRole(draft.role);
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
    const current = getEditingEmployeeRow();
    if (
      current &&
      !isSuperAdminViewer &&
      isAdminPortalRole(current.empRole ?? current.role) &&
      resolvePortalRoleLabel(draft.role) !== resolvePortalRoleLabel(current.empRole ?? current.role)
    ) {
      showToast({
        title: "Not allowed",
        message: "HR cannot change Super Admin portal roles.",
        tone: "error",
      });
      return;
    }
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
      portalRole: resolvePortalRoleLabel(draft.role),
      empRole: resolvePortalRoleLabel(draft.role),
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
    const empRole = resolvePortalRoleLabel(addDraft.empRole);
    const isAdminRole = isAdminPortalRole(empRole);
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

    if (!isAdminRole && !designationValue) {
      showToast({
        title: "Job title required",
        message: "Enter a job title or pick band and department so it auto-fills from your lookup table.",
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
      } else if (lower.includes("users_department_check") || lower.includes("department_check")) {
        message =
          "That department could not be saved on the employee profile. Choose a department from the directory list (e.g. Human Resources, Developer) and ensure it matches the designation lookup for the selected band.";
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

  const listEmpty = !Array.isArray(employees) || employees.length === 0;

  if (employeesLoading && listEmpty && !employeesError) {
    return (
      <AdminPageShell className="space-y-6" maxWidth="max-w-[1600px]">
        <AdminPageHeader
          title="Team list"
          subtitle="Search people, promote bands, and open or close one person's review window."
        />
        <div className="rt-panel flex items-center justify-center gap-2 py-16 text-sm text-[rgb(var(--muted))]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[rgb(var(--border))] border-t-[rgb(var(--accent))]" />
          Loading team list…
        </div>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell className="space-y-6" maxWidth="max-w-[1600px]">
      <AdminPageHeader
        title="Team list"
        subtitle="Search people, promote bands, and open or close one person's review window."
      />

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Total", value: totalEmployeesDisplay },
          { label: "Managers", value: managerCount },
          { label: "Showing", value: filtered.length, accent: true },
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
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-800 dark:text-red-100">
          <div className="font-semibold">Couldn’t load the team list</div>
          <p className="mt-1.5 text-xs sm:text-sm opacity-95">
            {toUserFacingMessage(employeesError, "Please refresh the page or try again in a moment.")}
          </p>
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
          <div className="flex flex-wrap gap-2 lg:shrink-0">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rt-input h-10 min-h-0 w-full min-w-[9rem] sm:w-auto text-sm"
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
              className="rt-input h-10 min-h-0 w-full min-w-[10rem] sm:w-auto text-sm"
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
              className="rt-input h-10 min-h-0 w-full min-w-[9rem] sm:w-auto text-sm"
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
              {filtered.length} of {searchUniverse.length} in view
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
          <button type="button" className="rt-btn-ghost text-xs" onClick={() => setSelectedEmployeeIds(new Set())}>
            Clear selection
          </button>
        </div>
      ) : null}

      {/* ── Desktop roster ── */}
      <div className="pulse-surface hidden lg:block overflow-hidden">
        <div className="border-b border-[rgb(var(--border))] px-4 py-3 sm:px-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[rgb(var(--text))]">Employee roster</h2>
            <p className="pulse-section-subtitle mt-0.5">
              {listPagination.rangeLabel}
              {searchUniverse.length !== filtered.length ? ` (filtered from ${searchUniverse.length})` : ""}
              {" · "}
              {totalEmployeesDisplay} total in directory
            </p>
          </div>
          <TableDensityToggle value={density} onChange={setDensity} />
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table
            className={[
              "rt-data-table min-w-[1180px]",
              density === "comfortable" ? "rt-data-table--comfortable" : "rt-data-table--default",
            ].join(" ")}
          >
            <thead>
              <tr>
                <th className="w-10">
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
                <th className="whitespace-nowrap">Emp ID</th>
                <th className="min-w-[9rem] whitespace-nowrap">Name</th>
                <th className="min-w-[11rem] whitespace-nowrap">Email</th>
                <th className="min-w-[9.5rem] whitespace-nowrap">Portal role</th>
                <th className="min-w-[10rem] whitespace-nowrap">Designation</th>
                <th className="w-[5.5rem] whitespace-nowrap">Band</th>
                <th className="min-w-[9rem] whitespace-nowrap">Department</th>
                <th className="w-[6rem] whitespace-nowrap text-center">Last promo</th>
                <th className="w-[8.5rem] whitespace-nowrap text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleEmployees.map((emp) => {
                const promoteGate = getPromotionPreview(emp.band, "BOTH");
                const bandCode = employeeBandCode(emp);
                const bandLabel = bandLabelMap.get(emp.band) || bandLabelMap.get(bandCode);
                const streamLabel = streamLabelMap.get(emp.stream);
                return (
                <tr
                  key={emp.id}
                  className="cursor-pointer"
                  onClick={() => openEmployeeProfile(emp)}
                >
                  <td className="align-middle" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="rounded border-[rgb(var(--border))]"
                      checked={selectedEmployeeIds.has(String(emp.id ?? "").trim())}
                      onChange={(e) => toggleEmployeeSelected(emp.id, e.target.checked)}
                      aria-label={`Select ${emp.name}`}
                    />
                  </td>
                  <td className="align-middle">
                    <DirectoryCell mono title={emp.id}>{emp.id || "—"}</DirectoryCell>
                  </td>
                  <td className="align-middle">
                    <div className="flex min-w-0 max-w-[12rem] items-center gap-2.5">
                      <div className="relative shrink-0">
                        <UserAvatar
                          email={emp.email}
                          name={emp.name}
                          auth={{
                            picture: emp.profilePhoto || emp.picture,
                            profilePic: emp.profilePhoto || emp.picture,
                          }}
                          size={32}
                          className="h-8 w-8"
                        />
                        {emp.isOnline ? (
                          <span
                            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[rgb(var(--surface))] bg-emerald-500"
                            title="Online in Webtrak"
                            aria-label="Online in Webtrak"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-sm text-[rgb(var(--text))]" title={emp.name}>
                          {emp.name}
                        </div>
                        <DirectoryStatusBadge status={emp.status} />
                      </div>
                    </div>
                  </td>
                  <td className="align-middle">
                    <DirectoryCell title={emp.email}>{emp.email || "—"}</DirectoryCell>
                  </td>
                  <td className="align-middle" onClick={(e) => e.stopPropagation()}>
                    <PortalRoleCell
                      emp={emp}
                      canEdit={canEditPortalRoles}
                      portalRoleOptions={portalRoleOptions}
                      saving={portalRoleSavingId === String(emp.id)}
                      onChange={handleInlinePortalRoleChange}
                    />
                  </td>
                  <td className="align-middle">
                    <DirectoryCell title={employeeDesignation(emp)}>{employeeDesignation(emp)}</DirectoryCell>
                  </td>
                  <td className="align-middle">
                    <div className="font-mono text-sm font-semibold tabular-nums">{bandCode}</div>
                    {bandLabel && bandLabel !== bandCode ? (
                      <div className="text-[10px] text-[rgb(var(--muted))] truncate max-w-[5rem]" title={bandLabel}>
                        {collapseRepeatedSegments(bandLabel)}
                      </div>
                    ) : null}
                  </td>
                  <td className="align-middle">
                    <DirectoryCell title={streamLabel || emp.stream}>
                      {emp.stream || "—"}
                    </DirectoryCell>
                    {streamLabel && streamLabel !== emp.stream ? (
                      <div className="text-[10px] text-[rgb(var(--muted))] truncate max-w-[8rem]" title={streamLabel}>
                        {streamLabel}
                      </div>
                    ) : null}
                  </td>
                  <td className="align-middle text-center">
                     {emp.lastPromotionDate ? (
                        <span className="rt-badge rt-badge--success whitespace-nowrap tabular-nums">
                           {new Date(emp.lastPromotionDate).toLocaleDateString(undefined, {
                            month: "short",
                            day: "2-digit",
                            year: "numeric",
                          })}
                        </span>
                     ) : (
                        <span className="text-[rgb(var(--muted))]">—</span>
                     )}
                  </td>
                  <td className="align-middle text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center justify-end gap-0.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-0.5">
                      <DirectoryActionButton
                        onClick={() => openEdit(emp)}
                        disabled={!canModifyEmployee(emp)}
                        title={
                          !canModifyEmployee(emp)
                            ? "HR cannot edit Super Admin accounts"
                            : "Edit employee"
                        }
                        ariaLabel={`Edit ${emp.name}`}
                      >
                        <Edit3 size={16} strokeWidth={2} />
                      </DirectoryActionButton>
                      <DirectoryActionButton
                        onClick={() => requestPromoteEmployee(emp)}
                        disabled={!canModifyEmployee(emp) || promotingId === emp.id || promoteGate.isMaxBand}
                        variant="promote"
                        title={
                          !canModifyEmployee(emp)
                            ? "HR cannot promote Super Admin accounts"
                            : promoteGate.isMaxBand
                              ? promoteGate.reasonIfBlocked || "Already at highest band on default track"
                              : "Promote to next band"
                        }
                        ariaLabel={`Promote ${emp.name}`}
                      >
                        <ArrowUpCircle size={16} strokeWidth={2} />
                      </DirectoryActionButton>
                    </div>
                  </td>
                </tr>
                );
              })}

              {!employeesLoading && filtered.length === 0 ? (
                <tr>
                  <td className="py-16 text-center" colSpan={10}>
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
        {listPagination.show ? (
          <ListPaginationBar
            rangeLabel={listPagination.rangeLabel}
            page={listPagination.page}
            maxPage={listPagination.maxPage}
            pageSize={listPagination.pageSize}
            pageSizeOptions={listPagination.pageSizeOptions}
            loading={employeesLoading}
            onPageChange={listPagination.setPage}
            onPageSizeChange={listPagination.setPageSize}
          />
        ) : null}
      </div>

      {/* ── Mobile roster ── */}
      <div className="pulse-surface lg:hidden overflow-hidden">
        <div className="border-b border-[rgb(var(--border))] px-4 py-3">
          <h2 className="text-sm font-semibold">Employee roster</h2>
          <p className="pulse-section-subtitle mt-0.5">{listPagination.rangeLabel}</p>
        </div>
        <div className="space-y-3 p-4">
        {visibleEmployees.map((emp) => {
          const promoteGate = getPromotionPreview(emp.band, "BOTH");
          return (
          <div
            key={emp.id}
            className="rt-panel rounded-xl p-4 space-y-3 cursor-pointer"
            onClick={() => openEmployeeProfile(emp)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openEmployeeProfile(emp);
              }
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-[rgb(var(--text))] truncate flex flex-wrap items-center gap-x-1">
                  {emp.name}
                  <DirectoryStatusBadge status={emp.status} />
                </div>
                <div className="text-[11px] text-[rgb(var(--muted))] truncate">{emp.email || "—"}</div>
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <PortalRoleCell
                  emp={emp}
                  canEdit={canEditPortalRoles}
                  portalRoleOptions={portalRoleOptions}
                  saving={portalRoleSavingId === String(emp.id)}
                  onChange={handleInlinePortalRoleChange}
                />
              </div>
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

            <div
              className="flex items-center justify-between gap-2 pt-1 border-t border-[rgb(var(--border))]"
              onClick={(e) => e.stopPropagation()}
            >
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
              <div className="inline-flex items-center gap-0.5 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-0.5">
                <DirectoryActionButton
                  onClick={() => openEdit(emp)}
                  disabled={!canModifyEmployee(emp)}
                  title={
                    !canModifyEmployee(emp)
                      ? "HR cannot edit Super Admin accounts"
                      : "Edit employee"
                  }
                  ariaLabel={`Edit ${emp.name}`}
                >
                  <Edit3 size={16} strokeWidth={2} />
                </DirectoryActionButton>
                <DirectoryActionButton
                  onClick={() => requestPromoteEmployee(emp)}
                  disabled={!canModifyEmployee(emp) || promotingId === emp.id || promoteGate.isMaxBand}
                  variant="promote"
                  title={
                    !canModifyEmployee(emp)
                      ? "HR cannot promote Super Admin accounts"
                      : promoteGate.isMaxBand
                        ? promoteGate.reasonIfBlocked || "Already at highest band on default track"
                        : "Promote to next band"
                  }
                  ariaLabel={`Promote ${emp.name}`}
                >
                  <ArrowUpCircle size={16} strokeWidth={2} />
                </DirectoryActionButton>
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
        {listPagination.show ? (
          <ListPaginationBar
            rangeLabel={listPagination.rangeLabel}
            page={listPagination.page}
            maxPage={listPagination.maxPage}
            pageSize={listPagination.pageSize}
            pageSizeOptions={listPagination.pageSizeOptions}
            loading={employeesLoading}
            onPageChange={listPagination.setPage}
            onPageSizeChange={listPagination.setPageSize}
          />
        ) : null}
        </div>
      </div>

      {pager ? (
        <div className="pulse-surface px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={pager.onReset}
              disabled={Boolean(pager.loading) || !pager.onReset}
              className={[
                "rt-btn-ghost h-9 px-3 text-xs font-semibold",
                Boolean(pager.loading) || !pager.onReset ? "opacity-50 cursor-not-allowed" : "",
              ].join(" ")}
              title="First page"
            >
              First page
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
        title="Delete employee?"
        message={
          pendingDeleteEmployee
            ? `You are about to permanently delete ${pendingDeleteEmployee.name} from the database.\n\nThis removes their profile, roles, allocations, and related portal records. This cannot be undone.`
            : "Delete this employee?"
        }
        confirmText="Yes, delete permanently"
        cancelText="Cancel"
        confirmVariant="danger"
        busy={mutating}
        onCancel={() => setPendingDeleteEmployee(null)}
        onConfirm={confirmDeleteEmployee}
      />

      <ConfirmDialog
        open={Boolean(pendingBulkDelete?.length)}
        title={`Delete ${pendingBulkDelete?.length || 0} employees?`}
        message={
          pendingBulkDelete?.length
            ? `You selected ${pendingBulkDelete.length} people to permanently delete from the database.\n\nThis cannot be undone. Continue?`
            : ""
        }
        confirmText={`Delete ${pendingBulkDelete?.length || 0}`}
        cancelText="Cancel"
        confirmVariant="danger"
        busy={mutating}
        onCancel={() => setPendingBulkDelete(null)}
        onConfirm={confirmBulkDelete}
      />

      <ConfirmDialog
        open={pendingSaveEdit}
        title="Confirm changes to WebTrak?"
        message={
          editingEmployee
            ? `Whatever changes you make here will also update WebTrak.\n\nDo you want to confirm saving updates for ${draft.name || editingEmployee.name}?\n\nEmployee ID will not change.`
            : "Whatever changes you make here will also update WebTrak. Do you want to confirm?"
        }
        confirmText="Confirm & save"
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
        open={Boolean(pendingPortalRoleChange)}
        title="Confirm portal role change?"
        message={
          pendingPortalRoleChange
            ? `Whatever changes you make here will also update WebTrak.\n\nChange ${pendingPortalRoleChange.emp?.name || pendingPortalRoleChange.empKey} from ${pendingPortalRoleChange.current} to ${pendingPortalRoleChange.resolved}?\n\nDo you want to confirm?`
            : "Whatever changes you make here will also update WebTrak. Do you want to confirm?"
        }
        confirmText="Confirm role change"
        cancelText="Cancel"
        confirmVariant="primary"
        busy={Boolean(portalRoleSavingId)}
        onCancel={() => setPendingPortalRoleChange(null)}
        onConfirm={confirmInlinePortalRoleChange}
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
              <option value="TECH">Tech — up to {getTechMaxBand()}</option>
              <option value="NON_TECH">Non-tech — up to {getNonTechMaxBand()}</option>
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
                  value={coercePortalRoleSelectValue(draft.role, portalRoleOptions)}
                  onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
                  className="rt-input w-full text-sm"
                  disabled={!isSuperAdminViewer && isAdminPortalRole(editingEmployee?.empRole ?? editingEmployee?.role)}
                >
                  {portalRoleOptions.map((role) => (
                    <option key={`edit-portal-role:${role}`} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                {!isSuperAdminViewer && isAdminPortalRole(editingEmployee?.empRole ?? editingEmployee?.role) ? (
                  <p className="mt-1.5 text-[10px] text-[rgb(var(--muted))]">
                    HR cannot change Super Admin portal roles.
                  </p>
                ) : null}
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
