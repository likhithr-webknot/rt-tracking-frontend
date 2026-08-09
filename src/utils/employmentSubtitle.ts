/** Subtitle for portal header: band + designation (not portal role). */

import { formatEmployeeBandCode } from "../api/band-stream-directory";
import { firstDisplayString } from "./coerceDisplayString";

export function resolveEmploymentSubtitle(auth: Record<string, unknown> | null | undefined) {
  if (!auth || typeof auth !== "object") return "";
  const claims =
    auth.claims && typeof auth.claims === "object"
      ? (auth.claims as Record<string, unknown>)
      : {};

  const bandRaw = firstDisplayString(auth.band, claims.band, claims.level);
  const band = formatEmployeeBandCode(bandRaw) || bandRaw;
  const designation = firstDisplayString(
    auth.designation,
    claims.designation,
    claims.title,
    auth.jobTitle,
    claims.jobTitle,
  );
  const department = firstDisplayString(auth.stream, auth.department, claims.stream, claims.department);
  const empId = firstDisplayString(
    auth.employeeId,
    auth.empId,
    claims.employeeId,
    claims.empId,
  );

  const parts: string[] = [];
  if (band) parts.push(band);
  if (designation) parts.push(designation);
  else if (department) parts.push(department);
  if (!parts.length && empId) parts.push(empId);
  return parts.join(" · ");
}
