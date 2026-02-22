import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import AppErrorBoundary from "./components/shared/AppErrorBoundary.jsx";

function applyInitialTheme() {
    try {
        const saved = window.localStorage.getItem("rt_theme"); // "light" | "dark" | null
        const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
        const shouldUseDark = saved ? saved === "dark" : Boolean(prefersDark);
        document.documentElement.classList.toggle("dark", shouldUseDark);
    } catch {
        // ignore
    }
}
applyInitialTheme();

ReactDOM.createRoot(document.getElementById("root")).render(
    <AppErrorBoundary>
        <App />
    </AppErrorBoundary>
);