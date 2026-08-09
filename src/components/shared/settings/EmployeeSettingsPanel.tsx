// @ts-nocheck
import React, { useState } from "react";
import { Bell, Monitor, Palette } from "lucide-react";
import ThemeToggle from "../ThemeToggle";
import Toast from "../Toast";
import PortalPageHeader from "../PortalPageHeader";
import PortalWorkflowFrame from "../PortalWorkflowFrame";
import useScopedSettings from "../../../hooks/useScopedSettings";
import {
  SettingsField,
  SettingsFooter,
  SettingsGroup,
  SettingsPage,
  SettingsSection,
  SettingsToggle,
} from "./SettingsLayout";
import { EMPLOYEE_SETTINGS_DEFAULTS, SETTINGS_SCOPES } from "../../../utils/portalSettings";

const DATE_FORMAT_OPTIONS = [
  { value: "MMM YYYY", label: "Mar 2026 (MMM YYYY)" },
  { value: "YYYY-MM", label: "2026-03 (YYYY-MM)" },
  { value: "MM/YYYY", label: "03/2026 (MM/YYYY)" },
];

export default function EmployeeSettingsPanel() {
  const { settings, hasUnsaved, updateSetting, onSave, onReset } = useScopedSettings(SETTINGS_SCOPES.EMPLOYEE);
  const [toast, setToast] = useState(null);

  function handleSave() {
    onSave();
    setToast({ title: "Employee settings saved", message: "These preferences apply only on this device." });
  }

  function handleReset() {
    onReset();
    setToast({ title: "Defaults restored", message: "Employee preferences were reset." });
  }

  return (
    <PortalWorkflowFrame className="mx-auto w-full max-w-3xl">
      <PortalPageHeader
        title="Settings"
        subtitle="Personal display and draft preferences for your employee workspace."
        sectionLabel="Employee"
      />
      <SettingsPage>
        <SettingsGroup title="Personal" description="Saved locally for your employee account on this browser.">
          <SettingsSection icon={Palette} title="Appearance" description="Theme on this device">
            <SettingsField label="Color theme" hint="Light or dark mode">
              <ThemeToggle />
            </SettingsField>
          </SettingsSection>

          <SettingsSection icon={Monitor} title="Display" description="How lists and dates look in your portal">
            <div className="space-y-4">
              <SettingsField label="Date format" hint="Used across your employee views">
                <select
                  value={settings?.dateFormat ?? EMPLOYEE_SETTINGS_DEFAULTS.dateFormat}
                  onChange={(e) => updateSetting("dateFormat", e.target.value)}
                  className="rt-input h-10 w-full max-w-md text-sm"
                >
                  {DATE_FORMAT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </SettingsField>
              <SettingsToggle
                checked={settings?.tableAnimations ?? EMPLOYEE_SETTINGS_DEFAULTS.tableAnimations}
                onChange={(value) => updateSetting("tableAnimations", value)}
                label="Table animations"
                description="Subtle motion when rows update"
              />
              <SettingsToggle
                checked={settings?.compactTables ?? EMPLOYEE_SETTINGS_DEFAULTS.compactTables}
                onChange={(value) => updateSetting("compactTables", value)}
                label="Compact table rows"
                description="Show more rows in dense lists"
              />
            </div>
          </SettingsSection>

          <SettingsSection icon={Bell} title="Drafts & alerts" description="Autosave and notification behaviour">
            <div className="space-y-4">
              <SettingsField label="Draft autosave delay" hint="500 – 5,000 ms before saving your review draft">
                <div className="flex max-w-md items-center gap-2">
                  <input
                    type="number"
                    min={500}
                    max={5000}
                    step={100}
                    value={Number(settings?.draftAutosaveDelayMs ?? EMPLOYEE_SETTINGS_DEFAULTS.draftAutosaveDelayMs)}
                    onChange={(e) =>
                      updateSetting(
                        "draftAutosaveDelayMs",
                        Number.parseInt(String(e.target.value || "900"), 10) ||
                          EMPLOYEE_SETTINGS_DEFAULTS.draftAutosaveDelayMs,
                      )
                    }
                    className="rt-input h-10 flex-1 text-sm tabular-nums"
                  />
                  <span className="text-xs text-[rgb(var(--muted))]">ms</span>
                </div>
              </SettingsField>
              <SettingsToggle
                checked={settings?.enableSoundAlerts ?? EMPLOYEE_SETTINGS_DEFAULTS.enableSoundAlerts}
                onChange={(value) => updateSetting("enableSoundAlerts", value)}
                label="Notification sounds"
                description="Play a short sound for important alerts"
              />
            </div>
          </SettingsSection>
        </SettingsGroup>

        <SettingsFooter hasUnsaved={hasUnsaved} onSave={handleSave} onReset={handleReset} />
      </SettingsPage>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </PortalWorkflowFrame>
  );
}
