// @ts-nocheck

const CRITERIA_FIELD_KEYS = [
  "evaluationCriteria",
  "evaluation_criteria",
  "evaluationcriteria",
  "criteria",
  "evaluationPillar",
  "evaluation_pillar",
  "pillar",
  "valuePillar",
  "pillarName",
  "pillarType",
];

function criteriaFieldText(value, depth = 0) {
  if (value == null || depth > 4) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (Array.isArray(value)) {
    return value
      .map((v) => criteriaFieldText(v, depth + 1))
      .filter(Boolean)
      .join(", ")
      .trim();
  }
  if (typeof value === "object") {
    const obj = value;
    for (const key of ["name", "label", "title", "code", "value", "pillar", "criteria"]) {
      const s = criteriaFieldText(obj[key], depth + 1);
      if (s && s !== "—" && s !== "-") return s;
    }
  }
  return "";
}

function readCriteriaFromObject(obj) {
  if (!obj || typeof obj !== "object") return "";
  for (const key of CRITERIA_FIELD_KEYS) {
    const s = criteriaFieldText(obj[key], 0);
    if (s && s !== "—" && s !== "-") return s;
  }
  return "";
}

/** Resolve evaluation criteria from API/KPI/value rows (never treat employee role/department as criteria). */
export function extractEvaluationCriteria(row, fallback = "") {
  if (row == null) return String(fallback ?? "").trim();
  if (typeof row === "string") return row.trim();

  const direct = readCriteriaFromObject(row);
  if (direct) return direct;

  const obj = row && typeof row === "object" ? row : {};
  const nested =
    readCriteriaFromObject(obj.raw) ||
    readCriteriaFromObject(obj.attributes) ||
    readCriteriaFromObject(obj.metadata) ||
    readCriteriaFromObject(obj.kpiDefinition) ||
    readCriteriaFromObject(obj.definition);
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
