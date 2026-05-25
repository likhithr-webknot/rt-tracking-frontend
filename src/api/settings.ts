import type { ApiOptions } from "../types/api-options";
import { getAuthHeader } from "./auth";
import { buildApiUrl, ensureCsrfCookie, parseResponse, toHttpError, withCsrfHeaders } from "./http";

/**
 * Webtrak SettingsController — application settings key/value store.
 *
 * List: GET /api/v1/settings | /api/v1/list-settings
 * One:  GET /api/v1/settings/{key} | /api/v1/get-setting/{key}
 * Create: POST /api/v1/settings | /api/v1/create-setting
 * Replace: PUT /api/v1/settings/{key} | /api/v1/update-setting/{key}
 * Patch: PATCH /api/v1/settings/{key}
 * Delete: DELETE /api/v1/settings/{key}
 */

function extractSettingsArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const nested =
    raw.data != null && typeof raw.data === "object" && !Array.isArray(raw.data) ? raw.data : null;
  const root = nested ?? raw;
  if (Array.isArray(root)) return root;
  const candidates = [
    root.items,
    root.settings,
    root.results,
    root.content,
    root.list,
    root.data,
    raw.items,
    raw.settings,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  return [];
}

function stringifySettingValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Normalized row for UI tables. */
export function normalizeServerSettingRow(raw) {
  const obj = raw && typeof raw === "object" ? raw : {};
  const key = String(obj.key ?? obj.settingKey ?? obj.name ?? "").trim();
  if (!key) return null;
  const value = stringifySettingValue(obj.value ?? obj.settingValue ?? obj.val ?? obj.data);
  return { key, value, raw: obj };
}

export function normalizeServerSettingsList(raw) {
  const rows = extractSettingsArray(raw);
  const out = [];
  const seen = new Set();
  for (const r of rows) {
    const n = normalizeServerSettingRow(r);
    if (!n || seen.has(n.key)) continue;
    seen.add(n.key);
    out.push(n);
  }
  out.sort((a, b) => a.key.localeCompare(b.key, undefined, { sensitivity: "base" }));
  return out;
}

function encodeSettingKey(key) {
  return encodeURIComponent(String(key ?? "").trim());
}

