// @ts-nocheck
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Loader2,
  Lock,
  Play,
  UserCircle2,
  XCircle,
} from "lucide-react";
import SearchField from "../shared/SearchField";
import { resolveEmployeeApiId } from "../../utils/employeeId";
import {
  closeSubmissionWindowForEmployeeNow,
  fetchEmployeeSubmissionWindowStatus,
  openSubmissionWindowForEmployeeNow,
} from "../../api/submission-window";
import { computeSubmissionWindowOpen, parseSettingsWindowFields } from "../../utils/submissionWindow";

function initials(name) {
  const parts = String(name || "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatWhen(value) {
  if (!value) return "—";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return String(value);
  }
}

export default function EmployeeSubmissionOverride({ employees = [], employeesLoading = false, showToast }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [windowState, setWindowState] = useState(null);
  const [busy, setBusy] = useState("");

  const apiEmpId = useMemo(() => resolveEmployeeApiId(selected), [selected]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = Array.isArray(employees) ? employees.filter((e) => e?.status !== "INACTIVE") : [];
    if (!q) return list.slice(0, 12);
    return list
      .filter((e) => {
        const hay = [e.name, e.email, e.empId, e.id, e.designation, e.band, e.stream]
          .map((x) => String(x || "").toLowerCase())
          .join(" ");
        return hay.includes(q);
      })
      .slice(0, 12);
  }, [employees, query]);

  const refreshStatus = useCallback(async () => {
    if (!apiEmpId) {
      setWindowState(null);
      return;
    }
    setBusy((b) => (b === "open" || b === "close" ? b : "status"));
    try {
      const res = await fetchEmployeeSubmissionWindowStatus(apiEmpId);
      setWindowState(parseSettingsWindowFields(res));
    } catch (err) {
      setWindowState(null);
      showToast?.({
        title: "Could not load window",
        message: err?.message || "Try again.",
        tone: "error",
      });
    } finally {
      setBusy((b) => (b === "status" ? "" : b));
    }
  }, [apiEmpId, showToast]);

  useEffect(() => {
    if (!selected) {
      setWindowState(null);
      return;
    }
    refreshStatus();
  }, [selected, refreshStatus]);

  async function runOpen() {
    if (!apiEmpId) return;
    setBusy("open");
    try {
      const res = await openSubmissionWindowForEmployeeNow(apiEmpId);
      setWindowState(parseSettingsWindowFields(res));
      showToast?.({
        title: "Window opened",
        message: `${selected.name} can submit their review now (override active).`,
      });
    } catch (err) {
      showToast?.({ title: "Open failed", message: err?.message || "Please try again.", tone: "error" });
    } finally {
      setBusy("");
    }
  }

  async function runClose() {
    if (!apiEmpId) return;
    setBusy("close");
    try {
      const res = await closeSubmissionWindowForEmployeeNow(apiEmpId);
      setWindowState(parseSettingsWindowFields(res));
      showToast?.({
        title: "Window closed",
        message: `${selected.name}'s personal submission window is now closed.`,
      });
    } catch (err) {
      showToast?.({ title: "Close failed", message: err?.message || "Please try again.", tone: "error" });
    } finally {
      setBusy("");
    }
  }

  const isOpen = windowState ? computeSubmissionWindowOpen(windowState) : false;
  const acting = Boolean(busy);

  return (
    <div className="rounded-2xl border-2 border-[rgb(var(--accent))]/20 bg-gradient-to-br from-[rgb(var(--accent-soft))]/40 via-[rgb(var(--surface))] to-[rgb(var(--surface))] p-5 sm:p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--accent))]/15 text-[rgb(var(--accent))]">
          <CalendarClock size={24} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-[rgb(var(--text))]">One person at a time</h3>
          <p className="mt-1 text-sm text-[rgb(var(--muted))] leading-relaxed max-w-xl">
            Search by <strong className="text-[rgb(var(--text))]">name</strong>, pick someone, then open or close
            their monthly review window. This overrides the global schedule for that employee only.
          </p>
        </div>
      </div>

      <SearchField
        label="Find an employee"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onClear={() => setQuery("")}
        placeholder="Type a name or email…"
        hint={
          employeesLoading
            ? "Loading team list…"
            : query.trim()
              ? `${matches.length} match${matches.length === 1 ? "" : "es"} — click a person below`
              : "Showing up to 12 people — type to narrow down"
        }
        disabled={employeesLoading}
      />

      {matches.length > 0 && !selected ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {matches.map((emp) => (
            <li key={emp.id || emp.email}>
              <button
                type="button"
                onClick={() => {
                  setSelected(emp);
                  setQuery(emp.name || "");
                }}
                className="rt-table-row-interactive w-full flex items-center gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 text-left transition-all hover:border-[rgb(var(--accent))]/50 hover:shadow-md"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--accent))]/12 text-sm font-bold text-[rgb(var(--accent))]">
                  {initials(emp.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-[rgb(var(--text))] truncate">{emp.name}</span>
                  <span className="block text-xs text-[rgb(var(--muted))] truncate">{emp.email}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {selected ? (
        <div className="rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-5 shadow-sm space-y-5">
          <div className="flex flex-wrap items-start gap-4 justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--primary))]/10 text-lg font-bold text-[rgb(var(--primary))]">
                {initials(selected.name)}
              </span>
              <div className="min-w-0">
                <p className="text-lg font-bold text-[rgb(var(--text))]">{selected.name}</p>
                <p className="text-sm text-[rgb(var(--muted))] truncate">{selected.email}</p>
                <p className="mt-1 text-xs font-mono text-[rgb(var(--muted))]">ID {apiEmpId || "—"}</p>
              </div>
            </div>
            <button
              type="button"
              className="rt-btn-ghost text-sm"
              onClick={() => {
                setSelected(null);
                setWindowState(null);
                setQuery("");
              }}
            >
              Change person
            </button>
          </div>

          <div
            className={[
              "flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3",
              isOpen
                ? "border-emerald-500/30 bg-emerald-500/10"
                : "border-red-500/25 bg-red-500/5",
            ].join(" ")}
          >
            {busy === "status" ? (
              <Loader2 size={20} className="animate-spin text-[rgb(var(--accent))]" />
            ) : isOpen ? (
              <CheckCircle2 size={22} className="text-emerald-600" />
            ) : (
              <XCircle size={22} className="text-red-500" />
            )}
            <div className="flex-1 min-w-[12rem]">
              <p className="text-sm font-semibold text-[rgb(var(--text))]">
                {windowState == null && busy !== "status"
                  ? "Status unknown — use Refresh"
                  : isOpen
                    ? "Their window is open"
                    : "Their window is closed"}
              </p>
              <p className="text-xs text-[rgb(var(--muted))] mt-0.5">
                Opens {formatWhen(windowState?.start || windowState?.startAt)} · Closes{" "}
                {formatWhen(windowState?.end || windowState?.endAt)}
              </p>
            </div>
            <button
              type="button"
              className="rt-btn-secondary text-sm"
              disabled={acting}
              onClick={() => refreshStatus()}
            >
              {busy === "status" ? "Checking…" : "Refresh status"}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              disabled={acting || !apiEmpId}
              onClick={runOpen}
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-emerald-500/40 bg-emerald-500 px-5 py-4 text-base font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 disabled:opacity-50"
            >
              {busy === "open" ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} />}
              Open their window
            </button>
            <button
              type="button"
              disabled={acting || !apiEmpId}
              onClick={runClose}
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-red-500/35 bg-[rgb(var(--surface))] px-5 py-4 text-base font-semibold text-red-700 dark:text-red-200 transition hover:bg-red-500 hover:text-white disabled:opacity-50"
            >
              {busy === "close" ? <Loader2 size={20} className="animate-spin" /> : <Lock size={20} />}
              Close their window
            </button>
          </div>

          <p className="text-xs text-[rgb(var(--muted))] leading-relaxed flex items-start gap-2">
            <UserCircle2 size={14} className="shrink-0 mt-0.5" />
            Only this employee is affected. Everyone else still follows the global and role windows above.
          </p>
        </div>
      ) : (
        !employeesLoading &&
        query.trim() &&
        matches.length === 0 && (
          <p className="text-sm text-center text-[rgb(var(--muted))] py-6">No employees match that search.</p>
        )
      )}
    </div>
  );
}
