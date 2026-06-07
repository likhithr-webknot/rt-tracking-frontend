#!/usr/bin/env node

/**
 * Minimal QA dataset: 1 HR, 1 manager, 1 employee, 1 project (manager = seeded manager).
 *
 * Usage:
 *   SEED_API_BASE_URL=http://localhost:8080 \
 *   SEED_ADMIN_EMAIL=your-super-admin@webknot.in \
 *   SEED_ADMIN_PASSWORD='your-password' \
 *   node scripts/seed-minimal-data.mjs
 *
 * SEED_ADMIN_EMAIL must be a Super Admin account (env only — never hardcode personal emails).
 * Creates/updates QA accounts only: qa.hr.one, qa.manager.one, qa.employee.one.
 *
 * Password logins (dev profile): WebknotQA#Test1
 * Also run POST /api/v1/dev/seed-qa-users or the Login page dev seed button for auth rows.
 */

import process from "node:process";

const MINIMAL_USERS = [
  {
    email: "qa.hr.one@webknot.in",
    name: "QA HR One",
    role: "HR",
    designation: "HR Business Partner",
    bandCode: "B4",
    department: "Developer",
  },
  {
    email: "qa.manager.one@webknot.in",
    name: "QA Manager One",
    role: "Manager",
    designation: "Engineering Manager",
    bandCode: "B4",
    department: "Developer",
  },
  {
    email: "qa.employee.one@webknot.in",
    name: "QA Employee One",
    role: "Employee",
    designation: "Software Engineer",
    bandCode: "B7L",
    department: "Development",
  },
];

const MINIMAL_PROJECT = {
  code: "QA-DEMO",
  name: "QA Demo Project",
  description: "Minimal seeded project for local QA — manager is QA Manager One.",
};

const QA_PASSWORD_HINT = "WebknotQA#Test1";

