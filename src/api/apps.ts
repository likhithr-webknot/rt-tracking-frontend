// @ts-nocheck
/**
 * WebTrak Apps (admin API keys) — /api/v1/admin/api-keys
 * Keys are wtrt_… secrets only; full value returned once on create/rotate.
 */

import { parseResponse, toHttpError } from "./http";
import { buildWebtrakUrl, getWebtrakAuthHeaders, webtrakFetchCredentials } from "./webtrak";

export const ASSIGNABLE_APP_ROLES = [
  "ROLE_EMPLOYEE",
  "ROLE_HR",
  "ROLE_MANAGER",
  "ROLE_FINANCE",
  "ROLE_AM",
  "ROLE_DM",
];

function unwrap(raw) {
  if (!raw || typeof raw !== "object") return {};
  if (raw.data && typeof raw.data === "object" && !Array.isArray(raw.data) && raw.data.id != null) {
    return raw.data;
  }
  return raw;
}

export function normalizeAppKey(raw) {
  const row = unwrap(raw);
  return {
    id: Number(row.id),
    name: String(row.name ?? "").trim(),
    description: row.description != null ? String(row.description) : null,
    keyPrefix: String(row.key_prefix ?? row.keyPrefix ?? "").trim(),
    isActive: row.is_active !== false && row.isActive !== false,
    expiresAt: row.expires_at ?? row.expiresAt ?? null,
    lastUsedAt: row.last_used_at ?? row.lastUsedAt ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
    createdBy: row.created_by ?? row.createdBy ?? null,
    roles: Array.isArray(row.roles) ? row.roles.map(String) : [],
    fullKey: row.full_key ?? row.fullKey ?? null,
  };
}

async function webtrakJson(method, path, { body, signal } = {}) {
  const res = await fetch(buildWebtrakUrl(path), {
    method,
    signal,
    credentials: webtrakFetchCredentials(),
    headers: getWebtrakAuthHeaders(
      body != null ? { "Content-Type": "application/json" } : undefined,
    ),
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw await toHttpError(res, { method, path });
  }
  if (res.status === 204) return null;
  return parseResponse(res, {});
}

/** Convert “in N days” or a date string into an ISO expires_at (end of day local). */
export function resolveExpiresAt({ expiresAtDate = "", expiresInDays = "" } = {}) {
  const dateStr = String(expiresAtDate ?? "").trim();
  if (dateStr) {
    const d = new Date(`${dateStr}T23:59:59`);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const days = Number.parseInt(String(expiresInDays ?? "").trim(), 10);
  if (Number.isFinite(days) && days > 0) {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    d.setDate(d.getDate() + days);
    return d.toISOString();
  }
  return null;
}

export async function listAppKeys({ q = "", page = 1, perPage = 20, signal } = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", String(q));
  params.set("page", String(page));
  params.set("per_page", String(perPage));
  const qs = params.toString();
  const raw = await webtrakJson("GET", `/api/v1/admin/api-keys?${qs}`, { signal });
  const root = raw && typeof raw === "object" ? raw : {};
  const list = Array.isArray(root.data)
    ? root.data
    : Array.isArray(root.items)
      ? root.items
      : Array.isArray(root)
        ? root
        : [];
  return {
    data: list
      .map(normalizeAppKey)
      .filter((r) => Number.isFinite(r.id) && String(r.keyPrefix || "").startsWith("wtrt_")),
    total: Number(root.total ?? list.length) || 0,
    page: Number(root.page ?? page) || page,
    perPage: Number(root.per_page ?? root.perPage ?? perPage) || perPage,
    hasMore: Boolean(root.has_more ?? root.hasMore),
  };
}

export async function createAppKey(payload, { signal } = {}) {
  const p = payload && typeof payload === "object" ? payload : {};
  const body = {
    name: String(p.name ?? "").trim(),
    description: p.description ? String(p.description).trim() : null,
    expires_at: p.expires_at ?? p.expiresAt ?? null,
    roles: Array.isArray(p.roles) ? p.roles : [],
  };
  if (!body.name) throw new Error("App name is required.");
  const raw = await webtrakJson("POST", "/api/v1/admin/api-keys", { body, signal });
  return normalizeAppKey(raw?.data ?? raw);
}

export async function updateAppKey(id, payload, { signal } = {}) {
  const keyId = Number(id);
  if (!Number.isFinite(keyId)) throw new Error("App id is required.");
  const p = payload && typeof payload === "object" ? payload : {};
  const body = {};
  if (p.name != null) body.name = String(p.name).trim();
  if (p.description !== undefined) body.description = p.description ? String(p.description).trim() : null;
  if (p.expires_at !== undefined || p.expiresAt !== undefined) {
    body.expires_at = p.expires_at ?? p.expiresAt ?? null;
  }
  const raw = await webtrakJson("PATCH", `/api/v1/admin/api-keys/${keyId}`, { body, signal });
  return normalizeAppKey(raw?.data ?? raw);
}

export async function updateAppKeyRoles(id, roles, { signal } = {}) {
  const keyId = Number(id);
  if (!Number.isFinite(keyId)) throw new Error("App id is required.");
  const body = { roles: Array.isArray(roles) ? roles : [] };
  const raw = await webtrakJson("PUT", `/api/v1/admin/api-keys/${keyId}/roles`, { body, signal });
  return normalizeAppKey(raw?.data ?? raw);
}

export async function revokeAppKey(id, { signal } = {}) {
  const keyId = Number(id);
  if (!Number.isFinite(keyId)) throw new Error("App id is required.");
  return webtrakJson("DELETE", `/api/v1/admin/api-keys/${keyId}`, { signal });
}

export async function rotateAppKey(id, { signal } = {}) {
  const keyId = Number(id);
  if (!Number.isFinite(keyId)) throw new Error("App id is required.");
  const raw = await webtrakJson("POST", `/api/v1/admin/api-keys/${keyId}/rotate`, { signal });
  return normalizeAppKey(raw?.data ?? raw);
}

export function formatAppRoleLabel(role) {
  return String(role ?? "")
    .replace(/^ROLE_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
