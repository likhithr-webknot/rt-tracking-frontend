// @ts-nocheck
import React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

/** Consistent footer row for dialogs (Cancel / primary actions). */
export function DialogFooter({ children, className = "" }) {
  return (
    <div
      className={[
        "flex flex-wrap items-center justify-end gap-2 pt-4 mt-5 border-t border-[rgb(var(--border))]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

/**
 * Standard app dialog — backdrop blur, spring panel, optional title/subtitle/footer.
 */
export default function ModalOverlay({
  open,
  onClose,
  maxWidth = "max-w-lg",
  zIndex = 110,
  showClose = true,
  header,
  title,
  subtitle,
  footer,
  children,
  panelClassName = "",
}) {
  if (typeof document === "undefined") return null;

  const resolvedHeader =
    header ??
    (title ? (
      <div className="min-w-0 pr-2">
        <h2 className="text-lg font-semibold text-[rgb(var(--text))] tracking-tight">{title}</h2>
        {subtitle ? <p className="text-sm text-[rgb(var(--muted))] mt-0.5">{subtitle}</p> : null}
      </div>
    ) : null);

  const showHeaderRow = Boolean(resolvedHeader || showClose);

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
          style={{ zIndex }}
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose?.();
          }}
        >
          <motion.div
            key="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? "app-dialog-title" : undefined}
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.75 }}
            className={[
              "w-full rt-panel rounded-xl p-5 sm:p-6 my-3 sm:my-6 max-h-[90dvh] overflow-y-auto shadow-2xl",
              maxWidth,
              panelClassName,
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={(e) => e.stopPropagation()}
          >
            {showHeaderRow ? (
              <div className="flex items-start justify-between gap-4 mb-5">
                <div className="flex-1 min-w-0" id={title ? "app-dialog-title" : undefined}>
                  {resolvedHeader}
                </div>
                {showClose ? (
                  <button
                    type="button"
                    onClick={onClose}
                    className="shrink-0 p-2 rounded-lg hover:bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] transition-colors"
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                ) : null}
              </div>
            ) : null}
            {children}
            {footer ? <DialogFooter>{footer}</DialogFooter> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
