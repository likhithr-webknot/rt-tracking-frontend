// @ts-nocheck
import { APP_SETTINGS_DEFAULTS, getAppSettings } from "./appSettings";

/** Legacy fixed weights (50 / 35 / 15) — use {@link getResolvedScoreWeights} for live settings. */
export const LEGACY_RTP_SCORE_WEIGHTS = {
  kpi: 0.5,
  values: 0.35,
  certifications: 0.15,
} as const;

export const DEFAULT_SCORE_WEIGHT_PERCENTS = {
  kpi: APP_SETTINGS_DEFAULTS.scoreWeightKpiPercent,
  values: APP_SETTINGS_DEFAULTS.scoreWeightValuesPercent,
  certifications: APP_SETTINGS_DEFAULTS.scoreWeightCertificationsPercent,
};

export const DEFAULT_CERTIFICATION_CRITERIA = {
  pointsPerCertification: APP_SETTINGS_DEFAULTS.certificationPointsPerCert,
  pointsPerRecognition: APP_SETTINGS_DEFAULTS.recognitionPointsPerItem,
  techShowcaseComponentFloor: APP_SETTINGS_DEFAULTS.techShowcaseComponentFloor,
};

function toPercentInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

function toPoints(value, fallback, max = 5) {
  const n = Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(0, n));
}

function normalizeWeightPercents(raw) {
  let kpi = toPercentInt(raw?.scoreWeightKpiPercent, DEFAULT_SCORE_WEIGHT_PERCENTS.kpi);
  let values = toPercentInt(raw?.scoreWeightValuesPercent, DEFAULT_SCORE_WEIGHT_PERCENTS.values);
  let certifications = toPercentInt(
    raw?.scoreWeightCertificationsPercent,
    DEFAULT_SCORE_WEIGHT_PERCENTS.certifications,
  );
  const sum = kpi + values + certifications;
  if (sum <= 0) {
    return { ...DEFAULT_SCORE_WEIGHT_PERCENTS };
  }
  if (sum === 100) {
    return { kpi, values, certifications };
  }
  const scale = 100 / sum;
  kpi = Math.round(kpi * scale);
  values = Math.round(values * scale);
  certifications = 100 - kpi - values;
  if (certifications < 0) {
    certifications = 0;
    values = Math.max(0, 100 - kpi);
  }
  return { kpi, values, certifications };
}

export function getScoreWeightPercents(settings = null) {
  const src = settings && typeof settings === "object" ? settings : getAppSettings();
  return normalizeWeightPercents(src);
}

export function getResolvedScoreWeights(settings = null) {
  const percents = getScoreWeightPercents(settings);
  return {
    kpi: percents.kpi / 100,
    values: percents.values / 100,
    certifications: percents.certifications / 100,
    percents,
  };
}

export function getCertificationCriteria(settings = null) {
  const src = settings && typeof settings === "object" ? settings : getAppSettings();
  return {
    pointsPerCertification: toPoints(
      src?.certificationPointsPerCert,
      DEFAULT_CERTIFICATION_CRITERIA.pointsPerCertification,
    ),
    pointsPerRecognition: toPoints(
      src?.recognitionPointsPerItem,
      DEFAULT_CERTIFICATION_CRITERIA.pointsPerRecognition,
    ),
    techShowcaseComponentFloor: toPoints(
      src?.techShowcaseComponentFloor,
      DEFAULT_CERTIFICATION_CRITERIA.techShowcaseComponentFloor,
    ),
  };
}

export function scoreWeightsSumPercent(settings = null) {
  const src = settings && typeof settings === "object" ? settings : getAppSettings();
  const kpi = toPercentInt(src?.scoreWeightKpiPercent, DEFAULT_SCORE_WEIGHT_PERCENTS.kpi);
  const values = toPercentInt(src?.scoreWeightValuesPercent, DEFAULT_SCORE_WEIGHT_PERCENTS.values);
  const certifications = toPercentInt(
    src?.scoreWeightCertificationsPercent,
    DEFAULT_SCORE_WEIGHT_PERCENTS.certifications,
  );
  return kpi + values + certifications;
}

export function validateScoreWeightPercents(settings = null) {
  const sum = scoreWeightsSumPercent(settings);
  if (sum === 100) return { ok: true, sum };
  return {
    ok: false,
    sum,
    message: `KPI, Webknot values, and certifications weights must total 100% (currently ${sum}%).`,
  };
}

export function formatWeightPercentLabel(part) {
  const n = Number.parseInt(String(part ?? 0), 10);
  return `${Number.isFinite(n) ? n : 0}% weight`;
}
