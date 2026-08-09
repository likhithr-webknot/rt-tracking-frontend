// @ts-nocheck
import { getAuthHeader } from "./auth";
import {
  buildApiUrl,
  ensureCsrfCookie,
  requestWithFallbacks,
  toHttpError,
  withCsrfHeaders,
} from "./http";

function isoAddDays(isoDate, deltaDays) {
  const raw = String(isoDate || "").trim();
  const parts = raw.split("-").map((p) => Number.parseInt(String(p), 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    const fb = new Date();
    return fb.toISOString().slice(0, 10);
  }
  const [y, m, d] = parts;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Number(deltaDays) || 0);
  return dt.toISOString().slice(0, 10);
}

function normalizeListEmail(value) {
  const s = String(value ?? "").trim();
  return s.includes("@") ? s : "";
}

function extractTimeLogRows(raw) {
  const root = raw && typeof raw === "object" ? raw : {};
  const nested = root?.data && typeof root.data === "object" ? root.data : null;
  return (
    (Array.isArray(raw) && raw) ||
    (Array.isArray(root?.data) && root.data) ||
    (Array.isArray(root?.content) && root.content) ||
    (Array.isArray(root?.items) && root.items) ||
    (Array.isArray(root?.results) && root.results) ||
    (Array.isArray(root?.list) && root.list) ||
    (Array.isArray(root?.timeLogs) && root.timeLogs) ||
    (Array.isArray(root?.timelogs) && root.timelogs) ||
    (Array.isArray(nested?.content) && nested.content) ||
    (Array.isArray(nested?.items) && nested.items) ||
    (Array.isArray(nested?.data) && nested.data) ||
    []
  );
}

export function normalizeTimeLogs(raw) {
  const list = extractTimeLogRows(raw);
  return list
    .map((row, i) => {
      if (!row || typeof row !== "object") return null;
      const id = String(row.id ?? row.timeLogId ?? row.logId ?? `tl_${i}`).trim();
      const logDate = String(
        row.logDate ?? row.date ?? row.workDate ?? row.loggedDate ?? row.day ?? ""
      ).trim();
      const projectName = String(
        row.projectName ?? row.project?.name ?? row.projectTitle ?? row.projectCode ?? ""
      ).trim();
      const hours = Number(row.hours ?? row.hoursLogged ?? row.durationHours ?? row.duration ?? 0);
      const description = String(row.description ?? row.notes ?? row.comment ?? row.summary ?? "").trim();
      return {
        id,
        logDate: logDate || "—",
        projectName: projectName || "General",
        hours: Number.isFinite(hours) ? hours : 0,
        description: description || "—",
        raw: row,
      };
    })
    .filter(Boolean);
}

async function fetchTimeLogsByEmployeeDays({ email, endIso, days, signal, headers }) {
  const safeEmail = normalizeListEmail(email);
  if (!safeEmail) return { data: [] };

  const merged = [];
  const seen = new Set();
  const n = Math.max(1, Math.min(Number(days) || 1, 90));
  const dayList = [];
  for (let i = 0; i < n; i += 1) {
    dayList.push(isoAddDays(endIso, -i));
  }

  const chunkSize = 8;
  for (let c = 0; c < dayList.length; c += chunkSize) {
    const chunk = dayList.slice(c, c + chunkSize);
    const results = await Promise.all(
      chunk.map(async (day) => {
        const path = `/api/v1/timelogs/${encodeURIComponent(safeEmail)}/${encodeURIComponent(day)}`;
        try {
          const res = await fetch(buildApiUrl(path), {
            method: "GET",
            signal,
            credentials: "include",
            headers,
          });
          if (!res.ok) return { day, rows: [] };
          const raw = await res.json().catch(() => ({}));
          return { day, rows: extractTimeLogRows(raw) };
        } catch (err) {
          if (err && typeof err === "object" && err.name === "AbortError") throw err;
          return { day, rows: [] };
        }
      }),
    );
    for (const { day, rows } of results) {
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const rid = String(row.id ?? row.timeLogId ?? row.logId ?? "").trim();
        const dedupe = rid || `${day}:${row.logDate ?? row.date ?? ""}:${row.projectId ?? row.projectName ?? ""}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        merged.push(row);
      }
    }
  }

  return { data: merged };
}

export async function fetchTimeLogs(options = {}) {
  const { signal, email: emailOpt, startDate, endDate, lookbackDays = 90 } = options;
  const auth = getAuthHeader();
  const headers = auth ? { Authorization: auth } : undefined;

  const end = String(endDate || new Date().toISOString().slice(0, 10)).trim() || new Date().toISOString().slice(0, 10);
  const lb = Math.max(7, Math.min(Number(lookbackDays) || 90, 365));
  const start = String(startDate || isoAddDays(end, -(lb - 1))).trim() || isoAddDays(end, -89);

  /** Prefer range + list paths where GET is implemented; bare `/api/v1/timelogs` is often POST-only (500 / method mismatch). */
  const candidates = [
    `/api/v1/timelogs/project/${encodeURIComponent(start)}/${encodeURIComponent(end)}`,
    `/api/v1/timelog/list`,
    `/api/v1/time-logs`,
    `/api/v1/timelogs`,
  ];

  try {
    return await requestWithFallbacks(candidates, {
      signal,
      headers,
      fallbackStatuses: [404, 405, 500],
      notFoundMessage: "Timelog list endpoint not found.",
    });
  } catch (err) {
    const email = normalizeListEmail(emailOpt);
    if (!email) throw err;
    const aggregated = await fetchTimeLogsByEmployeeDays({
      email,
      endIso: end,
      days: Math.min(lb, 60),
      signal,
      headers,
    });
    const rows = extractTimeLogRows(aggregated);
    if (!rows.length) throw err;
    return aggregated;
  }
}

export async function addTimeLog(payload, options = {}) {
  const { signal } = options;
  const auth = getAuthHeader();
  await ensureCsrfCookie({ signal, headers: auth ? { Authorization: auth } : undefined }).catch(() => {});
  const headers = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });
  const body = JSON.stringify(payload ?? {});
  const paths = ["/api/v1/timelog", "/api/v1/timelogs"];
  let lastErr = null;
  for (const path of paths) {
    const res = await fetch(buildApiUrl(path), {
      method: "POST",
      signal,
      credentials: "include",
      headers,
      body,
    });
    if (res.ok) return res.json().catch(() => ({}));
    const err = await toHttpError(res);
    if ([404, 405].includes(res.status)) {
      lastErr = err;
      continue;
    }
    throw err;
  }
  throw lastErr || new Error("Could not save time log.");
}
