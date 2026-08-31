/** Canonical portal role labels shown in admin dropdowns. */
export const PORTAL_ROLE_LABELS = {
  EMPLOYEE: "Employee",
  MANAGER: "Manager",
  HR: "HR",
  FINANCE: "Finance",
  SUPER_ADMIN: "Super Admin",
} as const;

export const PORTAL_ROLE_OPTIONS = [
  PORTAL_ROLE_LABELS.EMPLOYEE,
  PORTAL_ROLE_LABELS.MANAGER,
  PORTAL_ROLE_LABELS.HR,
  PORTAL_ROLE_LABELS.FINANCE,
];

/** Normalize backend/JWT role strings to portal labels: Super Admin | Manager | Employee | HR | Finance */
export function formatPortalRoleLabel(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  const cleaned = raw.replace(/^role[_-]/, "");
  if (cleaned === "super admin" || cleaned === "superadmin") return PORTAL_ROLE_LABELS.SUPER_ADMIN;
  if (cleaned === "hr") return PORTAL_ROLE_LABELS.HR;
  if (cleaned === "finance") return PORTAL_ROLE_LABELS.FINANCE;
  if (cleaned === "admin") return PORTAL_ROLE_LABELS.SUPER_ADMIN;
  if (cleaned === "manager") return PORTAL_ROLE_LABELS.MANAGER;
  if (cleaned === "employee" || cleaned === "user") return PORTAL_ROLE_LABELS.EMPLOYEE;
  if (cleaned.includes("human resources") || cleaned.includes("human_resource")) return PORTAL_ROLE_LABELS.HR;
  if (cleaned.includes("finance")) return PORTAL_ROLE_LABELS.FINANCE;
  if (cleaned.includes("super") && cleaned.includes("admin")) return PORTAL_ROLE_LABELS.SUPER_ADMIN;
  if (cleaned.includes("admin") || cleaned.includes("asset")) return PORTAL_ROLE_LABELS.SUPER_ADMIN;
  if (cleaned.includes("manager")) return PORTAL_ROLE_LABELS.MANAGER;
  if (cleaned.includes("employee") || cleaned.includes("user")) return PORTAL_ROLE_LABELS.EMPLOYEE;
  return "";
}

export function resolvePortalRoleLabel(...candidates: unknown[]): string {
  for (const c of candidates) {
    const label = formatPortalRoleLabel(c);
    if (label) return label;
  }
  return PORTAL_ROLE_LABELS.EMPLOYEE;
}

/**
 * Pulse portal identity for routing — uses portalRole / empRole / /user/role only.
 * Ignores Webtrak security grants such as ROLE_ADMIN on the JWT `roles` array.
 */
export function resolvePulsePortalRoleFromSources(profile, { roleHint = "" } = {}) {
  const obj = profile && typeof profile === "object" ? profile : {};
  return resolvePortalRoleLabel(
    obj.portalRole,
    obj.empRole,
    obj.portal,
    obj.activeRole,
    obj.currentRole,
    obj.selectedRole,
    looksLikePulsePortalLabel(obj.role) ? obj.role : "",
    roleHint,
  );
}

function looksLikePulsePortalLabel(value) {
  const label = formatPortalRoleLabel(value);
  if (!label) return false;
  const raw = String(value ?? "").trim().toUpperCase();
  if (raw.startsWith("ROLE_")) return false;
  return true;
}

/** Map portal labels to App route buckets (Admin | Manager | Employee | HR). */
export function mapPulsePortalRoleToAppRoute(portalLabel) {
  const label = resolvePortalRoleLabel(portalLabel);
  if (label === PORTAL_ROLE_LABELS.SUPER_ADMIN || label === PORTAL_ROLE_LABELS.FINANCE) {
    return "Admin";
  }
  if (label === PORTAL_ROLE_LABELS.HR) return "HR";
  if (label === PORTAL_ROLE_LABELS.MANAGER) return "Manager";
  return "Employee";
}

export function getPortalRoleSelectOptions({ includeSuperAdmin = false } = {}) {
  return includeSuperAdmin
    ? [...PORTAL_ROLE_OPTIONS, PORTAL_ROLE_LABELS.SUPER_ADMIN]
    : [...PORTAL_ROLE_OPTIONS];
}

export function isAdminPortalRole(role: unknown): boolean {
  const label = resolvePortalRoleLabel(role);
  return label === PORTAL_ROLE_LABELS.SUPER_ADMIN || label === "Admin";
}

/** Map arbitrary stored role text onto a valid portal-role select value. */
export function coercePortalRoleSelectValue(
  role: unknown,
  options: string[] = PORTAL_ROLE_OPTIONS,
): string {
  const label = resolvePortalRoleLabel(role);
  if (options.includes(label)) return label;
  if (label && !options.includes(label)) return label;
  return PORTAL_ROLE_LABELS.EMPLOYEE;
}
