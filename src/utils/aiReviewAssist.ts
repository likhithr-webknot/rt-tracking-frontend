// @ts-nocheck

function avgDelta(current = {}, prior = {}) {
  const keys = new Set([...Object.keys(current), ...Object.keys(prior)]);
  const deltas = [];
  for (const k of keys) {
    const c = Number.parseFloat(String(current[k] ?? ""));
    const p = Number.parseFloat(String(prior[k] ?? ""));
    if (Number.isFinite(c) && Number.isFinite(p)) deltas.push(c - p);
  }
  if (!deltas.length) return null;
  return Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 10) / 10;
}

/**
 * Local draft manager comment from KPI/value deltas (no auto-scoring).
 */
export function draftManagerReviewComment({
  employeeName = "This reportee",
  employeeKpiRatings = {},
  managerKpiRatings = {},
  employeeValueRatings = {},
  managerValueRatings = {},
  priorManagerKpi = null,
  priorManagerValues = null,
  rejectFeedback = "",
} = {}) {
  const parts = [];
  const kpiDelta = avgDelta(managerKpiRatings, employeeKpiRatings);
  const valueDelta = avgDelta(managerValueRatings, employeeValueRatings);

  if (rejectFeedback) {
    parts.push(`Please address the prior feedback: ${String(rejectFeedback).trim()}`);
  }

  if (kpiDelta != null) {
    if (kpiDelta > 0.3) {
      parts.push(
        `Manager KPI ratings are notably above the employee self-assessment (avg +${kpiDelta}); acknowledge strengths and justify the uplift.`,
      );
    } else if (kpiDelta < -0.3) {
      parts.push(
        `Manager KPI ratings are below self-assessment (avg ${kpiDelta}); document specific gaps and coaching actions.`,
      );
    } else {
      parts.push(`KPI ratings are broadly aligned with the employee self-review.`);
    }
  }

  if (valueDelta != null) {
    if (valueDelta > 0.3) {
      parts.push(`Webknot value scores emphasize strengths (+${valueDelta} vs self). Tie comments to observed behaviors.`);
    } else if (valueDelta < -0.3) {
      parts.push(`Webknot value scores highlight development areas (${valueDelta} vs self). Provide concrete examples.`);
    }
  }

  if (priorManagerKpi || priorManagerValues) {
    parts.push(`Compared to the prior cycle, validate whether improvements are sustained before finalizing.`);
  }

  if (!parts.length) {
    parts.push(
      `${employeeName} met baseline expectations this cycle. Summarize impact, collaboration, and one focus area for the next period.`,
    );
  }

  return parts.join(" ");
}
