// @ts-nocheck
import { normalizeYearMonth } from "./reviewCycles";

export function previousYearMonth(monthKey) {
  const n = normalizeYearMonth(monthKey);
  if (!n) return "";
  const [y, m] = n.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

export function extractReplaySnapshot(submission) {
  const sub = submission?.submission || submission || {};
  const raw = sub?.raw || sub;
  const payload = raw?.payload || raw;
  return {
    month: sub?.month || payload?.month || "—",
    selfReviewText: String(sub?.selfReviewText ?? payload?.selfReviewText ?? "").trim(),
    kpiRatings: sub?.kpiRatings ?? payload?.kpiRatings ?? {},
    valueRatings: sub?.webknotValueRatings ?? payload?.webknotValueRatings ?? {},
    managerNotes:
      sub?.managerEvaluation?.comments ??
      payload?.managerEvaluation?.comments ??
      sub?.managerReview?.comments ??
      "",
    status: sub?.status || payload?.status || "",
    reviewStatus: sub?.reviewStatus || payload?.reviewStatus || "",
  };
}

export function diffReplaySnapshots(current, prior) {
  const diffs = [];
  if (!prior) return diffs;
  if ((current?.selfReviewText || "") !== (prior?.selfReviewText || "")) {
    diffs.push({ field: "Self review", kind: "text" });
  }
  const ck = Object.keys({ ...current?.kpiRatings, ...prior?.kpiRatings });
  if (ck.some((k) => String(current?.kpiRatings?.[k] ?? "") !== String(prior?.kpiRatings?.[k] ?? ""))) {
    diffs.push({ field: "KPI ratings", kind: "ratings" });
  }
  const vk = Object.keys({ ...current?.valueRatings, ...prior?.valueRatings });
  if (vk.some((k) => String(current?.valueRatings?.[k] ?? "") !== String(prior?.valueRatings?.[k] ?? ""))) {
    diffs.push({ field: "Value ratings", kind: "ratings" });
  }
  if ((current?.managerNotes || "") !== (prior?.managerNotes || "")) {
    diffs.push({ field: "Manager notes", kind: "text" });
  }
  return diffs;
}
