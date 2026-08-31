// @ts-nocheck
import {
  Award,
  Briefcase,
  ClipboardCheck,
  FileBarChart2,
  FolderKanban,
  History,
  KeyRound,
  LayoutDashboard,
  Sparkles,
  Target,
  UserCircle2,
  Users,
} from "lucide-react";

/** Flatten grouped nav for tab validation and legacy props. */
export function flattenNavGroups(groups) {
  const items = [];
  for (const group of groups || []) {
    for (const item of group.items || []) {
      items.push(item);
    }
  }
  return items;
}

/** Ordered monthly review steps shown in the employee stepper. */
export const EMPLOYEE_REVIEW_STEP_IDS = [
  "profile",
  "projects",
  "kpis",
  "values",
  "certifications",
  "recognitions",
  "review",
];

export const ADMIN_NAV_GROUPS = [
  {
    title: "Start here",
    items: [
      {
        id: "dashboard",
        icon: <LayoutDashboard size={20} />,
        label: "Dashboard",
        description: "Overview, alerts, and quick links",
      },
    ],
  },
  {
    title: "People & reviews",
    items: [
      {
        id: "directory",
        icon: <Users size={20} />,
        label: "Team list",
        description: "View and update employee profiles",
      },
      {
        id: "submissions",
        icon: <ClipboardCheck size={20} />,
        label: "Monthly reviews",
        description: "Approve or send back submissions",
      },
      {
        id: "ratings-history",
        icon: <History size={20} />,
        label: "Ratings history",
        description: "All cycles and months — Super Admin only",
      },
    ],
  },
  {
    title: "Company setup",
    items: [
      {
        id: "projects",
        icon: <Briefcase size={20} />,
        label: "Projects",
        description: "Client and internal project list",
      },
      {
        id: "certifications",
        icon: <Award size={20} />,
        label: "Certifications",
        description: "Credentials employees can select",
      },
      {
        id: "kpi",
        icon: <Target size={20} />,
        label: "Goals & KPIs",
        description: "What people are measured on",
      },
      {
        id: "values",
        icon: <Sparkles size={20} />,
        label: "Webknot values",
        description: "Culture and values scoring",
      },
    ],
  },
  {
    title: "More tools",
    items: [
      {
        id: "reports",
        icon: <FileBarChart2 size={20} />,
        label: "Reports",
        description: "Download and explore data",
      },
      {
        id: "apps",
        icon: <KeyRound size={20} />,
        label: "Apps",
        description: "Create and rotate WebTrak API keys",
      },
    ],
  },
];

export const ADMIN_NAV_ITEMS = flattenNavGroups(ADMIN_NAV_GROUPS);

export const EMPLOYEE_NAV_GROUPS = [
  {
    title: "Monthly review",
    items: [
      {
        id: "profile",
        icon: <UserCircle2 size={20} />,
        label: "1. Profile",
        description: "Confirm your details",
      },
      {
        id: "projects",
        icon: <FolderKanban size={20} />,
        label: "2. Projects",
        description: "Pick active projects this cycle",
      },
      {
        id: "kpis",
        icon: <Target size={20} />,
        label: "3. Goals (KPIs)",
        description: "Rate your goals",
      },
      {
        id: "values",
        icon: <Sparkles size={20} />,
        label: "4. Values",
        description: "How you lived our values",
      },
      {
        id: "certifications",
        icon: <Award size={20} />,
        label: "5. Certifications",
        description: "Certificates with proof",
      },
      {
        id: "recognitions",
        icon: <Award size={20} />,
        label: "6. Recognition",
        description: "Shout-outs (optional)",
      },
      {
        id: "review",
        icon: <ClipboardCheck size={20} />,
        label: "7. Review & submit",
        description: "Final check and submit",
      },
    ],
  },
  {
    title: "Just for you",
    items: [
      {
        id: "performance",
        icon: <History size={20} />,
        label: "My ratings",
        description: "All-time scores by month and cycle",
      },
    ],
  },
];

