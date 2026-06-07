import { safeJsonParse } from "./json";

const LEGACY_STORAGE_KEY = "rt_tracking_app_settings_v1";

export const SETTINGS_SCOPES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  EMPLOYEE: "employee",
  MANAGER: "manager",
} as const;

export type SettingsScope = (typeof SETTINGS_SCOPES)[keyof typeof SETTINGS_SCOPES];

const STORAGE_KEYS: Record<SettingsScope, string> = {
  [SETTINGS_SCOPES.SUPER_ADMIN]: "rt_tracking_settings_super_admin_v1",
  [SETTINGS_SCOPES.ADMIN]: "rt_tracking_settings_admin_v1",
  [SETTINGS_SCOPES.EMPLOYEE]: "rt_tracking_settings_employee_v1",
  [SETTINGS_SCOPES.MANAGER]: "rt_tracking_settings_manager_v1",
};

export const SUPER_ADMIN_SETTINGS_DEFAULTS = {
  apiBaseUrl: "",
  debugMode: false,
  reviewCycleMayStartMonth: 5,
  reviewCycleMayEndMonth: 10,
  reviewCycleNovStartMonth: 11,
  reviewCycleNovEndMonth: 4,
  scoreWeightKpiPercent: 90,
  scoreWeightValuesPercent: 10,
  scoreWeightCertificationsPercent: 0,
  certificationPointsPerCert: 0.5,
  recognitionPointsPerItem: 0.25,
  techShowcaseComponentFloor: 2,
};

export const ADMIN_SETTINGS_DEFAULTS = {
  driveQuotaGb: 50,
  driveMaxUploadMb: 10,
  managerCalibrationHints: true,
  enableSubmissionPlaybook: true,
  showEmploymentOnCards: true,
  managerReviewReminderDays: 3,
  employeeValuesPageSize: 10,
  dateFormat: "MMM YYYY",
  tableAnimations: true,
  compactTables: false,
  enableSoundAlerts: true,
  notificationPollIntervalMs: 30000,
  sessionTimeoutMinutes: 60,
};

export const EMPLOYEE_SETTINGS_DEFAULTS = {
  dateFormat: "MMM YYYY",
  tableAnimations: true,
  compactTables: false,
  enableSoundAlerts: true,
  draftAutosaveDelayMs: 900,
};

export const MANAGER_SETTINGS_DEFAULTS = {
  dateFormat: "MMM YYYY",
  tableAnimations: true,
  compactTables: false,
  enableSoundAlerts: true,
  draftAutosaveDelayMs: 900,
  notificationPollIntervalMs: 30000,
  showCalibrationHints: true,
  compactTeamTable: false,
};

const SUPER_ADMIN_KEYS = Object.keys(SUPER_ADMIN_SETTINGS_DEFAULTS);
const ADMIN_KEYS = Object.keys(ADMIN_SETTINGS_DEFAULTS);
const EMPLOYEE_KEYS = Object.keys(EMPLOYEE_SETTINGS_DEFAULTS);
const MANAGER_KEYS = Object.keys(MANAGER_SETTINGS_DEFAULTS);

function toNumber(value: unknown, fallback: number) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function toPointsSetting(value: unknown, fallback: number, max = 5) {
  const n = Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(0, Math.round(n * 100) / 100));
}

function pickKeys<T extends Record<string, unknown>>(raw: Record<string, unknown>, keys: string[], defaults: T): T {
  const next = { ...defaults };
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      (next as Record<string, unknown>)[key] = raw[key];
    }
  }
  return next;
}

