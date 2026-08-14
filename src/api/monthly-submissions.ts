// @ts-nocheck
import type { ApiOptions } from "../types/api-options";
import { sanitizeEmployeeIdForApi } from "../utils/employeeId";
import { getAuthHeader } from "./auth";
import { buildApiUrl, ensureCsrfCookie, parseResponse, requestWithFallbacks, toHttpError, withCsrfHeaders } from "./http";
import { buildCycleMeta, formatYearMonth as formatYearMonthFromCycle, normalizeCycleKey, normalizeYearMonth, resolveSubmissionCycleKey } from "../utils/reviewCycles";

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

function pickNumericRating(...candidates) {
  for (const candidate of candidates) {
    if (candidate == null || candidate === "") continue;
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === "string") {
      const parsed = Number.parseFloat(candidate);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function pickKpiItemRating(item) {
  if (!item || typeof item !== "object") return null;
  return pickNumericRating(
    item.rating,
    item.kpiRating,
    item.score,
    typeof item.value !== "object" ? item.value : null
  );
}

function pickValueItemRating(item) {
  if (!item || typeof item !== "object") return null;
  return pickNumericRating(
    item.rating,
    item.valueRating,
    item.score,
    typeof item.value !== "object" ? item.value : null
  );
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
        const rating = pickValueItemRating(item);
        assign(id, rating, null);
        continue;
      }
      assign(item, null, null);
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
        const rating = pickKpiItemRating(item);
        assign(id, rating, null);
        continue;
      }
      assign(item, null, null);
    }
  }

  return out;
}

function resolveSubmissionPayloadRoots(source) {
  if (!source || typeof source !== "object") {
    return { raw: {}, payload: {}, submission: null };
  }
  const raw = source.raw && typeof source.raw === "object" ? source.raw : source;
  const submission = source.payload && typeof source.payload === "object" ? source.payload : null;
  const nestedPayload = raw.payload && typeof raw.payload === "object" ? raw.payload : null;
  let parsedPayload = null;
  const payloadJson = raw.payloadJson ?? source.payloadJson;
  if (typeof payloadJson === "string" && payloadJson.trim()) {
    try {
      parsedPayload = JSON.parse(payloadJson);
    } catch {
      parsedPayload = null;
    }
  }
  const payload = submission ?? nestedPayload ?? parsedPayload ?? raw;
  return { raw, payload, submission };
}

export function resolveSubmissionKpiRatings(source) {
  const { raw, payload, submission } = resolveSubmissionPayloadRoots(source);
  return normalizeKpiRatings(
    submission?.kpiRatings ??
      payload?.kpiRatings ??
      payload?.kpis ??
      payload?.kpiSelfRatings ??
      raw?.kpiRatings ??
      raw?.kpis ??
      raw?.kpiSelfRatings
  );
}

export function resolveSubmissionValueRatings(source) {
  const { raw, payload, submission } = resolveSubmissionPayloadRoots(source);
  const rawValues = Array.isArray(payload?.webknotValues ?? payload?.values)
    ? (payload?.webknotValues ?? payload?.values)
    : Array.isArray(submission?.webknotValues)
      ? submission.webknotValues
      : [];
  return normalizeWebknotValueRatings(
    submission?.webknotValueRatings ??
      payload?.webknotValueRatings ??
      payload?.valuesRatings ??
      payload?.valueRatings ??
      rawValues ??
      raw?.webknotValueRatings ??
      raw?.valuesRatings ??
      raw?.valueRatings
  );
}

export function resolveManagerKpiRatings(source) {
  const { raw, payload, submission } = resolveSubmissionPayloadRoots(source);
  const managerEval =
    submission?.managerEvaluation ??
    payload?.managerEvaluation ??
    raw?.managerEvaluation ??
    null;
  return normalizeKpiRatings(
    managerEval?.kpiRatings ?? payload?.managerKpiRatings ?? raw?.managerKpiRatings
  );
}

export function resolveManagerValueRatings(source) {
  const { raw, payload, submission } = resolveSubmissionPayloadRoots(source);
  const managerEval =
    submission?.managerEvaluation ??
    payload?.managerEvaluation ??
    raw?.managerEvaluation ??
    null;
  return normalizeWebknotValueRatings(
    managerEval?.webknotValueRatings ??
      managerEval?.webknotValues ??
      payload?.managerWebknotValueRatings ??
      raw?.managerWebknotValueRatings
  );
}

