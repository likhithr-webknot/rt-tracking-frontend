import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import RootRouter from "./RootRouter";
import { queryClient } from "./queryClient";
import "./index.css";

function applyInitialTheme() {
  try {
    const saved = window.localStorage.getItem("rt_theme");
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    if (saved === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.add("light");
    }
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
