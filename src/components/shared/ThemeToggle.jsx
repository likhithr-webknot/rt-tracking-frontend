import React, { useState, useCallback, useId } from "react";
import { motion as Motion, AnimatePresence } from "framer-motion";

const THEME_STORAGE_KEY = "rt_theme";

function resolveTheme() {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/* ── Celestial body: morphs between sun and moon ── */
function CelestialIcon({ isDark, size = 20 }) {
  const gradId = useId();
  return (
    <Motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="relative z-10"
    >
      <defs>
        <radialGradient id={`${gradId}-glow`} cx="50%" cy="50%" r="60%">
          <Motion.stop
            offset="0%"
            animate={{ stopColor: isDark ? "rgba(165,180,252,0.5)" : "rgba(251,191,36,0.6)" }}
            transition={{ duration: 0.5 }}
          />
          <Motion.stop
            offset="100%"
            animate={{ stopColor: isDark ? "rgba(129,140,248,0)" : "rgba(251,191,36,0)" }}
            transition={{ duration: 0.5 }}
          />
        </radialGradient>
      </defs>

      {/* ambient glow */}
      <Motion.circle
        cx="12" cy="12"
        animate={{ r: isDark ? 10 : 11.5, opacity: isDark ? 0.3 : 0.5 }}
        fill={`url(#${gradId}-glow)`}
        transition={{ duration: 0.5, ease: "easeInOut" }}
      />

      {/* main body */}
      <Motion.circle
        cx="12" cy="12"
        animate={{
          r: isDark ? 5.5 : 5,
          fill: isDark ? "rgb(199,210,254)" : "rgb(250,204,21)",
          stroke: isDark ? "rgb(165,180,252)" : "rgb(234,179,8)",
        }}
        strokeWidth="1.5"
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
      />

      {/* moon crater mask: slides in for dark mode */}
      <Motion.circle
        cx="15" cy="10"
        animate={{
          r: isDark ? 4.5 : 0,
          opacity: isDark ? 1 : 0,
        }}
        fill="rgb(var(--surface))"
        transition={{ type: "spring", stiffness: 350, damping: 25, delay: isDark ? 0.08 : 0 }}
      />

      {/* sun rays: scale out for light, collapse for dark */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
        const rad = (angle * Math.PI) / 180;
        const x1 = 12 + Math.cos(rad) * 7.5;
        const y1 = 12 + Math.sin(rad) * 7.5;
        const x2 = 12 + Math.cos(rad) * 9.5;
        const y2 = 12 + Math.sin(rad) * 9.5;
        return (
          <Motion.line
            key={angle}
            x1={12} y1={12} x2={12} y2={12}
            animate={{
              x1: isDark ? 12 : x1,
              y1: isDark ? 12 : y1,
              x2: isDark ? 12 : x2,
              y2: isDark ? 12 : y2,
              opacity: isDark ? 0 : 0.9,
              stroke: isDark ? "rgb(165,180,252)" : "rgb(234,179,8)",
            }}
            strokeWidth="1.8"
            strokeLinecap="round"
            transition={{
              type: "spring",
              stiffness: 350,
              damping: 22,
              delay: isDark ? 0 : 0.04 + (angle / 360) * 0.15,
            }}
          />
        );
      })}

      {/* dark-mode stars */}
      {[
        { cx: 5.5, cy: 5.5, r: 0.6, delay: 0.2 },
        { cx: 19, cy: 17, r: 0.5, delay: 0.3 },
        { cx: 4, cy: 16, r: 0.4, delay: 0.35 },
      ].map((star, i) => (
        <Motion.circle
          key={`star-${i}`}
          cx={star.cx}
          cy={star.cy}
          fill="currentColor"
          animate={{
            r: isDark ? star.r : 0,
            opacity: isDark ? 0.6 : 0,
          }}
          className="text-indigo-300"
          transition={{ type: "spring", stiffness: 400, damping: 18, delay: isDark ? star.delay : 0 }}
        />
      ))}
    </Motion.svg>
  );
}

