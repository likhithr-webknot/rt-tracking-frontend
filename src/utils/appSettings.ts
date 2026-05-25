import { safeJsonParse } from "./json";

const APP_SETTINGS_STORAGE_KEY = "rt_tracking_app_settings_v1";

export const APP_SETTINGS_DEFAULTS = {
  apiBaseUrl: "",
  employeeValuesPageSize: 10,
  draftAutosaveDelayMs: 900,
  notificationPollIntervalMs: 30000,
  sessionTimeoutMinutes: 60,
  tableAnimations: true,
  compactTables: false,
  enableSoundAlerts: true,
  dateFormat: "MMM YYYY",
  debugMode: false,
  /** Webknot Drive quota (GB) shown in admin settings */
  driveQuotaGb: 50,
  /** Max single upload size (MB) */
  driveMaxUploadMb: 10,
  /** Manager portal: show calibration hints on team reviews */
  managerCalibrationHints: true,
  /** Employee portal: resubmission playbook checklist */
  enableSubmissionPlaybook: true,
  /** Days before cycle end to nudge managers (0 = off) */
  managerReviewReminderDays: 3,
  /** Show band/designation on directory cards */
  showEmploymentOnCards: true,
};

function toNumber(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function sanitize(settings) {
  const raw = settings && typeof settings === "object" ? settings : {};
  const apiBaseUrl = String(raw.apiBaseUrl ?? "").trim();
  const employeeValuesPageSize = Math.min(
    100,
    Math.max(5, toNumber(raw.employeeValuesPageSize, APP_SETTINGS_DEFAULTS.employeeValuesPageSize))
  );
  const draftAutosaveDelayMs = Math.min(
    5000,
    Math.max(500, toNumber(raw.draftAutosaveDelayMs, APP_SETTINGS_DEFAULTS.draftAutosaveDelayMs))
  );
  const notificationPollIntervalMs = Math.min(
    120000,
    Math.max(5000, toNumber(raw.notificationPollIntervalMs, APP_SETTINGS_DEFAULTS.notificationPollIntervalMs))
  );
  const sessionTimeoutMinutes = Math.min(
    480,
    Math.max(5, toNumber(raw.sessionTimeoutMinutes, APP_SETTINGS_DEFAULTS.sessionTimeoutMinutes))
  );
  const tableAnimations = toBool(raw.tableAnimations, APP_SETTINGS_DEFAULTS.tableAnimations);
  const compactTables = toBool(raw.compactTables, APP_SETTINGS_DEFAULTS.compactTables);
  const enableSoundAlerts = toBool(raw.enableSoundAlerts, APP_SETTINGS_DEFAULTS.enableSoundAlerts);
  const dateFormat = ["MMM YYYY", "YYYY-MM", "MM/YYYY"].includes(raw.dateFormat)
    ? raw.dateFormat
    : APP_SETTINGS_DEFAULTS.dateFormat;
  const debugMode = toBool(raw.debugMode, APP_SETTINGS_DEFAULTS.debugMode);
  const driveQuotaGb = Math.min(500, Math.max(1, toNumber(raw.driveQuotaGb, APP_SETTINGS_DEFAULTS.driveQuotaGb)));
  const driveMaxUploadMb = Math.min(100, Math.max(1, toNumber(raw.driveMaxUploadMb, APP_SETTINGS_DEFAULTS.driveMaxUploadMb)));
  const managerCalibrationHints = toBool(
    raw.managerCalibrationHints,
    APP_SETTINGS_DEFAULTS.managerCalibrationHints,
  );
  const enableSubmissionPlaybook = toBool(
    raw.enableSubmissionPlaybook,
    APP_SETTINGS_DEFAULTS.enableSubmissionPlaybook,
  );
  const managerReviewReminderDays = Math.min(
    30,
    Math.max(0, toNumber(raw.managerReviewReminderDays, APP_SETTINGS_DEFAULTS.managerReviewReminderDays)),
  );
  const showEmploymentOnCards = toBool(
    raw.showEmploymentOnCards,
    APP_SETTINGS_DEFAULTS.showEmploymentOnCards,
  );

  return {
    apiBaseUrl,
    employeeValuesPageSize,
    draftAutosaveDelayMs,
    notificationPollIntervalMs,
    sessionTimeoutMinutes,
    tableAnimations,
    compactTables,
    enableSoundAlerts,
    dateFormat,
    debugMode,
    driveQuotaGb,
    driveMaxUploadMb,
    managerCalibrationHints,
    enableSubmissionPlaybook,
    managerReviewReminderDays,
    showEmploymentOnCards,
  };
}

function parseStored(raw) {
  const parsed = safeJsonParse(raw, undefined, null);
  return parsed ? sanitize(parsed) : { ...APP_SETTINGS_DEFAULTS };
}

export function getAppSettings() {
  if (typeof window === "undefined") return { ...APP_SETTINGS_DEFAULTS };
  const raw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
  if (!raw) return { ...APP_SETTINGS_DEFAULTS };
  return parseStored(raw);
}

export function saveAppSettings(next) {
  if (typeof window === "undefined") return { ...APP_SETTINGS_DEFAULTS };
  const current = getAppSettings();
  const merged = sanitize({ ...current, ...(next && typeof next === "object" ? next : {}) });
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(merged));
  window.dispatchEvent(new CustomEvent("rt:app-settings-updated", { detail: merged }));
  return merged;
}

export function resetAppSettings() {
  if (typeof window === "undefined") return { ...APP_SETTINGS_DEFAULTS };
  window.localStorage.removeItem(APP_SETTINGS_STORAGE_KEY);
  const defaults = { ...APP_SETTINGS_DEFAULTS };
  window.dispatchEvent(new CustomEvent("rt:app-settings-updated", { detail: defaults }));
  return defaults;
}
