/**
 * Career promotion ladders — paths are loaded from the server
 * ({@code PromotionSettingsService} / GET /api/v1/settings/promotion-paths).
 *
 * Each path is ordered lowest band (career start) → highest (max promotion).
 */

import {
  DEFAULT_NON_TECH_PROMOTION_PATH,
  DEFAULT_TECH_PROMOTION_PATH,
  ensurePromotionPathsLoaded,
  getCachedPromotionPaths,
} from "./promotionPathSettings";

export type PromotionBandType = "TECH" | "NON_TECH" | "BOTH";

/** @deprecated Use getTechPromotionPath() — kept for imports that expect a constant default. */
export const TECH_PROMOTION_PATH = DEFAULT_TECH_PROMOTION_PATH;

/** @deprecated Use getNonTechPromotionPath() — kept for imports that expect a constant default. */
export const NON_TECH_PROMOTION_PATH = DEFAULT_NON_TECH_PROMOTION_PATH;

export function getTechPromotionPath(): readonly string[] {
  return getCachedPromotionPaths().techPath;
}

export function getNonTechPromotionPath(): readonly string[] {
  return getCachedPromotionPaths().nonTechPath;
}

/** Max band on tech track (single next step cannot go above this on tech ladder). */
export function getTechMaxBand() {
  const path = getTechPromotionPath();
  return path[path.length - 1] ?? null;
}

/** Max band on non-tech track. */
export function getNonTechMaxBand() {
  const path = getNonTechPromotionPath();
  return path[path.length - 1] ?? null;
}

/** @deprecated Use getTechMaxBand() */
export const TECH_MAX_BAND = DEFAULT_TECH_PROMOTION_PATH[DEFAULT_TECH_PROMOTION_PATH.length - 1];

/** @deprecated Use getNonTechMaxBand() */
export const NON_TECH_MAX_BAND = DEFAULT_NON_TECH_PROMOTION_PATH[DEFAULT_NON_TECH_PROMOTION_PATH.length - 1];

export { ensurePromotionPathsLoaded };

/**
 * Normalize directory/API band text to a Webtrak {@code Band} enum name when possible.
 */
export function extractWebtrakBandCode(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const collapsed = s.toUpperCase().replace(/\s+/g, "");
  if (/^B\d+[LH]?$/.test(collapsed)) return collapsed;
  const m = s.toUpperCase().match(/B\d+[LH]?/);
  return m ? m[0] : null;
}

function resolvePathForBoth(currentCode: string): readonly string[] {
  const tech = getTechPromotionPath();
  const nonTech = getNonTechPromotionPath();
  const techSet = new Set(tech);
  let promotionPath: readonly string[] = techSet.has(currentCode) ? tech : nonTech;
  let idx = promotionPath.indexOf(currentCode);
  if (idx === -1 || idx === promotionPath.length - 1) {
    const fallbackPath = promotionPath === tech ? nonTech : tech;
    if (fallbackPath.includes(currentCode)) promotionPath = fallbackPath;
  }
  return promotionPath;
}

export function resolvePromotionPath(
  bandType: PromotionBandType,
  currentCode: string | null,
): readonly string[] | null {
  if (!currentCode) return null;
  if (bandType === "TECH") return getTechPromotionPath();
  if (bandType === "NON_TECH") return getNonTechPromotionPath();
  return resolvePathForBoth(currentCode);
}

export const PROMOTION_MIN_PERFORMANCE_SCORE = 4.0;

export type PromotionPreview = {
  currentCode: string | null;
  path: readonly string[] | null;
  nextBand: string | null;
  isMaxBand: boolean;
  unknownBand: boolean;
  reasonIfBlocked: string | null;
  averageApprovedScore: number | null;
  promotionScoreEligible: boolean;
};

/**
 * Client-side preview of the next promotion step (for UX). The backend remains authoritative.
 */
export function getPromotionPreview(
  currentBandRaw: unknown,
  bandType: PromotionBandType,
  averageApprovedScore: number | null = null,
): PromotionPreview {
  const score =
    averageApprovedScore != null && Number.isFinite(Number(averageApprovedScore))
      ? Math.round(Number(averageApprovedScore) * 10) / 10
      : null;
  const promotionScoreEligible = score == null || score >= PROMOTION_MIN_PERFORMANCE_SCORE;
  const scoreBlockReason =
    score != null && !promotionScoreEligible
      ? `Average approved performance score is ${score}/5.0; promotion requires at least ${PROMOTION_MIN_PERFORMANCE_SCORE}/5.0.`
      : null;

  const currentCode = extractWebtrakBandCode(currentBandRaw);
  if (!currentCode) {
    return {
      currentCode: null,
      path: null,
      nextBand: null,
      isMaxBand: false,
      unknownBand: true,
      averageApprovedScore: score,
      promotionScoreEligible,
      reasonIfBlocked:
        scoreBlockReason ??
        "Band is missing or not in Webtrak format (e.g. B5, B6H). Assign a band before promoting.",
    };
  }

  const path = resolvePromotionPath(bandType, currentCode);
  if (!path) {
    return {
      currentCode,
      path: null,
      nextBand: null,
      isMaxBand: false,
      unknownBand: false,
      averageApprovedScore: score,
      promotionScoreEligible,
      reasonIfBlocked: scoreBlockReason ?? "Could not resolve a promotion path for this employee.",
    };
  }

  const idx = path.indexOf(currentCode);
  if (idx === -1) {
    return {
      currentCode,
      path,
      nextBand: null,
      isMaxBand: false,
      unknownBand: false,
      averageApprovedScore: score,
      promotionScoreEligible,
      reasonIfBlocked:
        scoreBlockReason ??
        `Band ${currentCode} is not on the ${bandType === "BOTH" ? "selected default" : bandType} ladder. Try the other track (Tech vs Non-tech) or fix the band in the directory.`,
    };
  }

  if (idx === path.length - 1) {
    const trackMax = path[path.length - 1];
    return {
      currentCode,
      path,
      nextBand: null,
      isMaxBand: true,
      unknownBand: false,
      averageApprovedScore: score,
      promotionScoreEligible,
      reasonIfBlocked: `Already at the top of this ladder (${trackMax}). No further promotion on this track.`,
    };
  }

  return {
    currentCode,
    path,
    nextBand: path[idx + 1],
    isMaxBand: false,
    unknownBand: false,
    averageApprovedScore: score,
    promotionScoreEligible,
    reasonIfBlocked: scoreBlockReason,
  };
}

export function normalizePromotionErrorMessage(raw: unknown): string {
  let m = String(raw ?? "").trim();
  if (!m) return "Promotion failed. Please try again.";
  const prefix = /^promotion\s+failed:\s*/i;
  if (prefix.test(m)) m = m.replace(prefix, "").trim();
  return m || "Promotion failed. Please try again.";
}
