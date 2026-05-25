// @ts-nocheck

/** Stable per-account key for browser-local data (notes, prefs). */
export function resolveAccountStorageKey(auth, fallback = "anonymous") {
  const candidates = [
    auth?.userId,
    auth?.id,
    auth?.sub,
    auth?.employeeId,
    auth?.email,
    auth?.username,
  ];
  for (const c of candidates) {
    const s = String(c ?? "").trim();
    if (s) return s;
  }
  return String(fallback || "anonymous").trim() || "anonymous";
}