export function resolveSubmissionValueComments(source) {
  const { raw, payload, submission } = resolveSubmissionPayloadRoots(source);
  const direct =
    submission?.webknotValueComments ??
    payload?.webknotValueComments ??
    raw?.webknotValueComments;
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    const out = {};
    for (const [key, value] of Object.entries(direct)) {
      const id = String(key || "").trim();
      const comment = String(value ?? "").trim();
      if (id && comment) out[id] = comment;
    }
    if (Object.keys(out).length) return out;
  }

  const responses =
    submission?.webknotValueResponses ??
    payload?.webknotValueResponses ??
    raw?.webknotValueResponses;
  const out = {};
  if (Array.isArray(responses)) {
    for (const item of responses) {
      if (!item || typeof item !== "object") continue;
      const id = String(item.valueId ?? item.webknotValueId ?? item.id ?? "").trim();
      const comment = String(item.comment ?? item.valueComment ?? item.note ?? "").trim();
      if (id && comment) out[id] = comment;
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
  const normalizedValueComments =
    source.webknotValueComments && typeof source.webknotValueComments === "object"
      ? source.webknotValueComments
      : {};
  const responseCommentsById = new Map();
  if (Array.isArray(source.webknotValueResponses)) {
    for (const item of source.webknotValueResponses) {
      if (!item || typeof item !== "object") continue;
      const id = String(item.valueId ?? item.webknotValueId ?? item.id ?? "").trim();
      const comment = String(item.comment ?? item.valueComment ?? "").trim();
      if (id && comment) responseCommentsById.set(id, comment);
    }
  }
  const valuePairs = Object.entries(normalizedValues);
  next.webknotValues = valuePairs.map(([valueId]) => String(valueId || "").trim());
  next.webknotValueRatings = Object.fromEntries(valuePairs);
  next.webknotValueResponses = valuePairs.map(([valueId, rating]) => {
    const id = String(valueId || "").trim();
    const comment = String(normalizedValueComments?.[id] ?? responseCommentsById.get(id) ?? "").trim() || undefined;
    return {
      valueId: id,
      webknotValueId: id,
      rating,
      ...(comment ? { comment } : {}),
    };
  });
  const commentsOut = {};
  for (const [valueId] of valuePairs) {
    const id = String(valueId || "").trim();
    const comment = String(normalizedValueComments?.[id] ?? responseCommentsById.get(id) ?? "").trim();
    if (comment) commentsOut[id] = comment;
  }
  if (Object.keys(commentsOut).length) next.webknotValueComments = commentsOut;
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
  if (Array.isArray(source.projectIds) && source.projectIds.length) {
    next.projectIds = source.projectIds
      .map((id) => String(id || "").trim())
      .filter(Boolean);
  }

  return next;
}

export function normalizeMonthlySubmission(data) {
  if (!data || typeof data !== "object") return null;
  const obj =
    data?.data && typeof data.data === "object" && !Array.isArray(data.data)
      ? data.data
      : data;

  const id = obj.submissionId ?? obj.id ?? null;
  const month = normalizeYearMonth(obj.month ?? obj.monthKey ?? obj.submissionMonth) || null;
  const status = typeof obj.status === "string" ? obj.status : null;

  let parsedPayloadJson = null;
  if (typeof obj.payloadJson === "string" && obj.payloadJson.trim()) {
    try {
      parsedPayloadJson = JSON.parse(obj.payloadJson);
    } catch {
      parsedPayloadJson = null;
    }
  }
  const payload =
    (obj.payload && typeof obj.payload === "object" ? obj.payload : null) ??
    parsedPayloadJson ??
    obj;
  if (obj.managerReviewJson && typeof obj.managerReviewJson === "string") {
    try {
      const mgr = JSON.parse(obj.managerReviewJson);
      if (mgr && typeof mgr === "object") {
        const hasManagerSubmit = Boolean(
          obj.managerSubmittedAt ?? payload?.managerSubmittedAt
        );
        if (hasManagerSubmit) {
          if (mgr.managerEvaluation) payload.managerEvaluation = mgr.managerEvaluation;
          if (mgr.managerReview) payload.managerReview = mgr.managerReview;
        } else {
          payload.managerEvaluation = payload.managerEvaluation ?? mgr.managerEvaluation;
          payload.managerReview = payload.managerReview ?? mgr.managerReview;
        }
      }
    } catch {
      /* ignore */
    }
  }
  const serverReviewStatusUpper = String(obj?.reviewStatus ?? status ?? "").trim().toUpperCase();
  const serverReopenedForResubmission = Boolean(obj?.reopenedForResubmission);
  if (obj.adminReviewJson && typeof obj.adminReviewJson === "string") {
    try {
      const adm = JSON.parse(obj.adminReviewJson);
      if (adm && typeof adm === "object") {
        if (adm.adminReview && typeof adm.adminReview === "object") {
          payload.adminReview = payload.adminReview ?? adm.adminReview;
        } else if (adm.action) {
          payload.adminReview = payload.adminReview ?? adm;
        }
        if (adm.reopenedForResubmission != null) {
          payload.reopenedForResubmission = adm.reopenedForResubmission;
        }
      }
    } catch {
      /* ignore */
    }
  }
  const selfReviewText = String(
    payload.selfReviewText ??
    payload.selfReview ??
    payload.reviewText ??
    payload.employeeComment ??
    obj.employeeComment ??
    ""
  ).trim();
  const rawWebknotValues = Array.isArray(payload.webknotValues ?? payload.values)
    ? (payload.webknotValues ?? payload.values)
    : [];
  const webknotValueRatings = resolveSubmissionValueRatings({ raw: obj, payload });
  const webknotValueComments = resolveSubmissionValueComments({ raw: obj, payload });
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
  const kpiRatings = resolveSubmissionKpiRatings({ raw: obj, payload });
  const techShowcase = String(
    payload?.techShowcase ?? payload?.techShowcaseNotes ?? obj?.techShowcase ?? ""
  ).trim();
  const projectIds = Array.from(
    new Set(
      [
        ...(Array.isArray(payload?.projectIds) ? payload.projectIds : []),
        ...(Array.isArray(obj?.selectedProjectIds) ? obj.selectedProjectIds : []),
        ...(Array.isArray(obj?.projectIds) ? obj.projectIds : []),
      ]
        .map((id) => String(id ?? "").trim())
        .filter(Boolean),
    ),
  );

  const submittedAt = obj.submittedAt ?? obj.submittedOn ?? obj.employeeSubmittedAt ?? null;
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
  const reviewStatusRaw = obj?.reviewStatus ?? status ?? payload?.reviewStatus ?? "";
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
    obj?.managerSelfReviewEvalComments ??
    payload?.managerComments ??
    payload?.managerNotes ??
    payload?.managerComment ??
    obj?.managerComment ??
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
  const rawManagerAction = String(managerReview?.action ?? "").trim().toUpperCase();
  const rawAdminAction = String(adminReview?.action ?? "").trim().toUpperCase();
  /* Fresh employee resubmit: server reviewStatus is SUBMITTED again but stale reject
     objects may still be attached from the prior cycle. Never treat NEEDS_REVIEW /
     reopened rows as stale — payloadJson often still says SUBMITTED. */
  const isResubmittedStatus =
    serverReviewStatusUpper === "SUBMITTED" &&
    statusUpper === "SUBMITTED" &&
    !serverReopenedForResubmission &&
    serverReviewStatusUpper !== "NEEDS_REVIEW" &&
    (rawManagerAction === "REJECT" || rawAdminAction === "REJECT");
  const effectiveReviewStatus = isResubmittedStatus ? "SUBMITTED" : reviewStatus;
  const effectiveReviewStatusUpper = String(effectiveReviewStatus || "").toUpperCase();
  const clearedManagerSubmittedAt = isResubmittedStatus ? null : managerSubmittedAt;
  const effectiveManagerReview =
    isResubmittedStatus && rawManagerAction === "REJECT" ? null : managerReview;
  const effectiveAdminReview =
    isResubmittedStatus && rawAdminAction === "REJECT" ? null : adminReview;
  const effectiveManagerEvaluation = isResubmittedStatus ? null : managerEvaluation;
  const effectiveAdminEvaluation = isResubmittedStatus ? null : adminEvaluation;

  const managerAction = String(effectiveManagerReview?.action ?? "").trim().toUpperCase();
  const adminAction = String(effectiveAdminReview?.action ?? "").trim().toUpperCase();
  const needsManagerRework = effectiveReviewStatusUpper === "NEEDS_MANAGER_REVIEW";
  const reopenedForResubmission = Boolean(
    isResubmittedStatus
      ? false
      : (serverReopenedForResubmission ||
          obj?.reopenedForResubmission ||
          payload?.reopenedForResubmission ||
          effectiveReviewStatusUpper === "NEEDS_REVIEW")
  );
  const resubmissionRequested = Boolean(
    !needsManagerRework &&
    (reopenedForResubmission ||
      effectiveReviewStatusUpper === "NEEDS_REVIEW" ||
      effectiveReviewStatusUpper === "REJECT" ||
      managerAction === "REJECT" ||
      adminAction === "REJECT")
  );

  const managerSubmitted =
    Boolean(clearedManagerSubmittedAt) && !resubmissionRequested && !needsManagerRework;
  const employeeId =
    String(
      subjectEmployeeId ??
      obj?.userId ??
      payload?.employeeId ??
      obj?.employeeId ??
      ""
    ).trim() || null;
  const empId =
    String(obj?.empId ?? payload?.subjectEmployeeId ?? subjectEmployeeId ?? "").trim() || null;
  const userId = obj?.userId == null ? null : String(obj.userId);
  const finalScore = toFiniteNumberOrNull(obj?.finalScore);

  return {
    id: id == null ? null : String(id),
    month: month ? String(month) : null,
    status: status ? String(status) : null,
    submissionType,
    targetRole,
    subjectEmployeeId,
    employeeId,
    empId,
    userId,
    finalScore,
    cycleKey:
      resolveSubmissionCycleKey({
        month,
        cycleKey: payload?.cycleKey ?? obj?.cycleKey,
      }) ||
      cycleMeta.cycleKey ||
      null,
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
    webknotValueComments,
    recognitionsCount,
    techShowcase,
    projectIds,
    submittedAt: submittedAt ? String(submittedAt) : null,
    updatedAt: updatedAt ? String(updatedAt) : null,
    raw: obj,
  };
}

export async function saveMonthlyDraft(payload, { signal } = {} as ApiOptions) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const auth = getAuthHeader();
  const prepared = toRequestPayload(payload);
  await ensureCsrfCookie({ signal });
  const res = await fetch(buildApiUrl("/api/v1/monthly-submissions/draft"), {
    method: "PUT",
    signal,
    credentials: "include",
    headers: withCsrfHeaders({
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    }),
    body: JSON.stringify({
      month: prepared.month ?? prepared.monthKey,
      submissionType: prepared.submissionType || "EMPLOYEE_MONTHLY_SUBMISSION",
      payloadJson: JSON.stringify(prepared),
    }),
  });
  if (!res.ok) throw await toHttpError(res);
  const raw = await parseResponse(res, {});
  return normalizeMonthlySubmission(raw) ?? raw;
}

