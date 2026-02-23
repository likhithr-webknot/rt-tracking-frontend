import React, { useEffect, useMemo, useState } from "react";
import Toast from "../shared/Toast.jsx";
import { adminResetPassword } from "../../api/auth.js";
import {
  APP_SETTINGS_DEFAULTS,
  getAppSettings,
  resetAppSettings,
  saveAppSettings,
} from "../../utils/appSettings.js";

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

  useEffect(() => {
    function onUpdated(event) {
      const next = event?.detail && typeof event.detail === "object" ? event.detail : getAppSettings();
      setSettings(next);
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

  function onSave(e) {
    e.preventDefault();
    const next = saveAppSettings(settings);
    setSettings(next);
    setToast({ title: "Settings saved", message: "Application settings updated." });
  }

  function onReset() {
    const next = resetAppSettings();
    setSettings(next);
    setToast({ title: "Reset complete", message: "Settings restored to defaults." });
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
      setResetDraft({
        requestId: "",
        adminCode: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (err) {
      setToast({ title: "Reset failed", message: err?.message || "Please try again." });
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="rt-title">Settings</h2>
      <p className="text-slate-500 text-sm mt-2">
        Configure application-wide runtime settings.
      </p>

      <form onSubmit={onSave} className="mt-8 rt-panel p-8 space-y-6">
        <div>
          <div className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">API Base URL Override</div>
          <input
            value={String(settings?.apiBaseUrl ?? "")}
            onChange={(e) => setSettings((prev) => ({ ...prev, apiBaseUrl: e.target.value }))}
            className="mt-2 rt-input text-sm"
            placeholder="Leave empty to use Vite proxy / env"
          />
          <div className="mt-2 text-xs text-slate-500">
            Effective API base: <span className="font-mono text-slate-700 dark:text-slate-300">{effectiveApiBase}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Employee Values Page Size</div>
            <input
              type="number"
              min={5}
              max={100}
              step={1}
              value={Number(settings?.employeeValuesPageSize ?? APP_SETTINGS_DEFAULTS.employeeValuesPageSize)}
              onChange={(e) => setSettings((prev) => ({ ...prev, employeeValuesPageSize: Number.parseInt(String(e.target.value || "10"), 10) || APP_SETTINGS_DEFAULTS.employeeValuesPageSize }))}
              className="mt-2 rt-input text-sm"
            />
            <div className="mt-2 text-xs text-slate-500">Allowed range: 5 to 100.</div>
          </div>

          <div>
            <div className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Draft Autosave Delay (ms)</div>
            <input
              type="number"
              min={500}
              max={5000}
              step={100}
              value={Number(settings?.draftAutosaveDelayMs ?? APP_SETTINGS_DEFAULTS.draftAutosaveDelayMs)}
              onChange={(e) => setSettings((prev) => ({ ...prev, draftAutosaveDelayMs: Number.parseInt(String(e.target.value || "900"), 10) || APP_SETTINGS_DEFAULTS.draftAutosaveDelayMs }))}
              className="mt-2 rt-input text-sm"
            />
            <div className="mt-2 text-xs text-slate-500">Allowed range: 500 to 5000 milliseconds.</div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onReset}
            className="rt-btn-ghost text-xs uppercase tracking-widest"
          >
            Reset Defaults
          </button>
          <button
            type="submit"
            className="rt-btn-primary text-xs uppercase tracking-widest"
          >
            Save Settings
          </button>
        </div>
      </form>

      <form onSubmit={onAdminPasswordReset} className="mt-6 rt-panel p-8 space-y-6">
        <div>
          <h3 className="font-black tracking-tight text-lg">Admin Password Reset Approval</h3>
          <p className="mt-1 text-sm text-slate-500">
            Enter the reset request id, admin verification code, and the approved new password.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Reset Request ID</div>
            <input
              value={resetDraft.requestId}
              onChange={(e) => setResetDraft((prev) => ({ ...prev, requestId: e.target.value }))}
              className="mt-2 rt-input text-sm"
              placeholder="Paste request id"
            />
          </div>

          <div>
            <div className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Admin Verification Code</div>
            <input
              value={resetDraft.adminCode}
              onChange={(e) => setResetDraft((prev) => ({ ...prev, adminCode: e.target.value }))}
              className="mt-2 rt-input text-sm"
              placeholder="6-digit code"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">New Password</div>
            <input
              type="password"
              value={resetDraft.newPassword}
              onChange={(e) => setResetDraft((prev) => ({ ...prev, newPassword: e.target.value }))}
              className="mt-2 rt-input text-sm"
              placeholder="Minimum 8 characters"
            />
          </div>

          <div>
            <div className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Confirm Password</div>
            <input
              type="password"
              value={resetDraft.confirmPassword}
              onChange={(e) => setResetDraft((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              className="mt-2 rt-input text-sm"
              placeholder="Repeat new password"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="submit"
            disabled={resetBusy}
            className={[
              "rt-btn-primary text-xs uppercase tracking-widest",
              resetBusy ? "opacity-60 cursor-not-allowed" : "",
            ].join(" ")}
          >
            {resetBusy ? "Resetting..." : "Approve And Reset"}
          </button>
        </div>
      </form>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
