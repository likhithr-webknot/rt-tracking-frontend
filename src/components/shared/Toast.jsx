import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

const MotionDiv = motion.div;

const TONES = {
  primary: {
    bg: "bg-[rgb(var(--surface))]",
    border: "border-[rgb(var(--primary))]/30",
    accent: "bg-[rgb(var(--primary))]",
    icon: "text-[rgb(var(--primary))]",
    Icon: Info,
    progress: "bg-[rgb(var(--primary))]",
  },
  success: {
    bg: "bg-[rgb(var(--surface))]",
    border: "border-emerald-500/30",
    accent: "bg-emerald-500",
    icon: "text-emerald-500",
    Icon: CheckCircle2,
    progress: "bg-emerald-500",
  },
  error: {
    bg: "bg-[rgb(var(--surface))]",
    border: "border-red-500/30",
    accent: "bg-red-500",
    icon: "text-red-500",
    Icon: AlertTriangle,
    progress: "bg-red-500",
  },
};

export default function Toast({ toast, onDismiss, durationMs = null }) {
  const prefersReducedMotion = useReducedMotion();
  const timeoutRef = useRef(null);
  const [progress, setProgress] = useState(100);
  const progressRef = useRef(null);

  const toneKey = String(toast?.tone || "").trim().toLowerCase() || "primary";
  const tone = TONES[toneKey] || TONES.primary;

  const toastKey = useMemo(() => {
    if (!toast) return "empty";
    const title = String(toast?.title ?? "");
    const message = String(toast?.message ?? "");
    return `${toneKey}:${title}:${message}`;
  }, [toast, toneKey]);

  useEffect(() => {
    if (!toast || !durationMs) {
      setProgress(100);
      return undefined;
    }
    setProgress(100);
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => onDismiss?.(), durationMs);

    const start = performance.now();
    const tick = () => {
      const elapsed = performance.now() - start;
      const remaining = Math.max(0, 1 - elapsed / durationMs);
      setProgress(remaining * 100);
      if (remaining > 0) progressRef.current = requestAnimationFrame(tick);
    };
    progressRef.current = requestAnimationFrame(tick);

    return () => {
      window.clearTimeout(timeoutRef.current);
      cancelAnimationFrame(progressRef.current);
    };
  }, [toastKey, toast, durationMs, onDismiss]);

  const enterTransition = prefersReducedMotion
    ? { duration: 0.15, ease: "easeOut" }
    : { type: "spring", stiffness: 380, damping: 28, mass: 0.8 };

  const exitTransition = prefersReducedMotion
    ? { duration: 0.15, ease: "easeIn" }
    : { duration: 0.35, ease: [0.32, 0, 0.67, 0] };

  return (
    <div className="fixed top-4 left-4 right-4 sm:top-6 sm:left-auto sm:right-6 z-[80] pointer-events-none flex justify-end">
      <AnimatePresence mode="popLayout">
        {toast ? (
          <MotionDiv
            key={toastKey}
            layout
            initial={prefersReducedMotion
              ? { opacity: 0 }
              : { opacity: 0, x: 80, scale: 0.92, filter: "blur(4px)" }
            }
            animate={{
              opacity: 1,
              x: 0,
              scale: 1,
              filter: "blur(0px)",
              transition: enterTransition,
            }}
            exit={prefersReducedMotion
              ? { opacity: 0 }
              : {
                  opacity: 0,
                  x: 60,
                  scale: 0.95,
                  filter: "blur(3px)",
                  transition: exitTransition,
                }
            }
            className={[
              "pointer-events-auto relative overflow-hidden",
              "w-full sm:w-[380px] max-w-full",
              "rounded-xl border shadow-2xl",
              tone.bg,
              tone.border,
            ].join(" ")}
            role="status"
            aria-live="polite"
          >
            {/* Left accent bar */}
            <div className={["absolute left-0 top-0 bottom-0 w-1 rounded-l-xl", tone.accent].join(" ")} />

            <div className="flex items-start gap-3 px-4 py-3.5 pl-5">
              <div className={["mt-0.5 shrink-0", tone.icon].join(" ")}>
                <tone.Icon size={18} strokeWidth={2.2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-[rgb(var(--text))] truncate">{toast.title}</div>
                {toast.message ? (
                  <div className="text-xs mt-1 text-[rgb(var(--muted))] break-words leading-relaxed">{toast.message}</div>
                ) : null}
              </div>
              <button
                onClick={() => onDismiss?.()}
                className="ml-1 shrink-0 rounded-lg p-1.5 text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-2))] transition-all duration-200"
                aria-label="Dismiss notification"
                title="Dismiss"
                type="button"
              >
                <X size={15} />
              </button>
            </div>

            {/* Progress bar */}
            {durationMs ? (
              <div className="h-[2px] w-full bg-[rgb(var(--border))]/30">
                <div
                  className={["h-full transition-none rounded-r-full opacity-60", tone.progress].join(" ")}
                  style={{ width: `${progress}%` }}
                />
              </div>
            ) : null}
          </MotionDiv>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
