/**
 * Persist last successful Webtrak projects/all payload for offline use.
 * Also mirrors into the projects catalog (local DB overlay).
 */

import { saveProjectsCatalog } from "./projectsCatalog";
import { toIsoDateString } from "./displayDate";

const CACHE_KEY = "rt_tracking_projects_cache_v1";

export type ProjectsCachePayload = {
  fetchedAt: string;
  items: unknown[];
  total: number | null;
};

export function loadProjectsCache(): ProjectsCachePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProjectsCachePayload;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveProjectsCache(payload: ProjectsCachePayload): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    void 0;
  }

  // Keep the local portfolio catalog in sync when Webtrak is reachable.
  try {
    const catalogRows = (payload.items || []).map((raw) => {
      const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      const id = String(row.id ?? row.projectId ?? row.project_code ?? row.projectCode ?? "").trim();
      const name = String(row.name ?? row.projectName ?? row.project_name ?? "").trim();
      const startDate = row.startDate ?? row.start_date ?? null;
      const endDate = row.endDate ?? row.end_date ?? null;
      const pm = String(row.pm ?? row.projectManager ?? row.managerName ?? "").trim();
      const am = String(
        row.am ?? row.accountManager ?? row.account_manager_name ?? row.accountManagerName ?? "",
      ).trim();
      const active = row.isActive !== false && row.active !== false && row.is_active !== false;
      return {
        id: id || name,
        name,
        startDate: toIsoDateString(startDate),
        endDate: toIsoDateString(endDate),
        pm,
        am,
        active,
        updatedAt: payload.fetchedAt,
      };
    }).filter((r) => r.name);
    if (catalogRows.length) saveProjectsCatalog(catalogRows);
  } catch {
    void 0;
  }
}
