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

export function getCycleForMonth(value) {
  const normalized = normalizeYearMonth(value || new Date());
  if (!normalized) return null;

  const [yText, mText] = normalized.split("-");
  const year = Number(yText);
  const month = Number(mText);

  if (month >= 5 && month <= 10) {
    const startMonth = `${String(year).padStart(4, "0")}-05`;
    const endMonth = `${String(year).padStart(4, "0")}-10`;
    const months = ["05", "06", "07", "08", "09", "10"].map((m) => `${String(year).padStart(4, "0")}-${m}`);
    return {
      key: `${String(year).padStart(4, "0")}-MAY-OCT`,
      label: `May ${year} - Oct ${year}`,
      shortLabel: "May-Oct",
      startMonth,
      endMonth,
      months,
      contains: months.includes(normalized),
    };
  }

  const startYear = month >= 11 ? year : year - 1;
  const endYear = startYear + 1;
  const startMonth = `${String(startYear).padStart(4, "0")}-11`;
  const endMonth = `${String(endYear).padStart(4, "0")}-04`;
  const months = [
    `${String(startYear).padStart(4, "0")}-11`,
    `${String(startYear).padStart(4, "0")}-12`,
    `${String(endYear).padStart(4, "0")}-01`,
    `${String(endYear).padStart(4, "0")}-02`,
    `${String(endYear).padStart(4, "0")}-03`,
    `${String(endYear).padStart(4, "0")}-04`,
  ];
  return {
    key: `${String(startYear).padStart(4, "0")}-NOV-APR`,
    label: `Nov ${startYear} - Apr ${endYear}`,
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

  if (obj.reopenedForResubmission) return true;
  if (reviewStatus.includes("NEEDS_REVIEW")) return true;
  if (reviewStatus.includes("REJECT")) return true;
  if (managerAction === "REJECT") return true;
  if (adminAction === "REJECT") return true;
  return false;
}

