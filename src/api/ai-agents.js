import { getAuthHeader } from "./auth.js";
import { buildApiUrl, withCsrfHeaders } from "./http.js";

function toCleanString(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value).trim();
  }
  return "";
}

function unwrapRoot(data) {
  if (!data || typeof data !== "object") return {};
  if (data?.data && typeof data.data === "object" && !Array.isArray(data.data)) return data.data;
  return data;
}

export function normalizeAiAgents(data) {
  const root = unwrapRoot(data);
  const arr =
    Array.isArray(data)
      ? data
      : Array.isArray(root.items)
        ? root.items
        : Array.isArray(root.agents)
          ? root.agents
          : Array.isArray(root.data)
            ? root.data
            : [];

  return arr
    .map((raw, i) => {
      const obj = raw && typeof raw === "object" ? raw : {};
      const id = String(obj.id ?? obj.agentId ?? `agent_${i}`).trim();
      const provider = toCleanString(obj.provider ?? obj.vendor ?? "openai") || "openai";
      const apiKey = toCleanString(obj.apiKey ?? obj.api_key ?? obj.token ?? "");
      return {
        id,
        provider,
        apiKey,
        active: obj.active == null ? true : Boolean(obj.active),
        createdAt: obj.createdAt ?? null,
        updatedAt: obj.updatedAt ?? null,
      };
    })
    .filter((item) => Boolean(item.id) && Boolean(item.apiKey));
}

async function readError(res) {
  const text = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(text);
    if (parsed?.message) return String(parsed.message);
    if (parsed?.error) return String(parsed.error);
  } catch { void 0; }
  return text || `Request failed: ${res.status} ${res.statusText}`;
}

async function toHttpError(res) {
  const message = await readError(res);
  const err = new Error(message);
  err.status = res.status;
  return err;
}

export async function fetchAiAgents({ activeOnly = null, limit = 50, cursor = null, signal } = {}) {
  const auth = getAuthHeader();
  const qs = new URLSearchParams();
  if (activeOnly != null) qs.set("activeOnly", String(Boolean(activeOnly)));
  if (limit != null) qs.set("limit", String(limit));
  if (cursor) qs.set("cursor", String(cursor));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(buildApiUrl(`/ai-agents/list${suffix}`), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}

export async function fetchActiveAiAgent({ signal } = {}) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/ai-agents/active"), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}

export async function addAiAgent(payload, { signal } = {}) {
  const auth = getAuthHeader();
  const provider = toCleanString(payload?.provider) || "openai";
  const apiKey = toCleanString(payload?.apiKey ?? payload?.api_key);
  if (!apiKey) throw new Error("API key is required.");

  const res = await fetch(buildApiUrl("/ai-agents/add"), {
    method: "POST",
    signal,
    credentials: "include",
    headers: withCsrfHeaders({
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    }),
    body: JSON.stringify({
      provider,
      apiKey,
      api_key: apiKey,
      active: payload?.active,
    }),
  });

  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}

export async function updateAiAgent(id, payload, { signal } = {}) {
  const safeId = encodeURIComponent(String(id ?? "").trim());
  if (!safeId) throw new Error("Agent id is required.");

  const auth = getAuthHeader();
  const provider = toCleanString(payload?.provider);
  const apiKey = toCleanString(payload?.apiKey ?? payload?.api_key);

  const res = await fetch(buildApiUrl(`/ai-agents/update/${safeId}`), {
    method: "PUT",
    signal,
    credentials: "include",
    headers: withCsrfHeaders({
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    }),
    body: JSON.stringify({
      ...(provider ? { provider } : {}),
      ...(apiKey ? { apiKey, api_key: apiKey } : {}),
      ...(payload?.active == null ? {} : { active: Boolean(payload.active) }),
    }),
  });

  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
}

export async function deleteAiAgent(id, { signal } = {}) {
  const safeId = encodeURIComponent(String(id ?? "").trim());
  if (!safeId) throw new Error("Agent id is required.");

  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl(`/ai-agents/delete/${safeId}`), {
    method: "DELETE",
    signal,
    credentials: "include",
    headers: withCsrfHeaders(auth ? { Authorization: auth } : undefined),
  });

  if (!res.ok) throw await toHttpError(res);
  return true;
}

export async function enhanceReviewText({ text, mode = "self_review", signal } = {}) {
  const auth = getAuthHeader();
  const content = toCleanString(text);
  if (!content) throw new Error("Text is required for AI enhancement.");

  const res = await fetch(buildApiUrl("/ai-agents/enhance"), {
    method: "POST",
    signal,
    credentials: "include",
    headers: withCsrfHeaders({
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    }),
    body: JSON.stringify({ text: content, mode }),
  });

  if (!res.ok) throw await toHttpError(res);
  const data = await res.json().catch(() => ({}));
  const enhanced = toCleanString(data?.text ?? data?.content ?? "");
  if (!enhanced) throw new Error("AI returned an empty response.");
  return enhanced;
}
