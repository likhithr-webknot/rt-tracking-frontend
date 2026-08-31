// @ts-nocheck

import { PORTAL_ROLE_LABELS, resolvePortalRoleLabel } from "./portalRole";

/** Guide variants — one per portal experience, not Webtrak ROLE_* grants. */
export const USAGE_GUIDE_KEYS = {
  EMPLOYEE: "employee",
  HR_EMPLOYEE: "hr_employee",
  MANAGER: "manager",
  HR_ADMIN: "hr_admin",
  SUPER_ADMIN: "super_admin",
  FINANCE: "finance",
};

/**
 * Pick the guide for the signed-in user in the current portal shell.
 * @param {"employee"|"manager"|"admin"} portalShell
 */
export function resolveUsageGuideKey({
  portalShell = "employee",
  auth = null,
  isHrUser = false,
  isSuperAdmin = false,
} = {}) {
  const portalRole = resolvePortalRoleLabel(
    auth?.portalRole,
    auth?.empRole,
    auth?.role,
    auth?.portal,
  );

  if (portalShell === "admin") {
    if (isSuperAdmin || portalRole === PORTAL_ROLE_LABELS.SUPER_ADMIN) {
      return USAGE_GUIDE_KEYS.SUPER_ADMIN;
    }
    if (portalRole === PORTAL_ROLE_LABELS.FINANCE) {
      return USAGE_GUIDE_KEYS.FINANCE;
    }
    return USAGE_GUIDE_KEYS.HR_ADMIN;
  }

  if (portalShell === "manager") {
    return USAGE_GUIDE_KEYS.MANAGER;
  }

  if (isHrUser || portalRole === PORTAL_ROLE_LABELS.HR) {
    return USAGE_GUIDE_KEYS.HR_EMPLOYEE;
  }

  return USAGE_GUIDE_KEYS.EMPLOYEE;
}

/** @typedef {{ id: string, title: string, body: string, tips?: string[] }} UsageGuideSection */

