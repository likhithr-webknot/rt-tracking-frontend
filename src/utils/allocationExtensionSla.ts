// @ts-nocheck

const SLA_WARNING_DAYS = 3;
const SLA_CRITICAL_DAYS = 7;

export function parseRequestAgeDays(createdAt) {
  if (!createdAt) return 0;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
}

export function enrichExtensionRequest(req) {
  const created = req?.createdAt || req?.requestedAt || req?.submittedAt || null;
  const ageDays = parseRequestAgeDays(created);
  const status = String(req?.status ?? "PENDING").trim().toUpperCase();
  let slaTier = "ok";
  if (status === "PENDING") {
    if (ageDays >= SLA_CRITICAL_DAYS) slaTier = "critical";
    else if (ageDays >= SLA_WARNING_DAYS) slaTier = "warning";
  }
  return {
    ...req,
    ageDays,
    slaTier,
    slaLabel:
      status !== "PENDING"
        ? "Closed"
        : ageDays >= SLA_CRITICAL_DAYS
          ? `${ageDays}d overdue`
          : ageDays >= SLA_WARNING_DAYS
            ? `${ageDays}d aging`
            : `${ageDays || 0}d open`,
  };
}

export function summarizeExtensionSla(requests = []) {
  const enriched = (Array.isArray(requests) ? requests : []).map(enrichExtensionRequest);
  return {
    enriched,
    pending: enriched.filter((r) => String(r.status).toUpperCase() === "PENDING"),
    critical: enriched.filter((r) => r.slaTier === "critical"),
    warning: enriched.filter((r) => r.slaTier === "warning"),
  };
}
