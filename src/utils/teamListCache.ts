/**
 * Persist last successful Webtrak onboard (Team List) payload for offline use.
 * Prefer localStorage; optionally mirror to Supabase when configured.
 */

import { getSupabase } from "../lib/supabase";

const CACHE_KEY = "rt_tracking_team_list_cache_v1";
const CACHE_META_KEY = "rt_tracking_team_list_cache_meta_v1";

export type TeamListCachePayload = {
  fetchedAt: string;
  items: unknown[];
  total: number | null;
  managerCount?: number;
  adminCount?: number;
  employeeCount?: number;
  bandCount?: number;
};

function readLocal(): TeamListCachePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TeamListCachePayload;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLocal(payload: TeamListCachePayload) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    window.localStorage.setItem(
      CACHE_META_KEY,
      JSON.stringify({ fetchedAt: payload.fetchedAt, total: payload.total }),
    );
  } catch {
    void 0;
  }
}

export async function loadTeamListCache(): Promise<TeamListCachePayload | null> {
  const local = readLocal();
  const supabase = getSupabase();
  if (!supabase) return local;

  try {
    const { data, error } = await supabase
      .from("team_list_cache")
      .select("payload, fetched_at")
      .eq("id", "default")
      .maybeSingle();
    if (error || !data?.payload) return local;
    const remote = data.payload as TeamListCachePayload;
    if (!remote || !Array.isArray(remote.items)) return local;
    const remoteAt = Date.parse(String(data.fetched_at || remote.fetchedAt || ""));
    const localAt = Date.parse(String(local?.fetchedAt || ""));
    if (!local || (Number.isFinite(remoteAt) && remoteAt >= (Number.isFinite(localAt) ? localAt : 0))) {
      writeLocal(remote);
      return remote;
    }
  } catch {
    void 0;
  }
  return local;
}

export async function saveTeamListCache(payload: TeamListCachePayload): Promise<void> {
  writeLocal(payload);
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    await supabase.from("team_list_cache").upsert(
      {
        id: "default",
        payload,
        fetched_at: payload.fetchedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  } catch {
    void 0;
  }
}
