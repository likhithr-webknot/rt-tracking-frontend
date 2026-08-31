// @ts-nocheck
import type { ApiOptions } from "../types/api-options";
import {
  fetchMe,
  hasRecoverableSession,
  stripOAuthParamsFromUrl,
} from "./auth";

const WEBTRAK_ORIGINS = [
  String(import.meta.env?.VITE_WEBTRAK_SSO_ORIGIN ?? "").trim(),
  String(import.meta.env?.VITE_WEBTRAK_API_BASE ?? "").trim(),
  String(import.meta.env?.VITE_EMPLOYEE_ROSTER_API_BASE ?? "").trim(),
  "https://webtrak.webknot-dev.in",
  "https://webtrak.webknot.in",
].filter(Boolean);

function normalizeOrigin(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  try {
    const url = new URL(text.startsWith("http") ? text : `https://${text}`);
    return url.origin;
  } catch {
    return "";
  }
}

export function getWebtrakSsoOrigin() {
  for (const candidate of WEBTRAK_ORIGINS) {
    const origin = normalizeOrigin(candidate);
    if (origin) return origin;
  }
  if (typeof window !== "undefined") {
    const host = window.location.hostname.toLowerCase();
    if (host.startsWith("rtportal.")) {
      return `https://webtrak.${host.slice("rtportal.".length)}`;
    }
  }
  return "https://webtrak.webknot-dev.in";
}

/** User opened Pulse from Webtrak (RT tool) or landed with ?from=webtrak. */
export function isWebtrakHandoff() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search || "");
  if (params.get("from") === "webtrak") return true;
  try {
    const ref = String(document.referrer || "");
    return /https?:\/\/webtrak\.(webknot-dev\.in|webknot\.in)/i.test(ref);
  } catch {
    return false;
  }
}

export function buildWebtrakPulseRedirectUrl({ returnPath = "/" } = {}) {
  const origin = getWebtrakSsoOrigin();
  const returnUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${returnPath.startsWith("/") ? returnPath : `/${returnPath}`}`
      : "";
  const qs = returnUrl ? `?return=${encodeURIComponent(returnUrl)}` : "";
  return `${origin}/api/v1/auth/pulse-redirect${qs}`;
}

/**
 * When arriving from Webtrak without a local Pulse session, bounce to Webtrak
 * pulse-redirect so it can attach the user's JWT and send them back here.
 */
export function redirectToWebtrakPulseHandoff({ returnPath = "/" } = {}) {
  if (typeof window === "undefined") return;
  stripOAuthParamsFromUrl();
  window.location.replace(buildWebtrakPulseRedirectUrl({ returnPath }));
}

/**
 * Bootstrap session after Webtrak RT-tool handoff:
 * 1. HttpOnly cookie session on same origin (/api/v1/auth/me)
 * 2. Redirect to Webtrak pulse-redirect when still unsigned-in
 */
export async function bootstrapWebtrakHandoffSession({ signal, hasToken = false } = {} as ApiOptions & { hasToken?: boolean }) {
  if (hasRecoverableSession() || hasToken) {
    const me = await fetchMe({ signal });
    if (me) return me;
  }

  if (!isWebtrakHandoff()) return null;

  const me = await fetchMe({ signal });
  if (me) return me;

  redirectToWebtrakPulseHandoff({
    returnPath: `${window.location.pathname}${window.location.search}`,
  });
  return null;
}
