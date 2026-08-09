export const WEBKNOT_WORK_EMAIL_SUFFIX = "@webknot.in";

export function isWebknotWorkEmail(email: unknown): boolean {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized.includes("@")) return false;
  return normalized.endsWith(WEBKNOT_WORK_EMAIL_SUFFIX);
}

export function webknotEmailHint(): string {
  return `Use your company Google account (${WEBKNOT_WORK_EMAIL_SUFFIX}).`;
}
