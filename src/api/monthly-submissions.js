import { getAuthHeader } from "./auth.js";
import { buildApiUrl, ensureCsrfCookie, withCsrfHeaders } from "./http.js";
import { buildCycleMeta, formatYearMonth as formatYearMonthFromCycle, normalizeYearMonth } from "../utils/reviewCycles.js";

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

export function formatYearMonth(date) {
  return formatYearMonthFromCycle(date);
}

function copyIfPresent(source, target, key, options = {}) {
  if (!source || typeof source !== "object") return;
  if (!target || typeof target !== "object") return;
  const value = source[key];
  if (value == null) return;
  if (options.asString) {
    const text = String(value).trim();
    if (!text) return;
    target[key] = text;
    return;
  }
  target[key] = value;
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
        const id =
          item.valueId ??
          item.webknotValueId ??
          item.valueDefinitionId ??
          item.id ??
          item.code ??
          item.key ??
          item.value ??
          item.title ??
          item.name;
        const rating = item.rating ?? item.valueRating ?? item.score ?? item.value;
        assign(id, rating, 1);
        continue;
      }
      assign(item, null, 1);
    }
  }

  return out;
}

function normalizeKpiRatings(input) {
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
        const id =
          item.kpiId ??
          item.kpiDefinitionId ??
          item.id ??
          item.code ??
          item.key ??
          item.title ??
          item.name;
        const rating = item.rating ?? item.kpiRating ?? item.score ?? item.value;
        assign(id, rating, 1);
        continue;
      }
      assign(item, null, 1);
    }
  }

  return out;
}

