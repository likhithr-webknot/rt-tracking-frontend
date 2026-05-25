// @ts-nocheck
import {
  Award,
  BadgeCheck,
  Briefcase,
  Calendar,
  ClipboardCheck,
  Clock,
  Cloud,
  FileBarChart2,
  Layers3,
  LayoutDashboard,
  Sparkles,
  StickyNote,
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

export const ADMIN_NAV_GROUPS = [
  {
    title: "Start here",
    items: [
      {
        id: "dashboard",
        icon: <LayoutDashboard size={20} />,
        label: "Home",
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
        id: "band-streams",
        icon: <Layers3 size={20} />,
        label: "Bands & departments",
        description: "Job levels and department names",
      },
      {
        id: "designations",
        icon: <BadgeCheck size={20} />,
        label: "Job titles",
        description: "Titles by band and department",
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
        label: "Company values",
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
        id: "notes",
        icon: <StickyNote size={20} />,
        label: "Notes",
        description: "Your private notebooks",
      },
      {
        id: "drive",
        icon: <Cloud size={20} />,
        label: "File sharing",
        description: "Upload and share files",
      },
    ],
  },
];

export const ADMIN_NAV_ITEMS = flattenNavGroups(ADMIN_NAV_GROUPS);

export const EMPLOYEE_NAV_GROUPS = [
  {
    title: "My review",
    items: [
      {
        id: "profile",
        icon: <UserCircle2 size={20} />,
        label: "My profile",
        description: "Your details and manager",
      },
      {
        id: "kpis",
        icon: <Target size={20} />,
        label: "Goals (KPIs)",
        description: "Rate your work goals this month",
      },
      {
        id: "values",
        icon: <Sparkles size={20} />,
        label: "Company values",
        description: "How you lived our values",
      },
      {
        id: "review",
        icon: <ClipboardCheck size={20} />,
        label: "Monthly review",
        description: "Write and submit your review",
      },
    ],
  },
  {
    title: "Work & time",
    items: [
      {
        id: "certifications",
        icon: <Award size={20} />,
        label: "Certifications",
        description: "Certificates that apply to you",
      },
      {
        id: "recognitions",
        icon: <Award size={20} />,
        label: "Recognition",
        description: "Shout-outs and highlights",
      },
      {
        id: "timelogs",
        icon: <Clock size={20} />,
        label: "Time sheet",
        description: "Log hours on projects",
      },
      {
        id: "leave-requests",
        icon: <Calendar size={20} />,
        label: "Leave & WFH",
        description: "Request time off or work from home",
      },
    ],
  },
  {
    title: "Just for you",
    items: [
      {
        id: "notes",
        icon: <StickyNote size={20} />,
        label: "Private notes",
        description: "Only you can see these",
      },
      {
        id: "drive",
        icon: <Cloud size={20} />,
        label: "My files",
        description: "Your personal file space",
      },
    ],
  },
];

export const EMPLOYEE_NAV_ITEMS = flattenNavGroups(EMPLOYEE_NAV_GROUPS);

export const MANAGER_NAV_GROUPS = [
  {
    title: "Your team",
    items: [
      {
        id: "team",
        icon: <Users size={20} />,
        label: "Team reviews",
        description: "Read and score your team's monthly reviews",
      },
      {
        id: "self-review",
        icon: <ClipboardCheck size={20} />,
        label: "Your own review",
        description: "Submit your manager self-review",
      },
    ],
  },
  {
    title: "Personal",
    items: [
      {
        id: "notes",
        icon: <StickyNote size={20} />,
        label: "Private notes",
        description: "Not visible to your team",
      },
      {
        id: "drive",
        icon: <Cloud size={20} />,
        label: "My files",
        description: "Your personal file space",
      },
    ],
  },
];

export const MANAGER_NAV_ITEMS = flattenNavGroups(MANAGER_NAV_GROUPS);

export const EMPLOYEE_TAB_COPY = {
  profile: { title: "My profile", subtitle: "Your name, role, and who you report to." },
  kpis: { title: "Goals (KPIs)", subtitle: "Score each goal for this month. Save as you go." },
  values: { title: "Company values", subtitle: "Share examples of how you demonstrated our values." },
  certifications: { title: "Certifications", subtitle: "Pick the certificates that apply to you this cycle." },
  recognitions: { title: "Recognition", subtitle: "Note praise from peers or projects (optional)." },
  review: { title: "Monthly review", subtitle: "Complete your self-review, then submit when the window is open." },
  timelogs: { title: "Time sheet", subtitle: "Record hours against your assigned projects." },
  "leave-requests": { title: "Leave & work from home", subtitle: "Submit leave, WFH, or comp-off requests." },
  notes: { title: "Private notes", subtitle: "Personal notebooks — not shared with HR or your manager." },
  drive: { title: "My files", subtitle: "Store files here. Only you can open them." },
};

export const MANAGER_TAB_COPY = {
  team: {
    title: "Team reviews",
    subtitle: "Open each person's submission, add scores, and submit when ready.",
  },
  "self-review": {
    title: "Your own review",
    subtitle: "Complete your monthly manager review for this cycle.",
  },
  notes: {
    title: "Private notes",
    subtitle: "Your notebooks stay private — reportees cannot see them.",
  },
  drive: {
    title: "My files",
    subtitle: "Personal storage. Not visible to your team.",
  },
};
