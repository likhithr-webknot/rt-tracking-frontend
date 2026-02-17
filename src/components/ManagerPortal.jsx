import React, { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, LogOut, RefreshCw, Users, X } from "lucide-react";

import { fetchMe } from "../api/auth.js";
import { fetchPortalManager } from "../api/portal.js";
import { fetchManagerReportees, normalizeEmployees } from "../api/employees.js";
import {
  fetchManagerTeamSubmissions,
  formatYearMonth,
  normalizeMonthlySubmission,
  saveMonthlyDraft,
  submitMonthlySubmission
} from "../api/monthly-submissions.js";
import { fetchKpiDefinitions, normalizeKpiDefinitions } from "../api/kpi-definitions.js";
import Toast from "./Toast.jsx";

const MANAGER_REVIEW_DRAFT_KEY = "rt_tracking_manager_review_draft_v1";

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function loadManagerReviewDrafts() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(MANAGER_REVIEW_DRAFT_KEY);
    const parsed = safeJsonParse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveManagerReviewDrafts(next) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MANAGER_REVIEW_DRAFT_KEY, JSON.stringify(next || {}));
  } catch {
    // ignore
  }
}

function normalizeTeamSubmissions(data) {
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : [];
  return arr
    .map((raw) => {
      const obj = raw && typeof raw === "object" ? raw : null;
      if (!obj) return null;

      const submission = normalizeMonthlySubmission(obj) || null;
      const emp = obj.employee || obj.reportee || obj.user || obj.emp || null;
      const employeeId = emp?.employeeId ?? emp?.empId ?? emp?.id ?? obj.employeeId ?? null;
      const employeeName = emp?.employeeName ?? emp?.name ?? emp?.fullName ?? obj.employeeName ?? null;
      const email = emp?.email ?? obj.email ?? null;

      return {
        submissionId: submission?.id ?? (obj.submissionId ? String(obj.submissionId) : null),
        month: submission?.month ?? (typeof obj.month === "string" ? obj.month : null),
        status: submission?.status ?? (typeof obj.status === "string" ? obj.status : null),
        updatedAt: submission?.updatedAt ?? (obj.updatedAt ? String(obj.updatedAt) : null),
        submittedAt: submission?.submittedAt ?? (obj.submittedAt ? String(obj.submittedAt) : null),
        employee: {
          id: employeeId == null ? "—" : String(employeeId),
          name: employeeName ? String(employeeName) : (email ? String(email) : "Unknown"),
          email: email ? String(email) : "",
        },
        payload: submission,
        raw: obj,
      };
    })
    .filter(Boolean);
}

