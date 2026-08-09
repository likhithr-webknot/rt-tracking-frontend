export const PERFORMANCE_RATING_LABELS: Record<number, string> = {
  1: "Poor Performance",
  2: "Below Average",
  3: "Meets Expectations",
  4: "Above Expectations",
  5: "Exceptional",
};

export const PERFORMANCE_RATING_INTEGER_OPTIONS = [1, 2, 3, 4, 5].map((score) => ({
  value: score,
  label: `${score} — ${PERFORMANCE_RATING_LABELS[score]}`,
}));

export function parseIntegerPerformanceRating(raw: unknown): number | null {
  const parsed =
    typeof raw === "number" && Number.isFinite(raw)
      ? Math.trunc(raw)
      : Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) return null;
  return parsed;
}

export function parseDecimalPerformanceRating(raw: unknown): number | null {
  const parsed = typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? "").trim());
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) return null;
  return Math.round(parsed * 10) / 10;
}

export function performanceRatingLabel(score: unknown): string | null {
  const num = typeof score === "number" ? score : Number.parseFloat(String(score ?? ""));
  if (!Number.isFinite(num) || num < 1 || num > 5) return null;
  return PERFORMANCE_RATING_LABELS[Math.round(num)] ?? null;
}

export function formatPerformanceRating(score: unknown): string {
  const num = typeof score === "number" ? score : Number.parseFloat(String(score ?? ""));
  if (!Number.isFinite(num) || num < 1 || num > 5) return "—";
  const label = performanceRatingLabel(num);
  const formatted = Number.isInteger(num) ? String(num) : num.toFixed(1);
  return label ? `${formatted} — ${label}` : formatted;
}

export function performanceRatingScaleText(): string {
  return Object.entries(PERFORMANCE_RATING_LABELS)
    .map(([score, label]) => `${score} — ${label}`)
    .join(" · ");
}
