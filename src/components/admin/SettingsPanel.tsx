// @ts-nocheck
import type { ApiOptions } from "../../types/api-options";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  Info,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Shield,
  Sliders,
  Square,
  Trash2,
  UserCheck,
  Users,
  Wrench,
  Cloud,
  Briefcase,
} from "lucide-react";
import { fetchDriveStorageStats } from "../../api/webknot-drive";
import Toast from "../shared/Toast";
import ConfirmDialog from "../shared/ConfirmDialog";
import ModalOverlay, { DialogFooter } from "../shared/ModalOverlay";
import AdminPageHeader from "./AdminPageHeader";
import {
  APP_SETTINGS_DEFAULTS,
  getAppSettings,
  resetAppSettings,
  saveAppSettings,
} from "../../utils/appSettings";
import {
  fetchSubmissionWindowCurrent,
  scheduleSubmissionWindow,
  openSubmissionWindowNow,
  closeSubmissionWindowNow,
  fetchRoleSubmissionWindow,
  scheduleRoleSubmissionWindow,
  openRoleSubmissionWindowNow,
  closeRoleSubmissionWindowNow,
  openSubmissionWindowForEmployeeNow,
  closeSubmissionWindowForEmployeeNow,
  fetchEmployeeSubmissionWindowStatus,
} from "../../api/submission-window";
import {
  createSetting as createServerSetting,
  deleteSettingKey as deleteServerSettingKey,
  fetchSettingsList,
  updateSettingKey as updateServerSettingKey,
} from "../../api/settings";
import {
  computeSubmissionWindowOpen,
  parseSettingsWindowFields,
} from "../../utils/submissionWindow";

function SectionCard({ icon: Icon, title, description, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rt-panel overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-5 text-left hover:bg-[rgb(var(--surface-2))]/50 transition-colors"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[rgb(var(--primary))]/10 text-[rgb(var(--primary))] shrink-0">
          <Icon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-[rgb(var(--text))]">{title}</div>
          {description ? <div className="text-xs text-[rgb(var(--muted))] mt-0.5">{description}</div> : null}
        </div>
        {open ? <ChevronDown size={16} className="text-[rgb(var(--muted))]" /> : <ChevronRight size={16} className="text-[rgb(var(--muted))]" />}
      </button>
      {open ? <div className="border-t border-[rgb(var(--border))] p-5 space-y-5">{children}</div> : null}
    </div>
  );
}

function FieldLabel({ children, hint }) {
  return (
    <div className="mb-1.5">
      <div className="text-[10px] font-semibold text-[rgb(var(--muted))] uppercase tracking-wider">{children}</div>
      {hint ? <div className="text-[10px] text-[rgb(var(--muted))]/70 mt-0.5">{hint}</div> : null}
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer group">
      <span className="text-sm text-[rgb(var(--text))]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={[
          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 shrink-0",
          checked ? "bg-[rgb(var(--primary))]" : "bg-[rgb(var(--border))]",
        ].join(" ")}
      >
        <span
          className={[
            "inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform duration-200",
            checked ? "translate-x-6" : "translate-x-1",
          ].join(" ")}
        />
      </button>
    </label>
  );
}

/* ── datetime helpers ── */

