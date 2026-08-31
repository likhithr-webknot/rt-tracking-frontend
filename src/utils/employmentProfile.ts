// @ts-nocheck

import { formatEmployeeBandCode } from "../api/band-stream-directory";
import { firstDisplayString } from "./coerceDisplayString";
export function parseEmploymentDate(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function yearsOfExperience(joinDate, at = new Date()) {
  const start = parseEmploymentDate(joinDate);
  if (!start) return null;
  const end = at instanceof Date ? at : new Date(at);
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  const adjusted = end.getDate() < start.getDate() ? months - 1 : months;
  const yrs = Math.max(0, adjusted) / 12;
  return Math.round(yrs * 10) / 10;
}

export function formatEmploymentDate(raw) {
  const d = parseEmploymentDate(raw);
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

export function extractEmploymentDetails(sources = {}) {
  const profile = sources.profile && typeof sources.profile === "object" ? sources.profile : {};
  const employee = sources.employee && typeof sources.employee === "object" ? sources.employee : {};
  const auth = sources.auth && typeof sources.auth === "object" ? sources.auth : {};

  const joinDate =
    profile.joinDate ??
    profile.dateOfJoining ??
    profile.doj ??
    profile.hireDate ??
    employee.joinDate ??
    employee.dateOfJoining ??
    employee.createdAt ??
    auth.joinDate ??
    null;

  const bandRaw = firstDisplayString(
    employee.band,
    employee.bandName,
    employee.level,
    profile.band,
    profile.bandName,
    profile.level,
    auth.band,
    auth.claims?.band,
    auth.claims?.level,
  );
  const band = formatEmployeeBandCode(bandRaw) || bandRaw;
  const stream = firstDisplayString(
    employee.stream,
    employee.department,
    profile.stream,
    profile.department,
    auth.stream,
    auth.department,
    auth.claims?.stream,
    auth.claims?.department,
  );
  const designation = firstDisplayString(
    employee.designation,
    employee.title,
    employee.jobTitle,
    profile.designation,
    profile.title,
    profile.jobTitle,
    auth.designation,
    auth.claims?.designation,
    auth.claims?.title,
  );
  const managerId = firstDisplayString(
    employee.managerId,
    profile.managerId,
    auth.managerId,
    auth.claims?.managerId,
  );
  const empId = firstDisplayString(
    employee.id,
    employee.empId,
    employee.employeeId,
    profile.employeeId,
    auth.employeeId,
    auth.empId,
    auth.claims?.employeeId,
  );
  const email = firstDisplayString(employee.email, profile.email, auth.email, auth.claims?.email);
  const addr =
    profile.address && typeof profile.address === "object" ? profile.address : {};
  const phone =
    profile.phoneNumber ??
    profile.phone ??
    profile.mobile ??
    profile.contactNumber ??
    employee.phoneNumber ??
    "";
  const location =
    addr.workLocation ??
    profile.workLocation ??
    profile.location ??
    profile.officeLocation ??
    "";

  const yrs = yearsOfExperience(joinDate);

  return {
    joinDate,
    joinDateLabel: formatEmploymentDate(joinDate),
    yearsOfExperience: yrs,
    yearsLabel: yrs != null ? `${yrs} ${yrs === 1 ? "year" : "years"}` : "—",
    band,
    stream,
    designation,
    managerId,
    empId,
    email,
    phone,
    location,
    bio: String(profile.bio ?? "").trim(),
  };
}