export const EMPLOYEE_NAV_ITEMS = flattenNavGroups(EMPLOYEE_NAV_GROUPS);

export const MANAGER_NAV_GROUPS = [
  {
    title: "Reviews",
    items: [
      {
        id: "team",
        icon: <Users size={20} />,
        label: "Team reviews",
        description: "Score and approve your team",
      },
      {
        id: "self-review",
        icon: <ClipboardCheck size={20} />,
        label: "Your review",
        description: "Submit your manager self-review",
      },
    ],
  },
];

export const MANAGER_NAV_ITEMS = flattenNavGroups(MANAGER_NAV_GROUPS);

export const EMPLOYEE_TAB_COPY = {
  profile: { title: "My profile", subtitle: "Step 1 — confirm your name, role, band, and department before continuing." },
  projects: {
    title: "Active projects",
    subtitle: "Step 2 — select up to 3 projects you worked on. PMs or AMs are notified when you submit.",
  },
  kpis: { title: "Goals (KPIs)", subtitle: "Step 3 — score each goal for this month and write your self-review notes." },
  values: { title: "Company values", subtitle: "Step 4 — share examples of how you demonstrated our values." },
  certifications: { title: "Certifications", subtitle: "Step 5 — pick certificates that apply to you and add proof links." },
  recognitions: { title: "Recognition", subtitle: "Step 6 — note praise from peers or projects (optional)." },
  review: {
    title: "Review & submit",
    subtitle: "Step 7 — read everything once more, then submit to lock this month.",
  },
  performance: {
    title: "My ratings",
    subtitle: "Your all-time performance — month-by-month and grouped by review cycle.",
  },
};

export const MANAGER_TAB_COPY = {
  team: {
    title: "Team reviews",
    subtitle: "Open each person's submission, add scores, and approve or send back for changes.",
  },
  "self-review": {
    title: "Your manager review",
    subtitle: "Complete your monthly self-review for this cycle.",
  },
};

export const ADMIN_TAB_COPY = {
  dashboard: {
    title: "Dashboard",
    subtitle: "Cycle health, submissions, and organization metrics at a glance.",
    sectionLabel: "Overview",
  },
  submissions: {
    title: "Monthly reviews",
    subtitle: "Approve submissions or send them back for changes.",
    sectionLabel: "People & reviews",
  },
  directory: {
    title: "Team list",
    subtitle: "View and update employee profiles, bands, and reporting lines.",
    sectionLabel: "People & reviews",
  },
  "ratings-history": {
    title: "Ratings history",
    subtitle: "Full timeline of monthly review scores — every employee, cycle, and month.",
    sectionLabel: "People & reviews",
  },
  projects: {
    title: "Projects",
    subtitle: "Client and internal projects — assign PMs, AMs, and team members.",
    sectionLabel: "Company setup",
  },
  reports: {
    title: "Reports",
    subtitle: "Download and explore review and allocation data.",
    sectionLabel: "More tools",
  },
  kpi: {
    title: "Goals & KPIs",
    subtitle: "Define what employees and managers are measured on each cycle.",
    sectionLabel: "Company setup",
  },
  values: {
    title: "Company values",
    subtitle: "Culture pillars and scoring criteria for monthly reviews.",
    sectionLabel: "Company setup",
  },
  "band-streams": {
    title: "Bands & departments",
    subtitle: "Job levels and department names used across the org.",
    sectionLabel: "Company setup",
  },
  certifications: {
    title: "Certifications",
    subtitle: "Credentials employees can select during their review.",
    sectionLabel: "Company setup",
  },
  apps: {
    title: "Apps",
    subtitle: "Create WebTrak API keys with optional expiry, then rotate or revoke them.",
    sectionLabel: "More tools",
  },
  settings: {
    title: "Settings",
    subtitle: "Submission windows, display preferences, and security options.",
    sectionLabel: "Administration",
  },
  account: {
    title: "Your account",
    subtitle: "Profile details and sign-in preferences.",
    sectionLabel: "Account",
  },
};