/* ── Track background with animated particles ── */
function TrackParticles({ isDark }) {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-full pointer-events-none">
      {[
        { x: "20%", y: "30%", size: 3, delay: 0 },
        { x: "70%", y: "55%", size: 2.5, delay: 0.1 },
        { x: "45%", y: "70%", size: 2, delay: 0.2 },
      ].map((p, i) => (
        <Motion.div
          key={i}
          className="absolute rounded-full"
          style={{ left: p.x, top: p.y, width: p.size, height: p.size }}
          animate={{
            backgroundColor: isDark ? "rgba(165,180,252,0.35)" : "rgba(255,255,255,0.7)",
            scale: [1, 1.3, 1],
            opacity: [0.4, 0.8, 0.4],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            delay: p.delay,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

const thumbSpring = { type: "spring", stiffness: 350, damping: 26, mass: 0.9 };

export default function ThemeToggle({ compact = false, className = "" }) {
  const [theme, setTheme] = useState(() => resolveTheme());

  const toggleTheme = useCallback(() => {
    if (typeof document === "undefined") return;
    const next = resolveTheme() === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch { void 0; }
    setTheme(next);
  }, []);

  const isDark = theme === "dark";

  /* ── Compact pill toggle ── */
  if (compact) {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={["relative inline-flex items-center outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))]/40 rounded-full", className].join(" ")}
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        role="switch"
        aria-checked={isDark}
      >
        <Motion.div
          className="relative h-7 w-[52px] rounded-full border overflow-hidden"
          animate={{
            background: isDark
              ? "linear-gradient(135deg, rgba(30,27,75,0.9) 0%, rgba(49,46,129,0.7) 100%)"
              : "linear-gradient(135deg, rgba(186,230,253,0.7) 0%, rgba(254,240,138,0.5) 100%)",
            borderColor: isDark ? "rgba(99,102,241,0.25)" : "rgba(250,204,21,0.3)",
          }}
          transition={{ duration: 0.45, ease: "easeInOut" }}
          style={{ borderWidth: 1 }}
        >
          <TrackParticles isDark={isDark} />

          {/* Thumb */}
          <Motion.div
            className="absolute top-[3px] left-[3px] grid h-[19px] w-[19px] place-items-center rounded-full"
            animate={{
              x: isDark ? 22 : 0,
              backgroundColor: isDark ? "rgb(67,56,202)" : "rgb(250,204,21)",
              boxShadow: isDark
                ? "0 0 10px 3px rgba(129,140,248,0.3), inset 0 0 4px rgba(165,180,252,0.2)"
                : "0 0 12px 3px rgba(250,204,21,0.35), inset 0 0 4px rgba(255,255,255,0.4)",
            }}
            transition={thumbSpring}
          >
            <CelestialIcon isDark={isDark} size={13} />
          </Motion.div>
        </Motion.div>
      </button>
    );
  }

  /* ── Full: label + pill ── */
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={[
        "group w-full flex items-center justify-between rounded-xl px-3.5 py-3 outline-none",
        "transition-all duration-300",
        "border border-[rgb(var(--border))]/50 hover:border-[rgb(var(--border))]",
        "focus-visible:ring-2 focus-visible:ring-[rgb(var(--primary))]/40",
        className,
      ].join(" ")}
      style={{
        background: isDark
          ? "linear-gradient(135deg, rgba(var(--surface-2),0.8) 0%, rgba(30,27,75,0.25) 100%)"
          : "linear-gradient(135deg, rgba(var(--surface-2),0.8) 0%, rgba(254,240,138,0.2) 100%)",
      }}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      role="switch"
      aria-checked={isDark}
    >
      {/* Left: icon + label */}
      <div className="flex items-center gap-2.5">
        <Motion.div
          className="grid h-7 w-7 place-items-center rounded-lg"
          animate={{
            backgroundColor: isDark ? "rgba(99,102,241,0.15)" : "rgba(250,204,21,0.15)",
          }}
          transition={{ duration: 0.3 }}
        >
          <CelestialIcon isDark={isDark} size={16} />
        </Motion.div>
        <div className="text-left">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
            Theme
          </div>
          <AnimatePresence mode="wait">
            <Motion.div
              key={isDark ? "dark" : "light"}
              initial={{ y: 6, opacity: 0, filter: "blur(3px)" }}
              animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
              exit={{ y: -6, opacity: 0, filter: "blur(3px)" }}
              transition={{ duration: 0.22 }}
              className="text-[12px] font-semibold text-[rgb(var(--text))]"
            >
              {isDark ? "Dark" : "Light"}
            </Motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Right: toggle track */}
      <Motion.div
        className="relative h-7 w-[52px] rounded-full border shrink-0 overflow-hidden"
        animate={{
          background: isDark
            ? "linear-gradient(135deg, rgba(30,27,75,0.9) 0%, rgba(49,46,129,0.7) 100%)"
            : "linear-gradient(135deg, rgba(186,230,253,0.7) 0%, rgba(254,240,138,0.5) 100%)",
          borderColor: isDark ? "rgba(99,102,241,0.25)" : "rgba(250,204,21,0.3)",
        }}
        transition={{ duration: 0.45, ease: "easeInOut" }}
        style={{ borderWidth: 1 }}
      >
        <TrackParticles isDark={isDark} />

        {/* Thumb */}
        <Motion.div
          className="absolute top-[3px] left-[3px] grid h-[19px] w-[19px] place-items-center rounded-full"
          animate={{
            x: isDark ? 22 : 0,
            backgroundColor: isDark ? "rgb(67,56,202)" : "rgb(250,204,21)",
            boxShadow: isDark
              ? "0 0 10px 3px rgba(129,140,248,0.3), inset 0 0 4px rgba(165,180,252,0.2)"
              : "0 0 12px 3px rgba(250,204,21,0.35), inset 0 0 4px rgba(255,255,255,0.4)",
          }}
          transition={thumbSpring}
        >
          <CelestialIcon isDark={isDark} size={13} />
        </Motion.div>
      </Motion.div>
    </button>
  );
}
