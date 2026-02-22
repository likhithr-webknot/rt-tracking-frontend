import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import ConfirmDialog from "../shared/ConfirmDialog.jsx";

import {
  deleteAdminMonthlySubmission,
  fetchAdminAllSubmissions,
  formatYearMonth,
  normalizeMonthlySubmission
} from "../../api/monthly-submissions.js";

function normalizeAdminSubmissions(data) {
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : [];

  return arr
    .map((raw, i) => {
      const obj = raw && typeof raw === "object" ? raw : null;
      if (!obj) return null;

      const normalized = normalizeMonthlySubmission(obj) || null;
      const employee = obj.employee || obj.user || obj.emp || obj.employeeDetails || null;
      const employeeName =
        employee?.employeeName ?? employee?.name ?? employee?.fullName ?? obj.employeeName ?? null;
      const employeeId = employee?.employeeId ?? employee?.empId ?? employee?.id ?? obj.employeeId ?? null;
      const email = employee?.email ?? obj.email ?? null;

      const id = normalized?.id ?? (obj.submissionId ?? obj.id ?? `SUB_${i}`);
      const month = normalized?.month ?? (typeof obj.month === "string" ? obj.month : null);
      const status = normalized?.status ?? (typeof obj.status === "string" ? obj.status : null);
      const updatedAt = normalized?.updatedAt ?? (obj.updatedAt ? String(obj.updatedAt) : null);
      const submittedAt = normalized?.submittedAt ?? (obj.submittedAt ? String(obj.submittedAt) : null);

      const payload = normalized?.raw?.payload && typeof normalized.raw.payload === "object"
        ? normalized.raw.payload
        : (obj.payload && typeof obj.payload === "object" ? obj.payload : obj);

      const managerReady = Boolean(
        obj.managerSubmittedAt ||
        obj.managerReviewedAt ||
        obj.reviewedByManager ||
        obj.managerReview ||
        obj.managerEvaluation ||
        payload?.managerSubmittedAt ||
        payload?.managerReviewedAt ||
        payload?.managerReview ||
        payload?.managerEvaluation
      );

      return {
        id: id == null ? null : String(id),
        month: month ? String(month) : "—",
        status: status ? String(status).toUpperCase() : "—",
        employee: {
          id: employeeId == null ? "—" : String(employeeId),
          name: employeeName ? String(employeeName) : (email ? String(email) : "Unknown"),
          email: email ? String(email) : "",
        },
        when: updatedAt || submittedAt || "—",
        managerReady,
        raw: obj,
      };
    })
    .filter((x) => x && x.id && x.status === "SUBMITTED");
}

