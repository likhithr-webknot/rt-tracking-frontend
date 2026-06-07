export const PERFORMANCE_RATING_LABELS: Record<number, string> = {
  1: "Poor Performance",
  2: "Below Average",
  3: "Meets Expectations",
  4: "Above Expectations",
  5: "Exceptional",
};

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