function sanitizeSuperAdmin(raw: Record<string, unknown>) {
  return {
    apiBaseUrl: String(raw.apiBaseUrl ?? "").trim(),
    debugMode: toBool(raw.debugMode, SUPER_ADMIN_SETTINGS_DEFAULTS.debugMode),
    reviewCycleMayStartMonth: Math.min(
      12,
      Math.max(1, toNumber(raw.reviewCycleMayStartMonth, SUPER_ADMIN_SETTINGS_DEFAULTS.reviewCycleMayStartMonth)),
    ),
    reviewCycleMayEndMonth: Math.min(
      12,
      Math.max(1, toNumber(raw.reviewCycleMayEndMonth, SUPER_ADMIN_SETTINGS_DEFAULTS.reviewCycleMayEndMonth)),
    ),
    reviewCycleNovStartMonth: Math.min(
      12,
      Math.max(1, toNumber(raw.reviewCycleNovStartMonth, SUPER_ADMIN_SETTINGS_DEFAULTS.reviewCycleNovStartMonth)),
    ),
    reviewCycleNovEndMonth: Math.min(
      12,
      Math.max(1, toNumber(raw.reviewCycleNovEndMonth, SUPER_ADMIN_SETTINGS_DEFAULTS.reviewCycleNovEndMonth)),
    ),
    scoreWeightKpiPercent: Math.min(
      100,
      Math.max(0, toNumber(raw.scoreWeightKpiPercent, SUPER_ADMIN_SETTINGS_DEFAULTS.scoreWeightKpiPercent)),
    ),
    scoreWeightValuesPercent: Math.min(
      100,
      Math.max(0, toNumber(raw.scoreWeightValuesPercent, SUPER_ADMIN_SETTINGS_DEFAULTS.scoreWeightValuesPercent)),
    ),
    scoreWeightCertificationsPercent: Math.min(
      100,
      Math.max(0, toNumber(raw.scoreWeightCertificationsPercent, SUPER_ADMIN_SETTINGS_DEFAULTS.scoreWeightCertificationsPercent)),
    ),
    certificationPointsPerCert: toPointsSetting(
      raw.certificationPointsPerCert,
      SUPER_ADMIN_SETTINGS_DEFAULTS.certificationPointsPerCert,
    ),
    recognitionPointsPerItem: toPointsSetting(
      raw.recognitionPointsPerItem,
      SUPER_ADMIN_SETTINGS_DEFAULTS.recognitionPointsPerItem,
    ),
    techShowcaseComponentFloor: toPointsSetting(
      raw.techShowcaseComponentFloor,
      SUPER_ADMIN_SETTINGS_DEFAULTS.techShowcaseComponentFloor,
    ),
  };
}

function sanitizeAdmin(raw: Record<string, unknown>) {
  return {
    driveQuotaGb: Math.min(500, Math.max(1, toNumber(raw.driveQuotaGb, ADMIN_SETTINGS_DEFAULTS.driveQuotaGb))),
    driveMaxUploadMb: Math.min(100, Math.max(1, toNumber(raw.driveMaxUploadMb, ADMIN_SETTINGS_DEFAULTS.driveMaxUploadMb))),
    managerCalibrationHints: toBool(raw.managerCalibrationHints, ADMIN_SETTINGS_DEFAULTS.managerCalibrationHints),
    enableSubmissionPlaybook: toBool(raw.enableSubmissionPlaybook, ADMIN_SETTINGS_DEFAULTS.enableSubmissionPlaybook),
    showEmploymentOnCards: toBool(raw.showEmploymentOnCards, ADMIN_SETTINGS_DEFAULTS.showEmploymentOnCards),
    managerReviewReminderDays: Math.min(
      30,
      Math.max(0, toNumber(raw.managerReviewReminderDays, ADMIN_SETTINGS_DEFAULTS.managerReviewReminderDays)),
    ),
    employeeValuesPageSize: Math.min(
      100,
      Math.max(5, toNumber(raw.employeeValuesPageSize, ADMIN_SETTINGS_DEFAULTS.employeeValuesPageSize)),
    ),
    dateFormat: ["MMM YYYY", "YYYY-MM", "MM/YYYY"].includes(String(raw.dateFormat))
      ? String(raw.dateFormat)
      : ADMIN_SETTINGS_DEFAULTS.dateFormat,
    tableAnimations: toBool(raw.tableAnimations, ADMIN_SETTINGS_DEFAULTS.tableAnimations),
    compactTables: toBool(raw.compactTables, ADMIN_SETTINGS_DEFAULTS.compactTables),
    enableSoundAlerts: toBool(raw.enableSoundAlerts, ADMIN_SETTINGS_DEFAULTS.enableSoundAlerts),
    notificationPollIntervalMs: Math.min(
      120000,
      Math.max(5000, toNumber(raw.notificationPollIntervalMs, ADMIN_SETTINGS_DEFAULTS.notificationPollIntervalMs)),
    ),
    sessionTimeoutMinutes: Math.min(
      480,
      Math.max(5, toNumber(raw.sessionTimeoutMinutes, ADMIN_SETTINGS_DEFAULTS.sessionTimeoutMinutes)),
    ),
  };
}

