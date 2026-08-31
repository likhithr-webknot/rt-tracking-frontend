import { evaluationCriteriaGroupKey } from "./evaluationCriteria";

/** Distinct palettes for evaluation-criteria groups (admin + employee review). */
export const EVALUATION_CRITERIA_PALETTE = [
  {
    ring: "ring-blue-500/25",
    dot: "bg-blue-500",
    badge: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
    bg: "bg-blue-500/10",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-500/20",
    band: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
    dept: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
  },
  {
    ring: "ring-emerald-500/25",
    dot: "bg-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    bg: "bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-500/20",
    band: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    dept: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20",
  },
  {
    ring: "ring-amber-500/25",
    dot: "bg-amber-500",
    badge: "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20",
    bg: "bg-amber-500/10",
    text: "text-amber-800 dark:text-amber-300",
    border: "border-amber-500/30",
    band: "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20",
    dept: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20",
  },
  {
    ring: "ring-violet-500/25",
    dot: "bg-violet-500",
    badge: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20",
    bg: "bg-violet-500/10",
    text: "text-violet-700 dark:text-violet-300",
    border: "border-violet-500/20",
    band: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20",
    dept: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
  },
  {
    ring: "ring-rose-500/25",
    dot: "bg-rose-500",
    badge: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
    bg: "bg-rose-500/10",
    text: "text-rose-700 dark:text-rose-300",
    border: "border-rose-500/20",
    band: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
    dept: "bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/20",
  },
  {
    ring: "ring-cyan-500/25",
    dot: "bg-cyan-500",
    badge: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20",
    bg: "bg-cyan-500/10",
    text: "text-cyan-700 dark:text-cyan-300",
    border: "border-cyan-500/20",
    band: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20",
    dept: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20",
  },
  {
    ring: "ring-lime-500/25",
    dot: "bg-lime-500",
    badge: "bg-lime-500/10 text-lime-800 dark:text-lime-300 border-lime-500/20",
    bg: "bg-lime-500/10",
    text: "text-lime-800 dark:text-lime-300",
    border: "border-lime-500/20",
    band: "bg-lime-500/10 text-lime-800 dark:text-lime-300 border-lime-500/20",
    dept: "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20",
  },
  {
    ring: "ring-fuchsia-500/25",
    dot: "bg-fuchsia-500",
    badge: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/20",
    bg: "bg-fuchsia-500/10",
    text: "text-fuchsia-700 dark:text-fuchsia-300",
    border: "border-fuchsia-500/20",
    band: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/20",
    dept: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/20",
  },
] as const;

const EMPTY_PALETTE = {
  ring: "ring-[rgb(var(--border))]",
  dot: "bg-[rgb(var(--muted))]",
  badge: "bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] border-[rgb(var(--border))]",
  bg: "bg-[rgb(var(--surface-2))]",
  text: "text-[rgb(var(--muted))]",
  border: "border-[rgb(var(--border))]",
  band: "bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] border-[rgb(var(--border))]",
  dept: "bg-[rgb(var(--surface-2))] text-[rgb(var(--muted))] border-[rgb(var(--border))]",
};

/** Stable per-page colors: each distinct criteria key gets the next palette slot. */
export function buildCriteriaColorMap(criteriaValues: unknown[]) {
  const keys = Array.from(
    new Set(
      (Array.isArray(criteriaValues) ? criteriaValues : [])
        .map((value) => evaluationCriteriaGroupKey(value))
        .filter(Boolean),
    ),
  ).sort();

  const map = new Map<string, (typeof EVALUATION_CRITERIA_PALETTE)[number]>();
  keys.forEach((key, index) => {
    map.set(key, EVALUATION_CRITERIA_PALETTE[index % EVALUATION_CRITERIA_PALETTE.length]);
  });
  return map;
}

export function paletteForCriteria(criteria: unknown, colorMap?: Map<string, unknown>) {
  const key = evaluationCriteriaGroupKey(criteria);
  if (key === "__empty__") return EMPTY_PALETTE;
  const fromMap = colorMap?.get(key);
  if (fromMap && typeof fromMap === "object") {
    return fromMap as (typeof EVALUATION_CRITERIA_PALETTE)[number];
  }
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return EVALUATION_CRITERIA_PALETTE[Math.abs(hash) % EVALUATION_CRITERIA_PALETTE.length];
}
