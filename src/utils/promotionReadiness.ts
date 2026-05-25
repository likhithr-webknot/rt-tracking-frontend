// @ts-nocheck
import {
  getPromotionPreview,
  PROMOTION_MIN_PERFORMANCE_SCORE,
  extractWebtrakBandCode,
  resolvePromotionPath,
} from "./careerPromotion";

export function monthsBetween(startDate, endDate = new Date()) {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate instanceof Date ? endDate : new Date(endDate);
  if (!start || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  let months =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}

export function buildPromotionReadiness(employee, { averageScore = null, overrideHistory = [] } = {}) {
  const band = employee?.band ?? employee?.level ?? "";
  const code = extractWebtrakBandCode(band);
  const path = resolvePromotionPath("BOTH", code);
  const lastPromo = employee?.lastPromotionDate ?? employee?.last_promotion_date ?? null;
  const monthsInBand = monthsBetween(lastPromo || employee?.joinDate || employee?.createdAt);
  const score =
    averageScore != null && Number.isFinite(Number(averageScore))
      ? Math.round(Number(averageScore) * 10) / 10
      : null;
  const preview = getPromotionPreview(band, "BOTH", score);
  const overrides = Array.isArray(overrideHistory) ? overrideHistory : [];

  const milestones = [];
  if (path?.length) {
    const idx = code ? path.indexOf(code) : -1;
    for (let i = 0; i < path.length; i++) {
      milestones.push({
        band: path[i],
        state: idx === -1 ? "unknown" : i < idx ? "past" : i === idx ? "current" : "future",
      });
    }
  }

  return {
    code,
    monthsInBand,
    lastPromotionDate: lastPromo,
    averageScore: score,
    preview,
    milestones,
    overrideCount: overrides.length,
    eligible: preview.promotionScoreEligible && preview.nextBand && !preview.isMaxBand,
    scoreThreshold: PROMOTION_MIN_PERFORMANCE_SCORE,
  };
}
