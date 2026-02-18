import React, { useEffect, useMemo, useState } from "react";
import Toast from "../shared/Toast.jsx";
import {
  APP_SETTINGS_DEFAULTS,
  getAppSettings,
  resetAppSettings,
  saveAppSettings,
} from "../../utils/appSettings.js";

export default function SettingsPanel() {
  const [settings, setSettings] = useState(() => getAppSettings());
  const [toast, setToast] = useState(null);

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

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-3xl font-black uppercase tracking-tighter italic">Settings</h2>
      <p className="text-gray-500 text-sm mt-2">
        Configure application-wide runtime settings.
      </p>

      <form onSubmit={onSave} className="mt-8 bg-[#111] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl space-y-6">
        <div>
          <div className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">API Base URL Override</div>
          <input
            value={String(settings?.apiBaseUrl ?? "")}
            onChange={(e) => setSettings((prev) => ({ ...prev, apiBaseUrl: e.target.value }))}
            className="mt-2 w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all"
            placeholder="Leave empty to use Vite proxy / env"
          />
          <div className="mt-2 text-xs text-gray-500">
            Effective API base: <span className="font-mono text-gray-300">{effectiveApiBase}</span>
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
              className="mt-2 w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all"
            />
            <div className="mt-2 text-xs text-gray-500">Allowed range: 5 to 100.</div>
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
              className="mt-2 w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all"
            />
            <div className="mt-2 text-xs text-gray-500">Allowed range: 500 to 5000 milliseconds.</div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onReset}
            className="rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest border border-white/10 text-gray-200 hover:bg-white/5 transition-all"
          >
            Reset Defaults
          </button>
          <button
            type="submit"
            className="rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest bg-purple-600 text-white hover:bg-purple-500 transition-all"
          >
            Save Settings
          </button>
        </div>
      </form>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}