function extractFirstJsonObject(text) {
  const str = String(text || "").trim();
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    const start = str.indexOf("{");
    if (start < 0) return null;
    let depth = 0;
    for (let i = start; i < str.length; i += 1) {
      const ch = str[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(str.slice(start, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }
}

function isSuccessfulWriteResponse(parsed) {
  if (!parsed || typeof parsed !== "object") return false;
  const msg = String(parsed.message || "").toLowerCase();
  if (msg === "success") return true;
  const data = parsed.data;
  return Boolean(data && typeof data === "object" && (data.id != null || data.project != null));
}

function toWebtrakStartDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

function splitSetCookieHeader(headerValue) {
  const str = String(headerValue || "");
  if (!str) return [];
  const out = [];
  let current = "";
  let inExpires = false;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str[i];
    if (!inExpires && ch === ",") {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
    if (current.slice(-8).toLowerCase() === "expires=") inExpires = true;
    if (inExpires && ch === ";") inExpires = false;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function getSetCookieValues(headers) {
  if (!headers) return [];
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const single = headers.get("set-cookie");
  return single ? splitSetCookieHeader(single) : [];
}

class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = String(baseUrl || "").replace(/\/+$/, "");
    this.cookies = new Map();
    this.authHeader = null;
  }

  setAuthFromLogin(loginResponse) {
    const root =
      loginResponse?.data && typeof loginResponse.data === "object" ? loginResponse.data : loginResponse;
    if (!root || typeof root !== "object") return;
    const tokenRaw =
      root.accessToken ??
      root.access_token ??
      root.token ??
      root.jwt ??
      null;
    if (!tokenRaw) return;
    const token = String(tokenRaw).trim();
    if (!token) return;
    const tokenType = String(root?.tokenType ?? root?.token_type ?? "Bearer").trim() || "Bearer";
    this.authHeader = `${tokenType} ${token}`;
  }

  updateCookies(headers) {
    for (const setCookie of getSetCookieValues(headers)) {
      const first = String(setCookie || "").split(";")[0] || "";
      const eq = first.indexOf("=");
      if (eq <= 0) continue;
      this.cookies.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
    }
  }

  cookieHeader() {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  csrfToken() {
    return this.cookies.get("XSRF-TOKEN") || this.cookies.get("CSRF-TOKEN") || "";
  }

  async ensureCsrf() {
    for (const path of ["/auth/me", "/portal/admin", "/submission-window/current"]) {
      try {
        await this.request(path, { method: "GET", tolerateStatus: [401, 403, 404] });
      } catch {
        // ignore
      }
      if (this.csrfToken()) return true;
    }
    return Boolean(this.csrfToken());
  }

  async login(email, password) {
    const paths = ["/api/v1/auth/login", "/auth/login"];
    let lastErr = null;
    for (const path of paths) {
      try {
        const data = await this.request(path, {
          method: "POST",
          body: { email, password },
          useCsrf: false,
        });
        this.setAuthFromLogin(data?.data ?? data);
        return data;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("Login failed.");
  }

  async request(path, { method = "GET", body, headers = {}, useCsrf = true, tolerateStatus = [] } = {}) {
    const normalizedPath = String(path || "").startsWith("/") ? String(path) : `/${String(path || "")}`;
    const url = `${this.baseUrl}${normalizedPath}`;
    const reqHeaders = { Accept: "application/json", ...(headers || {}) };
    if (this.authHeader && !reqHeaders.Authorization) reqHeaders.Authorization = this.authHeader;
    const cookie = this.cookieHeader();
    if (cookie) reqHeaders.Cookie = cookie;
    const upperMethod = String(method || "GET").toUpperCase();
    if (body !== undefined) reqHeaders["Content-Type"] = "application/json";
    if (useCsrf && upperMethod !== "GET" && upperMethod !== "HEAD") {
      const csrf = this.csrfToken();
      if (csrf) {
        reqHeaders["X-XSRF-TOKEN"] = csrf;
        reqHeaders["X-CSRF-TOKEN"] = csrf;
      }
    }
    const res = await fetch(url, {
      method: upperMethod,
      headers: reqHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    this.updateCookies(res.headers);
    if (!res.ok && tolerateStatus.includes(res.status)) return { __status: res.status };
    const text = await res.text().catch(() => "");
    const parsed = extractFirstJsonObject(text);
    if (!res.ok) {
      if (isSuccessfulWriteResponse(parsed)) return parsed;
      let message = text || `HTTP ${res.status}`;
      if (parsed) message = parsed?.message || parsed?.error || message;
      const err = new Error(`${upperMethod} ${normalizedPath} failed: ${message}`);
      err.status = res.status;
      throw err;
    }
    if (parsed && typeof parsed === "object") return parsed;
    const contentType = String(res.headers.get("content-type") || "").toLowerCase();
    return contentType.includes("application/json") ? {} : {};
  }
}

function normalizeEmployee(raw) {
  const obj = raw && typeof raw === "object" ? raw : {};
  return {
    id: String(obj.employeeId ?? obj.empId ?? obj.id ?? "").trim(),
    empId: String(obj.empId ?? obj.employeeId ?? obj.id ?? "").trim(),
    name: String(obj.employeeName ?? obj.name ?? "Unknown").trim(),
    email: String(obj.email ?? obj.employeeEmail ?? obj.mail ?? "").trim().toLowerCase(),
    role: String(obj.empRole ?? obj.role ?? obj.userRole ?? "Employee").trim(),
    band: String(obj.band ?? obj.level ?? obj.bandCode ?? "").trim(),
    department: String(obj.department ?? obj.stream ?? "").trim(),
    designation: String(obj.designation ?? obj.title ?? obj.jobTitle ?? "").trim(),
  };
}

function extractEmployees(data) {
  const root = data && typeof data === "object" ? data : {};
  const nested = root?.data && typeof root.data === "object" && !Array.isArray(root.data) ? root.data : null;
  const arr =
    (nested && Array.isArray(nested.data) && nested.data) ||
    (Array.isArray(root?.data) && root.data) ||
    (Array.isArray(root?.employees) && root.employees) ||
    (Array.isArray(root?.content) && root.content) ||
    (Array.isArray(data) && data) ||
    [];
  return arr.map(normalizeEmployee).filter((e) => e.id || e.empId);
}

function buildBandCodeToIdMap(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const id = row?.id;
    if (id == null || !/^\d+$/.test(String(id))) continue;
    const numericId = Number.parseInt(String(id), 10);
    for (const key of [row.designation, row.code, row.bandCode, row.name, row.band, row.label]) {
      const code = String(key ?? "").trim();
      if (!code) continue;
      map.set(code.toLowerCase(), numericId);
      const token = code.split(/[\s—–-]+/)[0]?.trim();
      if (token) map.set(token.toLowerCase(), numericId);
    }
  }
  return map;
}

function isDuplicateError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("already") || msg.includes("duplicate") || msg.includes("exists") || msg.includes("unique");
}

function normalizeProject(raw) {
  const obj = raw && typeof raw === "object" ? raw : {};
  return {
    id: String(obj.id ?? obj.projectId ?? "").trim(),
    code: String(obj.code ?? obj.projectCode ?? "").trim(),
    name: String(obj.name ?? obj.projectName ?? "").trim(),
    managerEmployeeId: String(obj.managerEmployeeId ?? obj.managerId ?? "").trim(),
  };
}

function extractProjects(data) {
  const root = data && typeof data === "object" ? data : {};
  const dataObj = root.data && typeof root.data === "object" && !Array.isArray(root.data) ? root.data : null;
  const arr =
    (Array.isArray(data) && data) ||
    (Array.isArray(root?.data) && root.data) ||
    (dataObj && Array.isArray(dataObj.content) && dataObj.content) ||
    (Array.isArray(root?.projects) && root.projects) ||
    (Array.isArray(root?.content) && root.content) ||
    [];
  return arr.map(normalizeProject).filter((p) => p.id);
}

const QA_EMP_ID_FALLBACK = {
  "qa.hr.one@webknot.in": "QA-H001",
  "qa.manager.one@webknot.in": "QA-M001",
  "qa.employee.one@webknot.in": "QA-E001",
};

async function fetchEmployees(client) {
  const paths = [
    "/api/v1/employees?page=0&size=500",
    "/employees/getall?limit=500",
    "/api/v1/employees/getall?limit=500",
  ];
  for (const path of paths) {
    try {
      const data = await client.request(path, { method: "GET", tolerateStatus: [403, 404, 500] });
      if (data?.__status) continue;
      const rows = extractEmployees(data);
      if (rows.length) return rows;
    } catch {
      // try next path
    }
  }
  return [];
}

function buildQaEmployeeFallback() {
  return MINIMAL_USERS.map((user) => {
    const email = String(user.email || "").trim().toLowerCase();
    const empId = QA_EMP_ID_FALLBACK[email] || email.split("@")[0].replace(/\./g, "-").toUpperCase();
    return normalizeEmployee({
      empId,
      employeeId: empId,
      id: empId,
      email: user.email,
      employeeName: user.name,
      name: user.name,
      role: user.role,
      band: user.bandCode,
      department: user.department,
      designation: user.designation,
    });
  });
}

async function resolveSeedEmployees(client) {
  const fetched = await fetchEmployees(client);
  if (fetched.length) return fetched;
  console.warn("[seed:minimal] employee list API unavailable — using QA fallback IDs");
  return buildQaEmployeeFallback();
}

async function resolveBandId(client, preferredCode = "B4") {
  const paths = [
    "/api/v1/band-list?page=0&limit=200",
    "/api/v1/bands/list?activeOnly=true&limit=200",
    "/bands/list?activeOnly=true&limit=200",
  ];
  const wanted = String(preferredCode || "B4").trim().toLowerCase();
  for (const path of paths) {
    const data = await client.request(path, { method: "GET", tolerateStatus: [403, 404] });
    if (data?.__status) continue;
    const nested = data?.data && typeof data.data === "object" ? data.data : null;
    const rows = Array.isArray(nested?.data)
      ? nested.data
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data)
          ? data
          : [];
    const map = buildBandCodeToIdMap(rows);
    return map.get(wanted) ?? map.get("b4") ?? (rows[0]?.id != null ? Number.parseInt(String(rows[0].id), 10) : null);
  }
  return null;
}

async function ensureEmployeeProfile(
  client,
  { empId, email, name, portalRole, designation, bandId, department, counters },
) {
  const id = String(empId || "").trim();
  if (!id) return false;
  const body = {
    name: String(name || "").trim(),
    email: String(email || "").trim().toLowerCase(),
    portalRole: String(portalRole || "").trim(),
    designation: String(designation || "").trim(),
    department: String(department || "").trim(),
  };
  if (bandId != null) body.band = { bandId: Number(bandId) };

  try {
    await client.request(`/api/v1/employees/${encodeURIComponent(id)}`, { method: "PUT", body });
    counters.updated = (counters.updated || 0) + 1;
    console.log(`[seed:minimal] updated ${email} — band ${body.band?.bandId ?? "—"}, dept ${department}`);
    return true;
  } catch (err) {
    counters.failed = (counters.failed || 0) + 1;
    console.error(`[seed:minimal] profile update failed ${email}: ${err.message}`);
    return false;
  }
}
async function ensureUser(client, { email, name, role, designation, bandId, department, counters }) {
  const payload = {
    email,
    name,
    role,
    department,
    bandId,
    userType: "FULLTIME",
    workMode: "HYBRID",
    startDate: toWebtrakStartDate(),
    assetRequired: false,
    salaryDetails: {
      base: 1,
      variable: 1,
      payoutCycle: "monthly",
      description: designation,
    },
  };

  try {
    await client.request("/api/v1/employees", { method: "POST", body: payload });
    counters.created += 1;
    console.log(`[seed:minimal] created ${role.toLowerCase()} ${email}`);
    return { created: true };
  } catch (err) {
    if (isDuplicateError(err)) {
      counters.existing += 1;
      console.log(`[seed:minimal] ${role.toLowerCase()} already exists ${email}`);
      return { existing: true };
    }
    counters.failed += 1;
    console.error(`[seed:minimal] failed ${email}: ${err.message}`);
    return { failed: true };
  }
}

async function ensureProject(client, { managerEmployeeId, counters }) {
  const existingRaw = await client.request("/api/v1/projects/all?page=0&size=500", {
    method: "GET",
    tolerateStatus: [403, 404],
  });
  if (!existingRaw?.__status) {
    const existing = extractProjects(existingRaw);
    const match = existing.find(
      (p) =>
        p.code.toUpperCase() === MINIMAL_PROJECT.code ||
        p.name.toLowerCase() === MINIMAL_PROJECT.name.toLowerCase(),
    );
    if (match?.id) {
      counters.existing += 1;
      console.log(`[seed:minimal] project already exists ${match.name} (${match.id})`);
      return match;
    }
  }

  const payload = {
    projectCode: MINIMAL_PROJECT.code,
    projectName: MINIMAL_PROJECT.name,
    projectType: "IN_HOUSE",
    code: MINIMAL_PROJECT.code,
    name: MINIMAL_PROJECT.name,
    description: MINIMAL_PROJECT.description,
    managerEmployeeId: String(managerEmployeeId || "").trim(),
    active: true,
  };

  for (const path of ["/api/v1/project", "/api/v1/projects"]) {
    try {
      const res = await client.request(path, { method: "POST", body: payload });
      counters.created += 1;
      const created = normalizeProject(res?.data ?? res);
      const id = created.id || String(res?.data?.id ?? res?.id ?? "").trim();
      console.log(`[seed:minimal] created project ${MINIMAL_PROJECT.name}${id ? ` (${id})` : ""}`);
      return { id, ...MINIMAL_PROJECT, managerEmployeeId };
    } catch (err) {
      if (isDuplicateError(err)) {
        counters.existing += 1;
        console.log(`[seed:minimal] project already exists ${MINIMAL_PROJECT.name}`);
        break;
      }
      if (path === "/api/v1/projects") throw err;
    }
  }

  const refreshed = extractProjects(
    await client.request("/api/v1/projects/all?page=0&size=500", { method: "GET", tolerateStatus: [403, 404] }),
  );
  return refreshed.find((p) => p.code.toUpperCase() === MINIMAL_PROJECT.code) || null;
}

function isAllocationDuplicateError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return (
    isDuplicateError(err) ||
    msg.includes("allocation already exists") ||
    msg.includes("already allotted")
  );
}

async function postAllocation(client, payload, label, counters) {
  try {
    await client.request("/api/v1/allocation", { method: "POST", body: payload });
    counters.created += 1;
    console.log(`[seed:minimal] ${label}`);
    return true;
  } catch (err) {
    if (isAllocationDuplicateError(err)) {
      counters.existing += 1;
      console.log(`[seed:minimal] ${label} (already exists)`);
      return true;
    }
    counters.failed += 1;
    console.error(`[seed:minimal] allocation failed (${label}): ${err.message}`);
    return false;
  }
}

/** HR must create allocations — backend rejects non-HR creators. */
async function ensureProjectManagerRole(client, { managerEmail, projectCode, counters }) {
  const email = String(managerEmail || "").trim().toLowerCase();
  const code = String(projectCode || "").trim();
  if (!email || !code) {
    console.warn("[seed:minimal] skipping manager role — missing manager email or project code");
    return false;
  }

  return postAllocation(
    client,
    {
      employeeEmail: email,
      projectCode: code,
      allocationType: "DEPLOYABLE",
      allocatedHours: 8,
      startDate: toWebtrakStartDate(),
      isManager: true,
      role: "PM",
    },
    `assigned ${email} as manager on ${code}`,
    counters,
  );
}

async function ensureEmployeeAllocation(client, { employeeEmail, projectCode, counters }) {
  const email = String(employeeEmail || "").trim().toLowerCase();
  const code = String(projectCode || "").trim();
  if (!email || !code) {
    console.warn("[seed:minimal] skipping employee allocation — missing employee email or project code");
    return false;
  }

  return postAllocation(
    client,
    {
      employeeEmail: email,
      projectCode: code,
      allocationType: "DEPLOYABLE",
      allocatedHours: 8,
      startDate: toWebtrakStartDate(),
      isManager: false,
      role: "Developer",
    },
    `allocated ${email} to ${code}`,
    counters,
  );
}

async function ensureQaProjectTeam(client, { hrEmail, managerEmail, employeeEmail, projectCode, qaPassword, counters }) {
  const hr = String(hrEmail || "").trim().toLowerCase();
  const pass = String(qaPassword || QA_PASSWORD_HINT).trim();
  if (!hr || !pass) {
    console.error("[seed:minimal] missing HR credentials for project allocations");
    return false;
  }

  try {
    await client.login(hr, pass);
    await client.ensureCsrf();
  } catch (err) {
    console.error(`[seed:minimal] HR login failed (${hr}): ${err.message}`);
    counters.allocation.failed += 1;
    return false;
  }

  await ensureProjectManagerRole(client, {
    managerEmail,
    projectCode,
    counters: counters.managerRole,
  });
  await ensureEmployeeAllocation(client, {
    employeeEmail,
    projectCode,
    counters: counters.allocation,
  });
  return true;
}

async function tryDevAuthSeed(client) {
  const res = await client.request("/api/v1/dev/seed-qa-users", {
    method: "POST",
    tolerateStatus: [404, 403],
  });
  if (res?.__status === 404 || res?.__status === 403) {
    console.log("[seed:minimal] dev auth seed endpoint unavailable — use Login page or SPRING_PROFILES_ACTIVE=dev");
    return false;
  }
  console.log("[seed:minimal] dev auth users seeded (password logins ready)");
  return true;
}

function formatYearMonth(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function normalizeKpi(raw) {
  const obj = raw && typeof raw === "object" ? raw : {};
  const bandObj = obj.band && typeof obj.band === "object" ? obj.band : null;
  return {
    id: String(obj.kpiDefinitionId ?? obj.definitionId ?? obj.kpiId ?? obj.id ?? "").trim(),
    title: String(obj.kpiName ?? obj.title ?? obj.kpiTitle ?? obj.objective ?? "").trim(),
    band: String(bandObj?.name ?? obj.band ?? obj.level ?? obj.bandCode ?? "").trim(),
    stream: String(obj.stream ?? obj.department ?? obj.context ?? "").trim(),
    weight: Number.parseFloat(String(obj.weightage ?? obj.weight ?? obj.weightPct ?? "0")) || 0,
  };
}

function normalizeValue(raw, idx = 0) {
  const obj = raw && typeof raw === "object" ? raw : {};
  const id = String(obj.id ?? obj.valueId ?? obj.webknotValueId ?? `VAL_${idx + 1}`).trim();
  return {
    id,
    title: String(obj.title ?? obj.valueTitle ?? obj.valueName ?? obj.name ?? id).trim(),
    pillar: String(obj.pillar ?? obj.evaluationCriteria ?? obj.criteria ?? "General").trim(),
  };
}

function extractCatalogItems(data) {
  const root = data && typeof data === "object" ? data : {};
  const nested = root?.data && typeof root.data === "object" && !Array.isArray(root.data) ? root.data : null;
  return (
    (Array.isArray(root?.data) && root.data) ||
    (nested && Array.isArray(nested.data) && nested.data) ||
    (nested && Array.isArray(nested.items) && nested.items) ||
    (Array.isArray(root?.items) && root.items) ||
    (Array.isArray(root?.content) && root.content) ||
    (Array.isArray(data) && data) ||
    []
  );
}

async function fetchKpiDefinitions(client) {
  const paths = [
    "/api/v1/kpi-definitions?limit=500",
    "/api/v1/list-kpi-definitions?limit=500",
    "/api/v1/kpi-definitions/getall?limit=500",
  ];
  for (const path of paths) {
    try {
      const data = await client.request(path, { method: "GET", tolerateStatus: [404, 500] });
      if (data?.__status) continue;
      const root = data?.data && typeof data.data === "object" ? data.data : data;
      const items = Array.isArray(root?.data) ? root.data : extractCatalogItems(data);
      const rows = items.map(normalizeKpi).filter((k) => k.id);
      if (rows.length) return rows;
    } catch {
      // try next path
    }
  }
  return [];
}

async function fetchWebknotValues(client) {
  const paths = [
    "/api/v1/webknot-values?limit=500",
    "/api/v1/webknot-values/list?limit=500",
    "/webknot-values/list?limit=500",
  ];
  for (const path of paths) {
    try {
      const data = await client.request(path, { method: "GET", tolerateStatus: [404] });
      if (data?.__status === 404) continue;
      return extractCatalogItems(data).map(normalizeValue).filter((v) => v.id);
    } catch {
      // try next path
    }
  }
  return [];
}

const MINIMAL_QA_KPIS = [
  { title: "Delivery & Sprint Commitment", weight: 25 },
  { title: "Code Quality & Peer Reviews", weight: 25 },
  { title: "Technical Problem Solving", weight: 25 },
  { title: "Collaboration & Communication", weight: 25 },
];

const MINIMAL_QA_VALUES = [
  { title: "Ownership", pillar: "Ownership" },
  { title: "Innovation", pillar: "Innovation" },
  { title: "Collaboration", pillar: "Collaboration" },
  { title: "Delivery", pillar: "Delivery" },
];

async function ensureMinimalKpis(client, { band, stream, bandId, counters }) {
  let kpis = await fetchKpiDefinitions(client);
  const bandKey = String(band || "B4").trim();
  const streamKey = String(stream || "Developer").trim();
  const matchesCombo = (k) => {
    const bandMatch =
      !bandKey ||
      k.band.toLowerCase() === bandKey.toLowerCase() ||
      k.band.toLowerCase().includes(bandKey.toLowerCase());
    const streamMatch =
      !streamKey ||
      k.stream.toLowerCase() === streamKey.toLowerCase() ||
      k.stream.toLowerCase().includes(streamKey.toLowerCase().replace("development", "developer"));
    return bandMatch && streamMatch;
  };
  const existing = kpis.filter(matchesCombo);
  if (existing.length >= MINIMAL_QA_KPIS.length) {
    counters.existing += existing.length;
    console.log(`[seed:minimal] KPIs already present for ${bandKey}/${streamKey} (${existing.length})`);
    return existing;
  }

  const resolvedBandId = bandId ?? (await resolveBandId(client, bandKey));
  if (!resolvedBandId) {
    console.warn(`[seed:minimal] skipping KPI seed — no band id for ${bandKey}`);
    return existing;
  }

  for (const template of MINIMAL_QA_KPIS) {
    const payload = {
      kpiName: template.title,
      department: streamKey,
      stream: streamKey,
      weightage: template.weight,
      band: { bandId: Number(resolvedBandId) },
      active: true,
    };
    try {
      await client.request("/api/v1/kpi-definitions", { method: "POST", body: payload });
      counters.created += 1;
      console.log(`[seed:minimal] created KPI ${template.title}`);
    } catch (err) {
      if (isDuplicateError(err)) {
        counters.existing += 1;
        console.log(`[seed:minimal] KPI already exists ${template.title}`);
      } else {
        counters.failed += 1;
        console.error(`[seed:minimal] KPI create failed (${template.title}): ${err.message}`);
      }
    }
  }

  kpis = await fetchKpiDefinitions(client);
  const created = kpis.filter(matchesCombo);
  return created.length ? created : kpis.slice(0, MINIMAL_QA_KPIS.length);
}

async function ensureMinimalWebknotValues(client, counters) {
  let values = await fetchWebknotValues(client);
  if (values.length >= MINIMAL_QA_VALUES.length) {
    counters.existing += values.length;
    console.log(`[seed:minimal] webknot values already present (${values.length})`);
    return values;
  }

  for (const template of MINIMAL_QA_VALUES) {
    const title = template.title;
    const payload = {
      title,
      valueTitle: title,
      name: title,
      valueName: title,
      pillar: template.pillar,
      evaluationCriteria: template.pillar,
      criteria: template.pillar,
      description: `Minimal QA value: ${title}.`,
    };
    try {
      await client.request("/api/v1/webknot-values/add", { method: "POST", body: payload, tolerateStatus: [404] });
      counters.created += 1;
      console.log(`[seed:minimal] created webknot value ${title}`);
    } catch (err) {
      if (isDuplicateError(err)) {
        counters.existing += 1;
      } else {
        try {
          await client.request("/webknot-values/add", { method: "POST", body: payload });
          counters.created += 1;
          console.log(`[seed:minimal] created webknot value ${title}`);
        } catch (err2) {
          if (isDuplicateError(err2)) {
            counters.existing += 1;
          } else {
            counters.failed += 1;
            console.error(`[seed:minimal] value create failed (${title}): ${err2.message}`);
          }
        }
      }
    }
  }

  return fetchWebknotValues(client);
}

async function ensureQaEmployeeSubmission(client, {
  employee,
  manager,
  kpis,
  values,
  month,
  qaPassword,
  counters,
  adminEmail,
  adminPassword,
}) {
  const email = String(employee?.email || "").trim().toLowerCase();
  const empId = String(employee?.empId || employee?.id || "").trim();
  const pass = String(qaPassword || QA_PASSWORD_HINT).trim();
  if (!email || !empId || !pass) {
    console.warn("[seed:minimal] skipping employee submission — missing employee credentials");
    return false;
  }

  const selectedKpis = (Array.isArray(kpis) ? kpis : []).slice(0, 4);
  const selectedValues = (Array.isArray(values) ? values : []).slice(0, 4);
  if (!selectedKpis.length || !selectedValues.length) {
    console.warn("[seed:minimal] skipping employee submission — KPIs or values missing");
    return false;
  }

  const kpiRatings = [4.2, 4.0, 3.8, 4.5];
  const valueRatings = [4.0, 4.2, 3.9, 4.1];
  const kpiRatingsArray = selectedKpis.map((k, idx) => ({
    kpiId: k.id,
    kpiDefinitionId: k.id,
    rating: kpiRatings[idx % kpiRatings.length],
  }));
  const valueResponses = selectedValues.map((v, idx) => ({
    valueId: v.id,
    webknotValueId: v.id,
    rating: valueRatings[idx % valueRatings.length],
  }));
  const webknotValueRatings = Object.fromEntries(valueResponses.map((x) => [x.valueId, x.rating]));

  try {
    await client.login(email, pass);
    await client.ensureCsrf();
  } catch (err) {
    counters.failed += 1;
    console.error(`[seed:minimal] employee login failed (${email}): ${err.message}`);
    return false;
  }

  const payload = {
    month,
    monthKey: month,
    profileVerified: true,
    submissionType: "EMPLOYEE_MONTHLY_SUBMISSION",
    actorRole: "EMPLOYEE",
    targetRole: "MANAGER",
    subjectEmployeeId: empId,
    employeeId: empId,
    managerId: String(manager?.empId || manager?.id || "").trim() || null,
    selfReviewText:
      "QA Employee One monthly self-review: delivered sprint goals, improved test coverage, and supported release readiness.",
    certifications: [],
    kpiRatings: kpiRatingsArray,
    webknotValueResponses: valueResponses,
    webknotValues: valueResponses.map((x) => x.valueId),
    webknotValueRatings,
    recognitionsCount: 1,
    reviewStatus: "SUBMITTED",
  };

  const paths = ["/api/v1/monthly-submissions/self"];
  let submitted = false;
  for (const path of paths) {
    try {
      await client.request(path, {
        method: "POST",
        body: {
          month,
          submissionType: "EMPLOYEE_MONTHLY_SUBMISSION",
          payloadJson: JSON.stringify(payload),
        },
      });
      counters.created += 1;
      console.log(`[seed:minimal] submitted monthly review for ${email} (${month})`);
      submitted = true;
      break;
    } catch (err) {
      if (isDuplicateError(err) || String(err.message || "").toLowerCase().includes("already submitted")) {
        counters.existing += 1;
        console.log(`[seed:minimal] employee submission already exists for ${month}`);
        submitted = true;
        break;
      }
      if (path === paths[paths.length - 1]) {
        counters.failed += 1;
        console.error(`[seed:minimal] employee submission failed: ${err.message}`);
      }
    }
  }

  if (adminEmail && adminPassword) {
    try {
      await client.login(adminEmail, adminPassword);
      await client.ensureCsrf();
    } catch {
      // best-effort restore admin session
    }
  }

  return submitted;
}

async function main() {
  const config = {
    baseUrl: String(process.env.SEED_API_BASE_URL || "http://localhost:8080").trim().replace(/\/+$/, ""),
    adminEmail: String(process.env.SEED_ADMIN_EMAIL || "").trim(),
    adminPassword: String(process.env.SEED_ADMIN_PASSWORD || "").trim(),
    department: String(process.env.SEED_DEPARTMENT || "Developer").trim(),
    seedAuth: String(process.env.SEED_DEV_AUTH || "true").trim().toLowerCase() !== "false",
  };

  if (!config.adminEmail || !config.adminPassword) {
    console.error("Missing SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD.");
    console.error("Set your Super Admin credentials via env (not QA test users). Example:");
    console.error(
      "  SEED_API_BASE_URL=http://localhost:8080 SEED_ADMIN_EMAIL=your-super-admin@webknot.in SEED_ADMIN_PASSWORD='***' npm run seed:minimal",
    );
    process.exit(1);
  }

  if (config.adminEmail.toLowerCase().startsWith("qa.")) {
    console.error("SEED_ADMIN_EMAIL must be a Super Admin account, not a qa.* test user.");
    process.exit(1);
  }

  console.log("[seed:minimal] starting minimal QA seed");
  console.log(`[seed:minimal] backend: ${config.baseUrl}`);

  const client = new ApiClient(config.baseUrl);
  try {
    await client.login(config.adminEmail, config.adminPassword);
    await client.ensureCsrf();
  } catch (err) {
    console.error(`[seed:minimal] login failed: ${err.message}`);
    process.exit(1);
  }

  const counters = {
    users: { created: 0, existing: 0, failed: 0 },
    profiles: { updated: 0, failed: 0 },
    project: { created: 0, existing: 0, failed: 0 },
    managerRole: { created: 0, existing: 0, failed: 0 },
    allocation: { created: 0, existing: 0, failed: 0 },
    kpis: { created: 0, existing: 0, failed: 0 },
    values: { created: 0, existing: 0, failed: 0 },
    submissions: { created: 0, existing: 0, failed: 0 },
  };
  const qaPassword = String(process.env.SEED_QA_PASSWORD || QA_PASSWORD_HINT).trim();
  const submissionMonth = String(process.env.SEED_MONTH || formatYearMonth()).trim();

  for (const user of MINIMAL_USERS) {
    const bandId = await resolveBandId(client, user.bandCode || "B4");
    if (!bandId) {
      console.warn(`[seed:minimal] no band id for ${user.email} (${user.bandCode || "B4"})`);
    }
    const department = String(user.department || config.department || "Development").trim();
    await ensureUser(client, {
      ...user,
      bandId,
      department,
      counters: counters.users,
    });
  }

  const employees = await resolveSeedEmployees(client);
  const byEmail = new Map(employees.map((e) => [e.email, e]));

  for (const user of MINIMAL_USERS) {
    const row = byEmail.get(String(user.email || "").trim().toLowerCase());
    if (!row) continue;
    const bandId = await resolveBandId(client, user.bandCode || "B4");
    await ensureEmployeeProfile(client, {
      empId: row.empId || row.id,
      email: user.email,
      name: user.name,
      portalRole: user.role,
      designation: user.designation,
      bandId,
      department: String(user.department || config.department || "Development").trim(),
      counters: counters.profiles,
    });
  }

  const hr = byEmail.get("qa.hr.one@webknot.in");
  const manager = byEmail.get("qa.manager.one@webknot.in");
  const employee = byEmail.get("qa.employee.one@webknot.in");

  const managerKey = manager?.empId || manager?.id;
  if (!managerKey) {
    console.error("[seed:minimal] seeded manager not found after create — aborting project seed");
    process.exit(1);
  }

  await ensureProject(client, {
    managerEmployeeId: managerKey,
    counters: counters.project,
  });

  const teamReady = await ensureQaProjectTeam(client, {
    hrEmail: hr?.email || "qa.hr.one@webknot.in",
    managerEmail: manager?.email,
    employeeEmail: employee?.email,
    projectCode: MINIMAL_PROJECT.code,
    qaPassword,
    counters,
  });

  try {
    await client.login(config.adminEmail, config.adminPassword);
    await client.ensureCsrf();
  } catch {
    // best-effort restore admin session after HR allocation login
  }

  const qaKpis = await ensureMinimalKpis(client, {
    band: employee?.band || "B4",
    stream: employee?.department || config.department || "Developer",
    bandId: await resolveBandId(client, employee?.band || "B4"),
    counters: counters.kpis,
  });
  const qaValues = await ensureMinimalWebknotValues(client, counters.values);

  if (employee) {
    await ensureQaEmployeeSubmission(client, {
      employee,
      manager,
      kpis: qaKpis,
      values: qaValues,
      month: submissionMonth,
      qaPassword,
      counters: counters.submissions,
      adminEmail: config.adminEmail,
      adminPassword: config.adminPassword,
    });
  }

  if (config.seedAuth) {
    try {
      await client.login(config.adminEmail, config.adminPassword);
      await client.ensureCsrf();
    } catch {
      // best-effort restore admin session for dev auth seed
    }
    await tryDevAuthSeed(client);
  }

  console.log("\n[seed:minimal] complete\n");
  console.log("Login credentials (dev password seed):\n");
  console.table(
    MINIMAL_USERS.map((user) => ({
      role: user.role,
      email: user.email,
      band: user.bandCode || "B4",
      password: QA_PASSWORD_HINT,
      empId:
        user.email === hr?.email
          ? hr?.empId || hr?.id
          : user.email === manager?.email
            ? manager?.empId || manager?.id
            : user.email === employee?.email
              ? employee?.empId || employee?.id
              : "—",
    })),
  );
  console.log(`Project: ${MINIMAL_PROJECT.name} (${MINIMAL_PROJECT.code})`);
  console.log(`Submission month: ${submissionMonth}`);
  console.log(`Manager review: sign in as ${manager?.email || "qa.manager.one@webknot.in"} → Manager portal → Team`);
  if (!teamReady) {
    console.warn(
      "\n[seed:minimal] WARNING: project manager/allocation step did not complete.",
      "Run seed again after POST /api/v1/dev/seed-qa-users so qa.hr.one can log in.",
    );
  }
  console.log("\nEach QA account uses the same dev password above.\n");
}

main().catch((err) => {
  console.error(`[seed:minimal] fatal: ${err.message}`);
  process.exit(1);
});
