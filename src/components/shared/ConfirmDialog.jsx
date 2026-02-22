import React from "react";

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
  if (!open) return null;

  const confirmClass =
    confirmVariant === "primary"
      ? "bg-purple-600 text-white hover:bg-purple-500"
      : "bg-red-500 text-white hover:bg-red-400";

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rt-panel rounded-3xl p-6">
        <h3 className="font-black uppercase tracking-tight text-[rgb(var(--text))]">{title || "Confirm"}</h3>
        <p className="mt-3 text-sm text-[rgb(var(--muted))] whitespace-pre-wrap">{message || "Are you sure?"}</p>

        <div className="mt-6 flex items-center justify-end gap-3">
          {showCancel ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rt-btn-ghost px-4 py-2 text-xs uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelText}
            </button>
          ) : null}

          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={[
              "rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest transition-all disabled:opacity-60 disabled:cursor-not-allowed",
              confirmClass,
            ].join(" ")}
          >
            {busy ? "Please wait…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