function toRequestPayload(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const month = normalizeYearMonth(source.monthKey ?? source.month) || String(source.monthKey ?? source.month ?? "").trim();
  const cycleMeta = buildCycleMeta(source.cycleMonth ?? month ?? source.monthKey ?? source.month);
  const selfReviewText = String(source.selfReviewText ?? source.selfReview ?? source.reviewText ?? "");
  const recognitionsCountRaw = source.recognitionsCount ?? source.recognitions ?? 0;
  const recognitionsCount =
    typeof recognitionsCountRaw === "number" && Number.isFinite(recognitionsCountRaw)
      ? recognitionsCountRaw
      : Number.parseInt(String(recognitionsCountRaw || "0"), 10) || 0;

  const next = {
    month: month || null,
    monthKey: month || null,
    cycleKey: String(source.cycleKey || cycleMeta.cycleKey || "").trim() || null,
    cycleLabel: String(source.cycleLabel || cycleMeta.cycleLabel || "").trim() || null,
    cycleShortLabel: String(source.cycleShortLabel || cycleMeta.cycleShortLabel || "").trim() || null,
    cycleStartMonth: normalizeYearMonth(source.cycleStartMonth) || cycleMeta.cycleStartMonth || null,
    cycleEndMonth: normalizeYearMonth(source.cycleEndMonth) || cycleMeta.cycleEndMonth || null,
    cycleMonth: month || null,
    profileVerified: Boolean(source.profileVerified),
    submissionType: String(source.submissionType ?? source.type ?? "").trim() || null,
    actorRole: String(source.actorRole ?? "").trim() || null,
    targetRole: String(source.targetRole ?? "").trim() || null,
    workflowStage: String(source.workflowStage ?? "").trim() || null,
    subjectEmployeeId: String(source.subjectEmployeeId ?? source.employeeId ?? "").trim() || null,
    selfReviewText,
    recognitionsCount,
    certifications: [],
    kpiRatings: [],
    webknotValueResponses: [],
  };

  const rawCertifications = Array.isArray(source.certifications) ? source.certifications : [];
  next.certifications = rawCertifications
    .map((item) => {
      if (typeof item === "string") {
        const name = String(item).trim();
        return name ? { name, certificationName: name, proof: "" } : null;
      }
      if (!item || typeof item !== "object") return null;
      const name = String(item.name ?? item.certificationName ?? item.title ?? "").trim();
      if (!name) return null;
      const proof = String(item.proof ?? item.url ?? item.link ?? item.credentialId ?? "").trim();
      return { name, certificationName: name, proof };
    })
    .filter(Boolean);

  const normalizedKpis = normalizeKpiRatings(source.kpiRatings ?? source.kpis ?? source.kpiSelfRatings);
  next.kpiRatings = Object.entries(normalizedKpis).map(([kpiId, rating]) => ({
    kpiId: String(kpiId || "").trim(),
    kpiDefinitionId: String(kpiId || "").trim(),
    rating,
  }));

  const normalizedValues = normalizeWebknotValueRatings(
    source.webknotValueResponses ??
    source.webknotValueRatings ??
    source.valuesRatings ??
    source.valueRatings ??
    source.webknotValues
  );
  const valuePairs = Object.entries(normalizedValues);
  next.webknotValues = valuePairs.map(([valueId]) => String(valueId || "").trim());
  next.webknotValueRatings = Object.fromEntries(valuePairs);
  next.webknotValueResponses = valuePairs.map(([valueId, rating]) => ({
    valueId: String(valueId || "").trim(),
    webknotValueId: String(valueId || "").trim(),
    rating,
  }));
  if (!Array.isArray(next.kpiRatings)) next.kpiRatings = [];
  if (!Array.isArray(next.certifications)) next.certifications = [];
  if (!Array.isArray(next.webknotValueResponses)) next.webknotValueResponses = [];

  copyIfPresent(source, next, "submittedAt", { asString: true });
  copyIfPresent(source, next, "employeeId", { asString: true });
  copyIfPresent(source, next, "reviewStatus", { asString: true });
  copyIfPresent(source, next, "reopenedForResubmission");
  copyIfPresent(source, next, "managerSubmittedAt", { asString: true });
  copyIfPresent(source, next, "managerReviewedAt", { asString: true });
  copyIfPresent(source, next, "managerReview");
  copyIfPresent(source, next, "managerEvaluation");
  copyIfPresent(source, next, "managerComments");
  copyIfPresent(source, next, "managerNotes");
  copyIfPresent(source, next, "adminSubmittedAt", { asString: true });
  copyIfPresent(source, next, "adminReviewedAt", { asString: true });
  copyIfPresent(source, next, "adminReview");
  copyIfPresent(source, next, "adminEvaluation");
  copyIfPresent(source, next, "adminComments");
  copyIfPresent(source, next, "adminNotes");

  return next;
}

