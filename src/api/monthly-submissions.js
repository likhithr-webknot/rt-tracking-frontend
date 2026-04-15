import { getAuthHeader } from "./auth.js";
import { buildApiUrl, ensureCsrfCookie, parseResponse, toHttpError, withCsrfHeaders } from "./http.js";
import { buildCycleMeta, formatYearMonth as formatYearMonthFromCycle, normalizeYearMonth } from "../utils/reviewCycles.js";

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
  copyIfPresent(source, next, "techShowcase", { asString: true });

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
  const techShowcase = String(
    payload?.techShowcase ?? payload?.techShowcaseNotes ?? obj?.techShowcase ?? ""
  ).trim();

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
  /* ── clear stale rejection data after employee resubmits ──
     When the employee resubmits, reviewStatus becomes "SUBMITTED" but the
     server may still return the old managerReview/adminReview objects with
     action:"REJECT".  We treat those as stale and null them out so the
     employee no longer sees old rejection comments, and admin/manager
     portals don't show a stale "REJECTED" badge.                         */
  const statusUpper = String(status || "").toUpperCase();
  const reviewStatusUpper = String(reviewStatus || "").toUpperCase();
  const isResubmittedStatus =
    (reviewStatusUpper === "SUBMITTED") ||
    (statusUpper === "SUBMITTED" && (reviewStatusUpper.includes("REJECT") || reviewStatusUpper.includes("NEEDS_REVIEW")));
  /* Override stale reviewStatus when the submission itself is SUBMITTED */
  const effectiveReviewStatus = isResubmittedStatus ? "SUBMITTED" : reviewStatus;
  const clearedManagerSubmittedAt = isResubmittedStatus ? null : managerSubmittedAt;
  const effectiveManagerReview =
    isResubmittedStatus &&
    managerReview &&
    String(managerReview.action ?? "").trim().toUpperCase() === "REJECT"
      ? null
      : managerReview;
  const effectiveAdminReview =
    isResubmittedStatus &&
    adminReview &&
    String(adminReview.action ?? "").trim().toUpperCase() === "REJECT"
      ? null
      : adminReview;
  const effectiveManagerEvaluation = isResubmittedStatus ? null : managerEvaluation;
  const effectiveAdminEvaluation = isResubmittedStatus ? null : adminEvaluation;

  const managerAction = String(effectiveManagerReview?.action ?? "").trim().toUpperCase();
  const adminAction = String(effectiveAdminReview?.action ?? "").trim().toUpperCase();
  const reopenedForResubmission = Boolean(
    isResubmittedStatus
      ? false
      : (payload?.reopenedForResubmission ??
         obj?.reopenedForResubmission ??
         effectiveReviewStatus?.toUpperCase().includes("NEEDS_REVIEW") ??
         false)
  );
  const resubmissionRequested = Boolean(
    reopenedForResubmission ||
    effectiveReviewStatus?.toUpperCase().includes("NEEDS_REVIEW") ||
    effectiveReviewStatus?.toUpperCase().includes("REJECT") ||
    managerAction === "REJECT" ||
    adminAction === "REJECT"
  );

  const managerSubmitted = Boolean(clearedManagerSubmittedAt) && !resubmissionRequested;

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
    reviewStatus: effectiveReviewStatus,
    managerReview: effectiveManagerReview,
    managerEvaluation: effectiveManagerEvaluation,
    managerSubmittedAt: clearedManagerSubmittedAt ? String(clearedManagerSubmittedAt) : null,
    managerSubmitted,
    adminReview: effectiveAdminReview,
    adminEvaluation: effectiveAdminEvaluation,
    adminSubmittedAt: adminSubmittedAt ? String(adminSubmittedAt) : null,
    reopenedForResubmission,
    resubmissionRequested,
    selfReviewText,
    certifications,
    kpiRatings,
    webknotValues,
    webknotValueRatings,
    recognitionsCount,
    techShowcase,
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

  // New controller integration: /draft might not exist anymore.
  if (res.status === 404 || res.status === 405) {
    return submitMonthlySubmission(payload, { signal });
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

  const submissionIdRaw = payload?.submissionId ?? payload?.id ?? payload?.submissionID ?? null;
  const submissionId = submissionIdRaw != null ? String(submissionIdRaw).trim() : "";

  const actorRole = String(payload?.actorRole ?? "").trim().toUpperCase();
  const targetRole = String(payload?.targetRole ?? "").trim().toUpperCase();
  const hasManagerReview = Boolean(payload?.managerReview || payload?.managerEvaluation || payload?.managerSubmittedAt);

  const isManagerEmployeeReview =
    actorRole === "MANAGER" &&
    targetRole === "EMPLOYEE" &&
    hasManagerReview &&
    Boolean(submissionId);

  const requestCandidates = isManagerEmployeeReview
    ? [
        {
          method: "PUT",
          path: `/monthly-submissions/${encodeURIComponent(submissionId)}/manager-review`,
        },
      ]
    : [
        { method: "POST", path: "/monthly-submissions/self" },
        // Backward-compat fallback (in case older backend is still deployed).
        { method: "POST", path: "/monthly-submissions/submit" },
      ];

  async function attempt({ method, path }) {
    return fetch(buildApiUrl(path), {
      method,
      signal,
      credentials: "include",
      headers: withCsrfHeaders(baseHeaders),
      body: JSON.stringify(preparedPayload),
    });
  }

  let lastErr = null;
  for (const candidate of requestCandidates) {
    let res = await attempt(candidate).catch((err) => {
      lastErr = err;
      return null;
    });
    if (!res) continue;

    if (!res.ok && res.status === 403) {
      await ensureCsrfCookie({
        signal,
        headers: auth ? { Authorization: auth } : undefined,
        forceRefresh: true,
      });
      res = await attempt(candidate).catch((err) => {
        lastErr = err;
        return null;
      });
    }

    if (!res) continue;

    if (!res.ok) {
      // Try next fallback path only for not-found-ish errors.
      if (res.status === 404 || res.status === 405) continue;
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

  if (lastErr) throw lastErr;
  throw new Error("Monthly submission endpoint not found.");
}

export async function fetchMyMonthlySubmission({ month, signal } = {}) {
  const auth = getAuthHeader();
  const monthKey = normalizeYearMonth(month) || String(month ?? "").trim();
  const endpoints = [
    "/api/v1/monthly-submissions/me",
    "/monthly-submissions/me",
  ];
  const queryVariants = [];
  if (monthKey) {
    queryVariants.push(new URLSearchParams({ month: monthKey }));
    queryVariants.push(new URLSearchParams({ monthKey: monthKey }));
    queryVariants.push(new URLSearchParams({ cycleKey: monthKey }));
  } else {
    queryVariants.push(new URLSearchParams());
  }

  let raw = null;
  let found = false;
  for (const endpoint of endpoints) {
    for (const qs of queryVariants) {
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      const res = await fetch(buildApiUrl(`${endpoint}${suffix}`), {
        signal,
        credentials: "include",
        headers: auth ? { Authorization: auth } : undefined,
      });
      if (res.status === 404 || res.status === 405) {
        continue;
      }
      if (!res.ok) throw await toHttpError(res);
      const contentType = res.headers.get("content-type") || "";
      raw = contentType.includes("application/json")
        ? await res.json().catch(() => ({}))
        : await res.text().catch(() => "");
      found = true;
      break;
    }
    if (found) break;
  }

  if (!found) return null;
  if (raw == null || typeof raw !== "object") return raw;

  // Backend returns GenericResponseDTO, where `data` is usually a list.
  const container = raw?.data ?? raw;
  if (Array.isArray(container)) {
    if (month) {
      const wanted = String(month);
      const found = container.find(
        (x) =>
          x &&
          (String(x.month ?? x.monthKey ?? x.cycleMonth ?? "") === wanted ||
            String(x.monthKey ?? "") === wanted)
      );
      if (found) return found;
    }
    return container[0] ?? null;
  }

  if (container && typeof container === "object") {
    const maybe =
      (Array.isArray(container?.submissions) && container.submissions) ||
      (Array.isArray(container?.items) && container.items) ||
      null;
    if (maybe) {
      if (month) {
        const wanted = String(month);
        const found = maybe.find(
          (x) =>
            x &&
            (String(x.month ?? x.monthKey ?? x.cycleMonth ?? "") === wanted || String(x.monthKey ?? "") === wanted)
        );
        if (found) return found;
      }
      return maybe[0] ?? null;
    }
    return container;
  }

  return raw;
}

export async function fetchMyMonthlySubmissionHistory({ signal } = {}) {
  const auth = getAuthHeader();
  const endpoints = [
    "/api/v1/monthly-submissions/me/history",
    "/monthly-submissions/me/history",
  ];
  let lastRouteErr = null;
  for (const endpoint of endpoints) {
    const res = await fetch(buildApiUrl(endpoint), {
      signal,
      credentials: "include",
      headers: auth ? { Authorization: auth } : undefined,
    });
    if (res.ok) return res.json().catch(() => []);
    const err = await toHttpError(res);
    if (res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }
  throw lastRouteErr || new Error("Monthly submission history endpoint not found.");
}

export async function fetchManagerTeamSubmissions({ month, status, limit = null, cursor = null, signal } = {}) {
  const auth = getAuthHeader();
  const monthKey = normalizeYearMonth(month) || String(month ?? "").trim();
  const endpoints = [
    "/api/v1/monthly-submissions/manager/team",
    "/monthly-submissions/manager/team",
  ];
  const queryVariants = [];
  const buildQuery = (monthField) => {
    const qs = new URLSearchParams();
    if (monthKey && monthField) qs.set(monthField, monthKey);
    if (status) qs.set("status", String(status));
    if (limit != null) qs.set("limit", String(limit));
    if (cursor) qs.set("cursor", String(cursor));
    return qs;
  };
  if (monthKey) {
    queryVariants.push(buildQuery("month"));
    queryVariants.push(buildQuery("monthKey"));
    queryVariants.push(buildQuery("cycleKey"));
  } else {
    queryVariants.push(buildQuery(null));
  }

  let lastRouteErr = null;
  for (const endpoint of endpoints) {
    for (const qs of queryVariants) {
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      const res = await fetch(buildApiUrl(`${endpoint}${suffix}`), {
        signal,
        credentials: "include",
        headers: auth ? { Authorization: auth } : undefined,
      });
      if (res.ok) return res.json().catch(() => ({}));
      const err = await toHttpError(res);
      if (res.status === 404 || res.status === 405) {
        lastRouteErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastRouteErr || new Error("Manager team submissions endpoint not found.");
}

export async function fetchAdminAllSubmissions({ month, status, signal } = {}) {
  const auth = getAuthHeader();
  const monthKey = normalizeYearMonth(month) || String(month ?? "").trim();
  const buildQuery = (monthField) => {
    const qs = new URLSearchParams();
    if (monthKey && monthField) qs.set(monthField, monthKey);
    if (status) qs.set("status", String(status));
    return qs;
  };
  const queryVariants = monthKey
    ? [buildQuery("month"), buildQuery("monthKey"), buildQuery("cycleKey")]
    : [buildQuery(null)];

  const endpoints = [
    "/api/v1/monthly-submissions/admin/all",
    "/monthly-submissions/admin/all",
    "/api/v1/monthly-submissions/admin/list",
    "/monthly-submissions/admin/list",
  ];

  let lastRouteErr = null;
  for (const endpoint of endpoints) {
    for (const qs of queryVariants) {
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      const res = await fetch(buildApiUrl(`${endpoint}${suffix}`), {
        signal,
        credentials: "include",
        headers: auth ? { Authorization: auth } : undefined,
      });
      if (res.ok) {
        const raw = await res.json().catch(() => ([]));
        const data = raw?.data ?? raw;
        if (Array.isArray(data)) return data;
        if (Array.isArray(data?.items)) return data.items;
        if (Array.isArray(data?.results)) return data.results;
        if (Array.isArray(data?.content)) return data.content;
        if (Array.isArray(raw?.items)) return raw.items;
        if (Array.isArray(raw?.results)) return raw.results;
        if (Array.isArray(raw?.content)) return raw.content;
        return [];
      }

      const err = await toHttpError(res);
      if (res.status === 404 || res.status === 405) {
        lastRouteErr = err;
        continue;
      }
      throw err;
    }
  }

  throw lastRouteErr || new Error("Monthly submissions endpoint not found.");
}

function normalizeScoreBreakdown(raw, fallback = {}) {
  const obj = raw && typeof raw === "object" ? raw : {};
  const readNumber = (...values) => {
    for (const value of values) {
      const num = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
      if (Number.isFinite(num)) return Math.round(num * 10) / 10;
    }
    return null;
  };

  return {
    managerKpiAverage: readNumber(obj.managerKpiAverage, obj.kpiAverage, obj.kpiAvg, obj.kpiScoreAverage, fallback.managerKpiAverage),
    managerWebknotValueAverage: readNumber(obj.managerWebknotValueAverage, obj.webknotValueAverage, obj.valueAverage, obj.webknotValueAvg, fallback.managerWebknotValueAverage),
    weightedScore: readNumber(obj.weightedScore, obj.finalScore, obj.score, obj.combinedScore, fallback.weightedScore),
    browniePoints: readNumber(obj.browniePoints, obj.brownie, obj.extraPoints, fallback.browniePoints),
    certificationPoints: readNumber(obj.certificationPoints, obj.certPoints, fallback.certificationPoints),
    recognitionPoints: readNumber(obj.recognitionPoints, obj.recognitionCount, obj.recognitions, fallback.recognitionPoints),
    techShowcasePoints: readNumber(obj.techShowcasePoints, obj.techShowcaseBonus, obj.techPoints, fallback.techShowcasePoints),
    certificationsCount: readNumber(obj.certificationsCount, obj.certCount, fallback.certificationsCount),
    recognitionsCount: readNumber(obj.recognitionsCount, obj.recognitionCount, fallback.recognitionsCount),
    techShowcase: String(obj.techShowcase ?? fallback.techShowcase ?? "").trim() || "",
    raw: obj,
  };
}

export async function fetchMonthlySubmissionScoreBreakdown(payload, { signal } = {}) {
  const auth = getAuthHeader();
  const preparedPayload = toRequestPayload(payload);
  const body = JSON.stringify(preparedPayload);
  const makeHeaders = () => withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });

  const endpoints = [
    "/api/v1/monthly-submissions/score-breakdown",
    "/monthly-submissions/score-breakdown",
  ];

  for (const endpoint of endpoints) {
    let res = await fetch(buildApiUrl(endpoint), {
      method: "POST",
      signal,
      credentials: "include",
      headers: makeHeaders(),
      body,
    });

    if (res.status === 403) {
      await ensureCsrfCookie({
        signal,
        headers: auth ? { Authorization: auth } : undefined,
        forceRefresh: true,
      }).catch(() => {});
      res = await fetch(buildApiUrl(endpoint), {
        method: "POST",
        signal,
        credentials: "include",
        headers: makeHeaders(),
        body,
      });
    }

    if (res.ok) {
      const raw = await res.json().catch(() => ({}));
      return normalizeScoreBreakdown(raw, preparedPayload);
    }

    if (res.status === 404 || res.status === 405) {
      continue;
    }

    throw await toHttpError(res);
  }

  return normalizeScoreBreakdown({}, preparedPayload);
}

function normalizeAdminOverview(raw, fallback = {}) {
  const obj = raw && typeof raw === "object" ? raw : {};
  const readNumber = (...values) => {
    for (const value of values) {
      const num = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
      if (Number.isFinite(num)) return Math.round(num);
    }
    return null;
  };

  return {
    month: String(obj.month ?? fallback.month ?? "").trim() || null,
    cycleKey: String(obj.cycleKey ?? fallback.cycleKey ?? "").trim() || null,
    totalSubmissions: readNumber(obj.totalSubmissions, obj.submissionCount, obj.total, fallback.totalSubmissions),
    pendingManagerReviews: readNumber(obj.pendingManagerReviews, obj.pendingReviews, obj.pending, fallback.pendingManagerReviews),
    managerReviewedCount: readNumber(obj.managerReviewedCount, obj.managerReviewed, obj.reviewed, fallback.managerReviewedCount),
    sixMonthReviewMonth: Boolean(obj.sixMonthReviewMonth ?? obj.reviewMonthFlag ?? obj.isSixMonthReviewMonth ?? fallback.sixMonthReviewMonth),
    reviewMonthLabel: String(obj.reviewMonthLabel ?? obj.reviewMonth ?? obj.sixMonthReviewLabel ?? fallback.reviewMonthLabel ?? "").trim() || null,
    raw: obj,
  };
}

export async function fetchAdminMonthlyOverview({ month, cycleKey, signal } = {}) {
  const auth = getAuthHeader();
  const qs = new URLSearchParams();
  if (month) qs.set("month", String(month));
  if (cycleKey) qs.set("cycleKey", String(cycleKey));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const endpoints = [
    `/api/v1/monthly-submissions/admin-overview${suffix}`,
    `/monthly-submissions/admin-overview${suffix}`,
  ];

  for (const endpoint of endpoints) {
    const res = await fetch(buildApiUrl(endpoint), {
      signal,
      credentials: "include",
      headers: auth ? { Authorization: auth } : undefined,
    });
    if (res.ok) {
      const raw = await res.json().catch(() => ({}));
      return normalizeAdminOverview(raw, { month, cycleKey });
    }
    if (res.status === 404 || res.status === 405) {
      continue;
    }
    throw await toHttpError(res);
  }

  return normalizeAdminOverview({}, { month, cycleKey });
}

export async function deleteAdminMonthlySubmission(submissionId, { signal } = {}) {
  const safeId = encodeURIComponent(String(submissionId));
  const auth = getAuthHeader();
  const endpoints = [
    `/api/v1/monthly-submissions/admin/${safeId}`,
    `/monthly-submissions/admin/${safeId}`,
  ];
  let lastRouteErr = null;
  for (const endpoint of endpoints) {
    const res = await fetch(buildApiUrl(endpoint), {
      method: "DELETE",
      signal,
      credentials: "include",
      headers: withCsrfHeaders(auth ? { Authorization: auth } : {}),
    });
    if (res.ok) {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) return res.json().catch(() => ({}));
      return res.text().catch(() => "");
    }
    const err = await toHttpError(res);
    if (res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }
  throw lastRouteErr || new Error("Admin monthly submission delete endpoint not found.");
}

/**
 * GET /monthly-submissions/cycles
 * Fetches available review cycles from the server.
 */
export async function fetchSubmissionCycles({ signal } = {}) {
  const auth = getAuthHeader();
  const endpoints = [
    "/api/v1/list-submission-cycles",
    "/monthly-submissions/cycles",
  ];
  let lastRouteErr = null;
  for (const endpoint of endpoints) {
    const res = await fetch(buildApiUrl(endpoint), {
      signal,
      credentials: "include",
      headers: auth ? { Authorization: auth } : undefined,
    });
    if (res.ok) return parseResponse(res, []);
    const err = await toHttpError(res);
    if (res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }
  throw lastRouteErr || new Error("Submission cycle list endpoint not found.");
}

export async function fetchSubmissionCycleById(id, { signal } = {}) {
  const safeId = encodeURIComponent(String(id ?? "").trim());
  if (!safeId) throw new Error("Submission cycle id is required.");
  const auth = getAuthHeader();
  const endpoints = [
    `/api/v1/get-submission-cycle/${safeId}`,
    `/monthly-submissions/cycles/${safeId}`,
  ];
  let lastRouteErr = null;
  for (const endpoint of endpoints) {
    const res = await fetch(buildApiUrl(endpoint), {
      signal,
      credentials: "include",
      headers: auth ? { Authorization: auth } : undefined,
    });
    if (res.ok) return parseResponse(res, {});
    const err = await toHttpError(res);
    if (res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }
  throw lastRouteErr || new Error("Submission cycle get-by-id endpoint not found.");
}

export async function fetchSubmissionCycleByKey({ cycleKey, scope = null, signal } = {}) {
  const key = String(cycleKey ?? "").trim();
  if (!key) throw new Error("cycleKey is required.");
  const auth = getAuthHeader();
  const qs = new URLSearchParams();
  qs.set("cycleKey", key);
  if (scope != null && String(scope).trim()) qs.set("scope", String(scope).trim());
  const endpoints = [`/api/v1/get-submission-cycle?${qs.toString()}`];
  let lastRouteErr = null;
  for (const endpoint of endpoints) {
    const res = await fetch(buildApiUrl(endpoint), {
      signal,
      credentials: "include",
      headers: auth ? { Authorization: auth } : undefined,
    });
    if (res.ok) return parseResponse(res, {});
    const err = await toHttpError(res);
    if (res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }
  throw lastRouteErr || new Error("Submission cycle get-by-key endpoint not found.");
}

export async function addSubmissionCycle(payload, { signal } = {}) {
  const auth = getAuthHeader();
  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });
  const endpoints = ["/api/v1/add-submission-cycle"];
  let lastRouteErr = null;
  for (const endpoint of endpoints) {
    const res = await fetch(buildApiUrl(endpoint), {
      method: "POST",
      signal,
      credentials: "include",
      headers,
      body: JSON.stringify(payload ?? {}),
    });
    if (res.ok) return parseResponse(res, {});
    const err = await toHttpError(res);
    if (res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }
  throw lastRouteErr || new Error("Submission cycle add endpoint not found.");
}

export async function updateSubmissionCycle(payload, { signal } = {}) {
  const bodyPayload = payload && typeof payload === "object" ? payload : {};
  const idRaw = bodyPayload.id ?? bodyPayload.submissionCycleId ?? bodyPayload.cycleId ?? null;
  const safeId = encodeURIComponent(String(idRaw ?? "").trim());
  const auth = getAuthHeader();
  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });
  const endpoints = [
    { method: "PUT", path: "/api/v1/update-submission-cycle" },
    { method: "POST", path: "/api/v1/update-submission-cycle" },
  ];
  if (safeId) {
    endpoints.unshift(
      { method: "PUT", path: `/api/v1/update-submission-cycle/${safeId}` },
      { method: "PATCH", path: `/api/v1/update-submission-cycle/${safeId}` },
      { method: "POST", path: `/api/v1/update-submission-cycle/${safeId}` },
      { method: "PUT", path: `/api/v1/edit-submission-cycle/${safeId}` },
      { method: "PATCH", path: `/api/v1/edit-submission-cycle/${safeId}` },
      { method: "POST", path: `/api/v1/edit-submission-cycle/${safeId}` },
    );
  }

  let lastRouteErr = null;
  for (const endpoint of endpoints) {
    const res = await fetch(buildApiUrl(endpoint.path), {
      method: endpoint.method,
      signal,
      credentials: "include",
      headers,
      body: JSON.stringify(bodyPayload),
    });
    if (res.ok) return parseResponse(res, {});
    const err = await toHttpError(res);
    if (res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }
  throw lastRouteErr || new Error("Submission cycle update endpoint not found.");
}

export async function deleteSubmissionCycle(id, { signal } = {}) {
  const safeId = encodeURIComponent(String(id ?? "").trim());
  if (!safeId) throw new Error("Submission cycle id is required.");
  const auth = getAuthHeader();
  const headers = withCsrfHeaders(auth ? { Authorization: auth } : undefined);
  const endpoints = [`/api/v1/delete-submission-cycle/${safeId}`];
  let lastRouteErr = null;
  for (const endpoint of endpoints) {
    const res = await fetch(buildApiUrl(endpoint), {
      method: "DELETE",
      signal,
      credentials: "include",
      headers,
    });
    if (res.ok) return parseResponse(res, true);
    const err = await toHttpError(res);
    if (res.status === 404 || res.status === 405) {
      lastRouteErr = err;
      continue;
    }
    throw err;
  }
  throw lastRouteErr || new Error("Submission cycle delete endpoint not found.");
}

export async function submitAdminReviewDecision(payload, { signal } = {}) {
  const auth = getAuthHeader();
  const preparedPayload = toRequestPayload(payload);
  const baseHeaders = {
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  };
  const endpoints = [
    "/api/v1/monthly-submissions/admin/review",
    "/api/v1/monthly-submissions/admin/reviews",
    "/api/v1/monthly-submissions/admin/decision",
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
