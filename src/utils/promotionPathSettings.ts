import { fetchPromotionPaths, type PromotionPathsConfig } from "../api/promotion-settings";

/** Default tech ladder — matches backend PromotionSettingsService.DEFAULT_TECH_PATH */
export const DEFAULT_TECH_PROMOTION_PATH = ["B8", "B7L", "B7H", "B6L", "B6H", "B6", "B5"] as const;

/** Default non-tech ladder — matches backend PromotionSettingsService.DEFAULT_NON_TECH_PATH */
export const DEFAULT_NON_TECH_PROMOTION_PATH = [
  "B8",
  "B7L",
  "B7H",
  "B6",
  "B5",
  "B4",
  "B3",
  "B2",
  "B1",
] as const;

export const KNOWN_PROMOTION_BANDS = [
  "B8",
  "B7L",
  "B7H",
  "B7",
  "B6L",
  "B6",
  "B6H",
  "B5",
  "B4",
  "B3",
  "B2",
  "B1",
] as const;

let cachedPaths: PromotionPathsConfig | null = null;
let loadPromise: Promise<PromotionPathsConfig> | null = null;

function normalizeBandCode(raw: unknown): string | null {
  const text = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!text || !/^B\d+[LH]?$/.test(text)) return null;
  return text;
}

export function sanitizePromotionPath(raw: unknown, fallback: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const source = Array.isArray(raw) ? raw : String(raw ?? "").split(/[,>\s]+/);
  for (const item of source) {
    const code = normalizeBandCode(item);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out.length ? out : [...fallback];
}

export function validatePromotionPath(path: string[], label: string) {
  if (!Array.isArray(path) || path.length === 0) {
    return { ok: false as const, message: `${label} must include at least one band.` };
  }
  const seen = new Set<string>();
  for (const raw of path) {
    const code = normalizeBandCode(raw);
    if (!code) {
      return { ok: false as const, message: `${label} contains an invalid band: ${String(raw || "").trim() || "?"}` };
    }
    if (seen.has(code)) {
      return { ok: false as const, message: `${label} contains duplicate band ${code}.` };
    }
    seen.add(code);
  }
  return { ok: true as const };
}

export function validatePromotionPathsConfig(config: PromotionPathsConfig) {
  const tech = validatePromotionPath(config.techPath, "Tech path");
  if (!tech.ok) return tech;
  const nonTech = validatePromotionPath(config.nonTechPath, "Non-tech path");
  if (!nonTech.ok) return nonTech;
  return { ok: true as const };
}

export function getCachedPromotionPaths(): PromotionPathsConfig {
  return (
    cachedPaths ?? {
      techPath: [...DEFAULT_TECH_PROMOTION_PATH],
      nonTechPath: [...DEFAULT_NON_TECH_PROMOTION_PATH],
    }
  );
}

export function setCachedPromotionPaths(config: PromotionPathsConfig) {
  cachedPaths = {
    techPath: sanitizePromotionPath(config.techPath, DEFAULT_TECH_PROMOTION_PATH),
    nonTechPath: sanitizePromotionPath(config.nonTechPath, DEFAULT_NON_TECH_PROMOTION_PATH),
  };
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("rt:promotion-paths-updated", { detail: cachedPaths }));
  }
  return cachedPaths;
}

export async function ensurePromotionPathsLoaded({ signal } = {} as { signal?: AbortSignal }) {
  if (cachedPaths) return cachedPaths;
  if (loadPromise) return loadPromise;
  loadPromise = fetchPromotionPaths({ signal })
    .then((config) => setCachedPromotionPaths(config))
    .catch(() => getCachedPromotionPaths())
    .finally(() => {
      loadPromise = null;
    });
  return loadPromise;
}

export function formatPromotionPathLabel(path: readonly string[]) {
  return path.join(" → ");
}
