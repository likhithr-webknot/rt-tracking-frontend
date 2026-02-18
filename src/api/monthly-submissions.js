import { getAuthHeader } from "./auth.js";
import { buildApiUrl, ensureCsrfCookie, withCsrfHeaders } from "./http.js";

async function readError(res) {
  const text = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(text);
    if (parsed?.message) return String(parsed.message);
    if (parsed?.error) return String(parsed.error);
  } catch {
    // ignore
  }
  return text || `Request failed: ${res.status} ${res.statusText}`;
}

async function toHttpError(res) {
  const message = await readError(res);
  const err = new Error(message);
  err.status = res.status;
  return err;
}

export function formatYearMonth(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function normalizeWebknotValueRatings(input) {
  const out = {};
  const assign = (idRaw, ratingRaw, fallback = null) => {
    const id = String(idRaw ?? "").trim();
    if (!id) return;
    const parsed =
      ratingRaw == null || ratingRaw === ""
        ? fallback
        : typeof ratingRaw === "number"
          ? ratingRaw
          : Number.parseFloat(String(ratingRaw));
    if (!Number.isFinite(parsed)) return;
    const rounded = Math.round(parsed * 10) / 10;
    if (rounded < 1 || rounded > 5) return;
    out[id] = rounded;
  };

  if (input && typeof input === "object" && !Array.isArray(input)) {
    for (const [k, v] of Object.entries(input)) assign(k, v);
    return out;
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      if (item && typeof item === "object") {
        const id = item.valueId ?? item.webknotValueId ?? item.id ?? item.code ?? item.key ?? item.value ?? item.title ?? item.name;
        const rating = item.rating ?? item.valueRating ?? item.score ?? item.value;
        assign(id, rating, 1);
        continue;
      }
      assign(item, null, 1);
    }
  }

  return out;
}

export function normalizeMonthlySubmission(data) {
  if (!data || typeof data !== "object") return null;
  const obj =
    data?.data && typeof data.data === "object" && !Array.isArray(data.data)
      ? data.data
      : data;

  const id = obj.submissionId ?? obj.id ?? null;
  const month = typeof obj.month === "string" ? obj.month : null;
  const status = typeof obj.status === "string" ? obj.status : null;

  const payload = obj.payload && typeof obj.payload === "object" ? obj.payload : obj;
  const selfReviewText = String(payload.selfReviewText ?? payload.selfReview ?? payload.reviewText ?? "").trim();
  const rawWebknotValues = Array.isArray(payload.webknotValues ?? payload.values)
    ? (payload.webknotValues ?? payload.values)
    : [];
  const webknotValueRatings = normalizeWebknotValueRatings(
    payload.webknotValueRatings ?? payload.valuesRatings ?? payload.valueRatings ?? rawWebknotValues
  );
  const webknotValues = Array.from(
    new Set([
      ...rawWebknotValues
        .map((v) => {
          if (v && typeof v === "object") {
            return String(v.valueId ?? v.webknotValueId ?? v.id ?? v.code ?? v.key ?? "").trim();
          }
          return String(v ?? "").trim();
        })
        .filter(Boolean),
      ...Object.keys(webknotValueRatings),
    ])
  );
  const recognitionsCountRaw = payload.recognitionsCount ?? payload.recognitions ?? 0;
  const recognitionsCount =
    typeof recognitionsCountRaw === "number" && Number.isFinite(recognitionsCountRaw)
      ? recognitionsCountRaw
      : Number.parseInt(String(recognitionsCountRaw || "0"), 10) || 0;
  const certifications = Array.isArray(payload.certifications) ? payload.certifications : [];
  const kpiRatings =
    payload.kpiRatings && typeof payload.kpiRatings === "object" ? payload.kpiRatings : {};

  const submittedAt = obj.submittedAt ?? obj.submittedOn ?? null;
  const updatedAt = obj.updatedAt ?? obj.lastUpdatedAt ?? null;

  return {
    id: id == null ? null : String(id),
    month: month ? String(month) : null,
    status: status ? String(status) : null,
    selfReviewText,
    certifications,
    kpiRatings,
    webknotValues,
    webknotValueRatings,
    recognitionsCount,
    submittedAt: submittedAt ? String(submittedAt) : null,
    updatedAt: updatedAt ? String(updatedAt) : null,
    raw: obj,
  };
}

export async function saveMonthlyDraft(payload, { signal } = {}) {
  const auth = getAuthHeader();
  const baseHeaders = {
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  };

  async function attempt() {
    return fetch(buildApiUrl("/monthly-submissions/draft"), {
      method: "POST",
      signal,
      credentials: "include",
      headers: withCsrfHeaders(baseHeaders),
      body: JSON.stringify(payload ?? {}),
    });
  }

  let res = await attempt();
  if (!res.ok && res.status === 403) {
    await ensureCsrfCookie({
      signal,
      headers: auth ? { Authorization: auth } : undefined,
      forceRefresh: true,
    });
    res = await attempt();
  }
  if (!res.ok) throw await toHttpError(res);
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json().catch(() => ({}));
  return res.text().catch(() => "");
}

export async function submitMonthlySubmission(payload, { signal } = {}) {
  const auth = getAuthHeader();
  const baseHeaders = {
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  };

  async function attempt() {
    return fetch(buildApiUrl("/monthly-submissions/submit"), {
      method: "POST",
      signal,
      credentials: "include",
      headers: withCsrfHeaders(baseHeaders),
      body: JSON.stringify(payload ?? {}),
    });
  }

  let res = await attempt();
  if (!res.ok && res.status === 403) {
    await ensureCsrfCookie({
      signal,
      headers: auth ? { Authorization: auth } : undefined,
      forceRefresh: true,
    });
    res = await attempt();
  }
  if (!res.ok) throw await toHttpError(res);
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json().catch(() => ({}));
  return res.text().catch(() => "");
}

export async function fetchMyMonthlySubmission({ month, signal } = {}) {
  const auth = getAuthHeader();
  const qs = new URLSearchParams();
  if (month) qs.set("month", String(month));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(buildApiUrl(`/monthly-submissions/me${suffix}`), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw await toHttpError(res);
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json().catch(() => ({}));
  return res.text().catch(() => "");
}

export async function fetchMyMonthlySubmissionHistory({ signal } = {}) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/monthly-submissions/me/history"), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => []);
}

export async function fetchManagerTeamSubmissions({ month, signal } = {}) {
  const auth = getAuthHeader();
  const qs = new URLSearchParams();
  if (month) qs.set("month", String(month));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(buildApiUrl(`/monthly-submissions/manager/team${suffix}`), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => []);
}

export async function fetchAdminAllSubmissions({ month, status, signal } = {}) {
  const auth = getAuthHeader();
  const qs = new URLSearchParams();
  if (month) qs.set("month", String(month));
  if (status) qs.set("status", String(status));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(buildApiUrl(`/monthly-submissions/admin/all${suffix}`), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => []);
}

export async function deleteAdminMonthlySubmission(submissionId, { signal } = {}) {
  const safeId = encodeURIComponent(String(submissionId));
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl(`/monthly-submissions/admin/${safeId}`), {
    method: "DELETE",
    signal,
    credentials: "include",
    headers: withCsrfHeaders(auth ? { Authorization: auth } : {}),
  });
  if (!res.ok) throw await toHttpError(res);
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json().catch(() => ({}));
  return res.text().catch(() => "");
}
