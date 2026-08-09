// @ts-nocheck

import { normalizeMonthlySubmission } from "../api/monthly-submissions";
import { scoreFromMonthlySubmission } from "./employeePerformanceScore";
import { RATINGS_HISTORY_CSV_HEADER } from "./csvImportNormalize";
import { normalizeYearMonth, resolveSubmissionCycleKey } from "./reviewCycles";

function buildEmployeeLookup(employees) {
  const map = new Map();
  for (const emp of employees || []) {
    const id = String(emp?.empId ?? emp?.id ?? "").trim();
    if (id) map.set(id.toLowerCase(), emp);
    const alt = String(emp?.id ?? "").trim();
    if (alt && alt !== id) map.set(alt.toLowerCase(), emp);
    const email = String(emp?.email ?? "").trim().toLowerCase();
    if (email) map.set(`email:${email}`, emp);
  }
  return map;
}

function resolveEmployeeForSubmission(sub, lookup) {
  const empId = String(sub?.employeeId ?? sub?.empId ?? "").trim();
  if (empId) {
    const hit = lookup.get(empId.toLowerCase());
    if (hit) return hit;
  }
  const email = String(sub?.email ?? sub?.userEmail ?? sub?.employeeEmail ?? "").trim().toLowerCase();
  if (email) return lookup.get(`email:${email}`) || null;
  return null;
}

/** Flat rows for ratings history CSV export (one row per scored monthly review). */
export function buildRatingsHistoryExportRows(employees, submissions) {
  const lookup = buildEmployeeLookup(employees);
  const rows = [];

  for (const item of Array.isArray(submissions) ? submissions : []) {
    const sub = normalizeMonthlySubmission(item?.submission ?? item) || item;
    if (!sub) continue;
    const emp = resolveEmployeeForSubmission(sub, lookup) || {};
    const empId = String(sub?.employeeId ?? sub?.empId ?? emp?.empId ?? emp?.id ?? "").trim();
    const score = scoreFromMonthlySubmission(sub);
    const month = normalizeYearMonth(sub?.month ?? sub?.cycleMonth ?? "") || "";
    const cycleKey = resolveSubmissionCycleKey({ month, cycleKey: sub?.cycleKey }) || "";
    if (!empId && !emp?.email && !month) continue;

    rows.push([
      String(sub?.id ?? sub?.submissionId ?? "").trim(),
      empId,
      String(emp?.name ?? sub?.employeeName ?? sub?.userName ?? "").trim(),
      String(emp?.email ?? sub?.email ?? sub?.userEmail ?? "").trim(),
      cycleKey,
      month,
      String(sub?.reviewStatus ?? sub?.status ?? "").trim(),
      score != null ? Number(score).toFixed(1) : "",
      String(sub?.submittedAt ?? sub?.employeeSubmittedAt ?? "").trim(),
      String(sub?.managerSubmittedAt ?? "").trim(),
    ]);
  }

  return rows.sort((a, b) => {
    const nameCmp = String(a[2]).localeCompare(String(b[2]));
    if (nameCmp !== 0) return nameCmp;
    return String(a[5]).localeCompare(String(b[5]));
  });
}

export function ratingsHistoryCsvHeaders() {
  return RATINGS_HISTORY_CSV_HEADER.split(",");
}
