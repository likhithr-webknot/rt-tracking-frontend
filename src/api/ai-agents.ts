// @ts-nocheck
import type { ApiOptions } from "../types/api-options";
import { getAuthHeader } from "./auth";
import { buildApiUrl, parseResponse, toHttpError, withCsrfHeaders } from "./http";
import { draftManagerReviewComment } from "../utils/aiReviewAssist";

/** Local fallback when AI agent backend is not configured. */
export async function fetchActiveAiAgent({ signal } = {} as ApiOptions) {
  void signal;
  return { id: "local", name: "Local assist", active: true };
}

export async function enhanceReviewText(text, { signal } = {} as ApiOptions) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return { text: trimmed, enhanced: false };

  const auth = getAuthHeader();
  const paths = ["/api/v1/ai/enhance-review", "/api/v1/ai-agents/enhance"];
  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });
  for (const path of paths) {
    try {
      const res = await fetch(buildApiUrl(path), {
        method: "POST",
        signal,
        credentials: "include",
        headers,
        body: JSON.stringify({ text: trimmed }),
      });
      if (res.status === 404 || res.status === 405) continue;
      if (!res.ok) throw await toHttpError(res);
      const data = await parseResponse(res, {});
      const out = data?.text || data?.enhancedText || trimmed;
      return { text: String(out).trim(), enhanced: true };
    } catch {
      continue;
    }
  }
  return { text: trimmed, enhanced: false };
}

/** Suggest manager review comment from rating deltas (local logic; optional API later). */
export async function suggestManagerReviewDraft(context = {}, { signal } = {} as ApiOptions) {
  void signal;
  const text = draftManagerReviewComment(context);
  return { text, enhanced: false, source: "local" };
}
