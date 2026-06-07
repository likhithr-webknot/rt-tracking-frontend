// @ts-nocheck
import React, { useState } from "react";
import { Bell, Monitor, Palette, Users } from "lucide-react";
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
import { MANAGER_SETTINGS_DEFAULTS, SETTINGS_SCOPES } from "../../../utils/portalSettings";

const DATE_FORMAT_OPTIONS = [
  { value: "MMM YYYY", label: "Mar 2026 (MMM YYYY)" },
  { value: "YYYY-MM", label: "2026-03 (YYYY-MM)" },
  { value: "MM/YYYY", label: "03/2026 (MM/YYYY)" },
];

export default function ManagerSettingsPanel() {
  const { settings, hasUnsaved, updateSetting, onSave, onReset } = useScopedSettings(SETTINGS_SCOPES.MANAGER);
  const [toast, setToast] = useState(null);

  function handleSave() {
    onSave();
    setToast({ title: "Manager settings saved", message: "These preferences apply only on this device." });
  }

  function handleReset() {
    onReset();
    setToast({ title: "Defaults restored", message: "Manager preferences were reset." });
  }

  return (
    <PortalWorkflowFrame className="mx-auto w-full max-w-3xl">
      <PortalPageHeader
        title="Settings"
        subtitle="Personal display, team review, and alert preferences for your manager workspace."
        sectionLabel="Manager"
      />
      <SettingsPage>
        <SettingsGroup title="Personal" description="Saved locally for your manager account on this browser.">
          <SettingsSection icon={Palette} title="Appearance" description="Theme on this device">
            <SettingsField label="Color theme" hint="Light or dark mode">
              <ThemeToggle />
            </SettingsField>
          </SettingsSection>

          <SettingsSection icon={Monitor} title="Display" description="Formatting in your manager portal">
            <div className="space-y-4">
              <SettingsField label="Date format" hint="Used across your manager views">
                <select
                  value={settings?.dateFormat ?? MANAGER_SETTINGS_DEFAULTS.dateFormat}
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
                checked={settings?.tableAnimations ?? MANAGER_SETTINGS_DEFAULTS.tableAnimations}
                onChange={(value) => updateSetting("tableAnimations", value)}
                label="Table animations"
                description="Subtle motion when team rows update"
              />
              <SettingsToggle
                checked={settings?.compactTeamTable ?? MANAGER_SETTINGS_DEFAULTS.compactTeamTable}
                onChange={(value) => updateSetting("compactTeamTable", value)}
                label="Compact team table"
                description="Fit more reportees on screen"
              />
            </div>
          </SettingsSection>

          <SettingsSection icon={Users} title="Team reviews" description="How review tools behave for you">
            <SettingsToggle
              checked={settings?.showCalibrationHints ?? MANAGER_SETTINGS_DEFAULTS.showCalibrationHints}
              onChange={(value) => updateSetting("showCalibrationHints", value)}
              label="Calibration hints"
              description="Show blind-compare guidance while rating reportees"
            />
          </SettingsSection>

          <SettingsSection icon={Bell} title="Drafts & alerts" description="Autosave and manager notifications">
            <div className="space-y-4">
              <SettingsField label="Draft autosave delay" hint="500 – 5,000 ms before saving your self-review draft">
                <div className="flex max-w-md items-center gap-2">
                  <input
                    type="number"
                    min={500}
                    max={5000}
                    step={100}
                    value={Number(settings?.draftAutosaveDelayMs ?? MANAGER_SETTINGS_DEFAULTS.draftAutosaveDelayMs)}
                    onChange={(e) =>
                      updateSetting(
                        "draftAutosaveDelayMs",
                        Number.parseInt(String(e.target.value || "900"), 10) ||
                          MANAGER_SETTINGS_DEFAULTS.draftAutosaveDelayMs,
                      )
                    }
                    className="rt-input h-10 flex-1 text-sm tabular-nums"
                  />
                  <span className="text-xs text-[rgb(var(--muted))]">ms</span>
                </div>
              </SettingsField>
              <SettingsField label="Alert poll interval" hint="How often to check for new manager notifications">
                <div className="flex max-w-md items-center gap-2">
                  <input
                    type="number"
                    min={5000}
                    max={120000}
                    step={1000}
                    value={Number(
                      settings?.notificationPollIntervalMs ?? MANAGER_SETTINGS_DEFAULTS.notificationPollIntervalMs,
                    )}
                    onChange={(e) =>
                      updateSetting(
                        "notificationPollIntervalMs",
                        Number.parseInt(String(e.target.value || "30000"), 10) ||
                          MANAGER_SETTINGS_DEFAULTS.notificationPollIntervalMs,
                      )
                    }
                    className="rt-input h-10 flex-1 text-sm tabular-nums"
                  />
                  <span className="text-xs text-[rgb(var(--muted))]">ms</span>
                </div>
              </SettingsField>
              <SettingsToggle
                checked={settings?.enableSoundAlerts ?? MANAGER_SETTINGS_DEFAULTS.enableSoundAlerts}
                onChange={(value) => updateSetting("enableSoundAlerts", value)}
                label="Notification sounds"
                description="Play a short sound for team review alerts"
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
