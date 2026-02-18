const APP_SETTINGS_STORAGE_KEY = "rt_tracking_app_settings_v1";

export const APP_SETTINGS_DEFAULTS = {
  apiBaseUrl: "",
  employeeValuesPageSize: 10,
  draftAutosaveDelayMs: 900,
};

function toNumber(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
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

  return {
    apiBaseUrl,
    employeeValuesPageSize,
    draftAutosaveDelayMs,
  };
}

function parseStored(raw) {
  try {
    const parsed = JSON.parse(String(raw || ""));
    return sanitize(parsed);
  } catch {
    return { ...APP_SETTINGS_DEFAULTS };
  }
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
