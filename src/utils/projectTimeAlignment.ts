// @ts-nocheck

/**
 * Flag timelogs whose project is not in the employee's assigned set for the cycle.
 */
export function findMisalignedTimeLogs(logs = [], assignedProjectIds = [], assignedProjectCodes = []) {
  const idSet = new Set(
    (assignedProjectIds || []).map((x) => String(x ?? "").trim().toLowerCase()).filter(Boolean),
  );
  const codeSet = new Set(
    (assignedProjectCodes || []).map((x) => String(x ?? "").trim().toLowerCase()).filter(Boolean),
  );
  const hasAssignment = idSet.size > 0 || codeSet.size > 0;

  return (Array.isArray(logs) ? logs : [])
    .map((log) => {
      const pid = String(log?.projectId ?? log?.project_id ?? "").trim().toLowerCase();
      const pcode = String(log?.projectCode ?? log?.project_code ?? "").trim().toLowerCase();
      const aligned =
        !hasAssignment ||
        (pid && idSet.has(pid)) ||
        (pcode && codeSet.has(pcode));
      return {
        log,
        aligned,
        projectLabel: log?.projectName || log?.projectCode || log?.projectId || "Unknown project",
        logDate: log?.logDate || log?.date || "—",
        hours: log?.hours ?? log?.duration ?? "—",
      };
    })
    .filter((x) => !x.aligned);
}
