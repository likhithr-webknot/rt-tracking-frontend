import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Info, RotateCcw, Save, Shield, Sliders, Wrench } from "lucide-react";
import Toast from "../shared/Toast.jsx";
import { adminResetPassword } from "../../api/auth.js";
import {
  APP_SETTINGS_DEFAULTS,
  getAppSettings,
  resetAppSettings,
  saveAppSettings,
} from "../../utils/appSettings.js";

function SectionCard({ icon: Icon, title, description, children, defaultOpen = true }) {
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

export default function SettingsPanel() {
  const [settings, setSettings] = useState(() => getAppSettings());
  const [toast, setToast] = useState(null);
  const [resetDraft, setResetDraft] = useState({
    requestId: "",
    adminCode: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [resetBusy, setResetBusy] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);

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

  async function onAdminPasswordReset(e) {
    e.preventDefault();
    const requestId = String(resetDraft.requestId || "").trim();
    const adminCode = String(resetDraft.adminCode || "").trim();
    const newPassword = String(resetDraft.newPassword || "");
    const confirmPassword = String(resetDraft.confirmPassword || "");

    if (!requestId || !adminCode || !newPassword || !confirmPassword) {
      setToast({ title: "Missing fields", message: "Fill all reset fields." });
      return;
    }
    if (newPassword.length < 8) {
      setToast({ title: "Weak password", message: "Password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setToast({ title: "Mismatch", message: "New password and confirm password must match." });
      return;
    }

    setResetBusy(true);
    try {
      await adminResetPassword({ requestId, adminCode, newPassword });
      setToast({ title: "Password reset complete", message: "Employee password updated successfully." });
      setResetDraft({ requestId: "", adminCode: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      setToast({ title: "Reset failed", message: err?.message || "Please try again." });
    } finally {
      setResetBusy(false);
    }
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

      {/* ── Security: Admin Password Reset ── */}
      <SectionCard icon={Shield} title="Security" description="Admin password reset approval">
        <p className="text-sm text-[rgb(var(--muted))]">
          Enter the reset request ID, admin verification code, and the approved new password to complete an employee password reset.
        </p>

        <form onSubmit={onAdminPasswordReset} className="space-y-5 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <FieldLabel>Reset Request ID</FieldLabel>
              <input
                value={resetDraft.requestId}
                onChange={(e) => setResetDraft((prev) => ({ ...prev, requestId: e.target.value }))}
                className="rt-input text-sm font-mono"
                placeholder="Paste request ID"
              />
            </div>

            <div>
              <FieldLabel>Admin Verification Code</FieldLabel>
              <input
                value={resetDraft.adminCode}
                onChange={(e) => setResetDraft((prev) => ({ ...prev, adminCode: e.target.value }))}
                className="rt-input text-sm font-mono"
                placeholder="6-digit code"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <FieldLabel hint="Minimum 8 characters">New Password</FieldLabel>
              <input
                type="password"
                value={resetDraft.newPassword}
                onChange={(e) => setResetDraft((prev) => ({ ...prev, newPassword: e.target.value }))}
                className="rt-input text-sm"
                placeholder="Enter new password"
              />
            </div>

            <div>
              <FieldLabel>Confirm Password</FieldLabel>
              <input
                type="password"
                value={resetDraft.confirmPassword}
                onChange={(e) => setResetDraft((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                className="rt-input text-sm"
                placeholder="Repeat new password"
              />
            </div>
          </div>

          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={resetBusy}
              className={["rt-btn-primary text-sm", resetBusy ? " opacity-60 cursor-not-allowed" : ""].join("")}
            >
              <Shield size={14} /> {resetBusy ? "Resetting\u2026" : "Approve & Reset Password"}
            </button>
          </div>
        </form>
      </SectionCard>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
