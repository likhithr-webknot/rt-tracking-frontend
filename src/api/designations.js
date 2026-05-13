import { getAuthHeader } from "./auth.js";
import { buildApiUrl, parseResponse, toHttpError } from "./http.js";

/**
 * Fetch designations by band and department
 * GET /designations?bandId={bandId}&department={department}
 * Note: department is parsed via Department.valueOf(...), 
 * so send exact enum names (Development, QA, HR, Finance, etc.).
 */
export async function fetchDesignations({ bandId, department, signal } = {}) {
  const auth = getAuthHeader();
  const qs = new URLSearchParams();
  if (bandId) qs.set("bandId", String(bandId));
  if (department) {
    const dep = String(department).trim();
    // Map common stream keys to exact enum names if needed
    // The normalizeStreamKey function in EmployeePortal.jsx already does some normalization,
    // but the backend expects exact enum names like Development, QA, HR, Finance.
    const mapping = {
      development: "Development",
      qa: "QA",
      hr: "HR",
      finance: "Finance",
      design: "Design",
      marketing: "Marketing",
      sales: "Sales",
      operations: "Operations",
      devops: "Operations", // fallback
      data: "Development", // fallback
      uiux: "Design",
    };
    const enumName = mapping[dep.toLowerCase()] || dep.charAt(0).toUpperCase() + dep.slice(1).toLowerCase();
    qs.set("department", enumName);
  }
  
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(buildApiUrl(`/api/v1/designations${suffix}`), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  
  if (!res.ok) throw await toHttpError(res);
  return parseResponse(res, []);
}
