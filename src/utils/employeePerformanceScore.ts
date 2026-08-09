import {
  averageRatings,
  computeBrowniePoints,
  computeCertificationComponentScore,
  computeSubmissionScoreBreakdown,
  computeWeightedScore503515,
  DEFAULT_INCOMPLETE_SUBMISSION_SCORE,
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
  const raw = sub?.raw && typeof sub.raw === "object" ? sub.raw : item;
  const payload = sub?.payload && typeof sub.payload === "object" ? sub.payload : sub;

  const clampScore = (value) => Math.round(Math.min(5, Math.max(1, value)) * 10) / 10;

  const approvedScore = Number(sub?.finalScore ?? raw?.finalScore ?? NaN);
  if (Number.isFinite(approvedScore) && approvedScore >= 1) {
    return clampScore(approvedScore);
  }

  const mgr =
    sub?.managerEvaluation && typeof sub.managerEvaluation === "object"
      ? sub.managerEvaluation
      : payload?.managerEvaluation;
  const managerKpiRatings = mgr?.kpiRatings ?? sub?.managerKpiRatings ?? payload?.managerKpiRatings;
  const managerWebknotValueRatings =
    mgr?.webknotValueRatings ?? sub?.managerWebknotValueRatings ?? payload?.managerWebknotValueRatings;

  const breakdown = computeSubmissionScoreBreakdown({
    managerKpiRatings,
    managerWebknotValueRatings,
    certifications: sub?.certifications ?? payload?.certifications ?? [],
    recognitionsCount: sub?.recognitions ?? payload?.recognitions ?? sub?.recognitionsCount,
    techShowcase: sub?.techShowcase ?? payload?.techShowcase ?? "",
  });

  const hasManagerRatings =
    breakdown.managerKpiAverage != null || breakdown.managerWebknotValueAverage != null;
  if (hasManagerRatings && breakdown.weightedScore != null) {
    return clampScore(breakdown.weightedScore);
  }

  const direct = Number(sub?.weightedScore ?? raw?.weightedScore ?? sub?.abilityScore ?? NaN);
  if (Number.isFinite(direct) && direct >= 1) {
    return clampScore(direct);
  }

  const hasSubmissionRow = Boolean(
    sub?.month ??
    raw?.month ??
    sub?.submittedAt ??
    raw?.submittedAt ??
    sub?.id ??
    raw?.id
  );
  if (hasSubmissionRow) {
    return DEFAULT_INCOMPLETE_SUBMISSION_SCORE;
  }

  return null;
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
    const raw = sub?.raw && typeof sub.raw === "object" ? sub.raw : item;
    const keys = [
      sub?.empId,
      sub?.employeeId,
      sub?.subjectEmployeeId,
      raw?.empId,
      raw?.userId,
      item?.empId,
      item?.userId,
    ]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);
    if (!keys.length) continue;
    const score = scoreFromMonthlySubmission(item);
    if (score == null) continue;
    const month = String(sub?.month ?? sub?.cycleKey ?? item?.month ?? "").trim();
    for (const empId of keys) {
      const bucket = byEmployee.get(empId) || { scores: [], months: [] };
      bucket.scores.push(score);
      if (month) bucket.months.push(month);
      byEmployee.set(empId, bucket);
    }
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
