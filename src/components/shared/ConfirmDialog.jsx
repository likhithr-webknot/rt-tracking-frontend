import React from "react";
import ModalOverlay from "./ModalOverlay.jsx";

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  confirmVariant = "danger",
  busy = false,
  showCancel = true,
}) {
  const confirmClass =
    confirmVariant === "primary"
      ? "bg-[rgb(var(--primary))] text-white hover:bg-[rgb(var(--primary-hover))]"
      : "bg-red-600 text-white hover:bg-red-500";

  return (
    <ModalOverlay
      open={open}
      onClose={busy ? undefined : onCancel}
      maxWidth="max-w-md"
      zIndex={80}
      showClose={false}
      header={
        <h3 className="font-semibold uppercase tracking-tight text-[rgb(var(--text))]">{title || "Confirm"}</h3>
      }
    >
      <p className="text-sm text-[rgb(var(--muted))] whitespace-pre-wrap -mt-2">{message || "Are you sure?"}</p>

      <div className="mt-6 flex items-center justify-end gap-2 sm:gap-3 flex-wrap">
        {showCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rt-btn-ghost disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelText}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={[
            "rounded-md px-4 py-2 text-xs font-medium uppercase tracking-wider transition-all disabled:opacity-60 disabled:cursor-not-allowed",
            confirmClass,
          ].join(" ")}
        >
          {busy ? "Please wait…" : confirmText}
        </button>
      </div>
    </ModalOverlay>
  );
}
