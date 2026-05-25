/** Subtitle for portal header: band + designation (not portal role). */

function firstNonEmpty(...values: (string | null | undefined)[]) {
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

export function resolveEmploymentSubtitle(auth: Record<string, unknown> | null | undefined) {
  if (!auth || typeof auth !== "object") return "";
  const claims =
    auth.claims && typeof auth.claims === "object"
      ? (auth.claims as Record<string, unknown>)
      : {};

  const band = firstNonEmpty(
    auth.band as string,
    claims.band as string,
    claims.level as string,
  );
  const designation = firstNonEmpty(
    auth.designation as string,
    claims.designation as string,
    claims.title as string,
    auth.stream as string,
    claims.stream as string,
  );
  const empId = firstNonEmpty(
    auth.employeeId as string,
    auth.empId as string,
    claims.employeeId as string,
    claims.empId as string,
  );

  const parts: string[] = [];
  if (band) parts.push(band);
  if (designation) parts.push(designation);
  if (!parts.length && empId) parts.push(empId);
  return parts.join(" · ");
}
