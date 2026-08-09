// @ts-nocheck
import React from "react";
import ModalOverlay from "./ModalOverlay";
import ThemeToggle from "./ThemeToggle";

/** Lightweight preferences for non-admin portals (theme only). */
export default function PortalSettingsModal({ open, onClose }) {
  return (
    <ModalOverlay
      open={open}
      onClose={onClose}
      maxWidth="max-w-md"
      zIndex={85}
      header={
        <div>
          <h3 className="rt-section-title">Settings</h3>
          <p className="mt-1 text-sm text-[rgb(var(--muted))]">Appearance and display preferences.</p>
        </div>
      }
    >
      <div className="space-y-4 -mt-1">
        <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]/50 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
            Theme
          </div>
          <p className="mt-1 text-xs text-[rgb(var(--muted))] leading-relaxed">
            Switch between light and dark mode for this device.
          </p>
          <div className="mt-4">
            <ThemeToggle />
          </div>
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="rt-btn-primary">
            Done
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
