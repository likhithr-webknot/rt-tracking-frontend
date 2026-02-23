import React from "react";
import { clearAuth } from "../../api/auth.js";

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    // Keep console logging for dev debugging.
    console.error("[AppErrorBoundary]", error);
  }

  render() {
    const { error } = this.state;
    const { children } = this.props;

    if (!error) return children;

    const message = String(error?.message || "The app crashed while rendering.");

    return (
      <div className="rt-shell font-sans grid place-items-center px-6">
        <div className="rt-panel w-full max-w-2xl rounded-[2rem] p-8">
          <div className="rt-kicker">
            Error
          </div>
          <div className="mt-2 rt-title">
            Something Broke
          </div>
          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200 whitespace-pre-wrap break-words font-mono">
            {message}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rt-btn-primary text-[11px] uppercase tracking-widest"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => {
                clearAuth();
                window.location.reload();
              }}
              className="rt-btn-ghost text-[11px] uppercase tracking-widest"
            >
              Clear Session
            </button>
          </div>

          <div className="mt-6 text-xs text-slate-500">
            Open DevTools Console for the full stack trace.
          </div>
        </div>
      </div>
    );
  }
}
