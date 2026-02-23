import React, { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const THEME_STORAGE_KEY = "rt_theme";

function resolveTheme() {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export default function ThemeToggle({ compact = false, className = "" }) {
  const [theme, setTheme] = useState(() => resolveTheme());

  useEffect(() => {
    setTheme(resolveTheme());
  }, []);

  function toggleTheme() {
    if (typeof document === "undefined") return;
    const next = resolveTheme() === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // ignore
    }
    setTheme(next);
  }

  const isDark = theme === "dark";

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={[
          "relative inline-flex h-7 w-12 items-center rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] p-0.5 transition-all",
          className,
        ].join(" ")}
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        role="switch"
        aria-checked={isDark}
      >
        <span
          className={[
            "grid h-5 w-5 place-items-center rounded-full bg-[rgb(var(--surface))] text-[rgb(var(--text))] shadow-sm transition-transform",
            isDark ? "translate-x-5" : "translate-x-0",
          ].join(" ")}
        >
          {isDark ? <Moon size={12} /> : <Sun size={12} />}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={[
        "w-full inline-flex items-center justify-between rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-2.5 text-xs font-bold uppercase tracking-widest text-[rgb(var(--text))]",
        className,
      ].join(" ")}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      role="switch"
      aria-checked={isDark}
    >
      <span className="text-[10px] tracking-[0.2em] text-slate-500">
        Theme
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="text-[11px] font-black normal-case tracking-normal">
          {isDark ? "Dark" : "Light"}
        </span>
        <span className="relative inline-flex h-6 w-11 items-center rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-0.5">
          <span
            className={[
              "grid h-5 w-5 place-items-center rounded-full bg-[rgb(var(--surface-2))] text-[rgb(var(--text))] shadow-sm transition-transform",
              isDark ? "translate-x-5" : "translate-x-0",
            ].join(" ")}
          >
            {isDark ? <Moon size={12} /> : <Sun size={12} />}
          </span>
        </span>
      </span>
    </button>
  );
}
