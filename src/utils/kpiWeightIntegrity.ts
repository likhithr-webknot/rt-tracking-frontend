// @ts-nocheck
import { extractEvaluationCriteria, evaluationCriteriaDisplayLabel, evaluationCriteriaGroupKey } from "./evaluationCriteria";

export function parseWeightPercent(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const numText = raw.endsWith("%") ? raw.slice(0, -1).trim() : raw;
  const parsed = Number.parseFloat(numText);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * All band+department combos per evaluation-criteria bucket with weight totals.
 */
export function computeKpiWeightIntegrity(kpis = []) {
  const list = Array.isArray(kpis) ? kpis : [];
  const comboWeights = new Map();
  const criteriaMeta = new Map();

  for (const kpi of list) {
    const band = String(kpi?.band ?? "").trim() || "Unassigned";
    const stream = String(kpi?.stream ?? "").trim() || "Unassigned";
    const criteria = extractEvaluationCriteria(kpi);
    const criteriaKey = evaluationCriteriaGroupKey(criteria);
    const criteriaLabel = evaluationCriteriaDisplayLabel(criteria);

    if (!criteriaMeta.has(criteriaKey)) {
      criteriaMeta.set(criteriaKey, { key: criteriaKey, label: criteriaLabel });
    }

    const comboKey = `${criteriaKey}||${normKey(band)}||${normKey(stream)}`;
    const prev = comboWeights.get(comboKey) || {
      criteriaKey,
      criteriaLabel,
      band,
      stream,
      sum: 0,
      goalCount: 0,
    };
    prev.sum += parseWeightPercent(kpi?.weight);
    prev.goalCount += 1;
    comboWeights.set(comboKey, prev);
  }

  const combos = Array.from(comboWeights.values()).map((c) => ({
    ...c,
    sum: Math.round(c.sum * 10) / 10,
    overweight: c.sum > 100,
    gap: Math.round((c.sum - 100) * 10) / 10,
  }));

  const overweight = combos.filter((c) => c.overweight);
  const byCriteria = new Map();

  for (const c of combos) {
    if (!byCriteria.has(c.criteriaKey)) {
      byCriteria.set(c.criteriaKey, {
        key: c.criteriaKey,
        label: c.criteriaLabel,
        combos: [],
        overweightCount: 0,
      });
    }
    const bucket = byCriteria.get(c.criteriaKey);
    bucket.combos.push(c);
    if (c.overweight) bucket.overweightCount += 1;
  }

  return {
    totalGoals: list.length,
    totalCombos: combos.length,
    overweightCount: overweight.length,
    overweight,
    combos: combos.sort((a, b) => b.sum - a.sum),
    criteriaBuckets: Array.from(byCriteria.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    ),
    blocksCycleGate: overweight.length > 0,
  };
}
