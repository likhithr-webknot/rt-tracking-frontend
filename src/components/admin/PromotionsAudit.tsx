// @ts-nocheck
import React, { useMemo, useState } from "react";
import { ArrowUpCircle, Calendar, Loader2, ShieldAlert } from "lucide-react";
import {
  fetchPromotionEligibility,
  promoteEmployee,
} from "../../api/employees";
import {
  getPromotionPreview,
  normalizePromotionErrorMessage,
  PROMOTION_MIN_PERFORMANCE_SCORE,
  TECH_MAX_BAND,
  NON_TECH_MAX_BAND,
} from "../../utils/careerPromotion";
import { performanceGrade } from "../../utils/submissionScoring";
import Toast from "../shared/Toast";
import AdminPageHeader, { AdminPageShell } from "./AdminPageHeader";
import EntityCsvToolbar from "../shared/EntityCsvToolbar";
import { exportPromotionsCsv } from "../../utils/entityCsvExport";
import PromotionReadinessTimeline from "../shared/PromotionReadinessTimeline";

export default function PromotionsAudit({ employees, loading, reloadEmployees }) {
  const [busyId, setBusyId] = useState(null);
  const [overrideId, setOverrideId] = useState(null);
  const [scoreCache, setScoreCache] = useState({});
  const [toast, setToast] = useState(null);

  const promotedThisCycle = useMemo(() => {
    if (!Array.isArray(employees)) return [];
    return employees
      .filter((e) => e.lastPromotionDate)
      .sort((a, b) => new Date(b.lastPromotionDate) - new Date(a.lastPromotionDate));
  }, [employees]);

  const candidates = useMemo(() => {
    if (!Array.isArray(employees)) return [];
    return employees.filter((e) => e.status !== "INACTIVE");
  }, [employees]);

  async function loadScore(empId) {
    if (scoreCache[empId] !== undefined) return scoreCache[empId];
    try {
      const data = await fetchPromotionEligibility(empId);
      setScoreCache((prev) => ({ ...prev, [empId]: data }));
      return data;
    } catch {
      setScoreCache((prev) => ({ ...prev, [empId]: null }));
      return null;
    }
  }

  async function handlePromote(emp, forceOverride = false) {
    const empId = String(emp?.id ?? emp?.empId ?? "").trim();
    if (!empId) return;
    setBusyId(empId);
    try {
      await promoteEmployee(empId, "BOTH", { forceOverride });
      setToast({
        title: "Promoted",
        message: forceOverride
          ? `${emp.name} promoted (score override applied).`
          : `${emp.name} promoted successfully.`,
      });
      await reloadEmployees?.();
    } catch (err) {
      setToast({
        title: "Promotion failed",
        message: normalizePromotionErrorMessage(err?.message),
        tone: "error",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminPageShell className="space-y-8">
      <AdminPageHeader
        title="Promotions"
        subtitle={`Eligible when average approved score ≥ ${PROMOTION_MIN_PERFORMANCE_SCORE}/5. HR may override with documented exception.`}
      >
        <EntityCsvToolbar
          entityKey="employees"
          importLabel="Import roster"
          exportLabel="Export promotions"
          onExport={() => exportPromotionsCsv(employees)}
          onImportComplete={() => reloadEmployees?.()}
          confirmImportMessage="Import full employee roster from CSV? Users not in the file are deactivated."
          showToast={(t) => setToast(t)}
        />
      </AdminPageHeader>

      <section className="rt-panel p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldAlert size={18} className="text-amber-600" />
          <h3 className="font-semibold">Promotion eligibility queue</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">
              <tr>
                <th className="p-4">Employee</th>
                <th className="p-4">Band</th>
                <th className="p-4">Avg score</th>
                <th className="p-4">Next band</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {candidates.map((emp) => {
                const empId = String(emp.id ?? "").trim();
                const cached = scoreCache[empId];
                const avg = cached?.averageApprovedScore ?? null;
                const preview = getPromotionPreview(emp.band, "BOTH", avg);
                const eligible = preview.promotionScoreEligible && !preview.isMaxBand && preview.nextBand;
                return (
                  <tr key={empId} className="hover:bg-[rgb(var(--surface-2))]">
                    <td className="p-4">
                      <div className="font-medium">{emp.name}</div>
                      <div className="text-xs text-[rgb(var(--muted))]">{emp.email}</div>
                      <div className="mt-2">
                        <PromotionReadinessTimeline employee={emp} averageScore={avg} compact />
                      </div>
                    </td>
                    <td className="p-4 font-mono text-xs">{emp.band || "—"}</td>
                    <td className="p-4">
                      {avg != null ? (
                        <span title={performanceGrade(avg) || ""}>{avg.toFixed(1)} / 5</span>
                      ) : (
                        <button
                          type="button"
                          className="text-xs text-[rgb(var(--primary))] hover:underline"
                          onClick={() => loadScore(empId)}
                        >
                          Check score
                        </button>
                      )}
                    </td>
                    <td className="p-4">{preview.nextBand || (preview.isMaxBand ? "Max band" : "—")}</td>
                    <td className="p-4 text-right space-x-2">
                      <button
                        type="button"
                        disabled={!eligible || busyId === empId}
                        onClick={() => handlePromote(emp, false)}
                        className="rt-btn-primary text-xs disabled:opacity-50"
                      >
                        {busyId === empId ? "…" : "Promote"}
                      </button>
                      {!eligible && preview.nextBand ? (
                        <button
                          type="button"
                          disabled={busyId === empId}
                          onClick={() => handlePromote(emp, true)}
                          className="rt-btn-ghost text-xs text-amber-700"
                        >
                          Override
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rt-panel">
        <div className="p-6 border-b border-[rgb(var(--border))] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ArrowUpCircle size={20} className="text-[rgb(var(--primary))]" />
            <h3 className="font-bold">Recent promotions</h3>
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-[rgb(var(--muted))]">
            Tech max {TECH_MAX_BAND} · Non-tech max {NON_TECH_MAX_BAND}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">
              <tr>
                <th className="p-6">Employee</th>
                <th className="p-6">Band</th>
                <th className="p-6">Promoted</th>
                <th className="p-6">Designation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {promotedThisCycle.map((emp) => (
                <tr key={emp.id}>
                  <td className="p-6 font-medium">{emp.name}</td>
                  <td className="p-6 font-mono text-xs">{emp.band}</td>
                  <td className="p-6">
                    <span className="inline-flex items-center gap-1 text-xs">
                      <Calendar size={12} />
                      {emp.lastPromotionDate
                        ? new Date(emp.lastPromotionDate).toLocaleDateString()
                        : "—"}
                    </span>
                  </td>
                  <td className="p-6">{emp.designation || emp.role}</td>
                </tr>
              ))}
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-16 text-center">
                    <Loader2 className="animate-spin mx-auto" size={28} />
                  </td>
                </tr>
              ) : null}
              {!loading && !promotedThisCycle.length ? (
                <tr>
                  <td colSpan={4} className="p-12 text-center text-[rgb(var(--muted))]">
                    No promotions recorded yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {toast ? <Toast {...toast} onClose={() => setToast(null)} /> : null}
    </AdminPageShell>
  );
}
