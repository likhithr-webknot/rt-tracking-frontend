import React from "react";
import ModalOverlay, { DialogFooter } from "./ModalOverlay";

export default function ConfirmDialog({
  open,
  title,
  message,
  children = null,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  confirmVariant = "danger",
  busy = false,
  showCancel = true,
  confirmDisabled = false,
  zIndex = 120,
}) {
  const confirmClass =
    confirmVariant === "primary"
      ? "rt-btn-primary"
      : "rt-btn-primary !bg-red-600 hover:!bg-red-500 !border-red-600";

  return (
    <ModalOverlay
      open={open}
      onClose={busy ? undefined : onCancel}
      maxWidth="max-w-md"
      zIndex={zIndex}
      showClose={false}
      title={title || "Confirm"}
    >
      <p className="text-sm text-[rgb(var(--muted))] whitespace-pre-wrap">{message || "Are you sure?"}</p>
      {children ? <div className="mt-4 space-y-3 text-sm text-[rgb(var(--text))]">{children}</div> : null}

      <DialogFooter className="mt-5">
        {showCancel ? (
          <button type="button" onClick={onCancel} disabled={busy} className="rt-btn-ghost">
            {cancelText}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy || confirmDisabled}
          className={[confirmClass, busy || confirmDisabled ? "opacity-60 cursor-not-allowed" : ""].join(" ")}
        >
          {busy ? "Please wait…" : confirmText}
        </button>
      </DialogFooter>
    </ModalOverlay>
  );
}