export function normalizeMonthlySubmission(data) {
  if (!data || typeof data !== "object") return null;
  const obj =
    data?.data && typeof data.data === "object" && !Array.isArray(data.data)
      ? data.data
      : data;

  const id = obj.submissionId ?? obj.id ?? null;
  const month = normalizeYearMonth(obj.month ?? obj.monthKey) || null;
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
  const kpiRatings = normalizeKpiRatings(payload.kpiRatings);

  const submittedAt = obj.submittedAt ?? obj.submittedOn ?? null;
  const updatedAt = obj.updatedAt ?? obj.lastUpdatedAt ?? null;
  const cycleMeta = buildCycleMeta(
    payload?.cycleMonth ??
    payload?.month ??
    payload?.monthKey ??
    obj?.cycleMonth ??
    obj?.month ??
    obj?.monthKey ??
    month
  );
  const managerReviewRaw =
    (payload?.managerReview && typeof payload.managerReview === "object" ? payload.managerReview : null) ??
    (obj?.managerReview && typeof obj.managerReview === "object" ? obj.managerReview : null);
  const managerEvaluation =
    (payload?.managerEvaluation && typeof payload.managerEvaluation === "object" ? payload.managerEvaluation : null) ??
    (obj?.managerEvaluation && typeof obj.managerEvaluation === "object" ? obj.managerEvaluation : null);
  const adminReviewRaw =
    (payload?.adminReview && typeof payload.adminReview === "object" ? payload.adminReview : null) ??
    (obj?.adminReview && typeof obj.adminReview === "object" ? obj.adminReview : null);
  const adminEvaluation =
    (payload?.adminEvaluation && typeof payload.adminEvaluation === "object" ? payload.adminEvaluation : null) ??
    (obj?.adminEvaluation && typeof obj.adminEvaluation === "object" ? obj.adminEvaluation : null);
  const reviewStatusRaw = payload?.reviewStatus ?? obj?.reviewStatus ?? status ?? "";
  const reviewStatus = String(reviewStatusRaw || "").trim() || null;
  const managerSubmittedAt =
    payload?.managerSubmittedAt ??
    payload?.managerReviewedAt ??
    obj?.managerSubmittedAt ??
    obj?.managerReviewedAt ??
    null;
  const adminSubmittedAt =
    payload?.adminSubmittedAt ??
    payload?.adminReviewedAt ??
    obj?.adminSubmittedAt ??
    obj?.adminReviewedAt ??
    null;
  const managerFallbackComment = String(
    payload?.managerComments ??
    payload?.managerNotes ??
    managerEvaluation?.comments ??
    ""
  ).trim();
  const adminFallbackComment = String(
    payload?.adminComments ??
    payload?.adminNotes ??
    adminEvaluation?.comments ??
    ""
  ).trim();
  const managerReview =
    managerReviewRaw ||
    (managerFallbackComment
      ? {
          action: reviewStatus?.toUpperCase().includes("NEEDS_REVIEW") ? "REJECT" : null,
          comments: managerFallbackComment,
          reviewedAt: managerSubmittedAt || null,
          reviewedBy: managerEvaluation?.reviewedBy ?? null,
        }
      : null);
  const adminReview =
    adminReviewRaw ||
    (adminFallbackComment
      ? {
          action: reviewStatus?.toUpperCase().includes("NEEDS_REVIEW") ? "REJECT" : null,
          comments: adminFallbackComment,
          reviewedAt: adminSubmittedAt || null,
          reviewedBy: adminEvaluation?.reviewedBy ?? null,
        }
      : null);
  const submissionType =
    String(
      payload?.submissionType ??
      payload?.type ??
      obj?.submissionType ??
      obj?.type ??
      ""
    ).trim() || null;
  const targetRole =
    String(
      payload?.targetRole ??
      obj?.targetRole ??
      obj?.targetEmployeeRole ??
      payload?.targetEmployeeRole ??
      payload?.targetEmpRole ??
      obj?.targetEmpRole ??
      ""
    ).trim() || null;
  const subjectEmployeeId =
    String(payload?.subjectEmployeeId ?? obj?.subjectEmployeeId ?? payload?.employeeId ?? obj?.employeeId ?? "").trim() || null;
  const managerAction = String(managerReview?.action ?? "").trim().toUpperCase();
  const adminAction = String(adminReview?.action ?? "").trim().toUpperCase();
  const reopenedForResubmission = Boolean(
    payload?.reopenedForResubmission ??
    obj?.reopenedForResubmission ??
    reviewStatus?.toUpperCase().includes("NEEDS_REVIEW") ??
    false
  );
  const resubmissionRequested = Boolean(
    reopenedForResubmission ||
    reviewStatus?.toUpperCase().includes("NEEDS_REVIEW") ||
    reviewStatus?.toUpperCase().includes("REJECT") ||
    managerAction === "REJECT" ||
    adminAction === "REJECT"
  );

  return {
    id: id == null ? null : String(id),
    month: month ? String(month) : null,
    status: status ? String(status) : null,
    submissionType,
    targetRole,
    subjectEmployeeId,
    cycleKey: String(payload?.cycleKey ?? obj?.cycleKey ?? cycleMeta.cycleKey ?? "").trim() || null,
    cycleLabel: String(payload?.cycleLabel ?? obj?.cycleLabel ?? cycleMeta.cycleLabel ?? "").trim() || null,
    cycleShortLabel: String(payload?.cycleShortLabel ?? obj?.cycleShortLabel ?? cycleMeta.cycleShortLabel ?? "").trim() || null,
    cycleStartMonth: normalizeYearMonth(payload?.cycleStartMonth ?? obj?.cycleStartMonth) || cycleMeta.cycleStartMonth || null,
    cycleEndMonth: normalizeYearMonth(payload?.cycleEndMonth ?? obj?.cycleEndMonth) || cycleMeta.cycleEndMonth || null,
    reviewStatus,
    managerReview,
    managerEvaluation,
    managerSubmittedAt: managerSubmittedAt ? String(managerSubmittedAt) : null,
    adminReview,
    adminEvaluation,
    adminSubmittedAt: adminSubmittedAt ? String(adminSubmittedAt) : null,
    reopenedForResubmission,
    resubmissionRequested,
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
  const preparedPayload = toRequestPayload(payload);
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
      body: JSON.stringify(preparedPayload),
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
  if (!res.ok) {
    const err = await toHttpError(res);
    if (res.status === 400) {
      err.message = `${err.message} [payload-shape kpiRatings=${Array.isArray(preparedPayload?.kpiRatings)} certifications=${Array.isArray(preparedPayload?.certifications)} webknotValueResponses=${Array.isArray(preparedPayload?.webknotValueResponses)}]`;
    }
    throw err;
  }
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json().catch(() => ({}));
  return res.text().catch(() => "");
}

export async function submitMonthlySubmission(payload, { signal } = {}) {
  const auth = getAuthHeader();
  const preparedPayload = toRequestPayload(payload);
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
      body: JSON.stringify(preparedPayload),
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
  if (!res.ok) {
    const err = await toHttpError(res);
    if (res.status === 400) {
      err.message = `${err.message} [payload-shape kpiRatings=${Array.isArray(preparedPayload?.kpiRatings)} certifications=${Array.isArray(preparedPayload?.certifications)} webknotValueResponses=${Array.isArray(preparedPayload?.webknotValueResponses)}]`;
    }
    throw err;
  }
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

export async function fetchManagerTeamSubmissions({ month, status, limit = null, cursor = null, signal } = {}) {
  const auth = getAuthHeader();
  const qs = new URLSearchParams();
  if (month) qs.set("month", String(month));
  if (status) qs.set("status", String(status));
  if (limit != null) qs.set("limit", String(limit));
  if (cursor) qs.set("cursor", String(cursor));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(buildApiUrl(`/monthly-submissions/manager/team${suffix}`), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  return res.json().catch(() => ({}));
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

export async function submitAdminReviewDecision(payload, { signal } = {}) {
  const auth = getAuthHeader();
  const preparedPayload = toRequestPayload(payload);
  const baseHeaders = {
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  };
  const endpoints = [
    "/monthly-submissions/admin/review",
    "/monthly-submissions/admin/reviews",
    "/monthly-submissions/admin/decision",
  ];

  for (const endpoint of endpoints) {
    let res = await fetch(buildApiUrl(endpoint), {
      method: "POST",
      signal,
      credentials: "include",
      headers: withCsrfHeaders(baseHeaders),
      body: JSON.stringify(preparedPayload),
    });

    if (!res.ok && res.status === 403) {
      await ensureCsrfCookie({
        signal,
        headers: auth ? { Authorization: auth } : undefined,
        forceRefresh: true,
      });
      res = await fetch(buildApiUrl(endpoint), {
        method: "POST",
        signal,
        credentials: "include",
        headers: withCsrfHeaders(baseHeaders),
        body: JSON.stringify(preparedPayload),
      });
    }

    if (res.ok) {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) return res.json().catch(() => ({}));
      return res.text().catch(() => "");
    }

    const err = await toHttpError(res);
    if (res.status === 404 || res.status === 405) {
      continue;
    }
    throw err;
  }

  const action = String(preparedPayload?.adminReview?.action ?? "").trim().toUpperCase();
  if (action === "REJECT") {
    return saveMonthlyDraft(preparedPayload, { signal });
  }
  return submitMonthlySubmission(preparedPayload, { signal });
}