function toLocalInputValue(date) {
  if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function parseInputDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isWindowOpenLocal(win) {
  const start = parseInputDate(win?.start);
  const end = parseInputDate(win?.end);
  return computeSubmissionWindowOpen({
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
    manualClosed: win?.manualClosed,
    isOpen: win?.isOpen,
  });
}

/* ── WindowCard sub-component ── */

function WindowCard({ icon: Icon, iconColor, title, win, setWin, isOpen, busy, onToggle, onSchedule }) {
  return (
    <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className={`rounded-md p-1.5 ${iconColor}/10 ${iconColor.replace("bg-", "text-")}`}>
          <Icon size={14} />
        </div>
        <span className="text-sm font-semibold text-[rgb(var(--text))]">{title}</span>
        <span
          className={`ml-auto text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${
            isOpen
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
              : "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20"
          }`}
        >
          {isOpen ? "Active" : "Inactive"}
        </span>
      </div>
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="rt-kicker">Open at</label>
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" size={14} />
            <input
              type="datetime-local"
              value={win.start}
              onChange={(e) => setWin((p) => ({ ...p, start: e.target.value }))}
              className="w-full rt-input py-2.5 pl-9 pr-3 text-sm"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="rt-kicker">Close at</label>
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" size={14} />
            <input
              type="datetime-local"
              value={win.end}
              onChange={(e) => setWin((p) => ({ ...p, end: e.target.value }))}
              className="w-full rt-input py-2.5 pl-9 pr-3 text-sm"
            />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onToggle}
            disabled={busy}
            className={[
              "flex-1 rt-btn-primary justify-center py-2.5 text-sm",
              isOpen
                ? "!bg-red-500/10 !text-red-700 dark:!text-red-300 !border-red-500/20 hover:!bg-red-500 hover:!text-white"
                : "!bg-emerald-500 !text-white hover:!bg-emerald-400",
              busy ? " opacity-60 cursor-not-allowed" : "",
            ].join(" ")}
          >
            {busy ? "Working…" : isOpen ? <><Square size={13} /> Stop</> : <><Play size={13} /> Start</>}
          </button>
          <button
            type="button"
            onClick={onSchedule}
            disabled={busy}
            className={["flex-1 rt-btn-ghost justify-center py-2.5 text-sm", busy ? " opacity-60 cursor-not-allowed" : ""].join("")}
          >
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPanel() {
  const [settings, setSettings] = useState(() => getAppSettings());
  const [toast, setToast] = useState(null);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [driveStats, setDriveStats] = useState(null);
  const [driveStatsLoading, setDriveStatsLoading] = useState(false);

  const [serverRows, setServerRows] = useState([]);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [serverBusy, setServerBusy] = useState(false);
  const [newServerKey, setNewServerKey] = useState("");
  const [newServerValue, setNewServerValue] = useState("");
  const [editServerKey, setEditServerKey] = useState(null);
  const [editServerValue, setEditServerValue] = useState("");

  /* ── Submission Window state ── */
  const [globalWin, setGlobalWin] = useState({ start: "", end: "" });
  const [empWin, setEmpWin] = useState({ start: "", end: "" });
  const [mgrWin, setMgrWin] = useState({ start: "", end: "" });
  const [globalBusy, setGlobalBusy] = useState(false);
  const [empBusy, setEmpBusy] = useState(false);
  const [mgrBusy, setMgrBusy] = useState(false);
  const [winLoading, setWinLoading] = useState(true);

  /* per-employee override */
  const [empOverrideId, setEmpOverrideId] = useState("");
  const [empOverrideResult, setEmpOverrideResult] = useState(null);
  const [empOverrideBusy, setEmpOverrideBusy] = useState(false);
  const [empOverrideModalOpen, setEmpOverrideModalOpen] = useState(false);
  const [settingKeyToDelete, setSettingKeyToDelete] = useState(null);

  const globalIsOpen = useMemo(() => isWindowOpenLocal(globalWin), [globalWin]);
  const empIsOpen = useMemo(() => isWindowOpenLocal(empWin), [empWin]);
  const mgrIsOpen = useMemo(() => isWindowOpenLocal(mgrWin), [mgrWin]);

  /* Fetch all 3 windows on mount */
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    (async () => {
      setWinLoading(true);
      try {
        const [gRes, eRes, mRes] = await Promise.allSettled([
          fetchSubmissionWindowCurrent({ signal: controller.signal }),
          fetchRoleSubmissionWindow("employee", { signal: controller.signal }),
          fetchRoleSubmissionWindow("manager", { signal: controller.signal }),
        ]);
        if (!alive) return;
        if (gRes.status === "fulfilled") {
          setGlobalWin(parseSettingsWindowFields(gRes.value));
        }
        if (eRes.status === "fulfilled") {
          setEmpWin(parseSettingsWindowFields(eRes.value));
        }
        if (mRes.status === "fulfilled") {
          setMgrWin(parseSettingsWindowFields(mRes.value));
        }
      } catch { /* swallow */ }
      if (alive) setWinLoading(false);
    })();
    return () => { alive = false; controller.abort(); };
  }, []);

  function showToastMsg(t) { setToast(t); }

  /* ── Window action helpers ── */
  const handleGlobalToggle = useCallback(async () => {
    setGlobalBusy(true);
    try {
      const res = globalIsOpen ? await closeSubmissionWindowNow() : await openSubmissionWindowNow();
      setGlobalWin(parseSettingsWindowFields(res));
      showToastMsg({ title: globalIsOpen ? "Global window closed" : "Global window opened", message: "Updated." });
    } catch (err) {
      showToastMsg({ title: "Failed", message: err?.message || "Please try again." });
    } finally { setGlobalBusy(false); }
  }, [globalIsOpen]);

  const handleGlobalSchedule = useCallback(async () => {
    const start = parseInputDate(globalWin.start);
    const end = parseInputDate(globalWin.end);
    if (!start || !end) { showToastMsg({ title: "Invalid", message: "Pick valid dates." }); return; }
    if (end <= start) { showToastMsg({ title: "Invalid", message: "Close must be after Open." }); return; }
    setGlobalBusy(true);
    try {
      const res = await scheduleSubmissionWindow({ startAt: start.toISOString(), endAt: end.toISOString() });
      setGlobalWin(parseSettingsWindowFields(res));
      showToastMsg({ title: "Scheduled", message: "Global window schedule saved." });
    } catch (err) {
      showToastMsg({ title: "Failed", message: err?.message || "Please try again." });
    } finally { setGlobalBusy(false); }
  }, [globalWin]);

  function makeRoleHandlers(role, win, setWin, isOpen, setBusy) {
    const label = role === "employee" ? "Employee" : "Manager";
    const toggle = async () => {
      setBusy(true);
      try {
        const res = isOpen ? await closeRoleSubmissionWindowNow(role) : await openRoleSubmissionWindowNow(role);
        setWin(parseSettingsWindowFields(res));
        showToastMsg({ title: isOpen ? `${label} window closed` : `${label} window opened`, message: "Updated." });
      } catch (err) {
        showToastMsg({ title: "Failed", message: err?.message || "Please try again." });
      } finally { setBusy(false); }
    };
    const schedule = async () => {
      const start = parseInputDate(win.start);
      const end = parseInputDate(win.end);
      if (!start || !end) { showToastMsg({ title: "Invalid", message: "Pick valid dates." }); return; }
      if (end <= start) { showToastMsg({ title: "Invalid", message: "Close must be after Open." }); return; }
      setBusy(true);
      try {
        const res = await scheduleRoleSubmissionWindow(role, { startAt: start.toISOString(), endAt: end.toISOString() });
        setWin(parseSettingsWindowFields(res));
        showToastMsg({ title: "Scheduled", message: `${label} window schedule saved.` });
      } catch (err) {
        showToastMsg({ title: "Failed", message: err?.message || "Please try again." });
      } finally { setBusy(false); }
    };
    return { toggle, schedule };
  }

  const empHandlers = useMemo(() => makeRoleHandlers("employee", empWin, setEmpWin, empIsOpen, setEmpBusy), [empWin, empIsOpen]);
  const mgrHandlers = useMemo(() => makeRoleHandlers("manager", mgrWin, setMgrWin, mgrIsOpen, setMgrBusy), [mgrWin, mgrIsOpen]);

  /* Per-employee override handlers */
  async function lookupEmployeeWindow() {
    const id = String(empOverrideId).trim();
    if (!id) { showToastMsg({ title: "Missing", message: "Enter an employee ID." }); return; }
    setEmpOverrideBusy(true);
    setEmpOverrideResult(null);
    try {
      const res = await fetchEmployeeSubmissionWindowStatus(id);
      setEmpOverrideResult({ type: "status", data: parseSettingsWindowFields(res), employeeId: id });
    } catch (err) {
      showToastMsg({ title: "Lookup failed", message: err?.message || "Please try again." });
    } finally { setEmpOverrideBusy(false); }
  }

  async function openWindowForEmployee() {
    const id = String(empOverrideId).trim();
    if (!id) return;
    setEmpOverrideBusy(true);
    try {
      const res = await openSubmissionWindowForEmployeeNow(id);
      setEmpOverrideResult({ type: "status", data: parseSettingsWindowFields(res), employeeId: id });
      showToastMsg({ title: "Window opened", message: `Opened for ${id}.` });
    } catch (err) {
      showToastMsg({ title: "Failed", message: err?.message || "Please try again." });
    } finally { setEmpOverrideBusy(false); }
  }

  async function closeWindowForEmployee() {
    const id = String(empOverrideId).trim();
    if (!id) return;
    setEmpOverrideBusy(true);
    try {
      const res = await closeSubmissionWindowForEmployeeNow(id);
      setEmpOverrideResult({ type: "status", data: parseSettingsWindowFields(res), employeeId: id });
      showToastMsg({ title: "Window closed", message: `Closed for ${id}.` });
    } catch (err) {
      showToastMsg({ title: "Failed", message: err?.message || "Please try again." });
    } finally { setEmpOverrideBusy(false); }
  }

  useEffect(() => {
    function onUpdated(event) {
      const next = event?.detail && typeof event.detail === "object" ? event.detail : getAppSettings();
      setSettings(next);
      setHasUnsaved(false);
    }
    window.addEventListener("rt:app-settings-updated", onUpdated);
    return () => window.removeEventListener("rt:app-settings-updated", onUpdated);
  }, []);

  const refreshServerSettings = useCallback(async ({ signal } = {} as ApiOptions) => {
    setServerLoading(true);
    setServerError("");
    try {
      const rows = await fetchSettingsList({ signal });
      if (signal?.aborted) return;
      setServerRows(Array.isArray(rows) ? rows : []);
    } catch (err) {
      if (err?.name === "AbortError" || signal?.aborted) return;
      setServerRows([]);
      if (err?.status === 401) {
        setServerError("Sign in required to load server settings.");
      } else {
        setServerError(err?.message || "Could not load server settings.");
      }
    } finally {
      if (!signal?.aborted) setServerLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    refreshServerSettings({ signal: ac.signal }).catch(() => {});
    return () => ac.abort();
  }, [refreshServerSettings]);

  useEffect(() => {
    let alive = true;
    setDriveStatsLoading(true);
    fetchDriveStorageStats()
      .then((s) => {
        if (alive) setDriveStats(s);
      })
      .catch(() => {
        if (alive) setDriveStats(null);
      })
      .finally(() => {
        if (alive) setDriveStatsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const effectiveApiBase = useMemo(() => {
    const runtime = String(settings?.apiBaseUrl || "").trim();
    if (runtime) return runtime;
    const envBase = String(import.meta?.env?.VITE_API_BASE_URL || "").trim();
    return envBase || "(using Vite proxy / same-origin)";
  }, [settings?.apiBaseUrl]);

  function updateSetting(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setHasUnsaved(true);
  }

  function onSave(e) {
    e?.preventDefault?.();
    const next = saveAppSettings(settings);
    setSettings(next);
    setHasUnsaved(false);
    setToast({ title: "Settings saved", message: "All changes have been applied." });
  }

  function onReset() {
    const next = resetAppSettings();
    setSettings(next);
    setHasUnsaved(false);
    setToast({ title: "Reset complete", message: "All settings restored to defaults." });
  }

  async function handleCreateServerSetting() {
    const key = String(newServerKey).trim();
    if (!key) {
      setToast({ title: "Missing key", message: "Enter a setting key." });
      return;
    }
    setServerBusy(true);
    try {
      await createServerSetting({ key, value: newServerValue });
      setNewServerKey("");
      setNewServerValue("");
      await refreshServerSettings();
      setToast({ title: "Setting created", message: key });
    } catch (err) {
      if (err?.status === 401) {
        setToast({ title: "Session expired", message: "Please sign in again." });
      } else {
        setToast({ title: "Create failed", message: err?.message || "Please try again." });
      }
    } finally {
      setServerBusy(false);
    }
  }

  async function handleSaveServerEdit() {
    if (!editServerKey) return;
    setServerBusy(true);
    try {
      await updateServerSettingKey(editServerKey, { value: editServerValue });
      setEditServerKey(null);
      setEditServerValue("");
      await refreshServerSettings();
      setToast({ title: "Setting updated", message: editServerKey });
    } catch (err) {
      setToast({ title: "Update failed", message: err?.message || "Please try again." });
    } finally {
      setServerBusy(false);
    }
  }

  async function handleDeleteServerSetting(key) {
    const k = String(key ?? settingKeyToDelete ?? "").trim();
    if (!k) return;
    setServerBusy(true);
    try {
      await deleteServerSettingKey(k);
      if (editServerKey === k) {
        setEditServerKey(null);
        setEditServerValue("");
      }
      await refreshServerSettings();
      setToast({ title: "Setting deleted", message: k });
    } catch (err) {
      setToast({ title: "Delete failed", message: err?.message || "Please try again." });
    } finally {
      setServerBusy(false);
      setSettingKeyToDelete(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      <AdminPageHeader
        title="Settings"
        subtitle="Application behaviour, display preferences, and security options."
      />

      {/* ── Webknot Drive storage ── */}
      <SectionCard icon={Cloud} title="Webknot Drive" description="Object storage quota and upload limits" defaultOpen>
        {driveStatsLoading ? (
          <p className="text-sm text-[rgb(var(--muted))]">Loading storage usage…</p>
        ) : driveStats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
            <div className="rounded-lg border border-[rgb(var(--border))] p-3">
              <div className="text-[10px] uppercase text-[rgb(var(--muted))]">Files</div>
              <div className="font-semibold text-lg">{driveStats.fileCount}</div>
            </div>
            <div className="rounded-lg border border-[rgb(var(--border))] p-3">
              <div className="text-[10px] uppercase text-[rgb(var(--muted))]">Used</div>
              <div className="font-semibold text-lg">{driveStats.totalMb} MB</div>
            </div>
            <div className="rounded-lg border border-[rgb(var(--border))] p-3 col-span-2">
              <div className="text-[10px] uppercase text-[rgb(var(--muted))]">Source</div>
              <div className="font-medium">{driveStats.source === "server" ? "Linode object storage" : "Local browser cache"}</div>
            </div>
          </div>
        ) : null}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <FieldLabel hint="Shown on Drive page as quota bar">Storage quota (GB)</FieldLabel>
            <input
              type="number"
              min={1}
              max={500}
              value={Number(settings?.driveQuotaGb ?? APP_SETTINGS_DEFAULTS.driveQuotaGb)}
              onChange={(e) => updateSetting("driveQuotaGb", Number.parseInt(String(e.target.value || "50"), 10) || 50)}
              className="rt-input text-sm"
            />
          </div>
          <div>
            <FieldLabel hint="Reject uploads larger than this">Max upload size (MB)</FieldLabel>
            <input
              type="number"
              min={1}
              max={100}
              value={Number(settings?.driveMaxUploadMb ?? APP_SETTINGS_DEFAULTS.driveMaxUploadMb)}
              onChange={(e) => updateSetting("driveMaxUploadMb", Number.parseInt(String(e.target.value || "10"), 10) || 10)}
              className="rt-input text-sm"
            />
          </div>
        </div>
      </SectionCard>

      {/* ── Employee & manager experience ── */}
      <SectionCard icon={Briefcase} title="Employee & manager experience" description="Features that improve review cycles and team workflows">
        <div className="space-y-4">
          <Toggle
            checked={settings?.managerCalibrationHints ?? APP_SETTINGS_DEFAULTS.managerCalibrationHints}
            onChange={(v) => updateSetting("managerCalibrationHints", v)}
            label="Manager calibration hints (blind compare)"
          />
          <Toggle
            checked={settings?.enableSubmissionPlaybook ?? APP_SETTINGS_DEFAULTS.enableSubmissionPlaybook}
            onChange={(v) => updateSetting("enableSubmissionPlaybook", v)}
            label="Resubmission playbook checklist (employees)"
          />
          <Toggle
            checked={settings?.showEmploymentOnCards ?? APP_SETTINGS_DEFAULTS.showEmploymentOnCards}
            onChange={(v) => updateSetting("showEmploymentOnCards", v)}
            label="Show band & designation on directory cards"
          />
          <div>
            <FieldLabel hint="0 disables reminders">Manager review reminder (days before cycle end)</FieldLabel>
            <input
              type="number"
              min={0}
              max={30}
              value={Number(settings?.managerReviewReminderDays ?? APP_SETTINGS_DEFAULTS.managerReviewReminderDays)}
              onChange={(e) =>
                updateSetting("managerReviewReminderDays", Number.parseInt(String(e.target.value || "0"), 10) || 0)
              }
              className="rt-input text-sm max-w-[8rem]"
            />
          </div>
        </div>
      </SectionCard>

      {/* ── General Settings ── */}
      <SectionCard icon={Sliders} title="General" description="Display and behaviour preferences">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <FieldLabel hint="5 – 100 items per page">Employee Values Page Size</FieldLabel>
            <input
              type="number"
              min={5}
              max={100}
              step={1}
              value={Number(settings?.employeeValuesPageSize ?? APP_SETTINGS_DEFAULTS.employeeValuesPageSize)}
              onChange={(e) => updateSetting("employeeValuesPageSize", Number.parseInt(String(e.target.value || "10"), 10) || APP_SETTINGS_DEFAULTS.employeeValuesPageSize)}
              className="rt-input text-sm"
            />
          </div>

          <div>
            <FieldLabel hint="How months appear across the app">Date Display Format</FieldLabel>
            <select
              value={settings?.dateFormat ?? APP_SETTINGS_DEFAULTS.dateFormat}
              onChange={(e) => updateSetting("dateFormat", e.target.value)}
              className="rt-input text-sm"
            >
              <option value="MMM YYYY">Mar 2026 (MMM YYYY)</option>
              <option value="YYYY-MM">2026-03 (YYYY-MM)</option>
              <option value="MM/YYYY">03/2026 (MM/YYYY)</option>
            </select>
          </div>
        </div>

        <div className="space-y-4 pt-2">
          <Toggle
            checked={settings?.tableAnimations ?? APP_SETTINGS_DEFAULTS.tableAnimations}
            onChange={(v) => updateSetting("tableAnimations", v)}
            label="Table animations"
          />
          <Toggle
            checked={settings?.compactTables ?? APP_SETTINGS_DEFAULTS.compactTables}
            onChange={(v) => updateSetting("compactTables", v)}
            label="Compact table rows"
          />
          <Toggle
            checked={settings?.enableSoundAlerts ?? APP_SETTINGS_DEFAULTS.enableSoundAlerts}
            onChange={(v) => updateSetting("enableSoundAlerts", v)}
            label="Notification sound alerts"
          />
        </div>
      </SectionCard>

      {/* ── Notifications & Timing ── */}
      <SectionCard icon={Info} title="Notifications & Timing" description="Control polling and autosave intervals">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <FieldLabel hint="500 – 5,000 ms">Draft Autosave Delay</FieldLabel>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={500}
                max={5000}
                step={100}
                value={Number(settings?.draftAutosaveDelayMs ?? APP_SETTINGS_DEFAULTS.draftAutosaveDelayMs)}
                onChange={(e) => updateSetting("draftAutosaveDelayMs", Number.parseInt(String(e.target.value || "900"), 10) || APP_SETTINGS_DEFAULTS.draftAutosaveDelayMs)}
                className="rt-input text-sm flex-1"
              />
              <span className="text-xs text-[rgb(var(--muted))] shrink-0">ms</span>
            </div>
          </div>

          <div>
            <FieldLabel hint="5,000 – 120,000 ms">Notification Poll Interval</FieldLabel>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={5000}
                max={120000}
                step={1000}
                value={Number(settings?.notificationPollIntervalMs ?? APP_SETTINGS_DEFAULTS.notificationPollIntervalMs)}
                onChange={(e) => updateSetting("notificationPollIntervalMs", Number.parseInt(String(e.target.value || "30000"), 10) || APP_SETTINGS_DEFAULTS.notificationPollIntervalMs)}
                className="rt-input text-sm flex-1"
              />
              <span className="text-xs text-[rgb(var(--muted))] shrink-0">ms</span>
            </div>
          </div>

          <div>
            <FieldLabel hint="5 – 480 minutes">Session Timeout</FieldLabel>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={5}
                max={480}
                step={5}
                value={Number(settings?.sessionTimeoutMinutes ?? APP_SETTINGS_DEFAULTS.sessionTimeoutMinutes)}
                onChange={(e) => updateSetting("sessionTimeoutMinutes", Number.parseInt(String(e.target.value || "60"), 10) || APP_SETTINGS_DEFAULTS.sessionTimeoutMinutes)}
                className="rt-input text-sm flex-1"
              />
              <span className="text-xs text-[rgb(var(--muted))] shrink-0">min</span>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── Advanced ── */}
      <SectionCard icon={Wrench} title="Advanced" description="API configuration and developer options" defaultOpen={false}>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 mb-1 flex items-start gap-2">
          <Info size={14} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            These settings are intended for developers and administrators. Incorrect values may affect application stability.
          </p>
        </div>

        <div>
          <FieldLabel hint="Leave empty so Vite proxies to Spring (VITE_API_DEV_PROXY or :8080). Set only for a real remote API.">
            API Base URL Override
          </FieldLabel>
          <input
            value={String(settings?.apiBaseUrl ?? "")}
            onChange={(e) => updateSetting("apiBaseUrl", e.target.value)}
            className="rt-input text-sm font-mono"
            placeholder="https://api.example.com"
          />
          <div className="mt-2 text-xs text-[rgb(var(--muted))]">
            Effective: <span className="font-mono text-[rgb(var(--text))]">{effectiveApiBase}</span>
            {import.meta.env?.DEV ? (
              <span className="block mt-1.5 text-amber-700 dark:text-amber-300">
                Dev: many <strong>502</strong> responses in the Network tab usually mean the proxy cannot reach the backend — fix connectivity first; the UI cannot load profile or KPI data without a live API.
              </span>
            ) : null}
          </div>
        </div>

        <div className="pt-2">
          <Toggle
            checked={settings?.debugMode ?? APP_SETTINGS_DEFAULTS.debugMode}
            onChange={(v) => updateSetting("debugMode", v)}
            label="Debug mode (verbose console logging)"
          />
        </div>
      </SectionCard>

      {/* ── Server settings (Webtrak API) ── */}
      <SectionCard
        icon={Database}
        title="Server settings"
        description="Key-value pairs from the Spring API (SettingsController). Distinct from browser preferences above."
        defaultOpen={false}
      >
        <div className="flex flex-wrap items-center gap-2 justify-between mb-4">
          <p className="text-xs text-[rgb(var(--muted))] max-w-xl">
            GET/POST <span className="font-mono">/api/v1/settings</span>, GET/PUT/PATCH/DELETE{" "}
            <span className="font-mono">/api/v1/settings/{"{key}"}</span>, plus legacy aliases (
            <span className="font-mono">list-settings</span>, <span className="font-mono">create-setting</span>, etc.).
          </p>
          <button
            type="button"
            disabled={serverLoading || serverBusy}
            onClick={() => refreshServerSettings().catch(() => {})}
            className="rt-btn-ghost text-xs py-2 px-3 shrink-0"
          >
            <RefreshCw size={13} className={serverLoading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        {serverError ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-800 dark:text-red-200 mb-3">
            {serverError}
          </div>
        ) : null}

        {serverLoading && !serverRows.length && !serverError ? (
          <div className="text-sm text-[rgb(var(--muted))] py-6 text-center">Loading server settings…</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[rgb(var(--border))]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] text-left text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">
                  <th className="p-3 font-semibold w-[28%]">Key</th>
                  <th className="p-3 font-semibold">Value</th>
                  <th className="p-3 font-semibold w-[120px] text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {serverRows.length === 0 && !serverLoading ? (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-[rgb(var(--muted))] text-xs">
                      No server settings returned. Create one below or check the API.
                    </td>
                  </tr>
                ) : null}
                {serverRows.map((row) => (
                  <tr key={row.key} className="border-b border-[rgb(var(--border))] last:border-0">
                    <td className="p-3 align-top font-mono text-xs text-[rgb(var(--text))] break-all">{row.key}</td>
                    <td className="p-3 align-top">
                      {editServerKey === row.key ? (
                        <textarea
                          value={editServerValue}
                          onChange={(e) => setEditServerValue(e.target.value)}
                          rows={3}
                          className="w-full rt-input text-xs font-mono"
                        />
                      ) : (
                        <div className="text-xs font-mono whitespace-pre-wrap break-all text-[rgb(var(--text))]">
                          {row.value || "—"}
                        </div>
                      )}
                    </td>
                    <td className="p-3 align-top text-right whitespace-nowrap">
                      {editServerKey === row.key ? (
                        <div className="flex flex-col gap-1 items-end">
                          <button
                            type="button"
                            disabled={serverBusy}
                            onClick={handleSaveServerEdit}
                            className="rt-btn-primary text-[10px] py-1 px-2"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            disabled={serverBusy}
                            onClick={() => {
                              setEditServerKey(null);
                              setEditServerValue("");
                            }}
                            className="rt-btn-ghost text-[10px] py-1 px-2"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-1 justify-end">
                          <button
                            type="button"
                            disabled={serverBusy}
                            onClick={() => {
                              setEditServerKey(row.key);
                              setEditServerValue(row.value);
                            }}
                            className="rt-btn-ghost p-2"
                            title="Edit value"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            disabled={serverBusy}
                            onClick={() => setSettingKeyToDelete(row.key)}
                            className="rt-btn-ghost p-2 text-red-600 dark:text-red-400"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-[rgb(var(--border))] space-y-3">
          <div className="text-xs font-semibold text-[rgb(var(--muted))] uppercase tracking-wider">Add setting</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Key</FieldLabel>
              <input
                value={newServerKey}
                onChange={(e) => setNewServerKey(e.target.value)}
                className="w-full rt-input text-sm font-mono"
                placeholder="e.g. feature.notifications.enabled"
                disabled={serverBusy}
              />
            </div>
            <div>
              <FieldLabel>Value</FieldLabel>
              <textarea
                value={newServerValue}
                onChange={(e) => setNewServerValue(e.target.value)}
                rows={2}
                className="w-full rt-input text-sm font-mono"
                placeholder="String or JSON"
                disabled={serverBusy}
              />
            </div>
          </div>
          <button
            type="button"
            disabled={serverBusy || !String(newServerKey).trim()}
            onClick={() => handleCreateServerSetting().catch(() => {})}
            className="rt-btn-primary text-sm py-2"
          >
            <Plus size={14} /> Create on server
          </button>
        </div>
      </SectionCard>

      {/* ── Submission Windows ── */}
      <SectionCard icon={Calendar} title="Windows" description="Manage submission window schedules for all portals">
        {winLoading ? (
          <div className="text-sm text-[rgb(var(--muted))] animate-pulse py-4 text-center">Loading window status…</div>
        ) : (
          <>
            {/* Status indicators */}
            <div className="flex items-center gap-4 flex-wrap pb-2">
              {[
                { label: "Global", open: globalIsOpen },
                { label: "Employee", open: empIsOpen },
                { label: "Manager", open: mgrIsOpen },
              ].map(({ label, open }) => (
                <span key={label} className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                  <span className={`h-2 w-2 rounded-full ${open ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                  {label} {open ? "Open" : "Closed"}
                </span>
              ))}
            </div>

            {/* Three window cards */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <WindowCard
                icon={Calendar}
                iconColor="bg-blue-500"
                title="Global"
                win={globalWin}
                setWin={setGlobalWin}
                isOpen={globalIsOpen}
                busy={globalBusy}
                onToggle={handleGlobalToggle}
                onSchedule={handleGlobalSchedule}
              />
              <WindowCard
                icon={UserCheck}
                iconColor="bg-blue-500"
                title="Employee"
                win={empWin}
                setWin={setEmpWin}
                isOpen={empIsOpen}
                busy={empBusy}
                onToggle={empHandlers.toggle}
                onSchedule={empHandlers.schedule}
              />
              <WindowCard
                icon={Shield}
                iconColor="bg-emerald-500"
                title="Manager"
                win={mgrWin}
                setWin={setMgrWin}
                isOpen={mgrIsOpen}
                busy={mgrBusy}
                onToggle={mgrHandlers.toggle}
                onSchedule={mgrHandlers.schedule}
              />
            </div>

            <div className="border-t border-[rgb(var(--border))] pt-5 mt-2 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="rounded-md p-1.5 bg-amber-500/10 text-amber-500"><Users size={14} /></div>
                <div>
                  <div className="text-sm font-semibold text-[rgb(var(--text))]">Per-employee override</div>
                  <div className="text-[10px] text-[rgb(var(--muted))]">Open, close, or check submission window for one employee</div>
                </div>
              </div>
              <button
                type="button"
                className="rt-btn-primary text-sm"
                onClick={() => setEmpOverrideModalOpen(true)}
              >
                Manage override…
              </button>
            </div>

            <ModalOverlay
              open={empOverrideModalOpen}
              onClose={() => setEmpOverrideModalOpen(false)}
              maxWidth="max-w-lg"
              zIndex={140}
              title="Per-employee window"
              subtitle="Override global and role windows for a single employee ID."
            >
              <div className="space-y-4">
              <div className="flex items-end gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <FieldLabel>Employee ID</FieldLabel>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" size={14} />
                    <input
                      value={empOverrideId}
                      onChange={(e) => setEmpOverrideId(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") lookupEmployeeWindow(); }}
                      className="w-full rt-input py-2.5 pl-9 pr-3 text-sm font-mono"
                      placeholder="e.g. EMP001"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={lookupEmployeeWindow}
                  disabled={empOverrideBusy || !empOverrideId.trim()}
                  className={["rt-btn-ghost text-sm py-2.5", empOverrideBusy ? " opacity-60 cursor-not-allowed" : ""].join("")}
                >
                  <Search size={13} /> Lookup
                </button>
                <button
                  type="button"
                  onClick={openWindowForEmployee}
                  disabled={empOverrideBusy || !empOverrideId.trim()}
                  className={["rt-btn-primary text-sm py-2.5 !bg-emerald-500 !text-white hover:!bg-emerald-400", empOverrideBusy ? " opacity-60 cursor-not-allowed" : ""].join("")}
                >
                  <Play size={13} /> Open
                </button>
                <button
                  type="button"
                  onClick={closeWindowForEmployee}
                  disabled={empOverrideBusy || !empOverrideId.trim()}
                  className={["rt-btn-primary text-sm py-2.5 !bg-red-500/10 !text-red-700 dark:!text-red-300 !border-red-500/20 hover:!bg-red-500 hover:!text-white", empOverrideBusy ? " opacity-60 cursor-not-allowed" : ""].join("")}
                >
                  <Square size={13} /> Close
                </button>
              </div>

              {empOverrideResult?.data ? (
                <div className="mt-3 rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-[rgb(var(--text))]">
                      Window for <span className="font-mono">{empOverrideResult.employeeId}</span>
                    </span>
                    <span
                      className={`ml-auto text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${
                        empOverrideResult.data.isOpen || isWindowOpenLocal(empOverrideResult.data)
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                          : "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20"
                      }`}
                    >
                      {empOverrideResult.data.isOpen || isWindowOpenLocal(empOverrideResult.data) ? "Open" : "Closed"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-[rgb(var(--muted))]">Opens:</span>{" "}
                      <span className="font-mono text-[rgb(var(--text))]">{empOverrideResult.data.start || "—"}</span>
                    </div>
                    <div>
                      <span className="text-[rgb(var(--muted))]">Closes:</span>{" "}
                      <span className="font-mono text-[rgb(var(--text))]">{empOverrideResult.data.end || "—"}</span>
                    </div>
                  </div>
                </div>
              ) : null}
              </div>
            </ModalOverlay>
          </>
        )}
      </SectionCard>

      {/* ── Save / Reset bar ── */}
      <div className="flex items-center justify-between gap-3 sticky bottom-4 z-10">
        <div className="flex-1">
          {hasUnsaved ? (
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">You have unsaved changes</span>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onReset}
            className="rt-btn-ghost text-sm"
          >
            <RotateCcw size={14} /> Reset Defaults
          </button>
          <button
            type="button"
            onClick={onSave}
            className="rt-btn-primary text-sm"
          >
            <Save size={14} /> Save Settings
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(settingKeyToDelete)}
        title="Delete setting"
        message={
          settingKeyToDelete
            ? `Delete server setting "${settingKeyToDelete}"? This cannot be undone.`
            : ""
        }
        confirmText="Delete"
        confirmVariant="danger"
        busy={serverBusy}
        onCancel={() => !serverBusy && setSettingKeyToDelete(null)}
        onConfirm={() => handleDeleteServerSetting(settingKeyToDelete)}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
