import type { ApiOptions } from "../types/api-options";
import { getAuthHeader } from "./auth";
import { buildApiUrl, ensureCsrfCookie, parseResponse, toHttpError, withCsrfHeaders } from "./http";

export type PromotionPathsConfig = {
  techPath: string[];
  nonTechPath: string[];
};

function extractConfig(raw: unknown): PromotionPathsConfig | null {
  const root = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const data =
    root?.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : root;
  if (!data) return null;
  const techPath = Array.isArray(data.techPath) ? data.techPath.map(String) : null;
  const nonTechPath = Array.isArray(data.nonTechPath) ? data.nonTechPath.map(String) : null;
  if (!techPath?.length || !nonTechPath?.length) return null;
  return { techPath, nonTechPath };
}

export async function fetchPromotionPaths({ signal } = {} as ApiOptions): Promise<PromotionPathsConfig> {
  const auth = getAuthHeader();
  const path = "/api/v1/settings/promotion-paths";
  const res = await fetch(buildApiUrl(path), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res, { method: "GET", path });
  const raw = await parseResponse(res, {});
  const config = extractConfig(raw);
  if (!config) throw new Error("Promotion paths response was invalid.");
  return config;
}

export async function savePromotionPaths(
  payload: PromotionPathsConfig,
  { signal } = {} as ApiOptions,
): Promise<PromotionPathsConfig> {
  const auth = getAuthHeader();
  const path = "/api/v1/settings/promotion-paths";
  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });
  let res = await fetch(buildApiUrl(path), {
    method: "PUT",
    signal,
    credentials: "include",
    headers,
    body: JSON.stringify(payload),
  });
  if (res.status === 403) {
    await ensureCsrfCookie({
      signal,
      headers: auth ? { Authorization: auth } : undefined,
      forceRefresh: true,
    }).catch(() => {});
    res = await fetch(buildApiUrl(path), {
      method: "PUT",
      signal,
      credentials: "include",
      headers,
      body: JSON.stringify(payload),
    });
  }
  if (!res.ok) throw await toHttpError(res, { method: "PUT", path });
  const raw = await parseResponse(res, {});
  const config = extractConfig(raw);
  if (!config) throw new Error("Promotion paths save response was invalid.");
  return config;
}
