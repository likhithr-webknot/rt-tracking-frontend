// @ts-nocheck

/** Minimal QA accounts — passwords come from backend dev seed (same for all QA logins). */
export const QA_DEV_DEFAULT_PASSWORD = "WebknotQA#Test1";

export const QA_DEV_ACCOUNTS = [
  {
    role: "HR",
    email: "qa.hr.one@webknot.in",
    password: QA_DEV_DEFAULT_PASSWORD,
  },
  {
    role: "Manager",
    email: "qa.manager.one@webknot.in",
    password: QA_DEV_DEFAULT_PASSWORD,
  },
  {
    role: "Employee",
    email: "qa.employee.one@webknot.in",
    password: QA_DEV_DEFAULT_PASSWORD,
  },
];

export function normalizeQaSeedResponse(payload) {
  const root = payload && typeof payload === "object" ? payload : {};
  const data = root.data && typeof root.data === "object" ? root.data : root;
  const defaultPassword = String(data.password ?? data.qaDefaultPassword ?? QA_DEV_DEFAULT_PASSWORD).trim();
  const rows = Array.isArray(data.users) ? data.users : [];
  const allowed = new Set(QA_DEV_ACCOUNTS.map((row) => row.email));
  return rows
    .map((row) => ({
      role: String(row.portalRole ?? row.role ?? "—").trim(),
      email: String(row.email ?? "").trim().toLowerCase(),
      password: String(row.password ?? defaultPassword).trim() || defaultPassword,
      empId: String(row.empId ?? row.employeeId ?? "").trim() || null,
    }))
    .filter((row) => allowed.has(row.email));
}