/** Path under `/api/v1/submission-cycles/...` for monthly submission pairs (create + list). */
export function submissionCycleMonthlySubmissionsPath(cycleKey, employeeId) {
  const ck = String(cycleKey ?? "").trim();
  const id = sanitizeEmployeeIdForApi(employeeId);
  if (!ck || !id) return "";
  return `/api/v1/submission-cycles/${encodeURIComponent(ck)}/employees/${encodeURIComponent(id)}/monthly-submissions`;
}

function unwrapGenericArray(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "object") return [];
  const root = raw.data !== undefined ? raw.data : raw;
  if (Array.isArray(root)) return root;
  if (Array.isArray(root?.data)) return root.data;
  if (Array.isArray(root?.items)) return root.items;
  if (Array.isArray(root?.results)) return root.results;
  if (Array.isArray(root?.content)) return root.content;
  return [];
}

function unwrapGenericPage(raw) {
  const root = raw && typeof raw === "object" && raw.data !== undefined ? raw.data : raw;
  const items = unwrapGenericArray(raw);
  const totalRaw =
    root?.totalElements ??
    root?.totalElement ??
    root?.total ??
    raw?.totalElements ??
    raw?.totalElement ??
    null;
  const total = Number.isFinite(Number(totalRaw)) ? Number(totalRaw) : items.length;
  return { items, total, raw: root ?? raw };
}

function resolveCycleKey({ month, cycleKey } = {} as ApiOptions) {
  const fromKey = normalizeCycleKey(cycleKey);
  if (fromKey) return fromKey;
  const monthKey = normalizeYearMonth(month) || String(month ?? "").trim();
  if (monthKey) {
    const meta = buildCycleMeta(monthKey);
    return String(meta?.cycleKey ?? "").trim() || null;
  }
  return null;
}

function toFiniteNumberOrNull(...values) {
  for (const value of values) {
    if (value == null || value === "") continue;
    const num = typeof value === "number" ? value : Number.parseFloat(String(value));
    if (Number.isFinite(num)) return Math.round(num * 10) / 10;
  }
  return null;
}

function toMonthlySubmissionDtoPayload(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const prepared = toRequestPayload(source);
  const submissionMonth =
    normalizeYearMonth(source.submissionMonth ?? prepared.month ?? prepared.monthKey ?? source.monthKey ?? source.month) ||
    String(source.submissionMonth ?? prepared.month ?? prepared.monthKey ?? "").trim();
  const managerReview = source.managerReview && typeof source.managerReview === "object" ? source.managerReview : {};
  const adminReview = source.adminReview && typeof source.adminReview === "object" ? source.adminReview : {};
  const managerEvaluation = source.managerEvaluation && typeof source.managerEvaluation === "object" ? source.managerEvaluation : {};
  const submittedAt = String(source.employeeSubmittedAt ?? source.submittedAt ?? "").trim() || new Date().toISOString();
  const reviewSubmittedAt = String(
    source.managerSubmittedAt ??
    source.managerReviewedAt ??
    managerReview.reviewedAt ??
    adminReview.reviewedAt ??
    ""
  ).trim();
  return {
    managerId: source.managerId != null && source.managerId !== "" ? Number(source.managerId) : null,
    submissionMonth,
    employeeScore: toFiniteNumberOrNull(source.employeeScore, source.weightedScore, source.score, source.selfScore),
    managerScore: toFiniteNumberOrNull(source.managerScore, managerEvaluation.score, source.managerWeightedScore),
    employeeComment: String(source.employeeComment ?? prepared.selfReviewText ?? source.selfReviewText ?? "").trim(),
    managerComment: String(source.managerComment ?? managerReview.comments ?? adminReview.comments ?? managerEvaluation.comments ?? "").trim(),
    employeeSubmittedAt: submittedAt,
    managerSubmittedAt: reviewSubmittedAt || (source.managerReview || source.adminReview ? new Date().toISOString() : null),
  };
}

