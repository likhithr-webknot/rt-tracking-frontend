// @ts-nocheck

function cleanText(value, depth = 0) {
  if (value == null || depth > 4) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (Array.isArray(value)) {
    return value
      .map((v) => cleanText(v, depth + 1))
      .filter(Boolean)
      .join(", ")
      .trim();
  }
  if (typeof value !== "object") return "";
  const obj = value;
  for (const key of [
    "evaluationCriteria",
    "evaluation_criteria",
    "evaluationcriteria",
    "criteria",
    "roles",
    "role",
    "pillar",
    "valuePillar",
    "pillarName",
    "pillarType",
    "category",
    "group",
    "domain",
  ]) {
    const s = cleanText(obj[key], depth + 1);
    if (s && s !== "—" && s !== "-") return s;
  }
  return "";
}

/** Resolve evaluation criteria from API/KPI/value rows (never treat department/stream as criteria). */
export function extractEvaluationCriteria(row, fallback = "") {
  const direct = cleanText(row);
  if (direct) return direct;
  const nested =
    cleanText(row?.raw) ||
    cleanText(row?.attributes) ||
    cleanText(row?.metadata) ||
    cleanText(row?.kpiDefinition) ||
    cleanText(row?.definition);
  if (nested) return nested;
  return String(fallback ?? "").trim();
}

export function evaluationCriteriaGroupKey(criteria) {
  const label = String(criteria ?? "").trim();
  return label
    ? label
        .toLowerCase()
        .replace(/\s+/g, " ")
    : "__empty__";
}

export function evaluationCriteriaDisplayLabel(criteria) {
  const label = String(criteria ?? "").trim();
  return label || "No evaluation criteria";
}
