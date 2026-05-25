// @ts-nocheck

/** Canonical review-cycle workflow states (display layer). */
export const SUBMISSION_PHASES = {
  DRAFT: "draft",
  IN_PROGRESS: "in_progress",
  SUBMITTED: "submitted",
  AWAITING_MANAGER: "awaiting_manager",
  MANAGER_REVIEW: "manager_review",
  MANAGER_DONE: "manager_done",
  ADMIN_REVIEW: "admin_review",
  APPROVED: "approved",
  RETURNED: "returned",
  LOCKED: "locked",
  UNKNOWN: "unknown",
};

const TONE_STYLES = {
  neutral: "rt-badge--neutral",
  primary: "rt-badge--primary",
  success: "rt-badge--success",
  warning: "rt-badge--warning",
  danger: "rt-badge--danger",
};

function norm(s) {
  return String(s ?? "").trim().toUpperCase();
}

/**
 * Resolve a single workflow snapshot from API fields.
 */
export function resolveSubmissionWorkflow(input = {}) {
  const status = norm(input.status);
  const reviewStatus = norm(input.reviewStatus || input.status);
  const managerReady = Boolean(input.managerReady);
  const adminAction = norm(input.adminAction);
  const submissionType = norm(input.submissionType);
  const isManagerSelf = submissionType.includes("MANAGER_SELF");

  if (status === "DRAFT" || reviewStatus === "DRAFT") {
    return pack("DRAFT", SUBMISSION_PHASES.DRAFT, "Draft", "Draft", "neutral", "Not yet submitted for this cycle.");
  }

  if (
    reviewStatus.includes("REJECT") ||
    reviewStatus.includes("NEEDS_REVIEW") ||
    reviewStatus.includes("RETURN") ||
    adminAction === "REJECT"
  ) {
    return pack(
      "RETURNED",
      SUBMISSION_PHASES.RETURNED,
      "Changes requested",
      "Returned",
      "warning",
      isManagerSelf
        ? "Manager self-review was returned for updates."
        : "Sent back to the employee for revision.",
    );
  }

  if (
    reviewStatus.includes("APPROVED") ||
    reviewStatus.includes("COMPLETED") ||
    reviewStatus.includes("FINAL") ||
    status.includes("APPROVED") ||
    status.includes("COMPLETED")
  ) {
    return pack(
      "APPROVED",
      SUBMISSION_PHASES.APPROVED,
      "Approved",
      "Approved",
      "success",
      "Cycle review is complete for this submission.",
    );
  }

  if (status === "LOCKED" || reviewStatus === "LOCKED") {
    return pack("LOCKED", SUBMISSION_PHASES.LOCKED, "Locked", "Locked", "neutral", "Submission is locked for this period.");
  }

  if (managerReady || reviewStatus.includes("MANAGER_SUBMITTED") || status === "MANAGER_REVIEWED") {
    return pack(
      "MANAGER_DONE",
      SUBMISSION_PHASES.MANAGER_DONE,
      "Manager review complete",
      "Mgr. done",
      "primary",
      "Ready for admin review or final scoring.",
    );
  }

  if (
    reviewStatus.includes("PENDING_MANAGER") ||
    reviewStatus.includes("NEEDS_MANAGER") ||
    reviewStatus.includes("AWAITING_MANAGER")
  ) {
    return pack(
      "AWAITING_MANAGER",
      SUBMISSION_PHASES.AWAITING_MANAGER,
      "Awaiting manager",
      "With manager",
      "primary",
      "Employee submitted; manager review is pending.",
    );
  }

  if (status === "SUBMITTED" || reviewStatus === "SUBMITTED") {
    if (managerReady) {
      return pack(
        "MANAGER_DONE",
        SUBMISSION_PHASES.MANAGER_DONE,
        "Manager review complete",
        "Mgr. done",
        "primary",
        "Manager evaluation submitted.",
      );
    }
    return pack(
      "SUBMITTED",
      SUBMISSION_PHASES.SUBMITTED,
      "Submitted",
      "Submitted",
      "primary",
      isManagerSelf ? "Manager self-review submitted." : "Employee submitted; awaiting manager action.",
    );
  }

  if (reviewStatus.includes("IN_PROGRESS") || status.includes("IN_PROGRESS")) {
    return pack(
      "IN_PROGRESS",
      SUBMISSION_PHASES.IN_PROGRESS,
      "In progress",
      "In progress",
      "neutral",
      "Submission started but not finalized.",
    );
  }

  return pack(
    reviewStatus || status || "UNKNOWN",
    SUBMISSION_PHASES.UNKNOWN,
    reviewStatus || status || "Unknown",
    "Unknown",
    "neutral",
    "Status could not be mapped — check API fields.",
  );
}

function pack(code, phase, label, shortLabel, tone, description) {
  return {
    code,
    phase,
    label,
    shortLabel,
    description,
    tone,
    badgeClass: TONE_STYLES[tone] || TONE_STYLES.neutral,
    steps: buildLifecycleSteps(phase),
  };
}

function buildLifecycleSteps(activePhase) {
  const order = [
    SUBMISSION_PHASES.DRAFT,
    SUBMISSION_PHASES.SUBMITTED,
    SUBMISSION_PHASES.AWAITING_MANAGER,
    SUBMISSION_PHASES.MANAGER_DONE,
    SUBMISSION_PHASES.APPROVED,
  ];
  const labels = {
    [SUBMISSION_PHASES.DRAFT]: "Draft",
    [SUBMISSION_PHASES.SUBMITTED]: "Submitted",
    [SUBMISSION_PHASES.AWAITING_MANAGER]: "Manager",
    [SUBMISSION_PHASES.MANAGER_DONE]: "Reviewed",
    [SUBMISSION_PHASES.APPROVED]: "Approved",
  };
  const activeIdx =
    activePhase === SUBMISSION_PHASES.RETURNED
      ? 1
      : activePhase === SUBMISSION_PHASES.LOCKED
        ? 4
        : Math.max(0, order.indexOf(activePhase));

  return order.map((phase, idx) => ({
    phase,
    label: labels[phase],
    state: idx < activeIdx ? "done" : idx === activeIdx ? "current" : "upcoming",
  }));
}

export const SUBMISSION_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "PENDING_MANAGER_REVIEW", label: "Awaiting manager" },
  { value: "MANAGER_SUBMITTED", label: "Manager complete" },
  { value: "NEEDS_REVIEW", label: "Changes requested" },
  { value: "APPROVED", label: "Approved" },
];

export function submissionMatchesStatusFilter(item, filterValue) {
  const f = norm(filterValue);
  if (!f || f === "ALL") return true;
  const wf = resolveSubmissionWorkflow(item);
  const rs = norm(item?.reviewStatus);
  const st = norm(item?.status);
  if (f === "PENDING_MANAGER_REVIEW") {
    return wf.phase === SUBMISSION_PHASES.AWAITING_MANAGER || wf.phase === SUBMISSION_PHASES.SUBMITTED;
  }
  if (f === "MANAGER_SUBMITTED") {
    return wf.phase === SUBMISSION_PHASES.MANAGER_DONE || rs.includes("MANAGER_SUBMITTED");
  }
  if (f === "NEEDS_REVIEW") {
    return wf.phase === SUBMISSION_PHASES.RETURNED;
  }
  if (f === "APPROVED") {
    return wf.phase === SUBMISSION_PHASES.APPROVED;
  }
  return rs.includes(f) || st.includes(f);
}
