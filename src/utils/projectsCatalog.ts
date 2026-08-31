// @ts-nocheck

import { formatDisplayDate, toIsoDateString } from "./displayDate";

const STORAGE_KEY = "rt_projects_catalog_v1";

export type ProjectCatalogRow = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  pm: string;
  am: string;
  active: boolean;
  updatedAt: string | null;
};

function slugId(name) {
  const base = String(name || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return base || `project-${Math.random().toString(36).slice(2, 8)}`;
}

/** Parse dates like 12-Feb-2026, 1-Dec-2024, or ISO. */
export function parseProjectDate(raw) {
  return toIsoDateString(raw);
}

export function formatProjectDate(iso) {
  return formatDisplayDate(iso);
}

/** Admin manual flag only (toggle in directory). */
export function isProjectListedActive(row) {
  return row?.active !== false;
}

/** Whether employees may see/select this project (listed active + not past end date). */
export function isProjectVisibleToEmployee(row, at = new Date()) {
  if (!isProjectListedActive(row)) return false;
  const start = row.startDate ? new Date(row.startDate) : null;
  if (start && !Number.isNaN(start.getTime())) {
    const dayStart = new Date(at.getFullYear(), at.getMonth(), at.getDate());
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    if (startDay > dayStart) return false;
  }
  const end = row.endDate ? new Date(row.endDate) : null;
  if (end && !Number.isNaN(end.getTime())) {
    const dayEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    const today = new Date(at.getFullYear(), at.getMonth(), at.getDate());
    if (dayEnd < today) return false;
  }
  return true;
}

/** Validate project dates for save / end-project flows. */
export function validateProjectDates({ startDate, endDate }) {
  const errors = [];
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  if (start && Number.isNaN(start.getTime())) errors.push("Start date is invalid.");
  if (end && Number.isNaN(end.getTime())) errors.push("End date is invalid.");
  if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end < start) {
    errors.push("End date must be on or after the start date.");
  }
  return { ok: errors.length === 0, errors };
}

/** @deprecated use isProjectVisibleToEmployee */
export function isProjectActive(row, at = new Date()) {
  return isProjectVisibleToEmployee(row, at);
}

export function mergeCatalogWithApiProjects(apiProjects, catalogRows = loadProjectsCatalog()) {
  const catalog = Array.isArray(catalogRows) ? catalogRows : [];
  const byName = new Map();
  for (const row of catalog) {
    const key = String(row.name || "").trim().toLowerCase();
    if (key) byName.set(key, row);
  }

  const out = [];
  const seen = new Set();

  for (const api of apiProjects || []) {
    const name = String(api?.name || "").trim();
    const key = name.toLowerCase();
    const cat = key ? byName.get(key) : null;
    const id = String(api?.id || api?.code || cat?.id || "").trim();
    if (!id) continue;
    seen.add(key || id);
    const row = cat || {
      id,
      name: name || id,
      startDate: api.startDate || null,
      endDate: api.endDate || null,
      pm: api.pm || "",
      am: api.am || "",
      active: api.active !== false,
    };
    out.push({
      ...catalogRowToApiShape(row),
      id,
      active: isProjectListedActive(row),
      employeeVisible: isProjectVisibleToEmployee(row),
      pm: row.pm || api.pm || "",
      am: row.am || api.am || "",
    });
  }

  for (const row of catalog) {
    const key = String(row.name || "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    out.push({
      ...catalogRowToApiShape(row),
      active: isProjectListedActive(row),
      employeeVisible: isProjectVisibleToEmployee(row),
    });
  }

  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Active projects only — for employee portal pickers. */
export function listActiveProjectsForEmployees(apiProjects, catalogRows) {
  return mergeCatalogWithApiProjects(apiProjects, catalogRows).filter((p) => p.employeeVisible);
}

export function loadProjectsCatalog() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveProjectsCatalog(rows) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows ?? []));
}

export function parseProjectsCsv(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = {
    name: header.findIndex((h) => h.includes("project")),
    start: header.findIndex((h) => h.includes("strt") || h.includes("start")),
    end: header.findIndex((h) => h.includes("end")),
    pm: header.findIndex((h) => h === "pm"),
    am: header.findIndex((h) => h === "am"),
  };

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const name = idx.name >= 0 ? cols[idx.name] : cols[0];
    if (!name) continue;
    const startDate = idx.start >= 0 ? parseProjectDate(cols[idx.start]) : null;
    const endDate = idx.end >= 0 ? parseProjectDate(cols[idx.end]) : null;
    rows.push({
      id: slugId(name),
      name,
      startDate,
      endDate,
      pm: idx.pm >= 0 ? cols[idx.pm] || "" : "",
      am: idx.am >= 0 ? cols[idx.am] || "" : "",
      active: !endDate || new Date(endDate) >= new Date(),
      updatedAt: new Date().toISOString(),
    });
  }
  return rows;
}

export function mergeProjectCatalogRows(existing, incoming) {
  const map = new Map();
  for (const row of existing) {
    const key = String(row.name || "").trim().toLowerCase();
    if (key) map.set(key, row);
  }
  for (const row of incoming) {
    const key = String(row.name || "").trim().toLowerCase();
    if (!key) continue;
    const prev = map.get(key);
    map.set(key, prev ? { ...prev, ...row, id: prev.id || row.id } : row);
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function catalogRowToApiShape(row) {
  return {
    id: row.id,
    code: row.id,
    name: row.name,
    description: [row.pm && `PM: ${row.pm}`, row.am && `AM: ${row.am}`].filter(Boolean).join(" · "),
    managerName: row.pm || row.am || "",
    active: row.active,
    startDate: row.startDate,
    endDate: row.endDate,
    pm: row.pm,
    am: row.am,
  };
}
