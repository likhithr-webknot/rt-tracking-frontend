// @ts-nocheck

function avgMap(ratings) {
  const vals = Object.values(ratings || {})
    .map((v) => Number.parseFloat(String(v)))
    .filter((n) => Number.isFinite(n));
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

/**
 * Anonymized team rows for calibration (no names until reveal).
 */
export function buildCalibrationDataset(teamRows = [], { reveal = false } = {}) {
  const rows = (Array.isArray(teamRows) ? teamRows : []).map((row, idx) => {
    const payload = row?.payload || row?.raw?.payload || {};
    const kpi = payload?.kpiRatings || row?.managerEvaluation?.kpiRatings || {};
    const values = payload?.webknotValueRatings || row?.managerEvaluation?.webknotValueRatings || {};
    const employeeKpi = payload?.employeeKpiRatings || payload?.kpiRatings || {};
    const employeeValues = payload?.webknotValueRatings || payload?.webknotValues || {};
    return {
      id: row?.employee?.id || `row_${idx}`,
      label: reveal ? row?.employee?.name || `Reportee ${idx + 1}` : `Team member ${String.fromCharCode(65 + (idx % 26))}`,
      kpiAvg: avgMap(kpi) ?? avgMap(employeeKpi),
      valueAvg: avgMap(values) ?? avgMap(employeeValues),
      status: row?.status || row?.reviewStatus || "",
    };
  });

  const kpiScores = rows.map((r) => r.kpiAvg).filter((n) => n != null);
  const valueScores = rows.map((r) => r.valueAvg).filter((n) => n != null);

  const distribution = (arr) => {
    if (!arr.length) return { min: null, max: null, mean: null, spread: null };
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const mean = Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
    return { min, max, mean, spread: Math.round((max - min) * 10) / 10 };
  };

  return {
    rows: rows.sort((a, b) => (b.kpiAvg ?? 0) - (a.kpiAvg ?? 0)),
    kpiDistribution: distribution(kpiScores),
    valueDistribution: distribution(valueScores),
    count: rows.length,
  };
}
