/**
 * Strip backend/dev details so people using Pulse never see HTTP codes,
 * API paths, or stack traces in the UI.
 */
const SYSTEM_ERROR_RE =
  /endpoint not found|method not allowed|method not supported|no handler found|whitelabel|proxy request failed|could not reach the backend|econnrefused|etimedout|enotfound|failed to fetch|network request failed|httprequestmethod|status\s*[45]\d\d|tried:\s*|\/api\/v\d|\/__webtrak|webtrak_api_key|vite_|hibernate|sqlstate|psql|jdbc|at \[source|java\.(lang|sql|net)|org\.springframework|null pointer|internal server error|bad gateway|service unavailable|connection refused/i;

const HTTP_VERB_RE = /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+\//i;

export const USER_FACING_ERROR_FALLBACK = "Something went wrong. Please try again.";

export function isSystemErrorMessage(raw: unknown) {
  const text = String(raw ?? "").trim();
  if (!text) return true;
  if (HTTP_VERB_RE.test(text)) return true;
  if (SYSTEM_ERROR_RE.test(text)) return true;
  if (text.includes(" -> ") && /https?:\/\//i.test(text)) return true;
  return false;
}

export function toUserFacingMessage(
  raw: unknown,
  fallback = USER_FACING_ERROR_FALLBACK,
) {
  const text = String(raw ?? "").trim();
  if (!text) return fallback;
  if (isSystemErrorMessage(text)) return fallback;
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length > 180) return fallback;
  return cleaned;
}
