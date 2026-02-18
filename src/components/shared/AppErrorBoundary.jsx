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
      <div className="min-h-screen bg-[#080808] text-slate-100 font-sans grid place-items-center px-6">
        <div className="w-full max-w-2xl rounded-[2.5rem] border border-white/10 bg-[#111] shadow-2xl p-8">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
            Error
          </div>
          <div className="mt-2 text-2xl font-black uppercase tracking-tighter italic">
            Something Broke
          </div>
          <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200 whitespace-pre-wrap break-words font-mono">
            {message}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-2xl bg-white text-black px-5 py-3 font-black text-[11px] uppercase tracking-widest hover:bg-gray-200 transition-all"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => {
                clearAuth();
                window.location.reload();
              }}
              className="rounded-2xl border border-white/10 text-gray-200 px-5 py-3 font-black text-[11px] uppercase tracking-widest hover:bg-white/5 transition-all"
            >
              Clear Session
            </button>
          </div>

          <div className="mt-6 text-xs text-gray-500">
            Open DevTools Console for the full stack trace.
          </div>
        </div>
      </div>
    );
  }
}
