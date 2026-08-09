#!/usr/bin/env node
// API smoke harness for webtrak backend.
//
// Logs in as a dev user via /oauth/bypass/{email}, captures cookies, then
// fires a curated request at every controller endpoint and prints a report.
//
// Usage:
//   BACKEND_URL=http://localhost:8080 ADMIN_EMAIL=your-super-admin@webknot.in node scripts/api-smoke.mjs
//   node scripts/api-smoke.mjs --md=scripts/api-smoke-report.md
//
// Exits 0 if no endpoints regressed (5xx / unexpected 4xx), otherwise 1.

import { writeFileSync } from "node:fs";
import { argv, env, exit } from "node:process";

const BASE = (env.BACKEND_URL || "http://localhost:8080").replace(/\/$/, "");
const ADMIN_EMAIL = String(env.ADMIN_EMAIL || "").trim();
const _MANAGER_EMAIL = env.MANAGER_EMAIL || "manager1@webtrak.local";
void _MANAGER_EMAIL;

if (!ADMIN_EMAIL) {
  console.error("Missing ADMIN_EMAIL. Example:");
  console.error("  ADMIN_EMAIL=your-super-admin@webknot.in node scripts/api-smoke.mjs");
  exit(1);
}

const args = Object.fromEntries(
  argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);
const REPORT_PATH = args.md || "scripts/api-smoke-report.md";

// ---------- minimal cookie jar -----------------------------------------------

