function toFiniteNumber(value) {
  const num = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(num) ? num : null;
}

function round1(value) {
  const num = toFiniteNumber(value);
  if (num == null) return null;
  return Math.round(num * 10) / 10;
}

function clampScore(value, min = 1, max = 5) {
  const num = toFiniteNumber(value);
  if (num == null) return null;
  return Math.min(max, Math.max(min, num));
}

export function averageRatings(ratings) {
  if (!ratings || typeof ratings !== "object") return null;
  const nums = Object.values(ratings)
    .map((value) => toFiniteNumber(value))
    .filter((value) => value != null && value >= 1 && value <= 5);
  if (!nums.length) return null;
  const avg = nums.reduce((sum, value) => sum + value, 0) / nums.length;
  return round1(avg);
}

export function computeWeightedScore85_15(kpiAverage, valueAverage) {
  const kpi = toFiniteNumber(kpiAverage);
  const values = toFiniteNumber(valueAverage);
  if (kpi == null && values == null) return null;

  let weighted;
  if (kpi != null && values != null) weighted = 0.85 * kpi + 0.15 * values;
  else if (kpi != null) weighted = kpi;
  else weighted = values;

  const clamped = clampScore(weighted, 1, 5);
  return round1(clamped);
}

export function computeBrowniePoints({ certificationsCount = 0, recognitionsCount = 0, techShowcase = "" } = {}) {
  const certs = Math.max(0, Number.parseInt(String(certificationsCount ?? 0), 10) || 0);
  const recognitions = Math.max(0, Number.parseInt(String(recognitionsCount ?? 0), 10) || 0);
  const hasTechShowcase = String(techShowcase ?? "").trim().length > 0;
  return certs + recognitions + (hasTechShowcase ? 1 : 0);
}

export function computeSubmissionScoreBreakdown({
  managerKpiRatings,
  managerWebknotValueRatings,
  certifications = [],
  recognitionsCount = 0,
  techShowcase = "",
} = {}) {
  const managerKpiAverage = averageRatings(managerKpiRatings);
  const managerWebknotValueAverage = averageRatings(managerWebknotValueRatings);
  const certificationsCount = Array.isArray(certifications) ? certifications.length : 0;
  const browniePoints = computeBrowniePoints({
    certificationsCount,
    recognitionsCount,
    techShowcase,
  });

  return {
    managerKpiAverage,
    managerWebknotValueAverage,
    weightedScore: computeWeightedScore85_15(managerKpiAverage, managerWebknotValueAverage),
    certificationsCount,
    recognitionsCount: Number.parseInt(String(recognitionsCount ?? 0), 10) || 0,
    techShowcase: String(techShowcase ?? "").trim(),
    techShowcasePoints: String(techShowcase ?? "").trim() ? 1 : 0,
    browniePoints,
  };
}
