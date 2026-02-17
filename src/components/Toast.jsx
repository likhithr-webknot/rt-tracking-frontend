import React, { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

const MotionDiv = motion.div;

const TONES = {
  primary: {
    container: "bg-purple-600 text-white border-white/10",
    icon: "text-white",
    Icon: CheckCircle2,
  },
  success: {
    container: "bg-emerald-500 text-black border-emerald-200/20",
    icon: "text-black",
    Icon: CheckCircle2,
  },
  error: {
    container: "bg-red-500 text-white border-white/10",
    icon: "text-white",
    Icon: AlertTriangle,
  },
};

export default function Toast({ toast, onDismiss, durationMs = null }) {
  const prefersReducedMotion = useReducedMotion();
  const timeoutRef = useRef(null);

  const toneKey = String(toast?.tone || "").trim().toLowerCase() || "primary";
  const tone = TONES[toneKey] || TONES.primary;

  const toastKey = useMemo(() => {
    if (!toast) return "empty";
    const title = String(toast?.title ?? "");
    const message = String(toast?.message ?? "");
    return `${toneKey}:${title}:${message}`;
  }, [toast, toneKey]);

  useEffect(() => {
    if (!toast || !durationMs) return undefined;
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => onDismiss?.(), durationMs);
    return () => window.clearTimeout(timeoutRef.current);
  }, [toastKey, toast, durationMs, onDismiss]);

  const motionProps = prefersReducedMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: -12, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: -10, scale: 0.985 },
      };

  const transition = prefersReducedMotion
    ? { duration: 0.18, ease: "easeOut" }
    : { type: "spring", stiffness: 520, damping: 34, mass: 0.7 };

  return (
    <div className="fixed top-4 left-4 right-4 sm:top-6 sm:left-auto sm:right-6 z-[80] pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toast ? (
          <MotionDiv
            key={toastKey}
            {...motionProps}
            transition={transition}
            className={[
              "pointer-events-auto",
              "w-full sm:w-[360px] max-w-full",
              "rounded-2xl border px-4 py-3 shadow-2xl",
              "backdrop-blur-sm",
              tone.container,
            ].join(" ")}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-3">
              <div className={["mt-0.5", tone.icon].join(" ")}>
                <tone.Icon size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-black truncate">{toast.title}</div>
                {toast.message ? (
                  <div className="text-xs mt-1 opacity-90 break-words">{toast.message}</div>
                ) : null}
              </div>
              <button
                onClick={() => onDismiss?.()}
                className="ml-2 rounded-xl p-1 opacity-90 hover:bg-white/10 hover:opacity-100 transition"
                aria-label="Dismiss notification"
                title="Dismiss"
                type="button"
              >
                <X size={16} />
              </button>
            </div>
          </MotionDiv>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
