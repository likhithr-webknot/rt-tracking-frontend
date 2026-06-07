/**
 * Maps department-catalog labels (directory / designation tables) to users.department
 * storage values on Webtrak (check constraint enum).
 */

const CATALOG_TO_USERS_DEPARTMENT: Record<string, string> = {
  "account manager": "BusinessDevelopment",
  "ai/ml": "Development",
  "business analyst": "Product",
  "delivery manager": "Operations",
  developer: "Development",
  devops: "Devops",
  executive: "Operations",
  finance: "Finance",
  "human resources": "HR",
  "project manager": "Product",
  "quality assurance": "QA",
  "ui/ux": "Development",
  admin: "Admin",
  development: "Development",
  engineering: "Development",
  hr: "HR",
  qa: "QA",
};

const USERS_DEPARTMENT_TO_CATALOG: Record<string, string> = {
  HR: "Human Resources",
  Development: "Developer",
  QA: "Quality Assurance",
  Devops: "DevOps",
  Admin: "Admin",
  Finance: "Finance",
  Operations: "Delivery Manager",
  BusinessDevelopment: "Account Manager",
  Product: "Project Manager",
};

/** Catalog / UI stream label → users.department column value. */
export function toUsersDepartmentStorage(catalogDepartment: string): string {
  const raw = String(catalogDepartment ?? "").trim();
  if (!raw) return "";
  const mapped = CATALOG_TO_USERS_DEPARTMENT[raw.toLowerCase()];
  if (mapped) return mapped;
  if (Object.prototype.hasOwnProperty.call(USERS_DEPARTMENT_TO_CATALOG, raw)) return raw;
  return raw;
}

/** users.department column value → preferred catalog label for dropdowns. */
export function catalogDepartmentFromStorage(storedDepartment: string): string {
  const raw = String(storedDepartment ?? "").trim();
  if (!raw) return "";
  return USERS_DEPARTMENT_TO_CATALOG[raw] || raw;
}

/** Match a stored department to a stream select option value. */
export function resolveStreamSelectValue(
  storedDepartment: string,
  options: { value?: string; label?: string; code?: string }[] = [],
): string {
  const raw = String(storedDepartment ?? "").trim();
  if (!raw) return "";
  const catalog = catalogDepartmentFromStorage(raw);
  const candidates = new Set(
    [raw, catalog, raw.toLowerCase(), catalog.toLowerCase()].filter(Boolean),
  );
  for (const opt of options) {
    const value = String(opt?.value ?? "").trim();
    const label = String(opt?.label ?? "").trim();
    const code = String(opt?.code ?? "").trim();
    if (
      candidates.has(value) ||
      candidates.has(label) ||
      candidates.has(code) ||
      candidates.has(value.toLowerCase()) ||
      candidates.has(label.toLowerCase())
    ) {
      return value || label || code;
    }
  }
  return catalog || raw;
}
