import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import RootRouter from "./RootRouter";
import { queryClient } from "./queryClient";
import "./index.css";

function syncThemeColorMeta(isDark) {
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.setAttribute("content", isDark ? "#0a0c14" : "#f5f7fa");
}

function applyInitialTheme() {
  try {
    const saved = window.localStorage.getItem("rt_theme");
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    const isDark = saved === "dark";
    root.classList.add(isDark ? "dark" : "light");
    syncThemeColorMeta(isDark);
  } catch {
    void 0;
  }
}
applyInitialTheme();

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error('Missing root element with id "root".');
}

ReactDOM.createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RootRouter />
    </QueryClientProvider>
  </StrictMode>
);