class CookieJar {
  constructor() {
    this.cookies = new Map(); // name -> value
  }
  ingest(setCookieHeader) {
    if (!setCookieHeader) return;
    const lines = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : setCookieHeader.split(/,(?=[^;]+=[^;]+)/);
    for (const line of lines) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (!name) continue;
      if (!value || value === "deleted") {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }
  header() {
    if (this.cookies.size === 0) return undefined;
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  clear() {
    this.cookies.clear();
  }
}

// ---------- HTTP helper ------------------------------------------------------

async function call(jar, method, path, { body, query, headers, redirect = "manual" } = {}) {
  const url = new URL(path.startsWith("http") ? path : `${BASE}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.append(k, String(v));
    }
  }
  const init = {
    method,
    redirect,
    headers: {
      Accept: "application/json",
      ...(headers || {}),
    },
  };
  const cookie = jar.header();
  if (cookie) init.headers.Cookie = cookie;
  if (body !== undefined) {
    if (body instanceof FormData) {
      init.body = body;
    } else {
      init.headers["Content-Type"] = "application/json";
      init.body = typeof body === "string" ? body : JSON.stringify(body);
    }
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch (err) {
    return { ok: false, status: 0, statusText: String(err), body: null, raw: null };
  }
  const setCookie = res.headers.getSetCookie?.() ?? res.headers.get("set-cookie");
  jar.ingest(setCookie);
  const raw = await res.text();
  let parsed = null;
  try {
    parsed = raw && raw.startsWith("{") ? JSON.parse(raw) : raw && raw.startsWith("[") ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  return { ok: res.ok, status: res.status, statusText: res.statusText, body: parsed, raw };
}

// ---------- login via dev bypass --------------------------------------------

async function loginAs(email) {
  const jar = new CookieJar();
  const res = await call(jar, "GET", `/oauth/bypass/${encodeURIComponent(email)}`, { redirect: "manual" });
  // The handler typically redirects with cookies on success.
  if (res.status >= 400) {
    throw new Error(`bypass login failed for ${email}: ${res.status} ${res.statusText} ${res.raw?.slice(0, 200)}`);
  }
  if (!jar.cookies.has("accessToken")) {
    throw new Error(`bypass login did not yield accessToken for ${email}. cookies=${[...jar.cookies.keys()].join(",")}`);
  }
  return jar;
}

// ---------- endpoint catalog -------------------------------------------------

// Each test is { name, method, path, query?, body?, expect?: number[] | (status, body) => boolean, skip?: boolean }
const tests = [];
const T = (...args) => {
  tests.push(Object.assign({}, ...args));
};

// AUTH / SELF
T({ tag: "auth", name: "user role", method: "GET", path: "/api/v1/user/role" });
T({ tag: "auth", name: "profile", method: "GET", path: "/api/v1/profile" });

// USERS / EMPLOYEES
T({ tag: "users", name: "list onboarded users", method: "GET", path: "/api/v1/user/onboard", query: { page: 0, size: 5 } });
T({ tag: "users", name: "list users (employees)", method: "GET", path: "/api/v1/employees", query: { page: 0, size: 5 } });
T({ tag: "users", name: "user email-name index", method: "GET", path: "/api/v1/user/get-email-name" });
T({ tag: "users", name: "client-proj-status", method: "GET", path: "/api/v1/client-proj-status" });

// DESIGNATIONS
T({ tag: "designations", name: "list designations", method: "GET", path: "/api/v1/designations" });

// BAND / STREAM
T({ tag: "bands", name: "band-list", method: "GET", path: "/api/v1/band-list" });
T({ tag: "bands", name: "departments (streams)", method: "GET", path: "/api/v1/departments" });
T({ tag: "bands", name: "streams", method: "GET", path: "/api/v1/streams" });

// KPI DEFINITIONS
T({ tag: "kpi", name: "list kpi-definitions", method: "GET", path: "/api/v1/kpi-definitions" });
T({ tag: "kpi", name: "list-kpi-definitions", method: "GET", path: "/api/v1/list-kpi-definitions" });

// WEBKNOT VALUES
T({ tag: "webknot", name: "list webknot-values", method: "GET", path: "/api/v1/webknot-values" });
T({ tag: "webknot", name: "list webknot-value (singular)", method: "GET", path: "/api/v1/webknot-value" });

// CERTIFICATIONS (none in the controller list?) we'll check via webknot/cert if exists in URL space
// SETTINGS
T({ tag: "settings", name: "list settings", method: "GET", path: "/api/v1/settings" });
T({ tag: "settings", name: "list-settings alias", method: "GET", path: "/api/v1/list-settings" });

// SUBMISSION CYCLES
T({ tag: "cycles", name: "list submission-cycles", method: "GET", path: "/api/v1/submission-cycles" });
T({ tag: "cycles", name: "list-submission-cycles alias", method: "GET", path: "/api/v1/list-submission-cycles" });
T({ tag: "cycles", name: "resolve-submission-cycle (no key -> 400 ok)", method: "GET", path: "/api/v1/resolve-submission-cycle", expect: [200, 400, 404] });

// NOTIFICATIONS (need userId)
// We'll wire that dynamically.

// PROJECTS
T({ tag: "projects", name: "list projects", method: "GET", path: "/api/v1/projects", query: { page: 0, size: 5 } });
T({ tag: "projects", name: "manager-projects", method: "GET", path: "/api/v1/manager-projects" });
T({ tag: "projects", name: "manager-projects-with-roles", method: "GET", path: "/api/v1/manager-projects-with-roles" });
T({ tag: "projects", name: "project-assigned-to-user", method: "GET", path: "/api/v1/project-assigned-to-user" });
T({ tag: "projects", name: "manager allocation-ending-soon", method: "GET", path: "/api/v1/manager/allocation-ending-soon" });

// ALLOCATIONS
T({ tag: "alloc", name: "list allocations", method: "GET", path: "/api/v1/allocation", query: { page: 0, size: 5 } });
T({ tag: "alloc", name: "allocation/user", method: "GET", path: "/api/v1/allocation/user" });
T({ tag: "alloc", name: "allocation/forecasting", method: "GET", path: "/api/v1/allocation/forecasting" });
T({ tag: "alloc", name: "allocation/roles", method: "GET", path: "/api/v1/allocation/roles" });

// ALLOCATION EXTENSIONS
T({ tag: "alloc-ext", name: "list allocation-extension-request", method: "GET", path: "/api/v1/allocation-extension-request" });
T({ tag: "alloc-ext", name: "manager allocation-extension-status", method: "GET", path: "/api/v1/manager/allocation-extension-status" });

// USER REQUESTS
T({ tag: "user-req", name: "user-requests managers", method: "GET", path: "/api/v1/user-requests/managers" });
T({ tag: "user-req", name: "userRequest managers alias", method: "GET", path: "/api/v1/userRequest/managers" });

// LEAVE SUMMARY
T({ tag: "leave", name: "leave-summary", method: "GET", path: "/api/v1/leave-summary", expect: [200, 403] });

// SUBMISSION CYCLE GET ENDPOINTS (path params filled dynamically)

// CRON (public)
T({ tag: "cron", name: "cron reminder", method: "GET", path: "/api/v1/reminder", expect: [200, 204] });
T({ tag: "cron", name: "cron run-monthly-leave-cron", method: "GET", path: "/api/v1/run-monthly-leave-cron", expect: [200, 204] });

// MISC
T({ tag: "auth", name: "google signin (redirect)", method: "GET", path: "/api/v1/google-signin", expect: [200, 302, 303] });

// ---------- main -------------------------------------------------------------

const results = [];

function redactSensitiveReportText(text) {
  return String(text ?? "")
    .replace(/[a-z0-9._+-]+@webknot\.in/gi, "[user]@webknot.in")
    .replace(/\bLikhith R\b/gi, "[Admin User]");
}

function fmtBody(body, max = 220) {
  if (body == null) return "";
  if (typeof body === "string") return redactSensitiveReportText(body.slice(0, max));
  let s;
  try { s = JSON.stringify(body); } catch { s = String(body); }
  s = redactSensitiveReportText(s);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

async function runOne(jar, test) {
  if (test.skip) {
    return { ...test, status: "SKIP", code: 0, note: test.skipReason || "skipped" };
  }
  const expect = test.expect || [200];
  const expectFn = typeof expect === "function" ? expect : (s) => expect.includes(s);
  const res = await call(jar, test.method, test.path, { body: test.body, query: test.query });
  const ok = expectFn(res.status, res.body);
  const status = res.status === 0 ? "DOWN" : ok ? "PASS" : res.status >= 500 ? "FAIL" : "WARN";
  return {
    tag: test.tag,
    name: test.name,
    method: test.method,
    path: test.path,
    code: res.status,
    status,
    note: ok ? fmtBody(res.body, 80) : fmtBody(res.body, 300) || res.statusText,
  };
}

async function run() {
  console.log(`[smoke] backend=${BASE}  admin=${ADMIN_EMAIL}`);
  const jar = await loginAs(ADMIN_EMAIL);
  console.log(`[smoke] logged in as ${ADMIN_EMAIL}. cookies=${[...jar.cookies.keys()].join(",")}`);

  // Discover an admin userId from /user/role (often returns user info) or from notifications by listing.
  const role = await call(jar, "GET", "/api/v1/user/role");
  const meId =
    role.body?.data?.id ??
    role.body?.data?.userId ??
    role.body?.user?.id ??
    role.body?.id ??
    null;
  if (meId) {
    T({ tag: "notif", name: "list notifications", method: "GET", path: `/api/v1/notifications/${meId}` });
  } else {
    T({ tag: "notif", name: "list notifications (no userId)", method: "GET", path: "/api/v1/notifications/0", expect: [200, 400, 404] });
  }

  // Discover IDs to test detail endpoints.
  const kpiList = await call(jar, "GET", "/api/v1/kpi-definitions");
  const kpiId = pickId(kpiList.body);
  if (kpiId) {
    T({ tag: "kpi", name: "get kpi-definition by id", method: "GET", path: `/api/v1/kpi-definitions/${kpiId}` });
    T({ tag: "kpi", name: "get-kpi-definition alias", method: "GET", path: `/api/v1/get-kpi-definition/${kpiId}` });
  }

  const cycleList = await call(jar, "GET", "/api/v1/submission-cycles");
  const cycleId = pickId(cycleList.body);
  if (cycleId) {
    T({ tag: "cycles", name: "get submission-cycle by id", method: "GET", path: `/api/v1/submission-cycles/${cycleId}` });
    T({ tag: "cycles", name: "get-submission-cycle alias", method: "GET", path: `/api/v1/get-submission-cycle/${cycleId}` });
  }

  const wkList = await call(jar, "GET", "/api/v1/webknot-values");
  const wkId = pickId(wkList.body);
  if (wkId) {
    T({ tag: "webknot", name: "get webknot-value by id (PATCH-allowed)", method: "GET", path: `/api/v1/webknot-values/${wkId}`, expect: [200, 405, 404] });
  }

  const bandList = await call(jar, "GET", "/api/v1/band-list");
  const bandId = pickId(bandList.body);
  if (bandId) {
    T({ tag: "bands", name: "get band by id", method: "GET", path: `/api/v1/band/${bandId}`, expect: [200, 404] });
    T({ tag: "bands", name: "get bands by id alias", method: "GET", path: `/api/v1/bands/${bandId}`, expect: [200, 404] });
  }

  const settingsList = await call(jar, "GET", "/api/v1/settings");
  const settingKey = pickKey(settingsList.body);
  if (settingKey) {
    T({ tag: "settings", name: "get setting by key", method: "GET", path: `/api/v1/settings/${encodeURIComponent(settingKey)}` });
    T({ tag: "settings", name: "get-setting alias", method: "GET", path: `/api/v1/get-setting/${encodeURIComponent(settingKey)}` });
  }

  for (const test of tests) {
    const r = await runOne(jar, test);
    results.push(r);
    const tagColor = r.status === "PASS" ? "\x1b[32m" : r.status === "WARN" ? "\x1b[33m" : "\x1b[31m";
    console.log(`${tagColor}${r.status}\x1b[0m ${r.code.toString().padStart(3)} ${r.method.padEnd(6)} ${r.path} :: ${r.name}`);
    if (r.status !== "PASS") {
      console.log(`     note: ${r.note}`);
    }
  }

  // CRUD chain: settings (low-risk, no FK dependencies)
  await crudSettings(jar);

  // CRUD chain: KPI definition (depends on a band; reuse first band)
  if (bandId) await crudKpiDefinition(jar, bandId);

  // CRUD chain: webknot value
  await crudWebknotValue(jar);

  // Report
  writeReport();

  const fail = results.filter((r) => r.status === "FAIL" || r.status === "DOWN").length;
  const warn = results.filter((r) => r.status === "WARN").length;
  const pass = results.filter((r) => r.status === "PASS").length;
  console.log("");
  console.log(`[smoke] PASS=${pass}  WARN=${warn}  FAIL=${fail}  total=${results.length}`);
  process.exit(fail > 0 ? 1 : 0);
}

function pickId(body) {
  const list =
    body?.data?.content ??
    body?.data?.items ??
    body?.data ??
    body?.content ??
    body?.items ??
    body;
  if (!Array.isArray(list)) return null;
  const first = list[0];
  return first?.id ?? first?.kpiId ?? first?.bandId ?? null;
}
function pickKey(body) {
  const list =
    body?.data?.content ??
    body?.data?.items ??
    body?.data ??
    body?.content ??
    body?.items ??
    body;
  if (!Array.isArray(list)) return null;
  return list[0]?.key ?? list[0]?.settingKey ?? null;
}

// ---------- CRUD chains ------------------------------------------------------

async function crudSettings(jar) {
  const key = `smoke_test_${Date.now()}`;
  const created = await call(jar, "POST", "/api/v1/settings", {
    body: { key, value: "smoke-create", description: "smoke harness" },
  });
  pushCrud("settings.create", "POST /api/v1/settings", created, [200, 201]);
  const got = await call(jar, "GET", `/api/v1/settings/${encodeURIComponent(key)}`);
  pushCrud("settings.read", `GET /api/v1/settings/${key}`, got, [200]);
  const updated = await call(jar, "PUT", `/api/v1/settings/${encodeURIComponent(key)}`, {
    body: { key, value: "smoke-update", description: "updated" },
  });
  pushCrud("settings.update", `PUT /api/v1/settings/${key}`, updated, [200, 204]);
  const patched = await call(jar, "PATCH", `/api/v1/settings/${encodeURIComponent(key)}`, {
    body: { value: "smoke-patch" },
  });
  pushCrud("settings.patch", `PATCH /api/v1/settings/${key}`, patched, [200, 204]);
  const deleted = await call(jar, "DELETE", `/api/v1/settings/${encodeURIComponent(key)}`);
  pushCrud("settings.delete", `DELETE /api/v1/settings/${key}`, deleted, [200, 204]);
}

async function crudKpiDefinition(jar, bandId) {
  const dept = "Development";
  const name = `smoke_kpi_${Date.now()}`;
  const created = await call(jar, "POST", "/api/v1/kpi-definitions", {
    body: {
      band: { id: bandId },
      department: dept,
      kpiName: name,
      weightage: 10.0,
      active: true,
    },
  });
  pushCrud("kpi.create", "POST /api/v1/kpi-definitions", created, [200, 201]);
  const id = created.body?.data?.id ?? created.body?.id;
  if (id) {
    const got = await call(jar, "GET", `/api/v1/kpi-definitions/${id}`);
    pushCrud("kpi.read", `GET /api/v1/kpi-definitions/${id}`, got, [200]);
    const updated = await call(jar, "PUT", `/api/v1/kpi-definitions/${id}`, {
      body: {
        id,
        band: { id: bandId },
        department: dept,
        kpiName: name,
        weightage: 15.5,
        active: true,
      },
    });
    pushCrud("kpi.update", `PUT /api/v1/kpi-definitions/${id}`, updated, [200, 204]);
    const deleted = await call(jar, "DELETE", `/api/v1/kpi-definitions/${id}`);
    pushCrud("kpi.delete", `DELETE /api/v1/kpi-definitions/${id}`, deleted, [200, 204]);
  }
}

async function crudWebknotValue(jar) {
  const code = `SMOKE_${Date.now()}`;
  const created = await call(jar, "POST", "/api/v1/webknot-values", {
    body: { name: code, description: "smoke", active: true },
  });
  pushCrud("webknot.create", "POST /api/v1/webknot-values", created, [200, 201]);
  const id = created.body?.data?.id ?? created.body?.id;
  if (id) {
    const updated = await call(jar, "PUT", `/api/v1/webknot-values/${id}`, {
      body: { id, name: code + "_x", description: "smoke upd", active: true },
    });
    pushCrud("webknot.update", `PUT /api/v1/webknot-values/${id}`, updated, [200, 204]);
    const deleted = await call(jar, "DELETE", `/api/v1/webknot-values/${id}`);
    pushCrud("webknot.delete", `DELETE /api/v1/webknot-values/${id}`, deleted, [200, 204]);
  }
}

function pushCrud(name, signature, res, ok) {
  const passed = ok.includes(res.status);
  results.push({
    tag: "crud",
    name,
    method: signature.split(" ")[0],
    path: signature.split(" ")[1],
    code: res.status,
    status: res.status === 0 ? "DOWN" : passed ? "PASS" : res.status >= 500 ? "FAIL" : "WARN",
    note: passed ? fmtBody(res.body, 80) : fmtBody(res.body, 300),
  });
  const c = passed ? "\x1b[32m" : res.status >= 500 ? "\x1b[31m" : "\x1b[33m";
  console.log(`${c}${passed ? "PASS" : res.status >= 500 ? "FAIL" : "WARN"}\x1b[0m ${String(res.status).padStart(3)} ${signature} :: ${name}`);
  if (!passed) console.log(`     note: ${fmtBody(res.body, 300)}`);
}

// ---------- report -----------------------------------------------------------

function writeReport() {
  const byTag = new Map();
  for (const r of results) {
    if (!byTag.has(r.tag)) byTag.set(r.tag, []);
    byTag.get(r.tag).push(r);
  }
  const lines = [];
  lines.push(`# API smoke report`);
  lines.push("");
  lines.push(`Backend: \`${BASE}\``);
  lines.push(`Admin login: \`${redactSensitiveReportText(ADMIN_EMAIL)}\``);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  const pass = results.filter((r) => r.status === "PASS").length;
  const warn = results.filter((r) => r.status === "WARN").length;
  const fail = results.filter((r) => r.status === "FAIL" || r.status === "DOWN").length;
  lines.push(`**Totals:** PASS ${pass} · WARN ${warn} · FAIL ${fail} · total ${results.length}`);
  lines.push("");
  for (const [tag, rs] of byTag) {
    lines.push(`## ${tag}`);
    lines.push("");
    lines.push(`| status | code | method | path | note |`);
    lines.push(`| --- | --- | --- | --- | --- |`);
    for (const r of rs) {
      const note = (r.note || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
      lines.push(`| ${r.status} | ${r.code} | ${r.method} | \`${r.path}\` | ${note} |`);
    }
    lines.push("");
  }
  writeFileSync(REPORT_PATH, lines.join("\n"));
  console.log(`[smoke] wrote report: ${REPORT_PATH}`);
}

run().catch((err) => {
  console.error("[smoke] fatal:", err);
  process.exit(2);
});
