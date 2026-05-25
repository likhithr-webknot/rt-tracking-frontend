/**
 * UI often uses an em dash (—) as "no id"; that string must never be sent to APIs as employeeId.
 */
export function isPlaceholderEmployeeId(value) {
  const s = String(value ?? "").trim();
  if (!s) return true;
  if (s === "\u2014") return true;
  if (s === "—") return true;
  return false;
}

/** Returns a trimmed employee id for URL/query use, or "" if missing or placeholder. */
export function sanitizeEmployeeIdForApi(value) {
  if (isPlaceholderEmployeeId(value)) return "";
  return String(value ?? "").trim();
}
