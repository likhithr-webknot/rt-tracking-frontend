import React from "react";
import ReactDOM from "react-dom/client";
import RootRouter from "./RootRouter.jsx";
import "./index.css";

function applyInitialTheme() {
    try {
        const saved = window.localStorage.getItem("rt_theme"); // "light" | "dark" | null
        const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
        const shouldUseDark = saved ? saved === "dark" : Boolean(prefersDark);
        document.documentElement.classList.toggle("dark", shouldUseDark);
    } catch { void 0; }
}
applyInitialTheme();

ReactDOM.createRoot(document.getElementById("root")).render(<RootRouter />);
