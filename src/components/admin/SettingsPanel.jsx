import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, ChevronDown, ChevronRight, Clock, Info, Play, RotateCcw, Save, Search, Shield, Sliders, Square, UserCheck, Users, Wrench } from "lucide-react";
import Toast from "../shared/Toast.jsx";
import {
  APP_SETTINGS_DEFAULTS,
  getAppSettings,
  resetAppSettings,
  saveAppSettings,
} from "../../utils/appSettings.js";
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
} from "../../api/submission-window.js";

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

function parseServerWindow(data) {
  /* Be defensive: APIs sometimes return different keys */
  const root = data && typeof data === "object" ? data : {};
  const obj = root?.data && typeof root.data === "object" ? root.data : root;

  const startRaw = obj.startAt ?? obj.start ?? obj.openAt ?? obj.openFrom ?? obj.opensAt ?? null;
  const endRaw = obj.endAt ?? obj.end ?? obj.closeAt ?? obj.closesAt ?? obj.closeFrom ?? null;

  const startAt = startRaw ? new Date(startRaw) : null;
  const endAt = endRaw ? new Date(endRaw) : null;

  const isOpen =
    typeof obj.isOpen === "boolean"
      ? obj.isOpen
      : typeof obj.open === "boolean"
        ? obj.open
        : typeof obj.active === "boolean"
          ? obj.active
          : null;

  const manualClosed = Boolean(obj.manualClosed ?? obj.manuallyClosed ?? obj.closedManually);

  const normalizedStart = startAt && !Number.isNaN(startAt.getTime())
    ? toLocalInputValue(startAt)
    : isOpen
      ? toLocalInputValue(new Date())
      : "";
  const normalizedEnd = endAt && !Number.isNaN(endAt.getTime()) ? toLocalInputValue(endAt) : "";

  return {
    start: normalizedStart,
    end: normalizedEnd,
    isOpen,
    manualClosed,
    cycleKey: typeof obj.cycleKey === "string" ? obj.cycleKey : null,
  };
}

function isWindowOpenLocal(win) {
  /* If server explicitly told us the state, use it */
  if (win?.manualClosed) return false;
  if (typeof win?.isOpen === "boolean") return win.isOpen;
  /* Fallback: compute from dates */
  if (!win?.start) return false;
  const start = parseInputDate(win.start);
  if (!start) return false;
  const now = new Date();
  if (now < start) return false;
  const endRaw = String(win.end ?? "").trim();
  if (!endRaw) return true;
  const end = parseInputDate(endRaw);
  if (!end) return false;
  return now <= end;
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
          const p = parseServerWindow(gRes.value);
          if (p.start) setGlobalWin(p);
        }
        if (eRes.status === "fulfilled") {
          const p = parseServerWindow(eRes.value);
          if (p.start) setEmpWin(p);
        }
        if (mRes.status === "fulfilled") {
          const p = parseServerWindow(mRes.value);
          if (p.start) setMgrWin(p);
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
      const p = parseServerWindow(res);
      /* Explicitly set manualClosed on close, clear on open */
      if (globalIsOpen) { p.manualClosed = true; p.isOpen = false; }
      else { p.manualClosed = false; if (!p.isOpen) p.isOpen = true; }
      if (p.start) setGlobalWin(p);
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
      const p = parseServerWindow(res);
      if (p.start) setGlobalWin(p);
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
        const p = parseServerWindow(res);
        /* Explicitly set manualClosed on close, clear on open */
        if (isOpen) { p.manualClosed = true; p.isOpen = false; }
        else { p.manualClosed = false; if (!p.isOpen) p.isOpen = true; }
        if (p.start) setWin(p);
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
        const p = parseServerWindow(res);
        if (p.start) setWin(p);
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
      setEmpOverrideResult({ type: "status", data: parseServerWindow(res), employeeId: id });
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
      setEmpOverrideResult({ type: "status", data: parseServerWindow(res), employeeId: id });
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
      setEmpOverrideResult({ type: "status", data: parseServerWindow(res), employeeId: id });
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

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header>
        <h2 className="rt-title">Settings</h2>
        <p className="text-[rgb(var(--muted))] text-sm mt-2">
          Configure application behaviour, display preferences, and security options.
        </p>
      </header>

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
          <FieldLabel hint="Leave empty to use Vite proxy / environment variable">API Base URL Override</FieldLabel>
          <input
            value={String(settings?.apiBaseUrl ?? "")}
            onChange={(e) => updateSetting("apiBaseUrl", e.target.value)}
            className="rt-input text-sm font-mono"
            placeholder="https://api.example.com"
          />
          <div className="mt-2 text-xs text-[rgb(var(--muted))]">
            Effective: <span className="font-mono text-[rgb(var(--text))]">{effectiveApiBase}</span>
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
                iconColor="bg-purple-500"
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

            {/* Per-employee override */}
            <div className="border-t border-[rgb(var(--border))] pt-5 mt-2">
              <div className="flex items-center gap-2 mb-3">
                <div className="rounded-md p-1.5 bg-amber-500/10 text-amber-500"><Users size={14} /></div>
                <div>
                  <div className="text-sm font-semibold text-[rgb(var(--text))]">Per-Employee Override</div>
                  <div className="text-[10px] text-[rgb(var(--muted))]">Open, close, or check window status for a specific employee</div>
                </div>
              </div>

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

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
