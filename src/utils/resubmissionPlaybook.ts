// @ts-nocheck

function stableJson(obj) {
  try {
    return JSON.stringify(obj ?? {});
  } catch {
    return "";
  }
}

function countRatingChanges(before = {}, after = {}) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  let changed = 0;
  for (const k of keys) {
    if (String(before[k] ?? "") !== String(after[k] ?? "")) changed += 1;
  }
  return changed;
}

/**
 * Build checklist for employee/manager after a submission was returned.
 */
export function buildResubmissionPlaylist(submission, options = {}) {
  const sub = submission?.submission || submission || {};
  const raw = sub?.raw || sub;
  const payload = raw?.payload || raw;
  const rejectComment =
    options.rejectComment ||
    sub?.managerReview?.comments ||
    payload?.managerReview?.comments ||
    sub?.adminReview?.comments ||
    payload?.adminReview?.comments ||
    "";
  const rejectAt =
    options.rejectAt ||
    sub?.managerReview?.reviewedAt ||
    payload?.managerReview?.reviewedAt ||
    null;
  const updatedAt = sub?.updatedAt || payload?.updatedAt || null;
  const reopened = Boolean(sub?.reopenedForResubmission || payload?.reopenedForResubmission);

  const snapshot = payload?._rejectSnapshot || raw?._rejectSnapshot || null;
  const items = [];

  if (rejectComment) {
    items.push({
      id: "feedback",
      label: "Read return feedback",
      detail: String(rejectComment).trim(),
      required: true,
      status: "info",
    });
  }

  const selfNow = String(sub?.selfReviewText ?? payload?.selfReviewText ?? "").trim();
  const selfThen = String(snapshot?.selfReviewText ?? "").trim();
  items.push({
    id: "self-review",
    label: "Update self-review narrative",
    detail: selfThen
      ? reopened && selfNow !== selfThen
        ? "Self-review text was updated since return."
        : "Self-review still matches pre-return text — consider revising."
      : "Ensure self-review reflects feedback.",
    required: true,
    status: selfThen && selfNow !== selfThen ? "done" : reopened ? "pending" : "neutral",
  });

  const kpiChanges = countRatingChanges(
    snapshot?.kpiRatings || snapshot?.employeeKpiRatings,
    sub?.kpiRatings || payload?.kpiRatings,
  );
  items.push({
    id: "kpis",
    label: "Revise KPI ratings",
    detail:
      kpiChanges > 0
        ? `${kpiChanges} KPI rating(s) changed since return.`
        : "Confirm KPI scores address feedback.",
    required: true,
    status: kpiChanges > 0 ? "done" : "pending",
  });

  const valueChanges = countRatingChanges(
    snapshot?.webknotValueRatings || snapshot?.valueRatings,
    sub?.webknotValueRatings || payload?.webknotValueRatings,
  );
  items.push({
    id: "values",
    label: "Revise Webknot value ratings",
    detail:
      valueChanges > 0
        ? `${valueChanges} value rating(s) changed since return.`
        : "Confirm value scores address feedback.",
    required: true,
    status: valueChanges > 0 ? "done" : "pending",
  });

  if (rejectAt && updatedAt) {
    const ra = new Date(rejectAt).getTime();
    const ua = new Date(updatedAt).getTime();
    items.push({
      id: "resubmit",
      label: "Resubmit for review",
      detail:
        ua > ra
          ? `Last saved ${new Date(updatedAt).toLocaleString()} after return.`
          : "Save draft and resubmit when ready.",
      required: true,
      status: ua > ra ? "done" : "pending",
    });
  }

  return {
    rejectComment: String(rejectComment || "").trim(),
    rejectAt,
    updatedAt,
    items,
    progress: items.filter((i) => i.status === "done").length,
    total: items.length,
  };
}

export function captureRejectSnapshot(submission) {
  const sub = submission?.submission || submission || {};
  const raw = sub?.raw || sub;
  const payload = raw?.payload || raw;
  return {
    selfReviewText: sub?.selfReviewText ?? payload?.selfReviewText ?? "",
    kpiRatings: sub?.kpiRatings ?? payload?.kpiRatings ?? {},
    webknotValueRatings: sub?.webknotValueRatings ?? payload?.webknotValueRatings ?? {},
    capturedAt: new Date().toISOString(),
  };
}