function submissionMonthKey(item) {
  return (
    normalizeYearMonth(item?.month ?? item?.monthKey ?? item?.submissionMonth) ||
    String(item?.month ?? item?.monthKey ?? "").trim()
  );
}

function filterSubmissionsByMonth(items, monthKey) {
  if (!monthKey || !Array.isArray(items)) return items;
  return items.filter((item) => submissionMonthKey(item) === monthKey);
}

function paginateSubmissionItems(items, page, size) {
  const safePage = Math.max(Number.parseInt(String(page ?? 0), 10) || 0, 0);
  const safeSize = Math.max(Number.parseInt(String(size ?? 200), 10) || 200, 1);
  const start = safePage * safeSize;
  return {
    items: items.slice(start, start + safeSize),
    total: items.length,
  };
}

function isMissingRouteStatus(status) {
  return status === 404 || status === 405 || status === 400;
}

async function fetchAdminMonthlySubmissionsPage({ month, cycleKey, employeeId, page = 0, size = 200, signal } = {} as ApiOptions) {
  const auth = getAuthHeader();
  const monthKey = normalizeYearMonth(month) || String(month ?? "").trim();
  const ck = resolveCycleKey({ month, cycleKey });
  const empFilter = sanitizeEmployeeIdForApi(employeeId);
  const safePage = Math.max(Number.parseInt(String(page ?? 0), 10) || 0, 0);
  const safeSize = Math.max(Number.parseInt(String(size ?? 200), 10) || 200, 1);

  // Paginated admin route (Render / legacy Pulse APIs).
  const legacyQs = new URLSearchParams();
  if (monthKey) legacyQs.set("month", monthKey);
  else if (ck) legacyQs.set("cycleKey", ck);
  if (empFilter) legacyQs.set("employeeId", empFilter);
  legacyQs.set("page", String(safePage));
  legacyQs.set("size", String(safeSize));

  for (const path of [`/api/v1/admin/monthly-submissions?${legacyQs.toString()}`]) {
    const res = await fetch(buildApiUrl(path), {
      signal,
      credentials: "include",
      headers: auth ? { Authorization: auth } : undefined,
    });
    if (res.ok) {
      const raw = await parseResponse(res, {});
      return unwrapGenericPage(raw);
    }
    if (isMissingRouteStatus(res.status)) continue;
    throw await toHttpError(res, { method: "GET", path });
  }

  // Java webtrak: GET /monthly-submissions requires employeeId; admin roster uses /all.
  const javaPaths = empFilter
    ? [`/api/v1/monthly-submissions?employeeId=${encodeURIComponent(empFilter)}`]
    : ["/api/v1/monthly-submissions/all"];

  for (const path of javaPaths) {
    const res = await fetch(buildApiUrl(path), {
      signal,
      credentials: "include",
      headers: auth ? { Authorization: auth } : undefined,
    });
    if (!res.ok) {
      if (isMissingRouteStatus(res.status)) continue;
      throw await toHttpError(res, { method: "GET", path });
    }

    const raw = await parseResponse(res, {});
    let items = unwrapGenericArray(raw)
      .map((row) => normalizeMonthlySubmission(row))
      .filter(Boolean);
    items = filterSubmissionsByMonth(items, monthKey);
    const paged = paginateSubmissionItems(items, safePage, safeSize);
    return { ...paged, raw: raw?.data ?? raw };
  }

  return { items: [], total: 0, raw: null };
}

function pickSubmissionRowForMonth(list, monthKey) {
  const wanted = String(monthKey ?? "").trim();
  if (!wanted || !Array.isArray(list)) return null;
  return (
    list.find(
      (x) =>
        x &&
        (String(x.month ?? x.monthKey ?? x.cycleMonth ?? "").trim() === wanted ||
          String(x.monthKey ?? "").trim() === wanted)
    ) ?? null
  );
}

/** Resolve numeric monthly-submission id from a manager team row or review payload. */
export function resolveSubmissionIdFromRow(source) {
  if (!source || typeof source !== "object") return "";
  const candidates = [
    source.submissionId,
    source.id,
    source.submissionID,
    source.raw?.submissionId,
    source.raw?.id,
    source.raw?.submissionID,
    source.payload?.submissionId,
    source.payload?.id,
  ];
  for (const candidate of candidates) {
    const text = String(candidate ?? "").trim();
    if (text && /^\d+$/.test(text)) return text;
  }
  return "";
}

async function resolveManagerReviewSubmissionId(payload, { signal } = {} as ApiOptions) {
  const direct = resolveSubmissionIdFromRow(payload);
  if (direct) return direct;

  const employeeId = String(payload?.subjectEmployeeId ?? payload?.employeeId ?? "").trim();
  const monthKey = normalizeYearMonth(payload?.monthKey ?? payload?.month) || String(payload?.month ?? "").trim();
  const uid = sanitizeEmployeeIdForApi(employeeId);
  if (!uid || !/^\d+$/.test(uid) || !monthKey) return "";

  const auth = getAuthHeader();
  const qs = new URLSearchParams();
  qs.set("month", monthKey);
  qs.set("submissionType", String(payload?.submissionType ?? "EMPLOYEE_MONTHLY_SUBMISSION").trim() || "EMPLOYEE_MONTHLY_SUBMISSION");
  const res = await fetch(buildApiUrl(`/api/v1/monthly-submissions/user/${encodeURIComponent(uid)}?${qs.toString()}`), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) return "";
  const raw = await res.json().catch(() => ({}));
  const list = unwrapGenericArray(raw);
  const picked = pickSubmissionRowForMonth(list, monthKey);
  return resolveSubmissionIdFromRow(picked ?? list[0] ?? null);
}

