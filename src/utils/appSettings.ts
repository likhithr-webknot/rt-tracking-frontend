import {
  ADMIN_SETTINGS_DEFAULTS,
  EMPLOYEE_SETTINGS_DEFAULTS,
  getAdminSettings,
  getEmployeeSettings,
  getManagerSettings,
  getMergedOrgSettings,
  getSuperAdminSettings,
  MANAGER_SETTINGS_DEFAULTS,
  resetScopedSettings,
  saveScopedSettings,
  SETTINGS_SCOPES,
  SUPER_ADMIN_SETTINGS_DEFAULTS,
} from "./portalSettings";

/** @deprecated Prefer scoped getters from portalSettings.ts */
export const APP_SETTINGS_DEFAULTS = {
  ...ADMIN_SETTINGS_DEFAULTS,
  ...SUPER_ADMIN_SETTINGS_DEFAULTS,
  ...EMPLOYEE_SETTINGS_DEFAULTS,
};

export function getAppSettings() {
  return getMergedOrgSettings();
}

export function saveAppSettings(next) {
  if (!next || typeof next !== "object") return getAppSettings();

  const superAdminPatch = {};
  const adminPatch = {};

  for (const key of Object.keys(SUPER_ADMIN_SETTINGS_DEFAULTS)) {
    if (Object.prototype.hasOwnProperty.call(next, key)) {
      superAdminPatch[key] = next[key];
    }
  }
  for (const key of Object.keys(ADMIN_SETTINGS_DEFAULTS)) {
    if (Object.prototype.hasOwnProperty.call(next, key)) {
      adminPatch[key] = next[key];
    }
  }

  if (Object.keys(superAdminPatch).length) {
    saveScopedSettings(SETTINGS_SCOPES.SUPER_ADMIN, superAdminPatch);
  }
  if (Object.keys(adminPatch).length) {
    saveScopedSettings(SETTINGS_SCOPES.ADMIN, adminPatch);
  }

  return getAppSettings();
}

export function resetAppSettings() {
  resetScopedSettings(SETTINGS_SCOPES.SUPER_ADMIN);
  resetScopedSettings(SETTINGS_SCOPES.ADMIN);
  return getAppSettings();
}

export {
  ADMIN_SETTINGS_DEFAULTS,
  EMPLOYEE_SETTINGS_DEFAULTS,
  getAdminSettings,
  getEmployeeSettings,
  getManagerSettings,
  getSuperAdminSettings,
  MANAGER_SETTINGS_DEFAULTS,
  SUPER_ADMIN_SETTINGS_DEFAULTS,
};