export default function ManagerPortal({ onLogout, auth }) {
  const [month, setMonth] = useState(() => formatYearMonth(new Date()));
  const [managerId, setManagerId] = useState(() => String(auth?.employeeId || "").trim() || "");
  const [filter, setFilter] = useState("NEEDS_REVIEW"); // NEEDS_REVIEW | ALL | SUBMITTED

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  const [kpiIndex, setKpiIndex] = useState({}); // { [id]: { title, weight } }

  const [reportees, setReportees] = useState([]);
  const [reporteesLoading, setReporteesLoading] = useState(false);
  const [reporteesError, setReporteesError] = useState("");

  const [teamSubs, setTeamSubs] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState("");

  const [reviewModal, setReviewModal] = useState({ open: false, row: null });
  const [reviewDrafts, setReviewDrafts] = useState(() => loadManagerReviewDrafts());
  const [managerRatings, setManagerRatings] = useState({});
  const [managerNotes, setManagerNotes] = useState("");
  const [savingReview, setSavingReview] = useState(false);

  function showToast(next) {
    setToast(next);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2400);
  }

  function closeReviewModal() {
    setReviewModal({ open: false, row: null });
    setManagerRatings({});
    setManagerNotes("");
    setSavingReview(false);
  }

  const selectedRow = reviewModal.open ? reviewModal.row : null;
  const selectedKey = selectedRow ? `${selectedRow.employee.id}:${String(selectedRow.month || month)}` : "";

  useEffect(() => {
    if (!reviewModal.open || !selectedRow) return;
    const existing = selectedKey ? reviewDrafts?.[selectedKey] : null;
    const baseRatings = selectedRow?.payload?.kpiRatings && typeof selectedRow.payload.kpiRatings === "object"
      ? selectedRow.payload.kpiRatings
      : {};
    const initialRatings =
      existing?.kpiRatings && typeof existing.kpiRatings === "object"
        ? existing.kpiRatings
        : baseRatings;
    setManagerRatings({ ...(initialRatings || {}) });
    setManagerNotes(String(existing?.notes || "").trim());
  }, [reviewDrafts, reviewModal.open, selectedKey, selectedRow]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      try {
        await fetchPortalManager({ signal: controller.signal });
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!mounted) return;
        if (err?.status === 401) onLogout?.();
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [onLogout]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      // Ensure we have the current manager's employeeId.
      if (String(managerId || "").trim()) return;
      try {
        const me = await fetchMe({ signal: controller.signal });
        if (!mounted) return;
        const id = String(me?.employeeId ?? me?.empId ?? me?.id ?? "").trim();
        if (id) setManagerId(id);
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!mounted) return;
        if (err?.status === 401) onLogout?.();
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [managerId, onLogout]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      try {
        const data = await fetchKpiDefinitions({ signal: controller.signal });
        if (!mounted) return;
        const list = normalizeKpiDefinitions(data);
        const map = {};
        for (const k of list) map[String(k.id)] = { title: k.title, weight: k.weight };
        setKpiIndex(map);
      } catch {
        // KPI index is best-effort; manager can still review with ids.
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const id = String(managerId || "").trim();
    if (!id) return;
    let mounted = true;
    const controller = new AbortController();
    (async () => {
      setReporteesError("");
      setReporteesLoading(true);
      try {
        const data = await fetchManagerReportees(id, { signal: controller.signal });
        const normalized = normalizeEmployees(data);
        if (!mounted) return;
        setReportees(normalized);
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!mounted) return;
        if (err?.status === 401) {
          onLogout?.();
          return;
        }
        setReporteesError(err?.message || "Failed to load reportees.");
        setReportees([]);
      } finally {
        if (mounted) setReporteesLoading(false);
      }
    })();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [managerId, onLogout]);

  async function reloadTeam() {
    setTeamError("");
    setTeamLoading(true);
    try {
      const data = await fetchManagerTeamSubmissions({ month });
      setTeamSubs(normalizeTeamSubmissions(data));
    } catch (err) {
      if (err?.status === 401) {
        onLogout?.();
        return;
      }
      setTeamError(err?.message || "Failed to load team submissions.");
      setTeamSubs([]);
    } finally {
      setTeamLoading(false);
    }
  }

  useEffect(() => {
    if (!String(month || "").trim()) return;
    reloadTeam().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const reporteeCount = reportees.length;
  const submittedCount = useMemo(
    () => teamSubs.filter((s) => String(s.status || "").toUpperCase() === "SUBMITTED").length,
    [teamSubs]
  );

  const filteredTeamSubs = useMemo(() => {
    const mode = String(filter || "").toUpperCase();
    if (mode === "ALL") return teamSubs;
    if (mode === "SUBMITTED") {
      return teamSubs.filter((s) => String(s.status || "").toUpperCase() === "SUBMITTED");
    }
    // NEEDS_REVIEW: anything not SUBMITTED (including null status).
    return teamSubs.filter((s) => String(s.status || "").toUpperCase() !== "SUBMITTED");
  }, [filter, teamSubs]);

  return (
    <div className="min-h-screen bg-[#080808] text-slate-100 font-sans px-6 lg:px-12 py-10">
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
            Manager Portal
          </div>
          <h1 className="mt-2 text-3xl font-black uppercase tracking-tighter italic">
            Team Submissions
          </h1>
          <div className="mt-3 flex items-center gap-3 flex-wrap text-xs text-gray-400">
            <span className="inline-flex items-center gap-2">
              <Users size={16} /> Reportees: <span className="font-mono text-gray-200">{reporteeCount}</span>
            </span>
            <span className="inline-flex items-center gap-2">
              Submitted: <span className="font-mono text-gray-200">{submittedCount}</span>
            </span>
            {managerId ? (
              <span className="text-gray-500 font-mono">Manager ID: {managerId}</span>
            ) : null}
          </div>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
              Month
            </div>
            <input
              type="month"
              value={month}
              onChange={(e) => {
                const next = String(e.target.value || "").trim();
                if (!next) return;
                setMonth(next);
              }}
              className="bg-[#111] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all text-gray-200"
            />
          </div>

          <div className="space-y-1">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
              Filter
            </div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-[#111] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all text-gray-200"
              title="Filter"
            >
              <option value="NEEDS_REVIEW">Needs review</option>
              <option value="ALL">All</option>
              <option value="SUBMITTED">Submitted</option>
            </select>
          </div>

          <button
            onClick={() => reloadTeam()}
            disabled={teamLoading}
            className={[
              "inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-xs font-black uppercase tracking-widest border transition-all",
              "border-white/10 text-gray-200 hover:bg-white/5",
              teamLoading ? "opacity-60 cursor-not-allowed" : "",
            ].join(" ")}
            title="Refresh"
          >
            <RefreshCw size={18} /> {teamLoading ? "Loading…" : "Refresh"}
          </button>

          <button
            onClick={onLogout}
            className="inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-xs font-black uppercase tracking-widest bg-red-500/10 text-red-200 hover:bg-red-500 hover:text-white border border-red-500/20 transition-all"
            title="Logout"
          >
            <LogOut size={18} /> Logout
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto mt-10 grid grid-cols-1 xl:grid-cols-3 gap-8">
        <section className="xl:col-span-2 bg-[#111] border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl">
          <div className="p-8 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight">Team Submissions</h2>
              <p className="text-gray-500 text-sm mt-1">
                Review employee submissions for {month}.
              </p>
            </div>
          </div>

          {teamError ? (
            <div className="px-8 pb-6 text-sm text-red-200">
              Failed to load: <span className="font-mono">{teamError}</span>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-white/[0.02] text-[10px] uppercase tracking-[0.2em] text-gray-500 border-t border-b border-white/5">
                <tr>
                  <th className="p-6 font-black">Employee</th>
                  <th className="p-6 font-black">Status</th>
                  <th className="p-6 font-black">Updated</th>
                  <th className="p-6 text-right font-black px-8">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredTeamSubs.map((s) => {
                  const status = String(s.status || "—").toUpperCase();
                  const isSubmitted = status === "SUBMITTED";
                  const when = s.updatedAt || s.submittedAt || "—";
                  return (
                    <tr key={`${s.employee.id}:${s.submissionId || when}`} className="hover:bg-white/[0.01] transition-colors">
                      <td className="p-6">
                        <div className="font-bold text-white tracking-tight">{s.employee.name}</div>
                        <div className="text-xs text-gray-500 font-mono mt-1">
                          {s.employee.id}{s.employee.email ? ` • ${s.employee.email}` : ""}
                        </div>
                      </td>
                      <td className="p-6">
                        <span
                          className={[
                            "text-[10px] font-black uppercase px-3 py-1 rounded-lg border",
                            isSubmitted
                              ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-300 border-amber-500/20",
                          ].join(" ")}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="p-6 text-xs text-gray-400 font-mono">
                        {when}
                      </td>
                      <td className="p-6 text-right px-8">
                        <button
                          type="button"
                          onClick={() => setReviewModal({ open: true, row: s })}
                          className={[
                            "inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest transition-all border",
                            "border-white/10 text-gray-200 hover:bg-white/5",
                          ].join(" ")}
                          title="Review"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {!teamLoading && filteredTeamSubs.length === 0 ? (
                  <tr>
                    <td className="p-10 text-center text-gray-500" colSpan={4}>
                      No submissions to show.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-[#111] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl">
          <h2 className="text-xl font-black uppercase tracking-tight">Reportees</h2>
          <p className="text-gray-500 text-sm mt-1">
            From <span className="font-mono">/employees/manager/{`{managerId}`}/reportees</span>.
          </p>

          {reporteesError ? (
            <div className="mt-4 text-sm text-red-200">
              Failed to load: <span className="font-mono">{reporteesError}</span>
            </div>
          ) : null}

          {reporteesLoading ? (
            <div className="mt-4 text-sm text-gray-300">Loading reportees…</div>
          ) : null}

          <div className="mt-6 space-y-3">
            {reportees.slice(0, 20).map((e) => (
              <div key={e.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="font-bold text-white tracking-tight">{e.name}</div>
                <div className="text-xs text-gray-500 font-mono mt-1">
                  {e.id}{e.email ? ` • ${e.email}` : ""}
                </div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mt-2">
                  {e.role}{e.band ? ` • ${e.band}` : ""}
                </div>
              </div>
            ))}

            {!reporteesLoading && reportees.length === 0 ? (
              <div className="text-sm text-gray-500">No reportees to show.</div>
            ) : null}
          </div>
        </section>
      </main>

      {reviewModal.open && selectedRow ? (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-6 z-[70] overflow-y-auto">
          <div className="w-full max-w-6xl bg-[#111] border border-white/10 rounded-3xl p-4 sm:p-6 my-4 sm:my-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                  Manager Review
                </div>
                <div className="mt-2 text-2xl font-black tracking-tight text-white">
                  {selectedRow.employee.name}
                </div>
                <div className="mt-1 text-xs text-gray-500 font-mono">
                  {selectedRow.employee.id} • {String(selectedRow.month || month)}
                </div>
              </div>
              <button
                type="button"
                onClick={closeReviewModal}
                className="p-2 rounded-xl hover:bg-white/5"
                aria-label="Close"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-[2.5rem] border border-white/10 bg-white/[0.03] p-6">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                  Employee Submitted
                </div>
                <div className="mt-4 space-y-5">
                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-gray-500">Self Review</div>
                    <div className="mt-2 text-sm text-gray-200 whitespace-pre-wrap">
                      {String(selectedRow.payload?.selfReviewText || "—")}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-gray-500">KPI Ratings</div>
                    <div className="mt-2 space-y-2">
                      {Object.keys(selectedRow.payload?.kpiRatings || {}).length ? (
                        Object.entries(selectedRow.payload.kpiRatings).map(([id, v]) => (
                          <div key={id} className="flex items-center justify-between gap-3">
                            <div className="text-sm text-gray-200">
                              {kpiIndex?.[id]?.title || id}
                            </div>
                            <div className="text-sm font-mono text-purple-200">{String(v)}</div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-gray-500">No KPI ratings.</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-gray-500">Certifications</div>
                    <div className="mt-2 space-y-2">
                      {Array.isArray(selectedRow.payload?.certifications) && selectedRow.payload.certifications.length ? (
                        selectedRow.payload.certifications.map((c) => (
                          <div key={String(c?.name || "")} className="flex items-start justify-between gap-4">
                            <div className="text-sm text-gray-200">{String(c?.name || "")}</div>
                            <div className="text-xs text-gray-500 font-mono break-all">{String(c?.proof || "")}</div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-gray-500">None.</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-gray-500">Webknot Values</div>
                    <div className="mt-2 space-y-2">
                      {Array.isArray(selectedRow.payload?.webknotValues) && selectedRow.payload.webknotValues.length ? (
                        selectedRow.payload.webknotValues.map((v) => (
                          <div key={String(v || "")} className="text-sm text-gray-200">
                            {String(v || "")}
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-gray-500">None.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[2.5rem] border border-white/10 bg-[#0c0c0c] p-6">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                  Manager Evaluation
                </div>
                <div className="mt-4 space-y-5">
                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-gray-500">KPI Ratings (Manager)</div>
                    <div className="mt-2 space-y-3">
                      {Object.keys(selectedRow.payload?.kpiRatings || {}).length ? (
                        Object.entries(selectedRow.payload.kpiRatings).map(([id]) => {
                          const current = managerRatings?.[id];
                          const display =
                            typeof current === "number" && Number.isFinite(current) ? current : (current ?? "");
                          return (
                            <div key={id} className="flex items-center justify-between gap-3">
                              <div className="text-sm text-gray-200">
                                {kpiIndex?.[id]?.title || id}
                              </div>
                              <input
                                type="number"
                                min={1}
                                max={5}
                                step={0.1}
                                value={display}
                                onChange={(e) => {
                                  const raw = String(e.target.value ?? "").trim();
                                  const parsed = raw === "" ? null : Number.parseFloat(raw);
                                  setManagerRatings((prev) => {
                                    const next = { ...(prev || {}) };
                                    if (parsed == null || !Number.isFinite(parsed)) {
                                      delete next[id];
                                      return next;
                                    }
                                    next[id] = Math.round(parsed * 10) / 10;
                                    return next;
                                  });
                                }}
                                className="w-28 bg-[#111] border border-white/10 rounded-2xl py-2 px-3 text-sm outline-none focus:border-purple-500 transition-all text-gray-200"
                                placeholder="1-5"
                              />
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-sm text-gray-500">No KPIs.</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-black uppercase tracking-widest text-gray-500">Manager Notes</div>
                    <textarea
                      value={managerNotes}
                      onChange={(e) => setManagerNotes(e.target.value)}
                      rows={6}
                      className="mt-2 w-full bg-[#111] border border-white/10 rounded-2xl p-4 text-sm outline-none focus:border-purple-500 transition-all text-gray-200 resize-none"
                      placeholder="Write your evaluation notes..."
                    />
                  </div>

                  <div className="flex justify-end gap-3 flex-wrap pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedKey) return;
                        const next = {
                          ...reviewDrafts,
                          [selectedKey]: { kpiRatings: managerRatings, notes: managerNotes, updatedAt: Date.now() },
                        };
                        setReviewDrafts(next);
                        saveManagerReviewDrafts(next);
                        showToast({ title: "Saved", message: "Manager draft saved locally." });
                      }}
                      className="rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest border border-white/10 text-gray-200 hover:bg-white/5 transition-all"
                    >
                      Save draft
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!selectedRow) return;
                        const empId = String(selectedRow.employee.id || "").trim();
                        const m = String(selectedRow.month || month || "").trim();
                        if (!empId || !m) return;

                        // Submit using existing endpoint; backend must decide whether this is a manager-final submit.
                        // We avoid sending new/unknown fields to reduce 400 risk.
                        const employeePayload = selectedRow.payload || {};
                        const payload = {
                          month: m,
                          employeeId: empId,
                          selfReviewText: String(employeePayload.selfReviewText || ""),
                          certifications: Array.isArray(employeePayload.certifications) ? employeePayload.certifications : [],
                          webknotValues: Array.isArray(employeePayload.webknotValues) ? employeePayload.webknotValues : [],
                          recognitionsCount: Number(employeePayload.recognitionsCount || 0) || 0,
                          kpiRatings: managerRatings,
                        };

                        try {
                          setSavingReview(true);
                          // Best-effort: save draft first, then submit.
                          await saveMonthlyDraft(payload);
                          await submitMonthlySubmission(payload);
                          showToast({ title: "Submitted", message: "Manager review submitted." });
                          closeReviewModal();
                          await reloadTeam();
                        } catch (err) {
                          showToast({ title: "Submit failed", message: err?.message || "Please try again." });
                        } finally {
                          setSavingReview(false);
                        }
                      }}
                      disabled={savingReview}
                      className={[
                        "rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-widest transition-all",
                        savingReview
                          ? "bg-white/5 text-gray-600 border border-white/10 cursor-not-allowed"
                          : "bg-purple-600 text-white hover:bg-purple-500 shadow-xl shadow-purple-900/20",
                      ].join(" ")}
                    >
                      {savingReview ? "Submitting…" : "Submit review"}
                    </button>
                  </div>
                  <div className="text-[10px] text-gray-500">
                    Note: this uses `POST /monthly-submissions/draft` and `POST /monthly-submissions/submit`. If your backend expects different manager-review fields, share the payload shape and I will wire it correctly.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