export async function submitMonthlySubmission(payload, { signal } = {} as ApiOptions) {
  const auth = getAuthHeader();
  const preparedPayload = toRequestPayload(payload);
  await ensureCsrfCookie({
    signal,
    headers: auth ? { Authorization: auth } : undefined,
  });
  const baseHeaders = {
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  };

  const actorRole = String(payload?.actorRole ?? "").trim().toUpperCase();
  const targetRole = String(payload?.targetRole ?? "").trim().toUpperCase();
  const hasManagerReview = Boolean(payload?.managerReview || payload?.managerEvaluation || payload?.managerSubmittedAt);
  const wantsManagerReviewEndpoint =
    actorRole === "MANAGER" && targetRole === "EMPLOYEE" && hasManagerReview;

  let submissionId = resolveSubmissionIdFromRow(payload);
  if (!submissionId && wantsManagerReviewEndpoint) {
    submissionId = await resolveManagerReviewSubmissionId(payload, { signal });
  }

  const isManagerEmployeeReview = wantsManagerReviewEndpoint && Boolean(submissionId);

  const requestCandidates = isManagerEmployeeReview
    ? [
        {
          method: "PUT",
          path: `/api/v1/monthly-submissions/${encodeURIComponent(submissionId)}/manager-review`,
          payload: {
            managerReviewJson: JSON.stringify({
              managerEvaluation: payload.managerEvaluation,
              managerReview: payload.managerReview,
              reviewStatus: payload.reviewStatus,
            }),
            reviewStatus: String(payload.reviewStatus ?? "").trim() || undefined,
            managerSelfReviewEvalComments: String(
              payload.managerComments ?? payload.managerNotes ?? payload.managerReview?.comments ?? ""
            ).trim() || undefined,
          },
        },
      ]
    : [
        {
          method: "POST",
          path: "/api/v1/monthly-submissions/self",
          payload: {
            month: preparedPayload.month ?? preparedPayload.monthKey,
            submissionType: preparedPayload.submissionType || "EMPLOYEE_MONTHLY_SUBMISSION",
            payloadJson: JSON.stringify(preparedPayload),
          },
        },
      ];

  async function attempt(candidate) {
    const { method, path } = candidate;
    return fetch(buildApiUrl(path), {
      method,
      signal,
      credentials: "include",
      headers: withCsrfHeaders(baseHeaders),
      body: JSON.stringify(candidate.payload ?? preparedPayload),
    });
  }

  let lastErr = null;
  for (const candidate of requestCandidates) {
    let res = await attempt(candidate).catch((err) => {
      lastErr = err;
      return null;
    });
    if (!res) continue;

    if (!res.ok && (res.status === 403 || res.status === 401)) {
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
  if (wantsManagerReviewEndpoint && !submissionId) {
    throw new Error("Could not resolve submission id for manager review. Refresh the page and try again.");
  }
  throw new Error("Monthly submission endpoint not found.");
}

export async function fetchMyMonthlySubmission({ month, employeeId, signal } = {} as ApiOptions) {
  const auth = getAuthHeader();
  const monthKey = normalizeYearMonth(month) || String(month ?? "").trim();
  const qs = new URLSearchParams();
  if (monthKey) qs.set("month", monthKey);
  qs.set("submissionType", "EMPLOYEE_MONTHLY_SUBMISSION");
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  const paths = [`/api/v1/monthly-submissions/me${suffix}`];
  if (employeeId) {
    const uid = sanitizeEmployeeIdForApi(employeeId);
    if (uid && /^\d+$/.test(uid)) {
      paths.push(`/api/v1/monthly-submissions/user/${encodeURIComponent(uid)}${suffix}`);
    }
  }

  for (const path of paths) {
    const res = await fetch(buildApiUrl(path), {
      signal,
      credentials: "include",
      headers: auth ? { Authorization: auth } : undefined,
    });
    if (res.ok) {
      const raw = await res.json().catch(() => ({}));
      const list = unwrapGenericArray(raw);
      const picked = pickSubmissionRowForMonth(list, monthKey);
      return picked ?? (list[0] ?? null);
    }
    if (res.status !== 404 && res.status !== 405) {
      throw await toHttpError(res);
    }
  }

  return null;
}

export async function fetchMyMonthlySubmissionHistory({ signal } = {} as ApiOptions) {
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl("/api/v1/monthly-submissions/me/history"), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (res.ok) {
    const raw = await parseResponse(res, {});
    return unwrapGenericArray(raw).map((row) => normalizeMonthlySubmission(row)).filter(Boolean);
  }
  if (res.status === 404 || res.status === 405) return [];
  throw await toHttpError(res);
}

export async function fetchManagerTeamSubmissions({ month, status, limit = null, cursor = null, signal } = {} as ApiOptions) {
  const auth = getAuthHeader();
  const monthKey = normalizeYearMonth(month) || String(month ?? "").trim();
  const qs = monthKey ? `?month=${encodeURIComponent(monthKey)}` : "";
  let items = [];
  try {
    const res = await fetch(buildApiUrl(`/api/v1/monthly-submissions/manager/team${qs}`), {
      signal,
      credentials: "include",
      headers: auth ? { Authorization: auth } : undefined,
    });
    if (res.ok) {
      const raw = await parseResponse(res, {});
      items = unwrapGenericArray(raw);
    } else if (res.status !== 403 && res.status !== 404) {
      throw await toHttpError(res);
    }
  } catch (err) {
    if (err?.status !== 403 && err?.status !== 404) throw err;
  }
  if (!items.length) {
    const page = await fetchAdminMonthlySubmissionsPage({
      month,
      page: cursor ? Number.parseInt(String(cursor), 10) || 0 : 0,
      size: limit ?? 100,
      signal,
    });
    items = page.items;
  }
  const page = { items, total: items.length };
  const wantedStatus = String(status ?? "").trim().toUpperCase();
  const filtered = wantedStatus
    ? page.items.filter((item) => {
        const normalized = normalizeMonthlySubmission(item);
        const value = String(normalized?.reviewStatus ?? normalized?.status ?? item?.status ?? "").trim().toUpperCase();
        return value === wantedStatus;
      })
    : page.items;
  return { data: filtered, items: filtered, content: filtered, totalElements: page.total };
}

export async function fetchAdminAllSubmissions({ month, status, signal } = {} as ApiOptions) {
  const pageSize = 500;
  const maxPages = 40;
  const allItems = [];

  for (let page = 0; page < maxPages; page += 1) {
    const pageResult = await fetchAdminMonthlySubmissionsPage({
      month,
      page,
      size: pageSize,
      signal,
    });
    const batch = Array.isArray(pageResult?.items) ? pageResult.items : [];
    allItems.push(...batch);

    const total = Number.isFinite(Number(pageResult?.total)) ? Number(pageResult.total) : null;
    if (batch.length < pageSize) break;
    if (total != null && allItems.length >= total) break;
  }

  const wantedStatus = String(status ?? "").trim().toUpperCase();
  if (!wantedStatus) return allItems;
  return allItems.filter((item) => {
    const normalized = normalizeMonthlySubmission(item);
    const value = String(
      normalized?.reviewStatus ??
      normalized?.status ??
      item?.reviewStatus ??
      item?.status ??
      ""
    ).trim().toUpperCase();
    return value === wantedStatus;
  });
}

/** Manager/admin self-reviews routed to the selected super admin reviewer for the cycle month. */
export async function fetchAssignedManagerSelfReviews(month, reviewerId, { signal } = {} as ApiOptions) {
  const reviewerKey = String(reviewerId ?? "").trim();
  if (!reviewerKey) return [];
  const { resolveReviewingSuperAdminIds } = await import("../utils/reviewCycles");
  const items = await fetchAdminAllSubmissions({ month, signal });
  return items.filter((item) => {
    const normalized = normalizeMonthlySubmission(item);
    const type = String(normalized?.submissionType ?? item?.submissionType ?? "").trim().toUpperCase();
    if (!type.includes("MANAGER_SELF")) return false;
    const assignedIds = resolveReviewingSuperAdminIds(normalized ?? item);
    return assignedIds.includes(reviewerKey);
  });
}

/** Super admin saves manager-style scores and comments on a manager self review. */
export async function submitSuperAdminManagerSelfEval(
  {
    submissionId,
    kpiRatings = {},
    webknotValueRatings = {},
    comments = "",
    reviewedBy = null,
    reviewStatus = "MANAGER_SUBMITTED",
  },
  { signal } = {} as ApiOptions,
) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const id = String(submissionId ?? "").trim();
  if (!id) throw new Error("submissionId is required.");

  const auth = getAuthHeader();
  await ensureCsrfCookie({
    signal,
    headers: auth ? { Authorization: auth } : undefined,
  });
  const reviewedAt = new Date().toISOString();
  const trimmedComments = String(comments || "").trim();
  const managerReviewJson = JSON.stringify({
    managerEvaluation: {
      kpiRatings,
      webknotValueRatings,
      comments: trimmedComments,
      reviewedAt,
      reviewedBy,
    },
    managerReview: {
      action: "SUBMIT",
      comments: trimmedComments,
      reviewedAt,
      reviewedBy,
    },
    reviewStatus,
  });
  const body = {
    managerReviewJson,
    managerSelfReviewEvalComments: trimmedComments || undefined,
    managerSelfReviewEvalStatus: "SUBMITTED",
    reviewStatus,
  };
  const baseHeaders = {
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  };
  const path = `/api/v1/monthly-submissions/${encodeURIComponent(id)}/manager-review`;

  let res = await fetch(buildApiUrl(path), {
    method: "PUT",
    signal,
    credentials: "include",
    headers: withCsrfHeaders(baseHeaders),
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status === 403) {
    await ensureCsrfCookie({
      signal,
      headers: auth ? { Authorization: auth } : undefined,
      forceRefresh: true,
    });
    res = await fetch(buildApiUrl(path), {
      method: "PUT",
      signal,
      credentials: "include",
      headers: withCsrfHeaders(baseHeaders),
      body: JSON.stringify(body),
    });
  }
  if (!res.ok) throw await toHttpError(res);
  const raw = await parseResponse(res, {});
  return normalizeMonthlySubmission(raw) ?? raw;
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

export async function fetchMonthlySubmissionScoreBreakdown(payload, { signal } = {} as ApiOptions) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const prepared = toRequestPayload(payload);
  const mgrKpi = prepared?.managerEvaluation?.kpiRatings ?? payload?.managerKpiRatings ?? prepared?.kpiRatings;
  const mgrValues =
    prepared?.managerEvaluation?.webknotValueRatings ??
    payload?.managerWebknotValueRatings ??
    prepared?.webknotValueRatings;
  const { averageRatings, computeCertificationComponentScore, computeWeightedScore503515 } = await import(
    "../utils/submissionScoring",
  );
  const { getResolvedScoreWeights } = await import("../utils/scoringSettings");
  const managerKpiAverage = averageRatings(
    typeof mgrKpi === "object" && !Array.isArray(mgrKpi)
      ? mgrKpi
      : Object.fromEntries((Array.isArray(mgrKpi) ? mgrKpi : []).map((k) => [k?.kpiId, k?.rating]))
  );
  const managerWebknotValueAverage = averageRatings(
    typeof mgrValues === "object" && !Array.isArray(mgrValues) ? mgrValues : prepared?.webknotValueRatings
  );
  const certificationsCount = Array.isArray(prepared?.certifications) ? prepared.certifications.length : 0;
  const recognitionsCount = Number(prepared?.recognitionsCount ?? 0) || 0;
  const techShowcase = String(payload?.techShowcase ?? prepared?.techShowcase ?? "").trim();
  const certificationAverage = computeCertificationComponentScore({
    certificationsCount,
    recognitionsCount,
    techShowcase,
  });

  const auth = getAuthHeader();
  await ensureCsrfCookie({ signal });
  const weights = getResolvedScoreWeights();
  const clientWeightedScore = computeWeightedScore503515(
    managerKpiAverage,
    managerWebknotValueAverage,
    certificationAverage,
    weights,
  );
  const body = {
    kpiScore: managerKpiAverage ?? 0,
    webknotValuesScore: managerWebknotValueAverage ?? 0,
    certificationScore: certificationAverage ?? 0,
    certificationsCount,
    recognitionsCount,
    techShowcaseAwarded: Boolean(techShowcase),
    scoreWeightKpiPercent: weights.percents.kpi,
    scoreWeightValuesPercent: weights.percents.values,
    scoreWeightCertificationsPercent: weights.percents.certifications,
  };

  try {
    const res = await fetch(buildApiUrl("/api/v1/monthly-submissions/score-breakdown"), {
      method: "POST",
      signal,
      credentials: "include",
      headers: withCsrfHeaders({
        "Content-Type": "application/json",
        ...(auth ? { Authorization: auth } : {}),
      }),
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const raw = await parseResponse(res, {});
      const data = raw?.data ?? raw;
      return normalizeScoreBreakdown(data, {
        managerKpiAverage,
        managerWebknotValueAverage,
        certificationAverage,
        weightedScore: clientWeightedScore,
        techShowcase,
        certificationsCount,
        recognitionsCount,
      });
    }
  } catch {
    /* fall through to client-side */
  }

  const { computeSubmissionScoreBreakdown } = await import("../utils/submissionScoring");
  return computeSubmissionScoreBreakdown({
    managerKpiRatings: mgrKpi,
    managerWebknotValueRatings: mgrValues,
    certifications: prepared?.certifications,
    recognitionsCount,
    techShowcase,
  });
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
    cycleKey:
      resolveSubmissionCycleKey({
        month: obj.month ?? fallback.month,
        cycleKey: obj.cycleKey ?? fallback.cycleKey,
      }) || null,
    totalSubmissions: readNumber(obj.totalSubmissions, obj.submissionCount, obj.total, fallback.totalSubmissions),
    pendingManagerReviews: readNumber(obj.pendingManagerReviews, obj.pendingReviews, obj.pending, fallback.pendingManagerReviews),
    managerReviewedCount: readNumber(obj.managerReviewedCount, obj.managerReviewed, obj.reviewed, fallback.managerReviewedCount),
    sixMonthReviewMonth: Boolean(obj.sixMonthReviewMonth ?? obj.reviewMonthFlag ?? obj.isSixMonthReviewMonth ?? fallback.sixMonthReviewMonth),
    reviewMonthLabel: String(obj.reviewMonthLabel ?? obj.reviewMonth ?? obj.sixMonthReviewLabel ?? fallback.reviewMonthLabel ?? "").trim() || null,
    raw: obj,
  };
}

export async function fetchAdminMonthlyOverview({ month, cycleKey, signal } = {} as ApiOptions) {
  const auth = getAuthHeader();
  const monthKey = normalizeYearMonth(month) || String(month ?? "").trim();
  const ck = resolveCycleKey({ month, cycleKey });
  const qs = new URLSearchParams();
  if (monthKey) qs.set("month", monthKey);
  if (ck) qs.set("cycleKey", ck);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  try {
    const res = await fetch(buildApiUrl(`/api/v1/monthly-submissions/admin-overview${suffix}`), {
      signal,
      credentials: "include",
      headers: auth ? { Authorization: auth } : undefined,
    });
    if (res.ok) {
      const raw = await parseResponse(res, {});
      const data = raw?.data ?? raw;
      return normalizeAdminOverview(data, { month, cycleKey });
    }
  } catch {
    /* fallback below */
  }
  const page = await fetchAdminMonthlySubmissionsPage({ month, cycleKey, size: 500, signal });
  const normalized = page.items.map((item) => normalizeMonthlySubmission(item)).filter(Boolean);
  const managerReviewedCount = normalized.filter((item) => Boolean(item.managerSubmittedAt || item.managerSubmitted)).length;
  const pendingManagerReviews = Math.max((page.total ?? normalized.length) - managerReviewedCount, 0);
  return normalizeAdminOverview(
    {
      month,
      cycleKey: resolveCycleKey({ month, cycleKey }),
      totalSubmissions: page.total ?? normalized.length,
      pendingManagerReviews,
      managerReviewedCount,
    },
    { month, cycleKey },
  );
}

export async function deleteAdminMonthlySubmission(submissionId, { signal } = {} as ApiOptions) {
  const safeId = encodeURIComponent(String(submissionId));
  const auth = getAuthHeader();
  const endpoints = [`/api/v1/admin/monthly-submissions/${safeId}`];
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

export function normalizeEmployeeSubmissionCycleSummary(raw) {
  const obj =
    raw && typeof raw === "object"
      ? raw.data !== undefined && typeof raw.data === "object"
        ? raw.data
        : raw
      : null;
  if (!obj || typeof obj !== "object") return null;
  const ae = obj.averageEmployeeScore;
  const am = obj.averageManagerScore;
  return {
    submissionCount: Number(obj.submissionCount ?? 0) || 0,
    months: Array.isArray(obj.months) ? obj.months : [],
    averageEmployeeScore:
      ae != null && ae !== "" && Number.isFinite(Number(ae)) ? Number(ae) : ae ?? null,
    averageManagerScore:
      am != null && am !== "" && Number.isFinite(Number(am)) ? Number(am) : am ?? null,
    monthlySubmissions: Array.isArray(obj.monthlySubmissions) ? obj.monthlySubmissions : [],
    raw: obj,
  };
}

/**
 * POST `/api/v1/submission-cycles/{cycleKey}/employees/{employeeId}/monthly-submissions`
 * Creates one monthly submission row for the cycle (same payload shape as other submit helpers).
 */
export async function createMonthlySubmissionPair({ cycleKey, employeeId, payload }, { signal } = {} as ApiOptions) {
  const path = submissionCycleMonthlySubmissionsPath(cycleKey, employeeId);
  if (!path) throw new Error("cycleKey and employeeId are required.");
  await ensureCsrfCookie({ signal });
  const auth = getAuthHeader();
  const preparedPayload = toMonthlySubmissionDtoPayload({
    ...(payload ?? {}),
    cycleKey,
    employeeId,
  });

  const candidates = [
    { method: "POST", path },
    // Some deployments expose the same controller without the /api/v1 prefix.
    { method: "POST", path: path.replace(/^\/api\/v1\//, "/") },
  ];

  return requestWithFallbacks(candidates, {
    signal,
    headers: withCsrfHeaders({
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    }),
    body: JSON.stringify(preparedPayload),
    notFoundMessage: "Create monthly submission endpoint not found.",
    parseFallback: {},
  });
}

/**
 * GET `/api/v1/submission-cycles/{cycleKey}/employees/{employeeId}/monthly-submissions`
 */
export async function fetchEmployeeCycleMonthlySubmissions({ cycleKey, employeeId, signal } = {}, { signal: outerSignal } = {} as ApiOptions) {
  const finalSignal = outerSignal ?? signal;
  const path = submissionCycleMonthlySubmissionsPath(cycleKey, employeeId);
  if (!path) throw new Error("cycleKey and employeeId are required.");
  const auth = getAuthHeader();
  const candidates = [path, path.replace(/^\/api\/v1\//, "/")];
  const raw = await requestWithFallbacks(candidates, {
    signal: finalSignal,
    headers: auth ? { Authorization: auth } : undefined,
    notFoundMessage: "Employee cycle monthly submissions endpoint not found.",
    parseFallback: [],
  });
  return unwrapGenericArray(raw);
}

/**
 * GET `/api/v1/submission-cycles/{cycleKey}/employees/{employeeId}/summary`
 */
export async function fetchEmployeeSubmissionCycleSummary({ cycleKey, employeeId, signal } = {}, { signal: outerSignal } = {} as ApiOptions) {
  const finalSignal = outerSignal ?? signal;
  const ck = String(cycleKey ?? "").trim();
  const id = sanitizeEmployeeIdForApi(employeeId);
  if (!ck || !id) throw new Error("cycleKey and employeeId are required.");
  const auth = getAuthHeader();
  const path = `/api/v1/submission-cycles/${encodeURIComponent(ck)}/employees/${encodeURIComponent(id)}/summary`;
  const candidates = [path, path.replace(/^\/api\/v1\//, "/")];
  const raw = await requestWithFallbacks(candidates, {
    signal: finalSignal,
    headers: auth ? { Authorization: auth } : undefined,
    notFoundMessage: "Employee cycle summary endpoint not found.",
    parseFallback: {},
  });
  return normalizeEmployeeSubmissionCycleSummary(raw);
}

export function normalizeEmployeeSubmissionCyclesList(raw) {
  const root = raw?.data !== undefined ? raw.data : raw;
  if (Array.isArray(root)) return root;
  if (Array.isArray(root?.cycles)) return root.cycles;
  if (Array.isArray(root?.items)) return root.items;
  if (Array.isArray(root?.summaries)) return root.summaries;
  if (root && typeof root === "object") {
    const byKey = root.byCycleKey ?? root.cyclesByKey;
    if (byKey && typeof byKey === "object" && !Array.isArray(byKey)) {
      return Object.entries(byKey).map(([cycleKey, summary]) =>
        summary && typeof summary === "object" ? { cycleKey, ...summary } : { cycleKey, summary }
      );
    }
  }
  return [];
}

/**
 * GET `/api/v1/employees/{employeeId}/submission-cycles`
 */
export async function fetchEmployeeSubmissionCycles(employeeId, { signal } = {} as ApiOptions) {
  const id = sanitizeEmployeeIdForApi(employeeId);
  if (!id) throw new Error("employeeId is required.");
  const auth = getAuthHeader();
  const path = `/api/v1/employees/${encodeURIComponent(id)}/submission-cycles`;
  const candidates = [path, path.replace(/^\/api\/v1\//, "/")];
  const raw = await requestWithFallbacks(candidates, {
    signal,
    headers: auth ? { Authorization: auth } : undefined,
    notFoundMessage: "Employee submission cycles endpoint not found.",
    parseFallback: [],
  });
  return normalizeEmployeeSubmissionCyclesList(raw);
}

/**
 * GET /api/v1/submission-cycles
 * Fetches available review cycles from the server.
 */
export async function fetchSubmissionCycles({ signal } = {} as ApiOptions) {
  const auth = getAuthHeader();
  const endpoints = ["/api/v1/submission-cycles"];
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

export async function fetchSubmissionCycleById(id, { signal } = {} as ApiOptions) {
  const safeId = encodeURIComponent(String(id ?? "").trim());
  if (!safeId) throw new Error("Submission cycle id is required.");
  const auth = getAuthHeader();
  const endpoints = [`/api/v1/submission-cycles/${safeId}`];
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

export async function fetchSubmissionCycleByKey({ cycleKey, scope = null, signal } = {} as ApiOptions) {
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

export async function addSubmissionCycle(payload, { signal } = {} as ApiOptions) {
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

export async function updateSubmissionCycle(payload, { signal } = {} as ApiOptions) {
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

export async function deleteSubmissionCycle(id, { signal } = {} as ApiOptions) {
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

export async function submitAdminReviewDecision(payload, { signal } = {} as ApiOptions) {
  const auth = getAuthHeader();
  const submissionId = String(payload?.submissionId ?? payload?.id ?? "").trim();
  if (!submissionId) throw new Error("submissionId is required.");
  const adminReview = payload?.adminReview && typeof payload.adminReview === "object" ? payload.adminReview : {};
  const action = String(adminReview.action ?? payload?.reviewStatus ?? "APPROVE").trim().toUpperCase();
  const reviewBody = {
    action,
    reviewStatus: String(payload?.reviewStatus ?? action).trim() || action,
    techShowcase: String(payload?.techShowcase ?? "").trim() || undefined,
    adminComments: String(adminReview.comments ?? payload?.adminComments ?? "").trim() || undefined,
    adminReviewJson: JSON.stringify({
      adminReview,
      techShowcase: payload?.techShowcase,
      reopenedForResubmission: payload?.reopenedForResubmission,
    }),
  };
  const baseHeaders = {
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  };
  const endpoint = `/api/v1/admin/monthly-submissions/${encodeURIComponent(submissionId)}`;

  let res = await fetch(buildApiUrl(endpoint), {
    method: "PATCH",
    signal,
    credentials: "include",
    headers: withCsrfHeaders(baseHeaders),
    body: JSON.stringify(reviewBody),
  });

  if (!res.ok && res.status === 403) {
    await ensureCsrfCookie({
      signal,
      headers: auth ? { Authorization: auth } : undefined,
      forceRefresh: true,
    });
    res = await fetch(buildApiUrl(endpoint), {
      method: "PATCH",
      signal,
      credentials: "include",
      headers: withCsrfHeaders(baseHeaders),
      body: JSON.stringify(reviewBody),
    });
  }

  if (res.ok) {
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) return res.json().catch(() => ({}));
    return res.text().catch(() => "");
  }

  throw await toHttpError(res);
}