export default function AdminSubmissions({ onLogout }) {
  const [month, setMonth] = useState(() => formatYearMonth(new Date()));
  const status = "SUBMITTED"; // Admin should only see fully submitted reviews.
  const [onlyManagerSubmitted, setOnlyManagerSubmitted] = useState(true);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingDeleteSubmissionId, setPendingDeleteSubmissionId] = useState(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState("");

  const query = useMemo(() => {
    const m = String(month || "").trim();
    return { month: m || null, status };
  }, [month, status]);

  async function reload() {
    setError("");
    setLoading(true);
    try {
      const data = await fetchAdminAllSubmissions({
        month: query.month || undefined,
        status: query.status || undefined,
      });
      setItems(normalizeAdminSubmissions(data));
    } catch (err) {
      if (err?.status === 401) {
        onLogout?.();
        return;
      }
      setError(err?.message || "Failed to load submissions.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.month, query.status]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="rt-title">
            Monthly Submissions
          </h2>
          <p className="text-slate-500 text-sm mt-2">
            Admin view for fully submitted entries only.
          </p>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="rt-kicker">
              Month
            </div>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(String(e.target.value || "").trim())}
              className="rt-input text-sm"
            />
            <div className="text-[10px] text-slate-500">
              Clear the input to fetch all months (backend permitting).
            </div>
          </div>

          <label className="flex items-center gap-3 rt-panel-subtle px-4 py-3">
            <input
              type="checkbox"
              checked={onlyManagerSubmitted}
              onChange={(e) => setOnlyManagerSubmitted(e.target.checked)}
              className="h-4 w-4 accent-purple-600"
            />
            <span className="text-xs font-black uppercase tracking-widest text-[rgb(var(--text))]">
              Only manager-submitted
            </span>
          </label>

          <button
            onClick={() => reload()}
            disabled={loading}
            className={[
              "rt-btn-ghost inline-flex items-center gap-2 text-xs uppercase tracking-widest transition-all",
              loading ? "opacity-60 cursor-not-allowed" : "",
            ].join(" ")}
            title="Refresh"
          >
            <RefreshCw size={18} /> {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          Failed to load submissions: <span className="font-mono">{error}</span>
        </div>
      ) : null}

      <section className="rt-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-[0.2em] text-slate-500 border-t border-b border-[rgb(var(--border))]">
              <tr>
                <th className="p-6 font-black">Employee</th>
                <th className="p-6 font-black">Month</th>
                <th className="p-6 font-black">Status</th>
                <th className="p-6 font-black">Updated</th>
                <th className="p-6 text-right font-black px-8">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {items
                .filter((it) => (onlyManagerSubmitted ? Boolean(it.managerReady) : true))
                .map((it) => (
                <tr key={it.id} className="hover:bg-[rgb(var(--surface-2))] transition-colors">
                  <td className="p-6">
                    <div className="font-bold text-[rgb(var(--text))] tracking-tight">{it.employee.name}</div>
                    <div className="text-xs text-slate-500 font-mono mt-1">
                      {it.employee.id}{it.employee.email ? ` • ${it.employee.email}` : ""}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 mt-1">
                      {it.id}
                    </div>
                  </td>
                  <td className="p-6 font-mono text-[rgb(var(--text))]">{it.month}</td>
                  <td className="p-6">
                    <span
                      className={[
                        "text-[10px] font-black uppercase px-3 py-1 rounded-lg border",
                        it.status === "SUBMITTED"
                          ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-300 border-amber-500/20",
                      ].join(" ")}
                    >
                      {it.status}
                    </span>
                    {it.managerReady ? (
                      <div className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">
                        Manager submitted
                      </div>
                    ) : (
                      <div className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                        Awaiting manager
                      </div>
                    )}
                  </td>
                  <td className="p-6 text-xs text-slate-500 font-mono">{it.when}</td>
                  <td className="p-6 text-right px-8">
                    <button
                      onClick={() => setPendingDeleteSubmissionId(it.id)}
                      className="p-2.5 bg-red-500/10 text-red-300 hover:bg-red-500 hover:text-white rounded-xl transition-all border border-red-500/20"
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}

              {!loading && items.filter((it) => (onlyManagerSubmitted ? Boolean(it.managerReady) : true)).length === 0 ? (
                <tr>
                  <td className="p-10 text-center text-slate-500" colSpan={5}>
                    No submissions to show.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(pendingDeleteSubmissionId)}
        title="Delete Submission"
        message={`Delete submission ${String(pendingDeleteSubmissionId ?? "")}?`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        onCancel={() => setPendingDeleteSubmissionId(null)}
        onConfirm={async () => {
          const id = pendingDeleteSubmissionId;
          if (!id) return;
          try {
            await deleteAdminMonthlySubmission(id);
            setPendingDeleteSubmissionId(null);
            await reload();
          } catch (err) {
            if (err?.status === 401) {
              onLogout?.();
              return;
            }
            setPendingDeleteSubmissionId(null);
            setDeleteErrorMessage(err?.message || "Delete failed.");
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteErrorMessage)}
        title="Delete Failed"
        message={String(deleteErrorMessage || "Delete failed.")}
        confirmText="OK"
        confirmVariant="primary"
        showCancel={false}
        onCancel={() => setDeleteErrorMessage("")}
        onConfirm={() => setDeleteErrorMessage("")}
      />
    </div>
  );
}
