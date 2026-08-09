/**
 * Central registry of TanStack Query keys.
 *
 * Each key is a function that returns a `readonly unknown[]`. Use the helper
 * that matches the scope of the cache entry you want to read or invalidate:
 *
 *   - `queryKeys.kpi.all` — every KPI-related query
 *   - `queryKeys.kpi.list({ limit: 20, offset: 0 })` — one specific list page
 *
 * Treat these as the single source of truth — components MUST import keys
 * from here instead of inlining `["something", ...]` arrays. That keeps
 * `invalidateQueries({ queryKey: queryKeys.x.all })` from missing anything.
 */

type Json = Record<string, unknown> | undefined;

export const queryKeys = {
  auth: {
    all: ["auth"] as const,
    me: () => ["auth", "me"] as const,
  },
  bandStreamDirectory: {
    all: ["band-stream-directory"] as const,
    list: () => ["band-stream-directory", "list"] as const,
  },
  bands: {
    all: ["bands"] as const,
    list: (params?: Json) => ["bands", "list", params ?? {}] as const,
    byId: (id: string | number) => ["bands", "by-id", String(id)] as const,
  },
  streams: {
    all: ["streams"] as const,
    list: (params?: Json) => ["streams", "list", params ?? {}] as const,
  },
  designations: {
    all: ["designations"] as const,
    forBandDepartment: (bandId?: string | number | null, department?: string | null) =>
      ["designations", "for", String(bandId ?? ""), String(department ?? "")] as const,
  },
  kpiDefinitions: {
    all: ["kpi-definitions"] as const,
    list: (params?: Json) => ["kpi-definitions", "list", params ?? {}] as const,
    byId: (id: string | number) => ["kpi-definitions", "by-id", String(id)] as const,
  },
  webknotValues: {
    all: ["webknot-values"] as const,
    list: (params?: Json) => ["webknot-values", "list", params ?? {}] as const,
  },
  certifications: {
    all: ["certifications"] as const,
    list: (params?: Json) => ["certifications", "list", params ?? {}] as const,
    byId: (id: string) => ["certifications", "by-id", id] as const,
  },
  projects: {
    all: ["projects"] as const,
    list: (params?: Json) => ["projects", "list", params ?? {}] as const,
    mine: () => ["projects", "mine"] as const,
    managerProjects: () => ["projects", "manager"] as const,
  },
  settings: {
    all: ["settings"] as const,
    list: () => ["settings", "list"] as const,
    byKey: (key: string) => ["settings", "by-key", key] as const,
  },
  employees: {
    all: ["employees"] as const,
    list: (params?: Json) => ["employees", "list", params ?? {}] as const,
    byId: (id: string) => ["employees", "by-id", id] as const,
    profile: () => ["employees", "profile"] as const,
    managers: () => ["employees", "managers"] as const,
  },
  submissionCycles: {
    all: ["submission-cycles"] as const,
    list: (params?: Json) => ["submission-cycles", "list", params ?? {}] as const,
    byId: (id: string | number) => ["submission-cycles", "by-id", String(id)] as const,
    byKey: (key: string, scope?: string | null) =>
      ["submission-cycles", "by-key", key, scope ?? ""] as const,
  },
  monthlySubmissions: {
    all: ["monthly-submissions"] as const,
    forCycleEmployee: (cycleKey: string, employeeId: string) =>
      ["monthly-submissions", "cycle", cycleKey, "employee", employeeId] as const,
    adminList: (params?: Json) => ["monthly-submissions", "admin-list", params ?? {}] as const,
    managerTeam: (params?: Json) => ["monthly-submissions", "manager-team", params ?? {}] as const,
  },
  notifications: {
    all: ["notifications"] as const,
    forUser: (userId: string | number) => ["notifications", String(userId)] as const,
  },
  userRequests: {
    all: ["user-requests"] as const,
    range: (params: Json) => ["user-requests", "range", params ?? {}] as const,
    managers: () => ["user-requests", "managers"] as const,
  },
} as const;

export type QueryKeys = typeof queryKeys;
