import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

/**
 * Reusable modal overlay with smooth entrance/exit animations.
 *
 * @param {object}   props
 * @param {boolean}  props.open       – whether the modal is visible
 * @param {function} [props.onClose]  – called when backdrop or close-button is clicked
 * @param {string}   [props.maxWidth] – Tailwind max-w class (default: "max-w-lg")
 * @param {number}   [props.zIndex]   – z-index tier (default: 60)
 * @param {boolean}  [props.showClose] – show the X button (default: true)
 * @param {React.ReactNode} [props.header] – optional header content (title area)
 * @param {React.ReactNode} props.children
 */
export default function ModalOverlay({
  open,
  onClose,
  maxWidth = "max-w-lg",
  zIndex = 60,
  showClose = true,
  header,
  children,
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={`fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto`}
          style={{ zIndex }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose?.();
          }}
        >
          <motion.div
            key="modal-panel"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.8 }}
            className={`w-full ${maxWidth} rt-panel rounded-xl p-5 sm:p-6 my-3 sm:my-6 max-h-[90dvh] overflow-y-auto shadow-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            {(header || showClose) ? (
              <div className="flex items-start justify-between gap-4 mb-5">
                <div className="flex-1 min-w-0">{header}</div>
                {showClose ? (
                  <button
                    type="button"
                    onClick={onClose}
                    className="shrink-0 p-2 rounded-lg hover:bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] transition-colors"
                    aria-label="Close"
                    title="Close"
                  >
                    <X size={18} />
                  </button>
                ) : null}
              </div>
            ) : null}
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
