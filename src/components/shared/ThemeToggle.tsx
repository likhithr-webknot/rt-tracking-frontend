// @ts-nocheck
import { useCallback, useState } from "react";
import { Moon, Sun } from "lucide-react";

const THEME_STORAGE_KEY = "rt_theme";

function resolveTheme() {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export default function ThemeToggle({ compact = false, className = "" }) {
  const [theme, setTheme] = useState(() => resolveTheme());

  const toggleTheme = useCallback(() => {
    if (typeof document === "undefined") return;
    const next = resolveTheme() === "dark" ? "light" : "dark";
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      void 0;
    }
    const meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (meta) meta.setAttribute("content", next === "dark" ? "#0a0c14" : "#f5f7fa");
    setTheme(next);
  }, []);

  const isDark = theme === "dark";

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={[
          "rt-theme-toggle inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)]",
          "border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--muted))]",
          "transition-[colors,box-shadow,border-color] duration-200",
          "hover:bg-[rgb(var(--surface-2))] hover:text-[rgb(var(--text))]",
          className,
        ].join(" ")}
        title={isDark ? "Light mode" : "Dark mode"}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={[
        "rt-theme-toggle flex w-full items-center justify-between gap-3 rounded-[var(--radius-md)]",
        "border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-2.5 text-sm font-medium",
        "text-[rgb(var(--text))] transition-[colors,box-shadow,border-color] duration-200",
        "hover:bg-[rgb(var(--sidebar-hover))]",
        className,
      ].join(" ")}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      <span className="text-[rgb(var(--muted))]">Appearance</span>
      <span className="inline-flex items-center gap-1.5 font-semibold text-[rgb(var(--text))]">
        {isDark ? <Moon size={16} /> : <Sun size={16} />}
        {isDark ? "Dark" : "Light"}
      </span>
    </button>
  );
}
