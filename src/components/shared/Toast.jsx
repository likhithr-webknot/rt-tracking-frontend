import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

/* ── Tone definitions ── */
const TONES = {
  primary: {
    accent: "rgb(var(--primary))",
    icon: "text-[rgb(var(--primary))]",
    Icon: Info,
    glow: "rgba(var(--primary), 0.12)",
    progress: "bg-[rgb(var(--primary))]",
    ring: "ring-[rgb(var(--primary))]/10",
  },
  success: {
    accent: "rgb(16, 185, 129)",
    icon: "text-emerald-500",
    Icon: CheckCircle2,
    glow: "rgba(16, 185, 129, 0.10)",
    progress: "bg-emerald-500",
    ring: "ring-emerald-500/10",
  },
  error: {
    accent: "rgb(239, 68, 68)",
    icon: "text-red-500",
    Icon: AlertTriangle,
    glow: "rgba(239, 68, 68, 0.10)",
    progress: "bg-red-500",
    ring: "ring-red-500/10",
  },
};

/* ── Icon micro-animation on mount ── */
function AnimatedIcon({ tone, reduced }) {
  const Comp = tone.Icon;
  if (reduced) return <Comp size={18} strokeWidth={2.2} />;
  return (
    <motion.span
      initial={{ scale: 0, rotate: -60, opacity: 0 }}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 22, delay: 0.08 }}
      className="block"
    >
      <Comp size={18} strokeWidth={2.2} />
    </motion.span>
  );
}

/* ── Smooth progress arc ── */
function ProgressBar({ durationMs, toneProgress, toastKey }) {
  const [progress, setProgress] = useState(100);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!durationMs) { setProgress(100); return; }
    setProgress(100);
    const start = performance.now();
    const tick = () => {
      const elapsed = performance.now() - start;
      const remaining = Math.max(0, 1 - elapsed / durationMs);
      setProgress(remaining * 100);
      if (remaining > 0) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [durationMs, toastKey]);

  if (!durationMs) return null;

  return (
    <div className="h-[2.5px] w-full bg-[rgb(var(--border))]/20 overflow-hidden">
      <motion.div
        initial={{ scaleX: 1 }}
        className={["h-full origin-left rounded-r-full", toneProgress].join(" ")}
        style={{ width: `${progress}%`, opacity: 0.7 }}
      />
    </div>
  );
}

