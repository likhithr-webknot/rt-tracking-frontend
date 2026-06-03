// @ts-nocheck

export function normalizeRoleToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^role[_-]/, "");
}

export function isHrRoleValue(value) {
  const raw = normalizeRoleToken(value);
  if (!raw) return false;
  return raw === "hr" || raw.includes("human resources") || raw.includes("human_resource");
}

export function resolveRawDirectoryRole(auth) {
  const obj = auth && typeof auth === "object" ? auth : {};
  const claims = obj?.claims && typeof obj.claims === "object" ? obj.claims : {};
  const candidates = [
    obj?.empRole,
    obj?.portalRole,
    obj?.role,
    obj?.userRole,
    claims?.role,
    claims?.authorities,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        if (isHrRoleValue(entry)) return "HR";
      }
      continue;
    }
    if (isHrRoleValue(candidate)) return "HR";
  }
  return "";
}

export function isHrPortalUser(auth) {
  return resolveRawDirectoryRole(auth) === "HR";
}

/** Hide ratings authored by other HR users when the viewer is HR. */
export function shouldHideHrPeerRating(viewerAuth, ratingRow = {}) {
  if (!isHrPortalUser(viewerAuth)) return false;
  const viewerEmail = String(
    viewerAuth?.email ?? viewerAuth?.claims?.email ?? viewerAuth?.claims?.sub ?? "",
  )
    .trim()
    .toLowerCase();
  const raterEmail = String(
    ratingRow?.reviewerEmail ??
      ratingRow?.raterEmail ??
      ratingRow?.reviewedByEmail ??
      ratingRow?.managerEmail ??
      "",
  )
    .trim()
    .toLowerCase();
  const raterRole = String(
    ratingRow?.reviewerRole ??
      ratingRow?.raterRole ??
      ratingRow?.role ??
      ratingRow?.reviewer ??
      "",
  );
  const reviewerLabel = String(ratingRow?.reviewer ?? ratingRow?.reviewerName ?? "").trim();
  if (!isHrRoleValue(raterRole) && !isHrRoleValue(reviewerLabel)) return false;
  if (viewerEmail && raterEmail && viewerEmail === raterEmail) return false;
  return true;
}

export function filterHrPeerReviewRows(viewerAuth, rows = []) {
  return (Array.isArray(rows) ? rows : []).filter((row) => !shouldHideHrPeerRating(viewerAuth, row));
}

export function filterHrPeerProjectRatings(viewerAuth, ratings = []) {
  return (Array.isArray(ratings) ? ratings : []).filter((row) => {
    if (!isHrPortalUser(viewerAuth)) return true;
    const raterRole = String(row?.raterRole ?? row?.reviewerRole ?? row?.role ?? "").trim();
    if (!isHrRoleValue(raterRole)) return true;
    const viewerEmail = String(viewerAuth?.email ?? "").trim().toLowerCase();
    const raterEmail = String(row?.raterEmail ?? row?.reviewerEmail ?? "").trim().toLowerCase();
    if (viewerEmail && raterEmail && viewerEmail === raterEmail) return true;
    return false;
  });
}