export async function fetchSettingsList({ signal } = {} as ApiOptions) {
  const auth = getAuthHeader();
  const headers = auth ? { Authorization: auth } : undefined;
  const paths = ["/api/v1/settings", "/api/v1/list-settings"];
  let lastRouteErr = null;
  for (const path of paths) {
    const res = await fetch(buildApiUrl(path), {
      signal,
      credentials: "include",
      headers,
    });
    if (res.ok) {
      const raw = await parseResponse(res, {});
      return normalizeServerSettingsList(raw);
    }
    const err = await toHttpError(res, { method: "GET", path });
    if (res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }
  throw lastRouteErr || new Error("Settings list endpoint not found.");
}

export async function fetchSettingByKey(key, { signal } = {} as ApiOptions) {
  const safeKey = encodeSettingKey(key);
  if (!safeKey || safeKey === "undefined") throw new Error("setting key is required.");
  const auth = getAuthHeader();
  const headers = auth ? { Authorization: auth } : undefined;
  const paths = [`/api/v1/settings/${safeKey}`, `/api/v1/get-setting/${safeKey}`];
  let lastRouteErr = null;
  for (const path of paths) {
    const res = await fetch(buildApiUrl(path), {
      signal,
      credentials: "include",
      headers,
    });
    if (res.ok) return parseResponse(res, {});
    const err = await toHttpError(res, { method: "GET", path });
    if (res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }
  throw lastRouteErr || new Error("Setting get-by-key endpoint not found.");
}

function toCreateBody(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const key = String(p.key ?? p.settingKey ?? "").trim();
  const value = stringifySettingValue(p.value ?? p.settingValue ?? "");
  return { key, value };
}

export async function createSetting(payload, { signal } = {} as ApiOptions) {
  const body = toCreateBody(payload);
  if (!body.key) throw new Error("setting key is required.");
  const auth = getAuthHeader();
  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });
  const paths = ["/api/v1/settings", "/api/v1/create-setting"];
  let lastRouteErr = null;
  for (const path of paths) {
    let res = await fetch(buildApiUrl(path), {
      method: "POST",
      signal,
      credentials: "include",
      headers,
      body: JSON.stringify({ key: body.key, value: body.value }),
    });
    if (res.status === 403) {
      await ensureCsrfCookie({
        signal,
        headers: auth ? { Authorization: auth } : undefined,
        forceRefresh: true,
      }).catch(() => {});
      res = await fetch(buildApiUrl(path), {
        method: "POST",
        signal,
        credentials: "include",
        headers,
        body: JSON.stringify({ key: body.key, value: body.value }),
      });
    }
    if (res.ok) return parseResponse(res, {});
    const err = await toHttpError(res, { method: "POST", path });
    if (res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }
  throw lastRouteErr || new Error("Setting create endpoint not found.");
}

function toUpdateBody(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const value = stringifySettingValue(p.value ?? p.settingValue ?? "");
  return { value };
}

export async function updateSettingKey(key, payload, { signal, preferPatch = true } = {} as ApiOptions) {
  const safeKey = encodeSettingKey(key);
  if (!safeKey || safeKey === "undefined") throw new Error("setting key is required.");
  const auth = getAuthHeader();
  const bodyObj = toUpdateBody(payload);
  const json = JSON.stringify({ value: bodyObj.value });
  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });

  const tryPaths = preferPatch
    ? [
        { method: "PATCH", path: `/api/v1/settings/${safeKey}` },
        { method: "PUT", path: `/api/v1/settings/${safeKey}` },
        { method: "PUT", path: `/api/v1/update-setting/${safeKey}` },
      ]
    : [
        { method: "PUT", path: `/api/v1/settings/${safeKey}` },
        { method: "PUT", path: `/api/v1/update-setting/${safeKey}` },
        { method: "PATCH", path: `/api/v1/settings/${safeKey}` },
      ];

  let lastRouteErr = null;
  for (const { method, path } of tryPaths) {
    let res = await fetch(buildApiUrl(path), {
      method,
      signal,
      credentials: "include",
      headers,
      body: json,
    });
    if (res.status === 403) {
      await ensureCsrfCookie({
        signal,
        headers: auth ? { Authorization: auth } : undefined,
        forceRefresh: true,
      }).catch(() => {});
      res = await fetch(buildApiUrl(path), {
        method,
        signal,
        credentials: "include",
        headers,
        body: json,
      });
    }
    if (res.ok) return parseResponse(res, {});
    const err = await toHttpError(res, { method, path });
    if (res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }
  throw lastRouteErr || new Error("Setting update endpoint not found.");
}

export async function deleteSettingKey(key, { signal } = {} as ApiOptions) {
  const safeKey = encodeSettingKey(key);
  if (!safeKey || safeKey === "undefined") throw new Error("setting key is required.");
  const auth = getAuthHeader();
  const headers = withCsrfHeaders(auth ? { Authorization: auth } : undefined);
  const path = `/api/v1/settings/${safeKey}`;
  let res = await fetch(buildApiUrl(path), {
    method: "DELETE",
    signal,
    credentials: "include",
    headers,
  });
  if (res.status === 403) {
    await ensureCsrfCookie({
      signal,
      headers: auth ? { Authorization: auth } : undefined,
      forceRefresh: true,
    }).catch(() => {});
    res = await fetch(buildApiUrl(path), {
      method: "DELETE",
      signal,
      credentials: "include",
      headers,
    });
  }
  if (res.ok) return parseResponse(res, { success: true });
  throw await toHttpError(res, { method: "DELETE", path });
}
