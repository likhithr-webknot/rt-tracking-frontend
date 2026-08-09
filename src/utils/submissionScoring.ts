import type { ApiOptions } from "../types/api-options";
import {
  getCertificationCriteria,
  getResolvedScoreWeights,
  LEGACY_RTP_SCORE_WEIGHTS,
} from "./scoringSettings";

/** @deprecated Use {@link getResolvedScoreWeights} from app settings. */
export const RTP_SCORE_WEIGHTS = LEGACY_RTP_SCORE_WEIGHTS;

export const PROMOTION_MIN_SCORE = 4.0;
/** Placeholder score for a month row without admin-approved or manager-computed ratings. */
export const DEFAULT_INCOMPLETE_SUBMISSION_SCORE = 2;

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

/** @deprecated Use {@link computeWeightedScore503515} — RTP spec is 50/35/15. */
export function computeWeightedScore85_15(kpiAverage, valueAverage) {
  return computeWeightedScore503515(kpiAverage, valueAverage, null);
}

/**
 * Certifications / recognitions / admin tech showcase → 1–5 component (15% weight).
 */
export function computeCertificationComponentScore({
  certificationsCount = 0,
  recognitionsCount = 0,
  techShowcase = "",
  criteria = null,
} = {} as ApiOptions) {
  const rule = criteria ?? getCertificationCriteria();
  const certs = Math.max(0, Number.parseInt(String(certificationsCount ?? 0), 10) || 0);
  const recognitions = Math.max(0, Number.parseInt(String(recognitionsCount ?? 0), 10) || 0);
  const hasTechShowcase = String(techShowcase ?? "").trim().length > 0;
  let score = certs * rule.pointsPerCertification + recognitions * rule.pointsPerRecognition;
  if (hasTechShowcase) score = Math.max(score, rule.techShowcaseComponentFloor);
  if (score <= 0) return null;
  return clampScore(Math.min(5, score), 0, 5);
}

/**
 * Weighted final score (1–5): KPI + Webknot values + certifications component.
 * Weights come from Admin → Settings unless overridden.
 */
export function computeWeightedScore503515(kpiAverage, valueAverage, certificationAverage, weights = null) {
  const kpi = toFiniteNumber(kpiAverage);
  const values = toFiniteNumber(valueAverage);
  const certs = toFiniteNumber(certificationAverage);
  if (kpi == null && values == null && certs == null) return null;

  const w = weights ?? getResolvedScoreWeights();
  const weighted =
    (kpi ?? 0) * w.kpi + (values ?? 0) * w.values + (certs ?? 0) * w.certifications;

  return round1(clampScore(weighted, 1, 5));
}

export function isPromotionEligible(finalScore) {
  const num = toFiniteNumber(finalScore);
  return num != null && num >= PROMOTION_MIN_SCORE;
}

export function performanceGrade(finalScore) {
  const num = toFiniteNumber(finalScore);
  if (num == null) return null;
  if (num >= 4.5) return "Outstanding";
  if (num >= 4.0) return "Exceeds Expectations";
  if (num >= 3.0) return "Meets Expectations";
  if (num >= 2.0) return "Needs Improvement";
  return "Below Expectations";
}

export function computeBrowniePoints({ certificationsCount = 0, recognitionsCount = 0, techShowcase = "" } = {} as ApiOptions) {
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
} = {} as ApiOptions) {
  const managerKpiAverage = averageRatings(managerKpiRatings);
  const managerWebknotValueAverage = averageRatings(managerWebknotValueRatings);
  const certificationsCount = Array.isArray(certifications) ? certifications.length : 0;
  const certificationAverage = computeCertificationComponentScore({
    certificationsCount,
    recognitionsCount,
    techShowcase,
  });
  const browniePoints = computeBrowniePoints({
    certificationsCount,
    recognitionsCount,
    techShowcase,
  });

  return {
    managerKpiAverage,
    managerWebknotValueAverage,
    certificationAverage,
    weightedScore: computeWeightedScore503515(
      managerKpiAverage,
      managerWebknotValueAverage,
      certificationAverage,
    ),
    certificationsCount,
    recognitionsCount: Number.parseInt(String(recognitionsCount ?? 0), 10) || 0,
    techShowcase: String(techShowcase ?? "").trim(),
    techShowcasePoints: String(techShowcase ?? "").trim() ? 1 : 0,
    browniePoints,
  };
}
