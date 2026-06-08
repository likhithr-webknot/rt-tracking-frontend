// @ts-nocheck
import type { ApiOptions } from "../../types/api-options";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Clock,
  Database,
  Info,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Shield,
  Sliders,
  Square,
  Trash2,
  UserCheck,
  Users,
  Wrench,
  Cloud,
  Briefcase,
  Mail,
  PieChart,
} from "lucide-react";
import {
  EMAIL_NOTIFICATION_DEFAULTS,
  fetchEmailNotificationSettings,
  saveEmailNotificationSettings,
  sendMonthlyWorkflowReminders,
  sendSubmissionWindowClosingReminders,
} from "../../api/email-notification-settings";
import { fetchDriveStorageStats } from "../../api/webknot-drive";
import Toast from "../shared/Toast";
import ConfirmDialog from "../shared/ConfirmDialog";
import ModalOverlay, { DialogFooter } from "../shared/ModalOverlay";
import AdminPageHeader, { AdminPageShell } from "./AdminPageHeader";
import {
  FieldLabel,
  SectionCard,
  SettingsFooter,
  SettingsGroup,
  SettingsPage,
  SettingsCallout,
  Toggle,
} from "../shared/settings/SettingsLayout";
import EmployeeSubmissionOverride from "./EmployeeSubmissionOverride";
import useScopedSettings from "../../hooks/useScopedSettings";
import {
  buildCycleMeta,
  currentReviewCycleKey,
  formatCycleKeyLabel,
  getCycleSlotLabel,
} from "../../utils/reviewCycles";
import {
  ADMIN_SETTINGS_DEFAULTS,
  SETTINGS_SCOPES,
  SUPER_ADMIN_SETTINGS_DEFAULTS,
} from "../../utils/portalSettings";
import {
  scoreWeightsSumPercent,
  validateScoreWeightPercents,
} from "../../utils/scoringSettings";
import {
  fetchSubmissionWindowCurrent,
  scheduleSubmissionWindow,
  openSubmissionWindowNow,
  closeSubmissionWindowNow,
  fetchRoleSubmissionWindow,
  scheduleRoleSubmissionWindow,
  openRoleSubmissionWindowNow,
  closeRoleSubmissionWindowNow,
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
import PromotionPathSettings from "./PromotionPathSettings";

const REVIEW_CYCLE_MONTH_OPTIONS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

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

export default function SettingsPanel({
  employees = [],
  employeesLoading = false,
  isSuperAdmin = false,
}) {
  const {
    settings: superSettings,
    hasUnsaved: superHasUnsaved,
    updateSetting: updateSuperSetting,
    onSave: saveSuperSettings,
    onReset: resetSuperSettings,
  } = useScopedSettings(SETTINGS_SCOPES.SUPER_ADMIN);

  const {
    settings: adminSettings,
    hasUnsaved: adminHasUnsaved,
    updateSetting: updateAdminSetting,
    onSave: saveAdminSettings,
    onReset: resetAdminSettings,
  } = useScopedSettings(SETTINGS_SCOPES.ADMIN);

  const [toast, setToast] = useState(null);
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

  const [settingKeyToDelete, setSettingKeyToDelete] = useState(null);
  const [emailReminderBusy, setEmailReminderBusy] = useState("");
  const [emailConfig, setEmailConfig] = useState(() => ({ ...EMAIL_NOTIFICATION_DEFAULTS }));
  const [emailConfigLoading, setEmailConfigLoading] = useState(true);
  const [emailConfigSaving, setEmailConfigSaving] = useState(false);
  const [emailConfigDirty, setEmailConfigDirty] = useState(false);

  const globalIsOpen = useMemo(() => isWindowOpenLocal(globalWin), [globalWin]);
  const empIsOpen = useMemo(() => isWindowOpenLocal(empWin), [empWin]);
  const mgrIsOpen = useMemo(() => isWindowOpenLocal(mgrWin), [mgrWin]);
  const empEffectiveOpen = empIsOpen || globalIsOpen;
  const mgrEffectiveOpen = mgrIsOpen || globalIsOpen;
  const employeeCardOpen = empEffectiveOpen;
  const managerCardOpen = mgrEffectiveOpen;

  const refreshAllSubmissionWindows = useCallback(async ({ signal } = {} as ApiOptions) => {
    const [gRes, eRes, mRes] = await Promise.allSettled([
      fetchSubmissionWindowCurrent({ signal }),
      fetchRoleSubmissionWindow("employee", { signal }),
      fetchRoleSubmissionWindow("manager", { signal }),
    ]);
    if (gRes.status === "fulfilled") {
      setGlobalWin(parseSettingsWindowFields(gRes.value));
    }
    if (eRes.status === "fulfilled") {
      setEmpWin(parseSettingsWindowFields(eRes.value));
    }
    if (mRes.status === "fulfilled") {
      setMgrWin(parseSettingsWindowFields(mRes.value));
    }
  }, []);

  /* Fetch all 3 windows on mount */
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    (async () => {
      setWinLoading(true);
      try {
        await refreshAllSubmissionWindows({ signal: controller.signal });
      } catch { /* swallow */ }
      if (alive) setWinLoading(false);
    })();
    return () => { alive = false; controller.abort(); };
  }, [refreshAllSubmissionWindows]);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    (async () => {
      setEmailConfigLoading(true);
      try {
        const config = await fetchEmailNotificationSettings({ signal: controller.signal });
        if (alive) {
          setEmailConfig(config);
          setEmailConfigDirty(false);
        }
      } catch {
        if (alive) setEmailConfig({ ...EMAIL_NOTIFICATION_DEFAULTS });
      } finally {
        if (alive) setEmailConfigLoading(false);
      }
    })();
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  const updateEmailConfig = useCallback((key, value) => {
    setEmailConfig((prev) => ({ ...(prev || {}), [key]: value }));
    setEmailConfigDirty(true);
  }, []);

  const saveEmailConfig = useCallback(async () => {
    setEmailConfigSaving(true);
    try {
      const saved = await saveEmailNotificationSettings(emailConfig);
      setEmailConfig(saved);
      setEmailConfigDirty(false);
      showToastMsg({
        title: "Email settings saved",
        message: "Notification emails will follow these rules on the server.",
      });
    } catch (err) {
      showToastMsg({
        title: "Could not save email settings",
        message: err?.message || "Please try again.",
        tone: "error",
      });
    } finally {
      setEmailConfigSaving(false);
    }
  }, [emailConfig]);

  function showToastMsg(t) { setToast(t); }

  /* ── Window action helpers ── */
  const handleGlobalToggle = useCallback(async () => {
    setGlobalBusy(true);
    try {
      const res = globalIsOpen ? await closeSubmissionWindowNow() : await openSubmissionWindowNow();
      setGlobalWin(parseSettingsWindowFields(res));
      await refreshAllSubmissionWindows();
      showToastMsg({
        title: globalIsOpen ? "Global window closed" : "Global window opened",
        message: globalIsOpen
          ? "Updated. Close emails send automatically when enabled in Email reminders."
          : "Updated. Open emails send automatically to employees when enabled in Email reminders.",
      });
    } catch (err) {
      showToastMsg({ title: "Failed", message: err?.message || "Please try again." });
    } finally { setGlobalBusy(false); }
  }, [globalIsOpen, refreshAllSubmissionWindows]);

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
        await refreshAllSubmissionWindows();
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

  const empHandlers = useMemo(
    () => makeRoleHandlers("employee", empWin, setEmpWin, empIsOpen, setEmpBusy),
    [empWin, empIsOpen, refreshAllSubmissionWindows],
  );
  const mgrHandlers = useMemo(
    () => makeRoleHandlers("manager", mgrWin, setMgrWin, mgrIsOpen, setMgrBusy),
    [mgrWin, mgrIsOpen, refreshAllSubmissionWindows],
  );

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
    if (!isSuperAdmin) return undefined;
    const ac = new AbortController();
    refreshServerSettings({ signal: ac.signal }).catch(() => {});
    return () => ac.abort();
  }, [refreshServerSettings, isSuperAdmin]);

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
    const runtime = String(superSettings?.apiBaseUrl || "").trim();
    if (runtime) return runtime;
    const envBase = String(import.meta?.env?.VITE_API_BASE_URL || "").trim();
    return envBase || "(using Vite proxy / same-origin)";
  }, [superSettings?.apiBaseUrl]);

  const scoreWeightSum = useMemo(() => scoreWeightsSumPercent(superSettings), [superSettings]);
  const scoreWeightValid = scoreWeightSum === 100;
  const currentReviewCycle = useMemo(() => buildCycleMeta(new Date()), [
    superSettings?.reviewCycleMayStartMonth,
    superSettings?.reviewCycleMayEndMonth,
    superSettings?.reviewCycleNovStartMonth,
    superSettings?.reviewCycleNovEndMonth,
  ]);

  function onSaveSuper(e) {
    e?.preventDefault?.();
    const weightCheck = validateScoreWeightPercents(superSettings);
    if (!weightCheck.ok) {
      setToast({
        title: "Scoring weights invalid",
        message: weightCheck.message,
        tone: "error",
      });
      return;
    }
    saveSuperSettings();
    setToast({ title: "Platform settings saved", message: "Super admin configuration updated." });
  }

  function onResetSuper() {
    resetSuperSettings();
    setToast({ title: "Platform defaults restored", message: "Super admin settings were reset." });
  }

  function onSaveAdmin(e) {
    e?.preventDefault?.();
    saveAdminSettings();
    setToast({ title: "Admin settings saved", message: "Operational policies and console preferences updated." });
  }

  function onResetAdmin() {
    resetAdminSettings();
    setToast({ title: "Admin defaults restored", message: "Operational settings were reset." });
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
    <AdminPageShell maxWidth="max-w-3xl">
      <AdminPageHeader
        title="Settings"
        subtitle={
          isSuperAdmin
            ? "Platform configuration for super admins, plus operational policies for HR and admin staff."
            : "Operational policies, submission windows, and admin console preferences."
        }
      />

      <SettingsPage>
        {isSuperAdmin ? (
          <>
            <SettingsGroup title="Platform" description="Super admin only — review cycles, scoring, and infrastructure.">
              <SectionCard
                icon={Calendar}
                title="Review cycles"
                description="Two six-month review cycles per year (MAY-OCT and NOV-APR keys)."
              >
          <p className="text-sm text-[rgb(var(--muted))] leading-relaxed">
            Monthly submissions roll up into exactly two review cycles. Configure each cycle&apos;s start and end month
            below. Backend keys stay <code className="text-xs">MAY-OCT-YYYY</code> and{" "}
            <code className="text-xs">NOV-APR-YYYY-YYYY</code> for Cycle one and Cycle two respectively.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="rounded-lg border border-[rgb(var(--border))] p-4 space-y-3">
              <div className="text-sm font-semibold text-[rgb(var(--text))]">Cycle one</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>Start month</FieldLabel>
                  <select
                    value={Number(superSettings?.reviewCycleMayStartMonth ?? SUPER_ADMIN_SETTINGS_DEFAULTS.reviewCycleMayStartMonth)}
                    onChange={(e) => updateSuperSetting("reviewCycleMayStartMonth", Number.parseInt(e.target.value, 10))}
                    className="rt-input text-sm w-full"
                  >
                    {REVIEW_CYCLE_MONTH_OPTIONS.map((opt) => (
                      <option key={`may-start-${opt.value}`} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel>End month</FieldLabel>
                  <select
                    value={Number(superSettings?.reviewCycleMayEndMonth ?? SUPER_ADMIN_SETTINGS_DEFAULTS.reviewCycleMayEndMonth)}
                    onChange={(e) => updateSuperSetting("reviewCycleMayEndMonth", Number.parseInt(e.target.value, 10))}
                    className="rt-input text-sm w-full"
                  >
                    {REVIEW_CYCLE_MONTH_OPTIONS.map((opt) => (
                      <option key={`may-end-${opt.value}`} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-[rgb(var(--border))] p-4 space-y-3">
              <div className="text-sm font-semibold text-[rgb(var(--text))]">Cycle two</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>Start month</FieldLabel>
                  <select
                    value={Number(superSettings?.reviewCycleNovStartMonth ?? SUPER_ADMIN_SETTINGS_DEFAULTS.reviewCycleNovStartMonth)}
                    onChange={(e) => updateSuperSetting("reviewCycleNovStartMonth", Number.parseInt(e.target.value, 10))}
                    className="rt-input text-sm w-full"
                  >
                    {REVIEW_CYCLE_MONTH_OPTIONS.map((opt) => (
                      <option key={`nov-start-${opt.value}`} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel>End month</FieldLabel>
                  <select
                    value={Number(superSettings?.reviewCycleNovEndMonth ?? SUPER_ADMIN_SETTINGS_DEFAULTS.reviewCycleNovEndMonth)}
                    onChange={(e) => updateSuperSetting("reviewCycleNovEndMonth", Number.parseInt(e.target.value, 10))}
                    className="rt-input text-sm w-full"
                  >
                    {REVIEW_CYCLE_MONTH_OPTIONS.map((opt) => (
                      <option key={`nov-end-${opt.value}`} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]/50 px-4 py-3 text-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">
              Current cycle preview
            </div>
            <div className="mt-1 font-medium text-[rgb(var(--text))]">
              {getCycleSlotLabel(currentReviewCycle?.cycleKey) || "—"}
            </div>
            <div className="text-xs text-[rgb(var(--muted))] mt-1">
              Key: <code>{currentReviewCycle?.cycleKey || currentReviewCycleKey() || "—"}</code>
              {" · "}
              {formatCycleKeyLabel(currentReviewCycle?.cycleKey || currentReviewCycleKey())}
            </div>
          </div>
        </SectionCard>

              <SectionCard
                icon={PieChart}
                title="Performance scoring"
                description="Monthly review weights and certification / recognition criteria"
              >
        <p className="text-sm text-[rgb(var(--muted))] leading-relaxed">
          Final score combines manager KPI average, Webknot values average, and a certifications component
          (certs, recognitions, tech showcase). Percent weights must total 100%.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <FieldLabel hint="Share of final score">KPI weight (%)</FieldLabel>
            <input
              type="number"
              min={0}
              max={100}
              value={Number(superSettings?.scoreWeightKpiPercent ?? SUPER_ADMIN_SETTINGS_DEFAULTS.scoreWeightKpiPercent)}
              onChange={(e) =>
                updateSuperSetting("scoreWeightKpiPercent", Number.parseInt(String(e.target.value || "0"), 10) || 0)
              }
              className="rt-input text-sm"
            />
          </div>
          <div>
            <FieldLabel hint="Company values ratings">Webknot values weight (%)</FieldLabel>
            <input
              type="number"
              min={0}
              max={100}
              value={Number(superSettings?.scoreWeightValuesPercent ?? SUPER_ADMIN_SETTINGS_DEFAULTS.scoreWeightValuesPercent)}
              onChange={(e) =>
                updateSuperSetting("scoreWeightValuesPercent", Number.parseInt(String(e.target.value || "0"), 10) || 0)
              }
              className="rt-input text-sm"
            />
          </div>
          <div>
            <FieldLabel hint="Certs / recognitions component">Certifications weight (%)</FieldLabel>
            <input
              type="number"
              min={0}
              max={100}
              value={Number(
                superSettings?.scoreWeightCertificationsPercent ?? SUPER_ADMIN_SETTINGS_DEFAULTS.scoreWeightCertificationsPercent,
              )}
              onChange={(e) =>
                updateSuperSetting(
                  "scoreWeightCertificationsPercent",
                  Number.parseInt(String(e.target.value || "0"), 10) || 0,
                )
              }
              className="rt-input text-sm"
            />
          </div>
        </div>
        <p
          className={[
            "text-xs font-medium",
            scoreWeightValid ? "text-emerald-600 dark:text-emerald-400" : "text-amber-700 dark:text-amber-300",
          ].join(" ")}
        >
          Weight total: {scoreWeightSum}% {scoreWeightValid ? "(valid)" : "— must equal 100% to save"}
        </p>

        <div className="border-t border-[rgb(var(--border))] pt-4">
          <div className="text-sm font-semibold text-[rgb(var(--text))] mb-3">Certification & recognition criteria</div>
          <p className="text-xs text-[rgb(var(--muted))] mb-4 leading-relaxed">
            Each certification and recognition adds points toward the certifications component (capped at 5.0 before
            the certifications weight above is applied). Tech showcase sets a minimum on that component when awarded.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <FieldLabel hint="Points per listed certification">Certification points</FieldLabel>
              <input
                type="number"
                min={0}
                max={5}
                step={0.05}
                value={Number(superSettings?.certificationPointsPerCert ?? SUPER_ADMIN_SETTINGS_DEFAULTS.certificationPointsPerCert)}
                onChange={(e) =>
                  updateSuperSetting("certificationPointsPerCert", Number.parseFloat(String(e.target.value || "0")) || 0)
                }
                className="rt-input text-sm"
              />
            </div>
            <div>
              <FieldLabel hint="Points per recognition">Recognition points</FieldLabel>
              <input
                type="number"
                min={0}
                max={5}
                step={0.05}
                value={Number(superSettings?.recognitionPointsPerItem ?? SUPER_ADMIN_SETTINGS_DEFAULTS.recognitionPointsPerItem)}
                onChange={(e) =>
                  updateSuperSetting("recognitionPointsPerItem", Number.parseFloat(String(e.target.value || "0")) || 0)
                }
                className="rt-input text-sm"
              />
            </div>
            <div>
              <FieldLabel hint="Floor when tech showcase is awarded">Tech showcase floor</FieldLabel>
              <input
                type="number"
                min={0}
                max={5}
                step={0.1}
                value={Number(superSettings?.techShowcaseComponentFloor ?? SUPER_ADMIN_SETTINGS_DEFAULTS.techShowcaseComponentFloor)}
                onChange={(e) =>
                  updateSuperSetting(
                    "techShowcaseComponentFloor",
                    Number.parseFloat(String(e.target.value || "0")) || 0,
                  )
                }
                className="rt-input text-sm"
              />
            </div>
          </div>
        </div>
      </SectionCard>

              <PromotionPathSettings onToast={setToast} />
            </SettingsGroup>

            <SettingsGroup title="Infrastructure" description="API overrides, debug tools, and server-side key-value settings.">
              <SectionCard icon={Wrench} title="Developer" description="API configuration and verbose logging">
                <SettingsCallout variant="warn">
                  These settings are intended for developers and platform owners. Incorrect values may affect application stability.
                </SettingsCallout>

                <div>
                  <FieldLabel hint="Leave empty so Vite proxies to Spring (VITE_API_DEV_PROXY or :8080). Set only for a real remote API.">
                    API Base URL Override
                  </FieldLabel>
                  <input
                    value={String(superSettings?.apiBaseUrl ?? "")}
                    onChange={(e) => updateSuperSetting("apiBaseUrl", e.target.value)}
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
                    checked={superSettings?.debugMode ?? SUPER_ADMIN_SETTINGS_DEFAULTS.debugMode}
                    onChange={(v) => updateSuperSetting("debugMode", v)}
                    label="Debug mode (verbose console logging)"
                  />
                </div>
              </SectionCard>

              <SectionCard
                icon={Database}
                title="Server settings"
                description="Key-value pairs from the Spring API (SettingsController)."
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
            </SettingsGroup>

            <SettingsFooter
              hasUnsaved={superHasUnsaved}
              onSave={onSaveSuper}
              onReset={onResetSuper}
              saveLabel="Save platform settings"
              resetLabel="Reset platform defaults"
            />
          </>
        ) : null}

        <SettingsGroup title="Organization" description="Storage limits and workforce-facing policies.">
          <SectionCard icon={Cloud} title="Webknot Drive" description="Object storage quota and upload limits">
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
                  value={Number(adminSettings?.driveQuotaGb ?? ADMIN_SETTINGS_DEFAULTS.driveQuotaGb)}
                  onChange={(e) => updateAdminSetting("driveQuotaGb", Number.parseInt(String(e.target.value || "50"), 10) || 50)}
                  className="rt-input text-sm"
                />
              </div>
              <div>
                <FieldLabel hint="Reject uploads larger than this">Max upload size (MB)</FieldLabel>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={Number(adminSettings?.driveMaxUploadMb ?? ADMIN_SETTINGS_DEFAULTS.driveMaxUploadMb)}
                  onChange={(e) => updateAdminSetting("driveMaxUploadMb", Number.parseInt(String(e.target.value || "10"), 10) || 10)}
                  className="rt-input text-sm"
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={Briefcase} title="Workforce experience" description="Org-wide toggles for employees and managers">
            <div className="space-y-4">
              <Toggle
                checked={adminSettings?.managerCalibrationHints ?? ADMIN_SETTINGS_DEFAULTS.managerCalibrationHints}
                onChange={(v) => updateAdminSetting("managerCalibrationHints", v)}
                label="Manager calibration hints (org default)"
              />
              <Toggle
                checked={adminSettings?.enableSubmissionPlaybook ?? ADMIN_SETTINGS_DEFAULTS.enableSubmissionPlaybook}
                onChange={(v) => updateAdminSetting("enableSubmissionPlaybook", v)}
                label="Resubmission playbook checklist (employees)"
              />
              <Toggle
                checked={adminSettings?.showEmploymentOnCards ?? ADMIN_SETTINGS_DEFAULTS.showEmploymentOnCards}
                onChange={(v) => updateAdminSetting("showEmploymentOnCards", v)}
                label="Show band & designation on directory cards"
              />
            </div>
          </SectionCard>
        </SettingsGroup>

        <SettingsGroup title="Admin console" description="Display and timing for the HR / admin workspace.">
          <SectionCard icon={Sliders} title="General" description="Display preferences in admin views">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <FieldLabel hint="5 – 100 items per page">Employee values page size</FieldLabel>
                <input
                  type="number"
                  min={5}
                  max={100}
                  step={1}
                  value={Number(adminSettings?.employeeValuesPageSize ?? ADMIN_SETTINGS_DEFAULTS.employeeValuesPageSize)}
                  onChange={(e) =>
                    updateAdminSetting(
                      "employeeValuesPageSize",
                      Number.parseInt(String(e.target.value || "10"), 10) || ADMIN_SETTINGS_DEFAULTS.employeeValuesPageSize,
                    )
                  }
                  className="rt-input text-sm"
                />
              </div>
              <div>
                <FieldLabel hint="How months appear in admin tables">Date display format</FieldLabel>
                <select
                  value={adminSettings?.dateFormat ?? ADMIN_SETTINGS_DEFAULTS.dateFormat}
                  onChange={(e) => updateAdminSetting("dateFormat", e.target.value)}
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
                checked={adminSettings?.tableAnimations ?? ADMIN_SETTINGS_DEFAULTS.tableAnimations}
                onChange={(v) => updateAdminSetting("tableAnimations", v)}
                label="Table animations"
              />
              <Toggle
                checked={adminSettings?.compactTables ?? ADMIN_SETTINGS_DEFAULTS.compactTables}
                onChange={(v) => updateAdminSetting("compactTables", v)}
                label="Compact table rows"
              />
              <Toggle
                checked={adminSettings?.enableSoundAlerts ?? ADMIN_SETTINGS_DEFAULTS.enableSoundAlerts}
                onChange={(v) => updateAdminSetting("enableSoundAlerts", v)}
                label="Notification sound alerts"
              />
            </div>
          </SectionCard>

          <SectionCard icon={Info} title="Notifications & timing" description="Admin console polling and session limits">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <FieldLabel hint="5,000 – 120,000 ms">Notification poll interval</FieldLabel>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={5000}
                    max={120000}
                    step={1000}
                    value={Number(adminSettings?.notificationPollIntervalMs ?? ADMIN_SETTINGS_DEFAULTS.notificationPollIntervalMs)}
                    onChange={(e) =>
                      updateAdminSetting(
                        "notificationPollIntervalMs",
                        Number.parseInt(String(e.target.value || "30000"), 10) || ADMIN_SETTINGS_DEFAULTS.notificationPollIntervalMs,
                      )
                    }
                    className="rt-input text-sm flex-1"
                  />
                  <span className="text-xs text-[rgb(var(--muted))] shrink-0">ms</span>
                </div>
              </div>
              <div>
                <FieldLabel hint="5 – 480 minutes">Session timeout</FieldLabel>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={5}
                    max={480}
                    step={5}
                    value={Number(adminSettings?.sessionTimeoutMinutes ?? ADMIN_SETTINGS_DEFAULTS.sessionTimeoutMinutes)}
                    onChange={(e) =>
                      updateAdminSetting(
                        "sessionTimeoutMinutes",
                        Number.parseInt(String(e.target.value || "60"), 10) || ADMIN_SETTINGS_DEFAULTS.sessionTimeoutMinutes,
                      )
                    }
                    className="rt-input text-sm flex-1"
                  />
                  <span className="text-xs text-[rgb(var(--muted))] shrink-0">min</span>
                </div>
              </div>
            </div>
          </SectionCard>
        </SettingsGroup>

        <SettingsGroup title="Operations" description="Submission windows and reminder emails.">
      <SectionCard icon={Calendar} title="Submission windows" description="Manage submission window schedules for all portals">
        {winLoading ? (
          <div className="text-sm text-[rgb(var(--muted))] animate-pulse py-4 text-center">Loading window status…</div>
        ) : (
          <>
            {/* Status indicators */}
            <div className="flex items-center gap-4 flex-wrap pb-2">
              {[
                { label: "Global", open: globalIsOpen, effective: globalIsOpen },
                { label: "Employee", open: empIsOpen, effective: empEffectiveOpen },
                { label: "Manager", open: mgrIsOpen, effective: mgrEffectiveOpen },
              ].map(({ label, open, effective }) => (
                <span key={label} className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                  <span className={`h-2 w-2 rounded-full ${effective ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                  {label} {effective ? "Open" : "Closed"}
                  {effective && !open && label !== "Global" ? (
                    <span className="normal-case tracking-normal text-emerald-700 dark:text-emerald-300">(via global)</span>
                  ) : null}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-[rgb(var(--muted))] -mt-1 pb-2">
              When the global window is open, employee and manager portals are open for everyone. Role-specific windows can still be managed independently.
            </p>

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
                isOpen={employeeCardOpen}
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
                isOpen={managerCardOpen}
                busy={mgrBusy}
                onToggle={mgrHandlers.toggle}
                onSchedule={mgrHandlers.schedule}
              />
            </div>

            <EmployeeSubmissionOverride
              employees={employees}
              employeesLoading={employeesLoading}
              showToast={showToastMsg}
            />
          </>
        )}
      </SectionCard>

      <SectionCard
        icon={Mail}
        title="Email notifications"
        description="Automatic and manual emails for submission windows and monthly review workflow"
      >
        {emailConfigLoading ? (
          <div className="text-sm text-[rgb(var(--muted))] animate-pulse py-4 text-center">Loading email settings…</div>
        ) : (
          <>
            <SettingsCallout tone="info">
              Emails are sent from Webtrak using <code className="text-xs">SMTP_USERNAME</code> /{" "}
              <code className="text-xs">SMTP_PASSWORD</code> in the backend <code className="text-xs">.env</code>.
              In non-production environments, mail is redirected to the SMTP account for safety.
            </SettingsCallout>

            <div className="space-y-4 pt-2">
              <Toggle
                checked={emailConfig?.enabled ?? true}
                onChange={(v) => updateEmailConfig("enabled", v)}
                label="Enable all submission emails"
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <Toggle
                  checked={emailConfig?.autoSendOnWindowOpen ?? true}
                  onChange={(v) => updateEmailConfig("autoSendOnWindowOpen", v)}
                  label="Auto-email when global window opens"
                />
                <Toggle
                  checked={emailConfig?.autoSendOnWindowClose ?? true}
                  onChange={(v) => updateEmailConfig("autoSendOnWindowClose", v)}
                  label="Auto-email when global window closes"
                />
                <Toggle
                  checked={emailConfig?.closingReminderEnabled ?? true}
                  onChange={(v) => updateEmailConfig("closingReminderEnabled", v)}
                  label="Closing deadline reminders"
                />
                <Toggle
                  checked={emailConfig?.workflowReminderEnabled ?? true}
                  onChange={(v) => updateEmailConfig("workflowReminderEnabled", v)}
                  label="Pending manager/admin workflow reminders"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <FieldLabel hint="Used by scheduled cron and manual closing reminders">Days before window closes</FieldLabel>
                  <input
                    type="number"
                    min={0}
                    max={14}
                    value={Number(emailConfig?.closingReminderDaysBeforeEnd ?? 3)}
                    onChange={(e) =>
                      updateEmailConfig(
                        "closingReminderDaysBeforeEnd",
                        Number.parseInt(String(e.target.value || "0"), 10) || 0,
                      )
                    }
                    className="rt-input text-sm max-w-[8rem]"
                  />
                </div>
                <div>
                  <FieldLabel hint="Days after employee submits before managers are nudged">Manager review reminder (days)</FieldLabel>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={Number(emailConfig?.managerReviewReminderDaysAfterSubmit ?? 3)}
                    onChange={(e) =>
                      updateEmailConfig(
                        "managerReviewReminderDaysAfterSubmit",
                        Number.parseInt(String(e.target.value || "3"), 10) || 3,
                      )
                    }
                    className="rt-input text-sm max-w-[8rem]"
                  />
                </div>
              </div>

              <div className="border-t border-[rgb(var(--border))] pt-4 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
                  Workflow emails
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Toggle
                    checked={emailConfig?.employeeSubmitConfirmationEnabled ?? true}
                    onChange={(v) => updateEmailConfig("employeeSubmitConfirmationEnabled", v)}
                    label="Employee submit confirmation"
                  />
                  <Toggle
                    checked={emailConfig?.employeeSubmitToManagerEnabled ?? true}
                    onChange={(v) => updateEmailConfig("employeeSubmitToManagerEnabled", v)}
                    label="Employee submit → manager"
                  />
                  <Toggle
                    checked={emailConfig?.managerSubmitConfirmationEnabled ?? true}
                    onChange={(v) => updateEmailConfig("managerSubmitConfirmationEnabled", v)}
                    label="Manager submit confirmation"
                  />
                  <Toggle
                    checked={emailConfig?.managerSubmitToAdminEnabled ?? true}
                    onChange={(v) => updateEmailConfig("managerSubmitToAdminEnabled", v)}
                    label="Manager submit → admin/HR"
                  />
                  <Toggle
                    checked={emailConfig?.adminApproveToEmployeeEnabled ?? true}
                    onChange={(v) => updateEmailConfig("adminApproveToEmployeeEnabled", v)}
                    label="Admin approve → employee"
                  />
                  <Toggle
                    checked={emailConfig?.adminRejectToEmployeeEnabled ?? true}
                    onChange={(v) => updateEmailConfig("adminRejectToEmployeeEnabled", v)}
                    label="Admin/manager return → employee"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  className="rt-btn-primary text-sm"
                  disabled={emailConfigSaving || !emailConfigDirty}
                  onClick={() => saveEmailConfig().catch(() => {})}
                >
                  {emailConfigSaving ? "Saving…" : "Save email settings"}
                </button>
                <button
                  type="button"
                  className="rt-btn-secondary text-sm"
                  disabled={Boolean(emailReminderBusy)}
                  onClick={async () => {
                    setEmailReminderBusy("closing");
                    try {
                      const res = await sendSubmissionWindowClosingReminders();
                      const data = res?.data ?? res;
                      setToast({
                        title: "RT sheet reminders sent",
                        message: `Emailed ${data?.sent ?? 0} people. Skipped ${data?.skippedAlreadySubmitted ?? 0} who already submitted.`,
                      });
                    } catch (err) {
                      setToast({
                        title: "Email failed",
                        message: err?.message || "Could not send reminders. Check SMTP settings on the server.",
                        tone: "error",
                      });
                    } finally {
                      setEmailReminderBusy("");
                    }
                  }}
                >
                  {emailReminderBusy === "closing" ? "Sending…" : "Send closing reminders now"}
                </button>
                <button
                  type="button"
                  className="rt-btn-secondary text-sm"
                  disabled={Boolean(emailReminderBusy)}
                  onClick={async () => {
                    setEmailReminderBusy("workflow");
                    try {
                      await sendMonthlyWorkflowReminders();
                      setToast({
                        title: "Workflow reminders sent",
                        message: "Managers and HR were emailed about pending monthly reviews.",
                      });
                    } catch (err) {
                      setToast({
                        title: "Email failed",
                        message: err?.message || "Could not send workflow reminders.",
                        tone: "error",
                      });
                    } finally {
                      setEmailReminderBusy("");
                    }
                  }}
                >
                  {emailReminderBusy === "workflow" ? "Sending…" : "Send workflow reminders now"}
                </button>
              </div>

              <p className="text-xs text-[rgb(var(--muted))] leading-relaxed">
                Optional cron on the server:
                <br />
                <code className="text-[11px]">GET /api/v1/submission-window-reminders</code> — closing reminders when within the days-before threshold
                <br />
                <code className="text-[11px]">GET /api/v1/monthly-submission-reminders</code> — pending manager/admin reviews
              </p>
            </div>
          </>
        )}
      </SectionCard>
        </SettingsGroup>

        <SettingsFooter
          hasUnsaved={adminHasUnsaved}
          onSave={onSaveAdmin}
          onReset={onResetAdmin}
          saveLabel="Save admin settings"
          resetLabel="Reset admin defaults"
        />
      </SettingsPage>

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
    </AdminPageShell>
  );
}
