// @ts-nocheck
import { getAuthHeader } from "./auth";
import { buildApiUrl, parseResponse, toHttpError } from "./http";

export function normalizeAllocationExtensionRequest(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id =
    raw.id ??
    raw.allocationExtensionRequestId ??
    raw.requestId ??
    raw.extensionRequestId;
  if (id == null || String(id).trim() === "") return null;
  return {
    ...raw,
    id: String(id),
    managerName:
      raw.managerName ??
      raw.manager?.name ??
      raw.requestedByName ??
      raw.requestedBy ??
      "—",
    employeeName:
      raw.employeeName ??
      raw.employee?.name ??
      raw.talentName ??
      raw.talent?.name ??
      "—",
    projectCode: raw.projectCode ?? raw.project?.code ?? raw.projectId ?? "",
    projectName: raw.projectName ?? raw.project?.name ?? "",
    extensionDate:
      raw.extensionDate ??
      raw.targetEndDate ??
      raw.endDate ??
      raw.extensionEndDate ??
      "—",
    reason: raw.reason ?? raw.comments ?? raw.hrComments ?? "",
    status: String(raw.status ?? "PENDING").trim().toUpperCase(),
    createdAt: raw.createdAt ?? raw.requestedAt ?? raw.submittedAt ?? null,
  };
}

export function normalizeAllocationExtensionsResponse(raw) {
  const root = raw?.data != null && typeof raw.data === "object" ? raw.data : raw;
  const page =
    root?.data != null && typeof root.data === "object" && !Array.isArray(root.data)
      ? root.data
      : root;
  const list =
    page?.content ??
    page?.data ??
    page?.items ??
    (Array.isArray(page) ? page : Array.isArray(root) ? root : []);
  const items = (Array.isArray(list) ? list : [])
    .map(normalizeAllocationExtensionRequest)
    .filter(Boolean);
  return {
    items,
    total: page?.totalElement ?? page?.totalElements ?? items.length,
    page: page?.currentPage ?? page?.page ?? 0,
    raw,
  };
}

export async function fetchAllocationExtensions({ page = 0, size = 10, search = "", status = null, signal } = {}) {
  const auth = getAuthHeader();
  const qs = new URLSearchParams();
  qs.set("page", String(page));
  qs.set("size", String(size));
  if (search) qs.set("search", search);
  if (status) qs.set("status", status);

  const res = await fetch(buildApiUrl(`/api/v1/allocation-extension-request?${qs.toString()}`), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  const json = await parseResponse(res, {});
  const normalized = normalizeAllocationExtensionsResponse(json);
  return {
    ...json,
    data: {
      ...(json?.data && typeof json.data === "object" ? json.data : {}),
      data: normalized.items,
      totalElement: normalized.total,
    },
    items: normalized.items,
  };
}

export async function createAllocationExtension(payload, options = {}) {
  const { signal } = options;
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/api/v1/allocation-extension-request"), {
    method: "POST",
    signal,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}

export async function updateExtensionStatus(payload, options = {}) {
  const { signal } = options;
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/api/v1/allocation-extension-request/status"), {
    method: "PUT",
    signal,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}
