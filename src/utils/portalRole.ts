/** Normalize backend/JWT role strings to portal labels: Admin | Manager | Employee */
export function formatPortalRoleLabel(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  const cleaned = raw.replace(/^role[_-]/, "");
  if (cleaned === "admin" || cleaned === "hr") return "Admin";
  if (cleaned === "manager") return "Manager";
  if (cleaned === "employee" || cleaned === "user") return "Employee";
  if (cleaned.includes("admin") || cleaned.includes("finance") || cleaned.includes("asset")) return "Admin";
  if (cleaned.includes("manager")) return "Manager";
  if (cleaned.includes("employee") || cleaned.includes("user")) return "Employee";
  return "";
}

export function resolvePortalRoleLabel(...candidates: unknown[]): string {
  for (const c of candidates) {
    const label = formatPortalRoleLabel(c);
    if (label) return label;
  }
  return "Employee";
}
