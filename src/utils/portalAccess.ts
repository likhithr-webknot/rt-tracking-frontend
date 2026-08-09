// @ts-nocheck
import { isPortalAdminEmail } from "../api/auth";
import { isHrPortalUser, isHrRoleValue, normalizeRoleToken } from "./hrRatingsFilter";
import { PORTAL_ROLE_LABELS, resolvePortalRoleLabel } from "./portalRole";

export function isSuperAdminRoleValue(value) {
  const raw = normalizeRoleToken(value);
  if (!raw) return false;
  return raw === "admin" || raw === "super admin" || raw === "superadmin" || raw.includes("super admin");
}

export function isSuperAdminPortalUser(auth) {
  if (isHrPortalUser(auth)) return false;
  const obj = auth && typeof auth === "object" ? auth : {};
  const label = resolvePortalRoleLabel(
    obj.empRole,
    obj.portalRole,
    obj.role,
    obj?.claims?.role,
  );
  if (label === "Super Admin" || label === "Admin") return true;
  const email = String(obj.email ?? obj?.claims?.email ?? "").trim().toLowerCase();
  return Boolean(email && isPortalAdminEmail(email));
}

export function isSuperAdminEmployee(emp) {
  return isSuperAdminRoleValue(emp?.empRole ?? emp?.role ?? emp?.portalRole);
}

export function isHrEmployee(emp) {
  const label = resolvePortalRoleLabel(emp?.empRole, emp?.portalRole, emp?.role);
  return label === PORTAL_ROLE_LABELS.HR;
}

/** HR may view ratings history for employees/managers, not other HR or Super Admin profiles. */
export function isProtectedEmployeeFromHrRatingsHistory(viewerAuth, emp) {
  if (!isHrPortalUser(viewerAuth)) return false;
  if (isSuperAdminEmployee(emp)) return true;
  if (!isHrEmployee(emp)) return false;
  const viewerEmail = String(viewerAuth?.email ?? viewerAuth?.claims?.email ?? "")
    .trim()
    .toLowerCase();
  const empEmail = String(emp?.email ?? "").trim().toLowerCase();
  if (viewerEmail && empEmail && viewerEmail === empEmail) return false;
  return true;
}

export function filterEmployeesForRatingsHistory(viewerAuth, employees) {
  const list = Array.isArray(employees) ? employees : [];
  if (isSuperAdminPortalUser(viewerAuth)) return list;
  return list.filter((emp) => !isProtectedEmployeeFromHrRatingsHistory(viewerAuth, emp));
}

/** HR may not edit or deactivate Super Admin / Admin portal accounts. */
export function isEmployeeProtectedFromHr(emp) {
  return isSuperAdminEmployee(emp);
}

export function canHrEditEmployee(viewerAuth, emp) {
  if (!isHrPortalUser(viewerAuth)) return true;
  return !isEmployeeProtectedFromHr(emp);
}

export function filterAdminNavGroups(groups, { isHrUser = false, isSuperAdmin = false } = {}) {
  const list = Array.isArray(groups) ? groups : [];
  return list
    .map((group) => ({
      ...group,
      items: (group.items || []).filter((item) => {
        if (item?.id === "ratings-history" && !isSuperAdmin && !isHrUser) return false;
        // Apps is Super Admin / Admin only — never HR.
        if (item?.id === "apps" && !isSuperAdmin) return false;
        if (item?.id === "band-streams") return false;
        return true;
      }),
    }))
    .filter((group) => (group.items || []).length > 0);
}
