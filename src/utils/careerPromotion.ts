/**
 * Career promotion ladders — kept in sync with webtrak
 * {@code com.webknot.webtrak.service.UserService#promoteUser}.
 *
 * Each path is ordered lowest band (career start) → highest (max promotion).
 */

export type PromotionBandType = "TECH" | "NON_TECH" | "BOTH";

/** Tech ladder (same order as backend). */
export const TECH_PROMOTION_PATH = ["B8", "B7L", "B7H", "B6L", "B6H", "B6", "B5"] as const;

/** Non-tech ladder (same order as backend). */
export const NON_TECH_PROMOTION_PATH = ["B8", "B7L", "B7H", "B6", "B5", "B4", "B3", "B2", "B1"] as const;

const TECH_SET = new Set<string>(TECH_PROMOTION_PATH);

/** Max band on tech track (single next step cannot go above this on tech ladder). */
export const TECH_MAX_BAND = TECH_PROMOTION_PATH[TECH_PROMOTION_PATH.length - 1];

/** Max band on non-tech track. */
export const NON_TECH_MAX_BAND = NON_TECH_PROMOTION_PATH[NON_TECH_PROMOTION_PATH.length - 1];

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
  const tech = TECH_PROMOTION_PATH as readonly string[];
  const nonTech = NON_TECH_PROMOTION_PATH as readonly string[];
  let promotionPath: readonly string[] = TECH_SET.has(currentCode) ? tech : nonTech;
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
  if (bandType === "TECH") return TECH_PROMOTION_PATH;
  if (bandType === "NON_TECH") return NON_TECH_PROMOTION_PATH;
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
