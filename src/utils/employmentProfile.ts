// @ts-nocheck

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

  const band = employee.band ?? profile.band ?? auth.band ?? "";
  const stream = employee.stream ?? profile.stream ?? profile.department ?? auth.stream ?? "";
  const designation = employee.designation ?? profile.designation ?? auth.designation ?? "";
  const managerId = employee.managerId ?? profile.managerId ?? auth.managerId ?? "";
  const empId = employee.id ?? employee.empId ?? profile.employeeId ?? auth.employeeId ?? "";
  const email = employee.email ?? profile.email ?? auth.email ?? "";
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
