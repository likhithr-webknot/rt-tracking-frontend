import React, { useMemo } from "react";
import { Calendar, Clock, Lock, ShieldAlert } from "lucide-react";

function parseDateTime(value) {
  const v = String(value ?? "").trim();
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatLocal(date) {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return String(date);
  }
}

function formatCycleMonth(cycleKey, now) {
  const key = String(cycleKey ?? "").trim();
  if (!key) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return null;
  const d = new Date(now);
  d.setFullYear(year);
  d.setMonth(monthIndex);
  d.setDate(1);
  try {
    return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(d);
  } catch {
    return key;
  }
}

export default function SubmissionWindowClosed({ portalWindow, error, onRetry }) {
  const now = useMemo(() => new Date(), []);
  const cycleKey = portalWindow?.cycleKey;
  const monthLabel = useMemo(() => {
    const fromCycle = formatCycleMonth(cycleKey, now);
    if (fromCycle) return fromCycle;
    try {
      return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(now);
    } catch {
      return "this month";
    }
  }, [cycleKey, now]);

  const start = parseDateTime(portalWindow?.startAt ?? portalWindow?.start);
  const end = parseDateTime(portalWindow?.endAt ?? portalWindow?.end);
  const endValue = portalWindow?.endAt ?? portalWindow?.end;
  const scopeKey = String(portalWindow?.source ?? "").trim().toLowerCase();
  const scopeLabel = scopeKey.includes("employee")
    ? "Employee-specific"
    : scopeKey.includes("global")
      ? "Global"
      : "Effective";

  return (
    <div className="rt-shell font-sans overflow-x-hidden">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-12 py-8 sm:py-12 lg:py-20">
        <div className="rt-panel relative overflow-hidden rounded-[2rem]">
          <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, #a855f7 0, transparent 55%), radial-gradient(circle at 90% 30%, #22c55e 0, transparent 60%)" }} />
          <div className="relative p-8 sm:p-12">
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-[rgb(var(--muted))]">
                  <Lock size={14} className="text-purple-300" /> Submissions Locked
                </div>
                <h1 className="mt-4 text-4xl sm:text-5xl font-black tracking-tight">
                  Submission Window Closed
                </h1>
                <p className="mt-3 text-[rgb(var(--muted))]">
                  Submissions are closed for <span className="text-[rgb(var(--text))] font-bold">{monthLabel}</span>.
                </p>
              </div>

              <div className="rt-panel-subtle p-4 min-w-[280px]">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                  <Calendar size={14} className="text-slate-400" /> Window Schedule
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">Opens</span>
                    <span className="font-mono text-[rgb(var(--text))]">{formatLocal(start)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">Closes</span>
                    <span className="font-mono text-[rgb(var(--text))]">{endValue ? formatLocal(end) : "—"}</span>
                  </div>
                </div>
                <div className="mt-4 text-xs text-slate-500 flex items-center gap-2">
                  <Clock size={14} className="text-slate-400" />
                  Check back when the window opens.
                </div>
                <div className="mt-3 text-xs text-slate-500 flex items-center justify-between gap-4">
                  <span>Scope</span>
                  <span className="font-mono text-[rgb(var(--text))]">{scopeLabel}</span>
                </div>
              </div>
            </div>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rt-panel-subtle rounded-2xl p-6">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                  What You Can Do
                </div>
                <ul className="mt-3 text-sm text-[rgb(var(--text))] space-y-2">
                  <li>Prepare your self review and collect certification proofs.</li>
                  <li>When the window opens, submit in one go.</li>
                  <li>If this looks incorrect, contact support.</li>
                </ul>
              </div>

              <div className="rounded-2xl border border-amber-400/40 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10 p-6">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-amber-700 dark:text-amber-200">
                  <ShieldAlert size={14} /> Support
                </div>
                <div className="mt-3 text-sm text-amber-800 dark:text-amber-100">
                  {error ? "Unable to load the submission window status." : "If you believe the window should be open, please contact:"}
                </div>
                {error ? (
                  <div className="mt-2 text-xs text-amber-800/90 dark:text-amber-100/90 font-mono whitespace-pre-wrap">{String(error)}</div>
                ) : null}
                <div className="mt-2 text-sm font-mono text-amber-800 dark:text-amber-100">
                  hr@webknot.in
                </div>
                {typeof onRetry === "function" ? (
                  <button
                    onClick={onRetry}
                    className="mt-5 inline-flex items-center justify-center rounded-2xl bg-white text-black px-5 py-3 font-black text-[11px] uppercase tracking-widest hover:bg-gray-200 transition-all"
                    type="button"
                  >
                    Retry
                  </button>
                ) : null}
                <div className="mt-4 text-xs text-amber-700/90 dark:text-amber-200/80">
                  Note: monthly and 6-month aggregations will be handled automatically once the backend workflow is wired.
                </div>
              </div>
            </div>

            <div className="mt-10 text-xs text-[rgb(var(--muted))]">
              This view is based on the server submission window state.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
