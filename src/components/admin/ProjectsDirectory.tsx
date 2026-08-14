// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import ListPaginationBar from "../shared/ListPaginationBar";
import TableDensityToggle from "../shared/TableDensityToggle";
import AdminPageHeader, { AdminPageShell } from "./AdminPageHeader";
import { fetchProjects, normalizeProjects } from "../../api/projects";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../hooks/queries";
import { useTableDensity } from "../../hooks/useTableDensity";
import {
  formatProjectDate,
  loadProjectsCatalog,
  mergeCatalogWithApiProjects,
} from "../../utils/projectsCatalog";
import { loadProjectsCache } from "../../utils/projectsCache";
import { toUserFacingMessage } from "../../utils/userFacingError";

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function rowFromApiProject(p) {
  return {
    id: String(p.id || p.code || "").trim(),
    name: String(p.name || "").trim(),
    code: String(p.code || "").trim(),
    startDate: p.startDate || null,
    endDate: p.endDate || null,
    pm: p.pm || p.managerName || "",
    am: p.am || "",
    active: p.active !== false,
    updatedAt: p.updatedAt || null,
  };
}

export default function ProjectsDirectory() {
  const { density, setDensity } = useTableDensity();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects.list({ all: true, source: "webtrak" }),
    queryFn: async ({ signal }) => {
      const raw = await fetchProjects({ signal });
      return {
        items: normalizeProjects(raw),
        fromCache: Boolean(raw?.fromCache),
        cachedAt: raw?.cachedAt || null,
      };
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const apiProjects = projectsQuery.data?.items ?? [];
  const fromCache = Boolean(projectsQuery.data?.fromCache);
  const apiLoading = projectsQuery.isLoading || projectsQuery.isFetching;

  const projects = useMemo(() => {
    const fromApi = apiProjects.map(rowFromApiProject);
    const catalog = loadProjectsCatalog();
    if (fromApi.length) return mergeCatalogWithApiProjects(fromApi, catalog);
    if (catalog.length) return mergeCatalogWithApiProjects([], catalog);
    const cached = loadProjectsCache();
    if (cached?.items?.length) {
      return mergeCatalogWithApiProjects(
        normalizeProjects({ items: cached.items }).map(rowFromApiProject),
        catalog,
      );
    }
    return [];
  }, [apiProjects]);

  const filtered = useMemo(() => {
    const isActive = (p) => (p.listedActive != null ? p.listedActive : p.active !== false);
    let list = projects;
    if (statusFilter === "active") list = projects.filter(isActive);
    else if (statusFilter === "inactive") list = projects.filter((p) => !isActive(p));
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        String(p.name || "").toLowerCase().includes(q) ||
        String(p.code || "").toLowerCase().includes(q) ||
        String(p.pm || "").toLowerCase().includes(q) ||
        String(p.am || "").toLowerCase().includes(q),
    );
  }, [projects, search, statusFilter]);

  const totalFiltered = filtered.length;
  const maxPage = Math.max(1, Math.ceil(totalFiltered / pageSize) || 1);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, pageSize]);

  useEffect(() => {
    if (page > maxPage) setPage(maxPage);
  }, [page, maxPage]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const rangeLabel = useMemo(() => {
    if (!totalFiltered) return "No projects";
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, totalFiltered);
    return `Showing ${start}–${end} of ${totalFiltered}`;
  }, [page, pageSize, totalFiltered]);

  const stats = useMemo(() => {
    const isActive = (p) => (p.listedActive != null ? p.listedActive : p.active !== false);
    const active = projects.filter(isActive).length;
    const withPm = projects.filter((p) => String(p.pm || "").trim()).length;
    return { total: projects.length, active, inactive: projects.length - active, withPm };
  }, [projects]);

  if (apiLoading && !projects.length && !projectsQuery.isError) {
    return (
      <AdminPageShell className="space-y-6">
        <AdminPageHeader
          title="Projects"
          subtitle="Company projects from Webtrak. Display only — changes are managed in Webtrak."
        />
        <div className="rt-panel flex items-center justify-center gap-2 py-16 text-sm text-[rgb(var(--muted))]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[rgb(var(--border))] border-t-[rgb(var(--accent))]" />
          Loading projects…
        </div>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell className="space-y-6">
      <AdminPageHeader
        title="Projects"
        subtitle="Company projects from Webtrak. Display only — changes are managed in Webtrak."
      />

      {projectsQuery.isError && !projects.length ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-800 dark:text-red-100">
          <div className="font-semibold">Couldn’t load projects</div>
          <p className="mt-1.5 text-xs sm:text-sm opacity-95">
            {toUserFacingMessage(
              projectsQuery.error?.message,
              "Please refresh the page or try again in a moment.",
            )}
          </p>
        </div>
      ) : null}

      {fromCache || (!apiLoading && !apiProjects.length && projects.length > 0) ? (
        <div className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 text-sm text-[rgb(var(--muted))]">
          Showing projects from the local cache because Webtrak is currently unreachable.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total", value: stats.total },
          { label: "Active", value: stats.active },
          { label: "Inactive", value: stats.inactive },
          { label: "With PM", value: stats.withPm },
        ].map((s) => (
          <div key={s.label} className="rt-stat">
            <div className="rt-field-label">{s.label}</div>
            <div className="mt-2 text-xl font-bold tabular-nums text-[rgb(var(--text))]">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="rt-toolbar-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search project, code, PM, or AM…"
              className="rt-input w-full pl-10"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rt-segmented shrink-0">
              {["all", "active", "inactive"].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setStatusFilter(f)}
                  className={[
                    "rt-segmented-item capitalize",
                    statusFilter === f ? "rt-segmented-item--active" : "",
                  ].join(" ")}
                >
                  {f}
                </button>
              ))}
            </div>
            <TableDensityToggle value={density} onChange={setDensity} />
          </div>
        </div>
      </div>

      <div className="rt-panel overflow-hidden">
        <div className="border-b border-[rgb(var(--border))] px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-[rgb(var(--text))]">Project roster</h2>
          <p className="pulse-section-subtitle mt-0.5">{rangeLabel}</p>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table
            className={[
              "rt-data-table min-w-[920px]",
              density === "comfortable" ? "rt-data-table--comfortable" : "rt-data-table--default",
            ].join(" ")}
          >
            <thead>
              <tr>
                <th className="min-w-[12rem]">Project</th>
                <th className="whitespace-nowrap">Code</th>
                <th className="whitespace-nowrap">Start</th>
                <th className="whitespace-nowrap">End</th>
                <th className="min-w-[9rem]">PM</th>
                <th className="min-w-[9rem]">AM</th>
                <th className="whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody>
              {apiLoading && !paginated.length ? (
                <tr>
                  <td colSpan={7} className="text-center text-[rgb(var(--muted))]">
                    Loading projects…
                  </td>
                </tr>
              ) : null}
              {paginated.map((p) => {
                const active = p.listedActive != null ? p.listedActive : p.active !== false;
                return (
                  <tr key={p.id}>
                    <td className="font-medium text-[rgb(var(--text))]">{p.name}</td>
                    <td className="font-mono text-xs text-[rgb(var(--muted))]">{p.code || "—"}</td>
                    <td className="tabular-nums text-[rgb(var(--muted))]">{formatProjectDate(p.startDate)}</td>
                    <td className="tabular-nums text-[rgb(var(--muted))]">{formatProjectDate(p.endDate)}</td>
                    <td>{p.pm || "—"}</td>
                    <td>{p.am || "—"}</td>
                    <td>
                      <span
                        className={[
                          "rt-badge uppercase",
                          active ? "rt-badge--success" : "rt-badge--neutral",
                        ].join(" ")}
                      >
                        {active ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!apiLoading && !filtered.length ? (
                <tr>
                  <td colSpan={7} className="text-center text-[rgb(var(--muted))]">
                    No projects to display.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <ListPaginationBar
          rangeLabel={rangeLabel}
          page={page}
          maxPage={maxPage}
          pageSize={pageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          loading={apiLoading}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </AdminPageShell>
  );
}