export default function Toast({ toast, onDismiss, durationMs = 2600 }) {
  const prefersReducedMotion = useReducedMotion();
  const timeoutRef = useRef(null);

  const toneKey = String(toast?.tone || "").trim().toLowerCase() || "primary";
  const tone = TONES[toneKey] || TONES.primary;

  const displayTitle = useMemo(() => {
    if (!toast) return "";
    if (toneKey === "error") return toast.friendlyTitle || "Something went wrong";
    return toast.title || "";
  }, [toast, toneKey]);

  const displayMessage = useMemo(() => {
    if (!toast) return "";
    const raw = String(toast.message || "").trim();
    if (toneKey === "error") {
      if (raw) console.debug("Suppressed error message", raw);
      return toast.friendlyMessage || "Please try again in a moment.";
    }
    return raw;
  }, [toast, toneKey]);

  const toastKey = useMemo(() => {
    if (!toast) return "empty";
    const title = displayTitle;
    const message = displayMessage;
    return `${toneKey}:${title}:${message}:${Date.now()}`;
  }, [displayMessage, displayTitle, toneKey, toast]);

  useEffect(() => {
    if (!toast || !durationMs) return;
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => onDismiss?.(), durationMs);
    return () => window.clearTimeout(timeoutRef.current);
  }, [toastKey, toast, durationMs, onDismiss]);

  /* ── Motion choreography ── */
  const enter = prefersReducedMotion
    ? { duration: 0.12, ease: "easeOut" }
    : { type: "spring", stiffness: 420, damping: 32, mass: 0.75 };

  const exit = prefersReducedMotion
    ? { duration: 0.12, ease: "easeIn" }
    : { duration: 0.4, ease: [0.36, 0, 0.66, -0.2] };

  return (
    <div className="fixed top-4 left-4 right-4 sm:top-6 sm:left-auto sm:right-6 z-[80] pointer-events-none flex justify-end">
      <AnimatePresence mode="wait">
        {toast ? (
          <motion.div
            key={toastKey}
            initial={prefersReducedMotion
              ? { opacity: 0 }
              : { opacity: 0, y: -16, x: 40, scale: 0.92, filter: "blur(6px)" }
            }
            animate={{
              opacity: 1,
              y: 0,
              x: 0,
              scale: 1,
              filter: "blur(0px)",
              transition: enter,
            }}
            exit={prefersReducedMotion
              ? { opacity: 0 }
              : {
                  opacity: 0,
                  y: -10,
                  x: 50,
                  scale: 0.96,
                  filter: "blur(4px)",
                  transition: exit,
                }
            }
            className={[
              "pointer-events-auto relative overflow-hidden",
              "w-full sm:w-[390px] max-w-full",
              "rounded-2xl border border-[rgb(var(--border))]/60",
              "bg-[rgb(var(--surface))]/95 backdrop-blur-xl",
              "shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12),0_2px_8px_-2px_rgba(0,0,0,0.06)]",
              `ring-1 ${tone.ring}`,
            ].join(" ")}
            role="status"
            aria-live="polite"
            style={{
              boxShadow: `0 8px 32px -4px rgba(0,0,0,0.12), 0 2px 8px -2px rgba(0,0,0,0.06), 0 0 0 1px ${tone.glow}`,
            }}
          >
            {/* floating glow */}
            <motion.div
              className="absolute right-[-40px] top-[-30px] h-28 w-28 rounded-full pointer-events-none"
              style={{ background: `radial-gradient(circle, ${tone.glow} 0%, transparent 55%)` }}
              animate={prefersReducedMotion ? undefined : { opacity: [0.45, 0.8, 0.45], scale: [0.9, 1.05, 0.9] }}
              transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
            />

            {/* Accent gradient strip */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
              className="absolute left-0 top-0 bottom-0 w-[3px] origin-top rounded-l-2xl"
              style={{ background: `linear-gradient(to bottom, ${tone.accent}, ${tone.accent}88)` }}
            />

            <div className="flex items-start gap-3 px-4 py-3.5 pl-5">
              <div className={["mt-0.5 shrink-0", tone.icon].join(" ")}>
                <AnimatedIcon tone={tone} reduced={prefersReducedMotion} />
              </div>

              <div className="min-w-0 flex-1">
                <motion.div
                  initial={prefersReducedMotion ? {} : { opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.06 }}
                  className="text-sm font-semibold text-[rgb(var(--text))] truncate leading-snug"
                >
                  {displayTitle}
                </motion.div>
                {displayMessage ? (
                  <motion.div
                    initial={prefersReducedMotion ? {} : { opacity: 0, x: 6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.12 }}
                    className="text-xs mt-1 text-[rgb(var(--muted))] break-words leading-relaxed"
                  >
                    {displayMessage}
                  </motion.div>
                ) : null}
              </div>

              <motion.button
                whileHover={{ scale: 1.1, backgroundColor: "rgb(var(--surface-2))" }}
                whileTap={{ scale: 0.9 }}
                onClick={() => onDismiss?.()}
                className="ml-1 shrink-0 rounded-lg p-1.5 text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] transition-colors duration-200"
                aria-label="Dismiss notification"
                title="Dismiss"
                type="button"
              >
                <X size={14} strokeWidth={2.5} />
              </motion.button>
            </div>

            <ProgressBar durationMs={durationMs} toneProgress={tone.progress} toastKey={toastKey} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
