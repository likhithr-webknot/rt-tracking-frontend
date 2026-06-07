import { getAppSettings } from "./appSettings";
import { scoreFromMonthlySubmission } from "./employeePerformanceScore";

export function normalizeYearMonth(value) {
  if (!value) return "";
  if (value instanceof Date) {
    const d = value;
    if (Number.isNaN(d.getTime())) return "";
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }
  const raw = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!match) return "";
  const yyyy = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(yyyy) || !Number.isFinite(mm) || mm < 1 || mm > 12) return "";
  return `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}`;
}

export function formatYearMonth(date) {
  return normalizeYearMonth(date);
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function monthName(monthNumber) {
  const idx = Number(monthNumber) - 1;
  return MONTH_NAMES[idx] ?? String(monthNumber);
}

function buildMonthLabel(ym) {
  const normalized = normalizeYearMonth(ym);
  if (!normalized) return "—";
  const [yText, mText] = normalized.split("-");
  const y = Number(yText);
  const m = Number(mText);
  const d = new Date(y, m - 1, 1);
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(d);
  } catch {
    return normalized;
  }
}

export function getReviewCycleConfig() {
  const settings = getAppSettings();
  const mayOctStartMonth = clampMonth(settings.reviewCycleMayStartMonth, 5);
  const mayOctEndMonth = clampMonth(settings.reviewCycleMayEndMonth, 10);
  const novAprStartMonth = clampMonth(settings.reviewCycleNovStartMonth, 11);
  const novAprEndMonth = clampMonth(settings.reviewCycleNovEndMonth, 4);
  return {
    mayOctStartMonth,
    mayOctEndMonth,
    novAprStartMonth,
    novAprEndMonth,
  };
}

function clampMonth(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n < 1 || n > 12) return fallback;
  return n;
}

function buildMayOctMonths(year, cfg) {
  const months = [];
  for (let m = cfg.mayOctStartMonth; m <= cfg.mayOctEndMonth; m += 1) {
    months.push(`${String(year).padStart(4, "0")}-${String(m).padStart(2, "0")}`);
  }
  return months;
}

function buildNovAprMonths(startYear, endYear, cfg) {
  const months = [];
  for (let m = cfg.novAprStartMonth; m <= 12; m += 1) {
    months.push(`${String(startYear).padStart(4, "0")}-${String(m).padStart(2, "0")}`);
  }
  for (let m = 1; m <= cfg.novAprEndMonth; m += 1) {
    months.push(`${String(endYear).padStart(4, "0")}-${String(m).padStart(2, "0")}`);
  }
  return months;
}

function formatMayOctLabel(year, cfg = getReviewCycleConfig()) {
  return `${monthName(cfg.mayOctStartMonth)} ${year} - ${monthName(cfg.mayOctEndMonth)} ${year}`;
}

function formatNovAprLabel(startYear, endYear, cfg = getReviewCycleConfig()) {
  return `${monthName(cfg.novAprStartMonth)} ${startYear} - ${monthName(cfg.novAprEndMonth)} ${endYear}`;
}

/** Canonical backend keys: MAY-OCT-YYYY and NOV-APR-YYYY-YYYY */
export function normalizeCycleKey(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();

  const ym = normalizeYearMonth(raw);
  if (ym) {
    return getCycleForMonth(ym)?.key ?? null;
  }

  let match = /^MAY-OCT-(\d{4})$/.exec(upper);
  if (match) return `MAY-OCT-${match[1]}`;

  match = /^NOV-APR-(\d{4})-(\d{4})$/.exec(upper);
  if (match) return `NOV-APR-${match[1]}-${match[2]}`;

  match = /^(\d{4})-MAY-OCT$/.exec(upper);
  if (match) return `MAY-OCT-${match[1]}`;

  match = /^(\d{4})-NOV-APR$/.exec(upper);
  if (match) {
    const startYear = Number(match[1]);
    return `NOV-APR-${startYear}-${startYear + 1}`;
  }

  return null;
}