/** @type {Record<string, { title: string, subtitle: string, roleLabel: string, sections: UsageGuideSection[] }>} */
export const PORTAL_USAGE_GUIDES = {
  [USAGE_GUIDE_KEYS.EMPLOYEE]: {
    title: "How to use Pulse — Employee",
    subtitle: "Complete your monthly self-review before the submission window closes.",
    roleLabel: "Employee",
    sections: [
      {
        id: "cycle",
        title: "Monthly review flow",
        body: "Work through the numbered steps in the sidebar each cycle. Your progress is saved as a draft until you submit on the final step.",
        tips: [
          "1. Profile — confirm your name, band, and department.",
          "2. Projects — pick up to 3 active projects; PMs/AMs are notified when you submit.",
          "3. Goals (KPIs) — rate each goal 1–5 and add self-review notes.",
          "4. Values — score how you demonstrated company values this month.",
          "5. Certifications — select credentials and add proof links where required.",
          "6. Recognition — optional shout-outs from peers or projects.",
          "7. Review & submit — read everything once, then submit to lock the month.",
        ],
      },
      {
        id: "after-submit",
        title: "After you submit",
        body: "Submitted reviews are locked for that month. You can still open My ratings to see history and browse settings.",
        tips: [
          "If your manager sends the review back, follow the resubmission checklist on the Review tab.",
          "The submission window must be open to edit review tabs — outside the window you can still view profile and ratings history.",
        ],
      },
      {
        id: "account",
        title: "Profile & session",
        body: "Use the account menu (top right) for your profile. Pulse will warn you before your session expires; choose Stay signed in to continue working.",
        tips: ["Settings (sidebar footer) controls theme and date display on this device."],
      },
    ],
  },

  [USAGE_GUIDE_KEYS.HR_EMPLOYEE]: {
    title: "How to use Pulse — HR (Employee view)",
    subtitle: "You have HR admin access; this portal is for your own monthly self-review.",
    roleLabel: "HR · Employee workspace",
    sections: [
      {
        id: "hr-dual",
        title: "Two workspaces",
        body: "Complete your personal monthly review here using the same 7-step flow as other employees. For HR admin tasks, open HR admin tools from the banner or go to /admin.",
        tips: [
          "Leadership self-review (band KPIs, all values, super-admin reviewer) lives under Manager → Your review when assigned.",
          "Team list, monthly review approvals, and company setup are in the Admin portal.",
        ],
      },
      {
        id: "cycle",
        title: "Your monthly review",
        body: "Follow Profile → Projects → KPIs → Values → Certifications → Recognition → Review & submit.",
        tips: [
          "HR users typically see KPIs and values scoped to their band and department.",
          "Submit before the cycle window closes — drafts do not count as submitted.",
        ],
      },
    ],
  },

  [USAGE_GUIDE_KEYS.MANAGER]: {
    title: "How to use Pulse — Manager",
    subtitle: "Review your team's submissions and complete your own manager self-review.",
    roleLabel: "Manager",
    sections: [
      {
        id: "team",
        title: "Team reviews",
        body: "Open Team reviews to see who has submitted for the selected month. Filter by pending review, submitted, or all.",
        tips: [
          "Open a row to score KPIs and values, add manager notes, then Approve or Send back for changes.",
          "Sending back requires a comment — the employee sees it on their Review tab with a resubmission checklist.",
          "Use Refresh if a submission was just submitted; pagination loads more reportees when available.",
        ],
      },
      {
        id: "self",
        title: "Your manager review",
        body: "Use Your review to complete your own monthly self-review for the same cycle.",
        tips: [
          "Draft saves automatically; submit when the window is open.",
          "If you also report to a super-admin reviewer, select them before submitting.",
        ],
      },
      {
        id: "month",
        title: "Cycle & month picker",
        body: "Switch months in the header to review past cycles or catch up on pending items.",
        tips: ["Notifications alert you when team members submit or when action is needed."],
      },
    ],
  },

  [USAGE_GUIDE_KEYS.HR_ADMIN]: {
    title: "How to use Pulse — HR Admin",
    subtitle: "Operate reviews, people data, and company setup for the organization.",
    roleLabel: "HR",
    sections: [
      {
        id: "start",
        title: "Start here",
        body: "Dashboard shows cycle health, submission counts, and alerts. Use it at the beginning of each review period.",
        tips: [
          "Team list — browse employees, open read-only profiles, set portal roles.",
          "Monthly reviews — approve or send back employee submissions org-wide.",
        ],
      },
      {
        id: "setup",
        title: "Company setup",
        body: "Keep master data current before each cycle so employees see the right KPIs, values, and projects.",
        tips: [
          "Projects — maintain the project catalog employees pick from.",
          "Goals & KPIs — define goals by band and department.",
          "Webknot values — culture pillars used in monthly scoring.",
          "Certifications — credentials available in employee reviews.",
        ],
      },
      {
        id: "settings",
        title: "Windows & settings",
        body: "Settings controls submission windows (when employees and managers can edit), email notifications, and display defaults.",
        tips: [
          "Open the global submission window before announcing a new cycle.",
          "HR cannot modify Super Admin accounts in the directory.",
        ],
      },
    ],
  },

  [USAGE_GUIDE_KEYS.SUPER_ADMIN]: {
    title: "How to use Pulse — Super Admin",
    subtitle: "Full access to reviews, people, configuration, and audit tools.",
    roleLabel: "Super Admin",
    sections: [
      {
        id: "overview",
        title: "Overview",
        body: "Dashboard summarizes org-wide submission status. Use Team list and Monthly reviews for day-to-day people operations.",
        tips: [
          "Ratings history — full timeline of scores across employees, cycles, and months (Super Admin only).",
          "Reports — export review, allocation, and roster data.",
          "Apps — create and rotate WebTrak API keys for integrations.",
        ],
      },
      {
        id: "people",
        title: "People & reviews",
        body: "Directory profiles are read-only from WebTrak; portal roles control who lands in Employee, Manager, or Admin workspaces.",
        tips: [
          "Assign portal roles from the directory — these are separate from WebTrak security roles (ROLE_ADMIN, etc.).",
          "Monthly reviews — bulk approve or reject with comments.",
        ],
      },
      {
        id: "setup",
        title: "Configuration",
        body: "Maintain KPIs, values, certifications, bands, and projects before each cycle.",
        tips: [
          "Settings — submission windows, session timeout, scoring, and notification templates.",
          "Operations workspace (if enabled) — diagnostic auth and API tools for support.",
        ],
      },
    ],
  },

  [USAGE_GUIDE_KEYS.FINANCE]: {
    title: "How to use Pulse — Finance",
    subtitle: "Admin access focused on reports and operational visibility.",
    roleLabel: "Finance",
    sections: [
      {
        id: "reports",
        title: "Reports & exports",
        body: "Use Reports to download review and workforce data. Dashboard gives a quick read on submission completion.",
        tips: [
          "Team list — view employee roster details; profile edits remain with HR/Super Admin.",
          "Monthly reviews — read submission status; approval workflows follow HR policy.",
        ],
      },
      {
        id: "settings",
        title: "Settings",
        body: "Adjust display preferences and review window visibility as permitted by your organization.",
        tips: ["Contact Super Admin or HR for changes to KPIs, values, or submission windows."],
      },
    ],
  },
};

export function getPortalUsageGuide(guideKey) {
  return PORTAL_USAGE_GUIDES[guideKey] || PORTAL_USAGE_GUIDES[USAGE_GUIDE_KEYS.EMPLOYEE];
}
