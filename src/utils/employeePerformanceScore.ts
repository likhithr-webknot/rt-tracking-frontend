import {
  averageRatings,
  computeBrowniePoints,
  computeCertificationComponentScore,
  computeSubmissionScoreBreakdown,
  computeWeightedScore503515,
} from "./submissionScoring";

/**
 * Weighted performance score (1–5) from manager KPI/values + certifications component.
 * Falls back to stored ability scores when manager ratings are missing.
 */
export function computeEmployeePerformanceScore(emp) {
  const mgrKpiAvg = averageRatings(emp?.managerKpiRatings);
  const mgrValueAvg = averageRatings(emp?.managerWebknotValueRatings);

  const certCount = Number(emp?.certCount ?? emp?.certifications?.length ?? 0) || 0;
  const recCount = Number(emp?.recognitions ?? 0) || 0;
  const techShowcase = String(emp?.techShowcase ?? "").trim();
  const certAvg = computeCertificationComponentScore({
    certificationsCount: certCount,
    recognitionsCount: recCount,
    techShowcase,
  });
  if (mgrKpiAvg != null || mgrValueAvg != null || certAvg != null) {
    const weighted = computeWeightedScore503515(mgrKpiAvg, mgrValueAvg, certAvg);
    return Math.round(Math.min(5, Math.max(1, weighted)) * 10) / 10;
  }

  const directRaw = Number(emp?.submissionAbility ?? emp?.abilityScore ?? emp?.avgScore ?? emp?.ability ?? NaN);
  if (Number.isFinite(directRaw)) return Math.round(Math.min(5, Math.max(1, directRaw)) * 10) / 10;
  const ratingAvg = Number(emp?.abilityScoreFromRatings ?? emp?.abilityFromRatings ?? emp?.abilityScore ?? NaN);
  if (Number.isFinite(ratingAvg)) return Math.round(Math.min(5, Math.max(1, ratingAvg)) * 10) / 10;
  return null;
}

export function computeEmployeeBrowniePoints(emp) {
  return computeBrowniePoints({
    certificationsCount: emp?.certCount ?? emp?.certifications?.length,
    recognitionsCount: emp?.recognitions,
    techShowcase: emp?.techShowcase,
  });
}

/** Extract a 1–5 weighted score from a normalized monthly submission row. */
export function scoreFromMonthlySubmission(item) {
  const sub = item?.submission && typeof item.submission === "object" ? item.submission : item;
  const payload = sub?.payload && typeof sub.payload === "object" ? sub.payload : sub;
  const mgr =
    sub?.managerEvaluation && typeof sub.managerEvaluation === "object"
      ? sub.managerEvaluation
      : payload?.managerEvaluation;
  const breakdown = computeSubmissionScoreBreakdown({
    managerKpiRatings: mgr?.kpiRatings ?? sub?.managerKpiRatings ?? payload?.managerKpiRatings,
    managerWebknotValueRatings:
      mgr?.webknotValueRatings ?? sub?.managerWebknotValueRatings ?? payload?.managerWebknotValueRatings,
    certifications: sub?.certifications ?? payload?.certifications ?? [],
    recognitionsCount: sub?.recognitions ?? payload?.recognitions ?? sub?.recognitionsCount,
    techShowcase: sub?.techShowcase ?? payload?.techShowcase ?? "",
  });
  const direct = Number(
    sub?.weightedScore ??
      sub?.finalScore ??
      sub?.abilityScore ??
      breakdown.weightedScore ??
      NaN,
  );
  if (Number.isFinite(direct)) return Math.round(Math.min(5, Math.max(1, direct)) * 10) / 10;
  return breakdown.weightedScore;
}

export function averageNumericScores(scores) {
  const nums = (Array.isArray(scores) ? scores : []).filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  return Math.round(avg * 10) / 10;
}

/**
 * Build per-employee all-time average from every submission that has a computable score.
 */
export function buildSubmissionScoreIndex(submissions) {
  const byEmployee = new Map();
  for (const item of Array.isArray(submissions) ? submissions : []) {
    const sub = item?.submission && typeof item.submission === "object" ? item.submission : item;
    const empId = String(
      sub?.employeeId ?? sub?.empId ?? item?.employeeId ?? item?.empId ?? "",
    ).trim();
    if (!empId) continue;
    const score = scoreFromMonthlySubmission(item);
    if (score == null) continue;
    const bucket = byEmployee.get(empId) || { scores: [], months: [] };
    bucket.scores.push(score);
    const month = String(sub?.month ?? sub?.cycleKey ?? item?.month ?? "").trim();
    if (month) bucket.months.push(month);
    byEmployee.set(empId, bucket);
  }
  const averages = new Map();
  for (const [empId, bucket] of byEmployee.entries()) {
    averages.set(empId, {
      averageScore: averageNumericScores(bucket.scores),
      reviewCount: bucket.scores.length,
      months: bucket.months,
      latestScore: bucket.scores[bucket.scores.length - 1] ?? null,
    });
  }
  return averages;
}