export function resolveSubmissionCycleKey({ month, cycleKey } = {}) {
  const fromKey = normalizeCycleKey(cycleKey);
  if (fromKey) return fromKey;
  const monthKey = normalizeYearMonth(month);
  if (!monthKey) return null;
  return getCycleForMonth(monthKey)?.key ?? null;
}

export function formatCycleKeyLabel(cycleKey) {
  const key = normalizeCycleKey(cycleKey);
  if (!key) {
    const fallback = String(cycleKey ?? "").trim();
    return fallback || "—";
  }

  const cfg = getReviewCycleConfig();
  let match = /^MAY-OCT-(\d{4})$/.exec(key);
  if (match) return formatMayOctLabel(Number(match[1]), cfg);

  match = /^NOV-APR-(\d{4})-(\d{4})$/.exec(key);
  if (match) return formatNovAprLabel(Number(match[1]), Number(match[2]), cfg);

  return key;
}

export function getCycleSlotLabel(cycleKey) {
  const key = normalizeCycleKey(cycleKey);
  if (!key) return "—";
  if (/^MAY-OCT-/i.test(key)) return "Cycle one";
  if (/^NOV-APR-/i.test(key)) return "Cycle two";
  return formatCycleKeyLabel(key);
}

export function currentReviewCycleKey(date = new Date()) {
  return buildCycleMeta(date).cycleKey;
}

export function buildAllReviewCycleKeys({ startYear, endYear } = {}) {
  const now = new Date();
  const end = Number.isFinite(endYear) ? endYear : now.getFullYear() + 1;
  const start = Number.isFinite(startYear) ? startYear : end - 12;
  const keys = new Set();
  for (let year = start; year <= end; year += 1) {
    keys.add(`MAY-OCT-${year}`);
    keys.add(`NOV-APR-${year}-${year + 1}`);
  }
  return [...keys].sort((a, b) => b.localeCompare(a));
}

export function collectCycleKeysFromUnknown(value, into = new Set()) {
  if (value == null) return into;
  if (Array.isArray(value)) {
    for (const item of value) collectCycleKeysFromUnknown(item, into);
    return into;
  }
  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (/cycle[_-]?key|^key$/i.test(key)) {
        const normalized = normalizeCycleKey(nested);
        if (normalized) into.add(normalized);
      }
      collectCycleKeysFromUnknown(nested, into);
    }
  }
  return into;
}

function monthlySubmissionHasRatings(item) {
  const score = scoreFromMonthlySubmission(item);
  if (Number.isFinite(score) && score > 0) return true;

  const sub = item?.submission && typeof item.submission === "object" ? item.submission : item;
  const payload = sub?.payload && typeof sub.payload === "object" ? sub.payload : sub;
  const mgr =
    sub?.managerEvaluation && typeof sub.managerEvaluation === "object"
      ? sub.managerEvaluation
      : payload?.managerEvaluation;
  const kpiRatings = mgr?.kpiRatings ?? sub?.managerKpiRatings ?? payload?.managerKpiRatings;
  const valueRatings =
    mgr?.webknotValueRatings ?? sub?.managerWebknotValueRatings ?? payload?.managerWebknotValueRatings;

  if (kpiRatings && typeof kpiRatings === "object" && Object.keys(kpiRatings).length > 0) return true;
  if (valueRatings && typeof valueRatings === "object" && Object.keys(valueRatings).length > 0) return true;

  const status = String(sub?.reviewStatus ?? sub?.status ?? item?.reviewStatus ?? item?.status ?? "")
    .trim()
    .toUpperCase();
  return ["APPROVED", "SUBMITTED", "MANAGER_REVIEWED", "COMPLETED", "REVIEWED"].some((token) =>
    status.includes(token),
  );
}

