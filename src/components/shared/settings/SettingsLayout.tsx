// @ts-nocheck
import React, { useId, useState } from "react";
import { ChevronDown, RotateCcw, Save } from "lucide-react";

export function SettingsPage({ children, className = "" }) {
  return <div className={`pulse-settings-page space-y-8 ${className}`.trim()}>{children}</div>;
}

export function SettingsGroup({ title, description, children }) {
  return (
    <section className="pulse-settings-group">
      {title ? (
        <div className="pulse-settings-group-head">
          <h2 className="pulse-settings-group-title">{title}</h2>
          {description ? <p className="pulse-settings-group-desc">{description}</p> : null}
        </div>
      ) : null}
      <div className="pulse-settings-group-body">{children}</div>
    </section>
  );
}

export function SettingsSection({
  icon: Icon,
  title,
  description,
  badge = null,
  defaultOpen = false,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className="pulse-settings-section">
      <button
        type="button"
        className="pulse-settings-section-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="pulse-settings-section-icon">{Icon ? <Icon size={18} strokeWidth={2} /> : null}</span>
        <span className="min-w-0 flex-1 text-left">
          <span className="flex flex-wrap items-center gap-2">
            <span className="pulse-settings-section-title">{title}</span>
            {badge ? <span className="pulse-settings-badge">{badge}</span> : null}
          </span>
          {description ? <span className="pulse-settings-section-desc">{description}</span> : null}
        </span>
        <ChevronDown
          size={18}
          strokeWidth={2}
          className={["pulse-settings-chevron shrink-0", open ? "pulse-settings-chevron--open" : ""].join(" ")}
        />
      </button>
      {open ? (
        <div id={panelId} className="pulse-settings-section-panel">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function SettingsField({ label, hint, children }) {
  return (
    <div className="pulse-settings-field">
      {label ? (
        <div className="mb-1.5">
          <div className="pulse-settings-field-label">{label}</div>
          {hint ? <div className="pulse-settings-field-hint">{hint}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function SettingsRow({ label, description, children }) {
  return (
    <div className="pulse-settings-row">
      <div className="min-w-0 flex-1">
        <div className="pulse-settings-row-label">{label}</div>
        {description ? <div className="pulse-settings-row-desc">{description}</div> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsToggle({ checked, onChange, label, description }) {
  return (
    <SettingsRow label={label} description={description}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={["pulse-settings-switch", checked ? "pulse-settings-switch--on" : ""].join(" ")}
      >
        <span className="pulse-settings-switch-knob" />
      </button>
    </SettingsRow>
  );
}

export function SettingsCallout({ variant = "info", children }) {
  return (
    <div
      className={[
        "pulse-settings-callout",
        variant === "warn" ? "pulse-settings-callout--warn" : "",
        variant === "danger" ? "pulse-settings-callout--danger" : "",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function SettingsFooter({
  hasUnsaved = false,
  onSave,
  onReset,
  saveLabel = "Save changes",
  resetLabel = "Reset defaults",
  busy = false,
}) {
  return (
    <div className="pulse-settings-footer">
      <div className="pulse-settings-footer-inner">
        <div className="min-w-0 flex-1 text-sm">
          {hasUnsaved ? (
            <span className="font-medium text-amber-700 dark:text-amber-300">You have unsaved changes</span>
          ) : (
            <span className="text-[rgb(var(--muted))]">Changes apply to this browser unless noted otherwise.</span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {onReset ? (
            <button type="button" onClick={onReset} disabled={busy} className="rt-btn-ghost h-10 px-4 text-sm">
              <RotateCcw size={15} strokeWidth={2} /> {resetLabel}
            </button>
          ) : null}
          {onSave ? (
            <button type="button" onClick={onSave} disabled={busy} className="rt-btn-primary h-10 px-4 text-sm">
              <Save size={15} strokeWidth={2} /> {saveLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Back-compat aliases used by admin SettingsPanel */
export const FieldLabel = SettingsField;
export function Toggle({ checked, onChange, label }) {
  return <SettingsToggle checked={checked} onChange={onChange} label={label} />;
}
export function SectionCard(props) {
  return <SettingsSection {...props} defaultOpen={props.defaultOpen ?? false} />;
}
