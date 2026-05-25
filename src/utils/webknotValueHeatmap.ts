// @ts-nocheck

function avgRatings(map) {
  const vals = Object.values(map || {})
    .map((v) => Number.parseFloat(String(v)))
    .filter((n) => Number.isFinite(n));
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

/**
 * rows: { employeeId, employeeName, band, stream, valueRatings: { valueId: rating } }
 * valuesIndex: { valueId: title }
 */
export function buildWebknotValueHeatmap(rows = [], valuesIndex = {}) {
  const valueIds = new Set();
  const segments = new Map();

  for (const row of rows) {
    const band = String(row?.band ?? "Unassigned").trim() || "Unassigned";
    const stream = String(row?.stream ?? "Unassigned").trim() || "Unassigned";
    const segKey = `${band}||${stream}`;
    if (!segments.has(segKey)) {
      segments.set(segKey, { band, stream, key: segKey, ratingsByValue: {}, count: 0 });
    }
    const seg = segments.get(segKey);
    seg.count += 1;
    const ratings = row?.valueRatings || row?.managerWebknotValueRatings || {};
    for (const [vid, rating] of Object.entries(ratings)) {
      valueIds.add(vid);
      if (!seg.ratingsByValue[vid]) seg.ratingsByValue[vid] = [];
      const n = Number.parseFloat(String(rating));
      if (Number.isFinite(n)) seg.ratingsByValue[vid].push(n);
    }
  }

  const valueColumns = Array.from(valueIds).map((id) => ({
    id,
    title: valuesIndex[id] || id,
  }));

  const matrix = Array.from(segments.values()).map((seg) => {
    const cells = {};
    for (const col of valueColumns) {
      const arr = seg.ratingsByValue[col.id] || [];
      cells[col.id] =
        arr.length > 0
          ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10
          : null;
    }
    const all = Object.values(cells).filter((v) => v != null);
    const rowAvg = all.length ? Math.round((all.reduce((a, b) => a + b, 0) / all.length) * 10) / 10 : null;
    return { ...seg, cells, rowAvg };
  });

  matrix.sort((a, b) => String(a.band).localeCompare(String(b.band), undefined, { numeric: true }));

  return { valueColumns, matrix };
}

export function heatColorForScore(score) {
  if (score == null || !Number.isFinite(score)) return "bg-[rgb(var(--surface-2))]";
  if (score >= 4.5) return "bg-emerald-500/25 text-emerald-800 dark:text-emerald-200";
  if (score >= 3.5) return "bg-blue-500/20 text-blue-800 dark:text-blue-200";
  if (score >= 2.5) return "bg-amber-500/20 text-amber-900 dark:text-amber-200";
  return "bg-rose-500/20 text-rose-800 dark:text-rose-200";
}