/** Map canonical cycle key → count of submissions that carry ratings in that cycle. */
export function collectRatedCycleCounts(submissions) {
  const counts = new Map();
  for (const item of Array.isArray(submissions) ? submissions : []) {
    if (!monthlySubmissionHasRatings(item)) continue;
    const sub = item?.submission && typeof item.submission === "object" ? item.submission : item;
    const month = normalizeYearMonth(sub?.month ?? item?.month);
    const cycleKey = resolveSubmissionCycleKey({
      month,
      cycleKey: sub?.cycleKey ?? item?.cycleKey,
    });
    if (!cycleKey) continue;
    counts.set(cycleKey, (counts.get(cycleKey) || 0) + 1);
  }
  return counts;
}

export function getCycleForMonth(value) {
  const normalized = normalizeYearMonth(value || new Date());
  if (!normalized) return null;

  const [yText, mText] = normalized.split("-");
  const year = Number(yText);
  const month = Number(mText);
  const cfg = getReviewCycleConfig();

  if (month >= cfg.mayOctStartMonth && month <= cfg.mayOctEndMonth) {
    const startMonth = `${String(year).padStart(4, "0")}-${String(cfg.mayOctStartMonth).padStart(2, "0")}`;
    const endMonth = `${String(year).padStart(4, "0")}-${String(cfg.mayOctEndMonth).padStart(2, "0")}`;
    const months = buildMayOctMonths(year, cfg);
    return {
      key: `MAY-OCT-${year}`,
      label: formatMayOctLabel(year, cfg),
      shortLabel: "May-Oct",
      startMonth,
      endMonth,
      months,
      contains: months.includes(normalized),
    };
  }

  const startYear = month >= cfg.novAprStartMonth ? year : year - 1;
  const endYear = startYear + 1;
  const startMonth = `${String(startYear).padStart(4, "0")}-${String(cfg.novAprStartMonth).padStart(2, "0")}`;
  const endMonth = `${String(endYear).padStart(4, "0")}-${String(cfg.novAprEndMonth).padStart(2, "0")}`;
  const months = buildNovAprMonths(startYear, endYear, cfg);
  return {
    key: `NOV-APR-${startYear}-${endYear}`,
    label: formatNovAprLabel(startYear, endYear, cfg),
    shortLabel: "Nov-Apr",
    startMonth,
    endMonth,
    months,
    contains: months.includes(normalized),
  };
}

export function buildCycleMeta(monthValue) {
  const month = normalizeYearMonth(monthValue || new Date()) || normalizeYearMonth(new Date());
  const cycle = getCycleForMonth(month);
  if (!cycle) {
    return {
      month,
      cycleKey: null,
      cycleLabel: null,
      cycleStartMonth: null,
      cycleEndMonth: null,
      cycleShortLabel: null,
    };
  }
  return {
    month,
    cycleKey: cycle.key,
    cycleLabel: cycle.label,
    cycleShortLabel: cycle.shortLabel,
    cycleStartMonth: cycle.startMonth,
    cycleEndMonth: cycle.endMonth,
  };
}

export function buildCycleMonthOptions(monthValue) {
  const cycle = getCycleForMonth(monthValue || new Date());
  if (!cycle) return [];
  return cycle.months.map((month) => ({
    value: month,
    label: buildMonthLabel(month),
  }));
}

export function isResubmissionRequested(meta) {
  const obj = meta && typeof meta === "object" ? meta : {};
  const reviewStatus = String(obj.reviewStatus || obj.status || "").trim().toUpperCase();
  const managerAction = String(obj.managerReview?.action || "").trim().toUpperCase();
  const adminAction = String(obj.adminReview?.action || "").trim().toUpperCase();

  if (reviewStatus === "NEEDS_MANAGER_REVIEW") return false;
  if (obj.reopenedForResubmission) return true;
  if (reviewStatus === "NEEDS_REVIEW" || reviewStatus === "REJECT") return true;
  if (managerAction === "REJECT") return true;
  if (adminAction === "REJECT") return true;
  return false;
}