function sanitizeEmployee(raw: Record<string, unknown>) {
  return {
    dateFormat: ["MMM YYYY", "YYYY-MM", "MM/YYYY"].includes(String(raw.dateFormat))
      ? String(raw.dateFormat)
      : EMPLOYEE_SETTINGS_DEFAULTS.dateFormat,
    tableAnimations: toBool(raw.tableAnimations, EMPLOYEE_SETTINGS_DEFAULTS.tableAnimations),
    compactTables: toBool(raw.compactTables, EMPLOYEE_SETTINGS_DEFAULTS.compactTables),
    enableSoundAlerts: toBool(raw.enableSoundAlerts, EMPLOYEE_SETTINGS_DEFAULTS.enableSoundAlerts),
    draftAutosaveDelayMs: Math.min(
      5000,
      Math.max(500, toNumber(raw.draftAutosaveDelayMs, EMPLOYEE_SETTINGS_DEFAULTS.draftAutosaveDelayMs)),
    ),
  };
}

function sanitizeManager(raw: Record<string, unknown>) {
  return {
    dateFormat: ["MMM YYYY", "YYYY-MM", "MM/YYYY"].includes(String(raw.dateFormat))
      ? String(raw.dateFormat)
      : MANAGER_SETTINGS_DEFAULTS.dateFormat,
    tableAnimations: toBool(raw.tableAnimations, MANAGER_SETTINGS_DEFAULTS.tableAnimations),
    compactTables: toBool(raw.compactTables, MANAGER_SETTINGS_DEFAULTS.compactTables),
    enableSoundAlerts: toBool(raw.enableSoundAlerts, MANAGER_SETTINGS_DEFAULTS.enableSoundAlerts),
    draftAutosaveDelayMs: Math.min(
      5000,
      Math.max(500, toNumber(raw.draftAutosaveDelayMs, MANAGER_SETTINGS_DEFAULTS.draftAutosaveDelayMs)),
    ),
    notificationPollIntervalMs: Math.min(
      120000,
      Math.max(5000, toNumber(raw.notificationPollIntervalMs, MANAGER_SETTINGS_DEFAULTS.notificationPollIntervalMs)),
    ),
    showCalibrationHints: toBool(raw.showCalibrationHints, MANAGER_SETTINGS_DEFAULTS.showCalibrationHints),
    compactTeamTable: toBool(raw.compactTeamTable, MANAGER_SETTINGS_DEFAULTS.compactTeamTable),
  };
}

const SANITIZERS: Record<SettingsScope, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  [SETTINGS_SCOPES.SUPER_ADMIN]: sanitizeSuperAdmin,
  [SETTINGS_SCOPES.ADMIN]: sanitizeAdmin,
  [SETTINGS_SCOPES.EMPLOYEE]: sanitizeEmployee,
  [SETTINGS_SCOPES.MANAGER]: sanitizeManager,
};

const DEFAULTS: Record<SettingsScope, Record<string, unknown>> = {
  [SETTINGS_SCOPES.SUPER_ADMIN]: SUPER_ADMIN_SETTINGS_DEFAULTS,
  [SETTINGS_SCOPES.ADMIN]: ADMIN_SETTINGS_DEFAULTS,
  [SETTINGS_SCOPES.EMPLOYEE]: EMPLOYEE_SETTINGS_DEFAULTS,
  [SETTINGS_SCOPES.MANAGER]: MANAGER_SETTINGS_DEFAULTS,
};

let migrationDone = false;

function migrateLegacySettings() {
  if (migrationDone || typeof window === "undefined") return;
  migrationDone = true;

  const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!legacyRaw) return;

  const legacy = safeJsonParse(legacyRaw, undefined, null);
  if (!legacy || typeof legacy !== "object") return;

  const legacyObj = legacy as Record<string, unknown>;

  for (const scope of Object.values(SETTINGS_SCOPES)) {
    const key = STORAGE_KEYS[scope];
    if (window.localStorage.getItem(key)) continue;

    const picked =
      scope === SETTINGS_SCOPES.SUPER_ADMIN
        ? pickKeys(legacyObj, SUPER_ADMIN_KEYS, SUPER_ADMIN_SETTINGS_DEFAULTS)
        : scope === SETTINGS_SCOPES.ADMIN
          ? pickKeys(legacyObj, ADMIN_KEYS, ADMIN_SETTINGS_DEFAULTS)
          : scope === SETTINGS_SCOPES.EMPLOYEE
            ? pickKeys(legacyObj, EMPLOYEE_KEYS, EMPLOYEE_SETTINGS_DEFAULTS)
            : pickKeys(legacyObj, MANAGER_KEYS, MANAGER_SETTINGS_DEFAULTS);

    const sanitized = SANITIZERS[scope](picked);
    window.localStorage.setItem(key, JSON.stringify(sanitized));
  }
}

function dispatchSettingsUpdated(scope: SettingsScope, settings: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent("rt:portal-settings-updated", { detail: { scope, settings } }));
  if (scope === SETTINGS_SCOPES.SUPER_ADMIN || scope === SETTINGS_SCOPES.ADMIN) {
    window.dispatchEvent(new CustomEvent("rt:app-settings-updated", { detail: getMergedOrgSettings() }));
  }
}

export function getScopedSettings(scope: SettingsScope) {
  if (typeof window === "undefined") {
    return { ...DEFAULTS[scope] };
  }

  migrateLegacySettings();
  const raw = window.localStorage.getItem(STORAGE_KEYS[scope]);
  if (!raw) return { ...DEFAULTS[scope] };

  const parsed = safeJsonParse(raw, undefined, null);
  if (!parsed || typeof parsed !== "object") return { ...DEFAULTS[scope] };
  return SANITIZERS[scope](parsed as Record<string, unknown>);
}

export function saveScopedSettings(scope: SettingsScope, next: Record<string, unknown>) {
  if (typeof window === "undefined") {
    return { ...DEFAULTS[scope] };
  }

  migrateLegacySettings();
  const current = getScopedSettings(scope);
  const merged = SANITIZERS[scope]({ ...current, ...(next && typeof next === "object" ? next : {}) });
  window.localStorage.setItem(STORAGE_KEYS[scope], JSON.stringify(merged));
  dispatchSettingsUpdated(scope, merged);
  return merged;
}

export function resetScopedSettings(scope: SettingsScope) {
  if (typeof window === "undefined") {
    return { ...DEFAULTS[scope] };
  }

  window.localStorage.removeItem(STORAGE_KEYS[scope]);
  const defaults = { ...DEFAULTS[scope] };
  dispatchSettingsUpdated(scope, defaults);
  return defaults;
}

export function getSuperAdminSettings() {
  return getScopedSettings(SETTINGS_SCOPES.SUPER_ADMIN);
}

export function getAdminSettings() {
  return getScopedSettings(SETTINGS_SCOPES.ADMIN);
}

export function getEmployeeSettings() {
  return getScopedSettings(SETTINGS_SCOPES.EMPLOYEE);
}

export function getManagerSettings() {
  return getScopedSettings(SETTINGS_SCOPES.MANAGER);
}

/** Org-wide platform config (super admin + admin operational policies). */
export function getMergedOrgSettings() {
  return {
    ...ADMIN_SETTINGS_DEFAULTS,
    ...SUPER_ADMIN_SETTINGS_DEFAULTS,
    ...getAdminSettings(),
    ...getSuperAdminSettings(),
  };
}

export function getOrgPolicySettings() {
  return getAdminSettings();
}

export function getPlatformSettings() {
  return getSuperAdminSettings();
}
