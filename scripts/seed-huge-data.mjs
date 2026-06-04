#!/usr/bin/env node

/**
 * Huge dataset seeder for RT Tracking backend.
 *
 * Usage:
 *   SEED_API_BASE_URL=http://localhost:8080 \
 *   SEED_ADMIN_EMAIL=admin@webknot.in \
 *   SEED_ADMIN_PASSWORD='your-password' \
 *   node scripts/seed-huge-data.mjs
 */

import process from "node:process";

function nowIso() {
  return new Date().toISOString();
}

function pad(n, width = 3) {
  return String(n).padStart(width, "0");
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ymNow() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function clamp(num, min, max) {
  return Math.min(max, Math.max(min, num));
}

function randomInt(min, max) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function randomRating() {
  return Math.round((2.8 + Math.random() * 2.2) * 10) / 10;
}

function shuffle(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function sample(arr, count) {
  if (!Array.isArray(arr) || arr.length === 0 || count <= 0) return [];
  if (count >= arr.length) return arr.slice();
  return shuffle(arr).slice(0, count);
}

function normalizeCursorPage(data) {
  const root =
    data && typeof data === "object" && data.data && typeof data.data === "object" && !Array.isArray(data.data)
      ? data.data
      : data && typeof data === "object"
        ? data
        : {};

  const items = Array.isArray(root.items)
    ? root.items
    : Array.isArray(root.results)
      ? root.results
      : Array.isArray(root.content)
        ? root.content
        : Array.isArray(root.data)
          ? root.data
          : Array.isArray(root.list)
            ? root.list
            : Array.isArray(data)
              ? data
              : [];

  const nextCursorRaw =
    root.nextCursor ??
    root.next ??
    root.nextToken ??
    root.nextPageToken ??
    root?.page?.nextCursor ??
    root?.pageInfo?.nextCursor ??
    null;
  const nextCursor = nextCursorRaw == null ? null : String(nextCursorRaw).trim() || null;

  return { items, nextCursor };
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

    const tail = current.slice(-8).toLowerCase();
    if (tail === "expires=") {
      inExpires = true;
      continue;
    }

    if (inExpires && ch === ";") {
      inExpires = false;
    }
  }

  if (current.trim()) out.push(current.trim());
  return out;
}

function getSetCookieValues(headers) {
  if (!headers) return [];
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const single = headers.get("set-cookie");
  if (!single) return [];
  return splitSetCookieHeader(single);
}

class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = String(baseUrl || "").replace(/\/+$/, "");
    this.cookies = new Map();
    this.authHeader = null;
  }

  setAuthFromLogin(loginResponse) {
    if (!loginResponse || typeof loginResponse !== "object") return;
    const tokenRaw =
      loginResponse.accessToken ??
      loginResponse.access_token ??
      loginResponse.token ??
      loginResponse.jwt ??
      null;
    if (!tokenRaw) return;
    const token = String(tokenRaw).trim();
    if (!token) return;
    const tokenType = String(loginResponse.tokenType ?? loginResponse.token_type ?? "Bearer").trim() || "Bearer";
    this.authHeader = `${tokenType} ${token}`;
  }

  updateCookies(headers) {
    const setCookies = getSetCookieValues(headers);
    for (const setCookie of setCookies) {
      const first = String(setCookie || "").split(";")[0] || "";
      const eq = first.indexOf("=");
      if (eq <= 0) continue;
      const key = first.slice(0, eq).trim();
      const value = first.slice(eq + 1).trim();
      if (!key) continue;
      this.cookies.set(key, value);
    }
  }

  cookieHeader() {
    if (this.cookies.size === 0) return "";
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  csrfToken() {
    return (
      this.cookies.get("XSRF-TOKEN") ||
      this.cookies.get("CSRF-TOKEN") ||
      this.cookies.get("csrfToken") ||
      ""
    );
  }

  async ensureCsrf() {
    const probes = [
      "/auth/me",
      "/portal/admin",
      "/portal/manager",
      "/portal/employee",
      "/submission-window/current",
    ];
    for (const path of probes) {
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
    const data = await this.request("/auth/login", {
      method: "POST",
      body: { email, password },
      useCsrf: false,
    });
    this.setAuthFromLogin(data);
    return data;
  }

  async request(
    path,
    {
      method = "GET",
      body = undefined,
      headers = {},
      useCsrf = true,
      retryOn403 = true,
      tolerateStatus = [],
      signal = undefined,
    } = {}
  ) {
    const normalizedPath = String(path || "").startsWith("/") ? String(path) : `/${String(path || "")}`;
    const url = `${this.baseUrl}${normalizedPath}`;
    const reqHeaders = {
      Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
      ...(headers || {}),
    };

    if (this.authHeader && !reqHeaders.Authorization) {
      reqHeaders.Authorization = this.authHeader;
    }

    const cookie = this.cookieHeader();
    if (cookie) reqHeaders.Cookie = cookie;

    const upperMethod = String(method || "GET").toUpperCase();
    const hasBody = body !== undefined;
    if (hasBody && !reqHeaders["Content-Type"]) reqHeaders["Content-Type"] = "application/json";

    if (useCsrf && upperMethod !== "GET" && upperMethod !== "HEAD") {
      const csrf = this.csrfToken();
      if (csrf) {
        if (!reqHeaders["X-XSRF-TOKEN"]) reqHeaders["X-XSRF-TOKEN"] = csrf;
        if (!reqHeaders["X-CSRF-TOKEN"]) reqHeaders["X-CSRF-TOKEN"] = csrf;
      }
    }

    const res = await fetch(url, {
      method: upperMethod,
      headers: reqHeaders,
      body: hasBody ? JSON.stringify(body) : undefined,
      signal,
    });

    this.updateCookies(res.headers);

    if (!res.ok && res.status === 403 && retryOn403 && useCsrf && upperMethod !== "GET" && upperMethod !== "HEAD") {
      await this.ensureCsrf();
      return this.request(path, {
        method,
        body,
        headers,
        useCsrf,
        retryOn403: false,
        tolerateStatus,
        signal,
      });
    }

    if (!res.ok && Array.isArray(tolerateStatus) && tolerateStatus.includes(res.status)) {
      return { __status: res.status };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let message = text || `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(text);
        message = parsed?.message || parsed?.error || message;
      } catch {
        // ignore
      }
      const err = new Error(`${upperMethod} ${normalizedPath} failed: ${message}`);
      err.status = res.status;
      throw err;
    }

    const contentType = String(res.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      return res.json().catch(() => ({}));
    }
    return res.text().catch(() => "");
  }
}

function normalizeEmployee(raw) {
  const obj = raw && typeof raw === "object" ? raw : {};
  return {
    id: String(obj.employeeId ?? obj.empId ?? obj.id ?? "").trim(),
    name: String(obj.employeeName ?? obj.name ?? obj.fullName ?? "Unknown").trim(),
    email: String(obj.email ?? obj.employeeEmail ?? obj.mail ?? "").trim().toLowerCase(),
    role: String(obj.empRole ?? obj.role ?? obj.userRole ?? "Employee").trim(),
    band: String(obj.band ?? obj.level ?? "").trim(),
    stream: String(obj.stream ?? obj.context ?? "").trim(),
    designation: String(obj.designation ?? obj.title ?? obj.jobTitle ?? "").trim(),
    managerId: String(obj.managerId ?? obj.reportingManagerId ?? obj.managerEmpId ?? "").trim(),
  };
}

function normalizeKpi(raw) {
  const obj = raw && typeof raw === "object" ? raw : {};
  return {
    id: String(obj.kpiDefinitionId ?? obj.definitionId ?? obj.kpiId ?? obj.id ?? "").trim(),
    title: String(obj.kpiName ?? obj.title ?? obj.kpiTitle ?? obj.objective ?? "").trim(),
    band: String(obj.band ?? obj.level ?? "").trim(),
    stream: String(obj.stream ?? obj.context ?? "").trim(),
    weight: Number.parseFloat(String(obj.weightage ?? obj.weight ?? obj.weightPct ?? "0")) || 0,
  };
}

function normalizeValue(raw, idx = 0) {
  const obj = raw && typeof raw === "object" ? raw : {};
  const id = String(obj.id ?? obj.valueId ?? obj.webknotValueId ?? `VAL_${idx + 1}`).trim();
  return {
    id,
    title: String(obj.title ?? obj.valueTitle ?? obj.valueName ?? obj.name ?? id).trim(),
    pillar: String(
      obj.pillar ??
      obj.evaluationCriteria ??
      obj.criteria ??
      obj.valuePillar ??
      obj.valuePillarName ??
      "General"
    ).trim(),
  };
}

function normalizeCertification(raw, idx = 0) {
  const obj = raw && typeof raw === "object" ? raw : {};
  const id = String(obj.id ?? obj.certificationId ?? obj.certId ?? `CERT_${idx + 1}`).trim();
  const name = String(obj.name ?? obj.certificationName ?? obj.title ?? "").trim();
  return { id, name: name || `Certification ${idx + 1}` };
}

function normalizeRole(role) {
  const raw = String(role ?? "").trim().toLowerCase();
  if (raw === "admin") return "admin";
  if (raw === "manager") return "manager";
  if (raw === "employee") return "employee";
  return raw;
}

function uniqueNonBlank(values) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const normalized = String(value ?? "").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function buildComboCatalog(rows, role = null) {
  const map = new Map();
  for (const row of rows || []) {
    if (!row) continue;
    if (role && normalizeRole(row.role) !== normalizeRole(role)) continue;

    const band = String(row.band ?? "").trim();
    const stream = String(row.stream ?? "").trim();
    const designation = String(row.designation ?? "").trim();
    if (!band || !stream || !designation) continue;

    const key = `${band}::${stream}`;
    const prev = map.get(key) || { band, stream, designations: new Set() };
    prev.designations.add(designation);
    map.set(key, prev);
  }
  return map;
}

function comboCatalogToList(catalog) {
  return Array.from((catalog || new Map()).values())
    .map((entry) => ({
      band: entry.band,
      stream: entry.stream,
      designations: Array.from(entry.designations || []),
    }))
    .filter((entry) => entry.band && entry.stream && entry.designations.length > 0);
}

function buildBandCodeToIdMap(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const id = row?.id;
    if (id == null || !/^\d+$/.test(String(id))) continue;
    const numericId = Number.parseInt(String(id), 10);
    for (const key of [row.code, row.name, row.band, row.label]) {
      const code = String(key ?? "").trim();
      if (!code) continue;
      map.set(code.toLowerCase(), numericId);
    }
  }
  return map;
}

function toWebtrakStartDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

function roleLabelForSeed(role) {
  const r = String(role ?? "").trim().toLowerCase();
  if (r === "admin") return "Admin";
  if (r === "manager") return "Manager";
  return "Employee";
}

async function fetchAllWithCursor(
  client,
  path,
  { limit = 200, query = {}, maxPages = 200, tolerateStatus = [404] } = {}
) {
  const items = [];
  let cursor = null;

  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query || {})) {
      if (v == null || v === "") continue;
      params.set(k, String(v));
    }
    params.set("limit", String(limit));
    if (cursor) params.set("cursor", String(cursor));

    const suffix = params.toString() ? `?${params.toString()}` : "";
    const data = await client.request(`${path}${suffix}`, {
      method: "GET",
      tolerateStatus,
    });

    if (data && data.__status && tolerateStatus.includes(data.__status)) break;
    const pageData = normalizeCursorPage(data);
    items.push(...pageData.items);
    if (!pageData.nextCursor) break;
    cursor = pageData.nextCursor;
  }

  return items;
}

function cleanKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isLikelyDuplicate(err) {
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("already") ||
    msg.includes("duplicate") ||
    msg.includes("exists") ||
    msg.includes("constraint") ||
    msg.includes("unique")
  );
}

async function safeCreate({ fn, label, onSuccess, counters }) {
  try {
    const res = await fn();
    if (typeof onSuccess === "function") onSuccess(res);
    counters.created += 1;
    return { ok: true, res };
  } catch (err) {
    if (isLikelyDuplicate(err)) {
      counters.duplicates += 1;
      return { ok: true, duplicate: true };
    }
    counters.failed += 1;
    if (counters.failed <= 12) {
      console.error(`[seed] ${label} failed: ${err.message}`);
    }
    return { ok: false, err };
  }
}

async function main() {
  const config = {
    baseUrl: String(process.env.SEED_API_BASE_URL || "http://localhost:8080").trim().replace(/\/+$/, ""),
    adminEmail: String(process.env.SEED_ADMIN_EMAIL || "").trim(),
    adminPassword: String(process.env.SEED_ADMIN_PASSWORD || "").trim(),
    seedPrefix: String(process.env.SEED_PREFIX || "seed").trim().toLowerCase(),
    month: String(process.env.SEED_MONTH || ymNow()).trim(),
    adminCount: clamp(toInt(process.env.SEED_ADMIN_COUNT, 0), 0, 50),
    managerCount: clamp(toInt(process.env.SEED_MANAGER_COUNT, 24), 1, 500),
    employeeCount: clamp(toInt(process.env.SEED_EMPLOYEE_COUNT, 280), 1, 5000),
    valuesCount: clamp(toInt(process.env.SEED_VALUES_COUNT, 90), 5, 5000),
    certCount: clamp(toInt(process.env.SEED_CERTIFICATIONS_COUNT, 140), 5, 5000),
    kpiPerBandStream: clamp(toInt(process.env.SEED_KPI_PER_BAND_STREAM, 5), 1, 20),
    submissionCount: clamp(toInt(process.env.SEED_SUBMISSIONS_COUNT, 220), 0, 5000),
    managerReviewCount: clamp(toInt(process.env.SEED_MANAGER_REVIEW_COUNT, 140), 0, 5000),
    managerSelfReviewCount: clamp(toInt(process.env.SEED_MANAGER_SELF_REVIEW_COUNT, 18), 0, 5000),
    skipSubmissions: String(process.env.SEED_SKIP_SUBMISSIONS || "").trim().toLowerCase() === "true",
    skipBandStreamSeed:
      String(process.env.SEED_SKIP_BAND_STREAM_SEED || "true").trim().toLowerCase() !== "false",
    skipKpiSeed: String(process.env.SEED_SKIP_KPI_SEED || "true").trim().toLowerCase() !== "false",
  };

  if (!config.adminEmail || !config.adminPassword) {
    console.error("Missing SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD.");
    console.error("Example:");
    console.error("  SEED_API_BASE_URL=http://localhost:8080 SEED_ADMIN_EMAIL=admin@webknot.in SEED_ADMIN_PASSWORD='***' node scripts/seed-huge-data.mjs");
    process.exit(1);
  }

  console.log("[seed] starting huge seed");
  console.log(`[seed] backend: ${config.baseUrl}`);
  console.log(`[seed] month: ${config.month}`);

  const client = new ApiClient(config.baseUrl);

  try {
    await client.login(config.adminEmail, config.adminPassword);
    await client.ensureCsrf();
  } catch (err) {
    console.error(`[seed] login/connect failed: ${err.message}`);
    process.exit(1);
  }

  console.log("[seed] authenticated as admin");

  const createCounters = {
    bands: { created: 0, duplicates: 0, failed: 0 },
    streams: { created: 0, duplicates: 0, failed: 0 },
    certifications: { created: 0, duplicates: 0, failed: 0 },
    values: { created: 0, duplicates: 0, failed: 0 },
    kpis: { created: 0, duplicates: 0, failed: 0 },
    admins: { created: 0, duplicates: 0, failed: 0 },
    managers: { created: 0, duplicates: 0, failed: 0 },
    employees: { created: 0, duplicates: 0, failed: 0 },
    employeeSubmissions: { created: 0, duplicates: 0, failed: 0 },
    managerReviews: { created: 0, duplicates: 0, failed: 0 },
    managerSelfReviews: { created: 0, duplicates: 0, failed: 0 },
  };

  const defaultBands = [
    "B1",
    "B2",
    "B3",
    "B4",
    "B4L",
    "B4H",
    "B5",
    "B5H",
    "B5L",
    "B6",
    "B6H",
    "B6L",
    "B7H",
    "B7L",
    "B8",
  ];

  const defaultStreams = [
    { code: "DEVELOPMENT", label: "Development" },
    { code: "QA", label: "QA" },
    { code: "DEVOPS", label: "DevOps" },
    { code: "DATA", label: "Data" },
    { code: "UIUX", label: "UIUX" },
  ];

  console.log("[seed] loading existing employees and directory rows");
  const allEmployeesRaw = await fetchAllWithCursor(client, "/employees/getall", { limit: 300 });
  const allEmployees = allEmployeesRaw.map(normalizeEmployee).filter((e) => e.id);

  const allBandsRaw = await fetchAllWithCursor(client, "/bands/list", {
    limit: 200,
    query: { activeOnly: true },
    tolerateStatus: [403, 404],
  });
  const allStreamsRaw = await fetchAllWithCursor(client, "/streams/list", {
    limit: 200,
    query: { activeOnly: true },
    tolerateStatus: [403, 404],
  });

  const activeBands = uniqueNonBlank(
    allBandsRaw.map((row) => String(row?.code ?? row?.id ?? "").trim())
  );
  const activeStreams = uniqueNonBlank(
    allStreamsRaw.flatMap((row) => [
      String(row?.label ?? "").trim(),
      String(row?.code ?? "").trim(),
      String(row?.name ?? "").trim(),
    ])
  );

  if (!config.skipBandStreamSeed) {
    console.log("[seed] seeding missing bands and streams");
    const activeBandKeySet = new Set(activeBands.map((b) => b.toLowerCase()));
    for (let i = 0; i < defaultBands.length; i += 1) {
      const band = defaultBands[i];
      if (activeBandKeySet.has(band.toLowerCase())) continue;
      await safeCreate({
        fn: () => client.request("/bands/add", {
          method: "POST",
          body: {
            code: band,
            label: band,
            active: true,
            sortOrder: i + 1,
          },
        }),
        label: `band ${band}`,
        counters: createCounters.bands,
      });
    }

    const activeStreamKeySet = new Set(activeStreams.map((s) => cleanKey(s)));
    for (let i = 0; i < defaultStreams.length; i += 1) {
      const stream = defaultStreams[i];
      if (activeStreamKeySet.has(cleanKey(stream.code)) || activeStreamKeySet.has(cleanKey(stream.label))) {
        continue;
      }
      await safeCreate({
        fn: () => client.request("/streams/add", {
          method: "POST",
          body: {
            code: stream.code,
            label: stream.label,
            active: true,
            sortOrder: i + 1,
          },
        }),
        label: `stream ${stream.code}`,
        counters: createCounters.streams,
      });
    }
  } else {
    console.log("[seed] skipping band/stream seed (set SEED_SKIP_BAND_STREAM_SEED=false to enable)");
  }

  const bandsForCreate = await fetchAllWithCursor(client, "/bands/list", {
    limit: 200,
    query: { activeOnly: true },
    tolerateStatus: [403, 404],
  });
  const bandCodeToId = buildBandCodeToIdMap(
    bandsForCreate.length > 0 ? bandsForCreate : allBandsRaw
  );
  if (bandCodeToId.size === 0) {
    console.warn("[seed] no numeric band ids resolved — employee create may fail until bands exist in Webtrak");
  }

  console.log("[seed] seeding certifications");
  for (let i = 1; i <= config.certCount; i += 1) {
    const name = `Seed Certification ${pad(i, 4)} (${config.seedPrefix.toUpperCase()})`;
    await safeCreate({
      fn: () => client.request("/certifications/add", {
        method: "POST",
        body: { name, active: true },
      }),
      label: `certification ${name}`,
      counters: createCounters.certifications,
    });
  }

  console.log("[seed] seeding webknot values");
  const pillars = ["Ownership", "Innovation", "Delivery", "Collaboration", "Leadership"];
  for (let i = 1; i <= config.valuesCount; i += 1) {
    const pillar = pillars[(i - 1) % pillars.length];
    const title = `Seed Value ${pad(i, 4)} (${pillar})`;
    await safeCreate({
      fn: () => client.request("/webknot-values/add", {
        method: "POST",
        body: {
          title,
          valueTitle: title,
          name: title,
          valueName: title,
          pillar,
          evaluationCriteria: pillar,
          criteria: pillar,
          description: `Synthetic value signal ${i} for dashboard coverage.`,
        },
      }),
      label: `value ${title}`,
      counters: createCounters.values,
    });
  }

  if (!config.skipKpiSeed) {
    console.log("[seed] seeding KPI definitions where combo has remaining weight");
    const existingKpisRaw = await fetchAllWithCursor(client, "/kpi-definitions/getall", { limit: 300 });
    const existingKpis = existingKpisRaw.map(normalizeKpi).filter((k) => k.id);
    const totalWeightByCombo = new Map();
    for (const kpi of existingKpis) {
      const key = `${cleanKey(kpi.band)}::${cleanKey(kpi.stream)}`;
      const prev = totalWeightByCombo.get(key) || 0;
      totalWeightByCombo.set(key, prev + (Number.isFinite(kpi.weight) ? kpi.weight : 0));
    }

    const candidateBands = uniqueNonBlank([
      ...activeBands,
      ...allEmployees.map((e) => e.band),
      ...defaultBands,
    ]);
    const candidateStreams = uniqueNonBlank([
      ...activeStreams,
      ...allEmployees.map((e) => e.stream),
      ...defaultStreams.map((s) => s.label),
    ]);

    const kpiTemplates = [
      "Execution Quality",
      "Delivery Timeliness",
      "Technical Excellence",
      "Stakeholder Impact",
      "Continuous Improvement",
      "Ownership and Reliability",
      "Operational Discipline",
    ];

    for (const band of candidateBands) {
      for (const stream of candidateStreams) {
        const key = `${cleanKey(band)}::${cleanKey(stream)}`;
        const currentWeight = totalWeightByCombo.get(key) || 0;
        const remaining = Math.max(0, 100 - currentWeight);
        if (remaining < 1) continue;

        const perKpiWeight = Math.min(remaining, 100 / config.kpiPerBandStream);
        const count = Math.max(1, Math.min(config.kpiPerBandStream, Math.floor(remaining / perKpiWeight)));
        for (let i = 0; i < count; i += 1) {
          const title = `${stream} ${kpiTemplates[i % kpiTemplates.length]} (${band})`;
          const result = await safeCreate({
            fn: () => client.request("/kpi-definitions/add", {
              method: "POST",
              body: {
                kpiName: title,
                weightage: perKpiWeight,
                band,
                stream,
              },
            }),
            label: `kpi ${title}`,
            counters: createCounters.kpis,
          });
          if (!result.ok) break;
        }
      }
    }
  } else {
    console.log("[seed] skipping KPI seed (set SEED_SKIP_KPI_SEED=false to enable)");
  }

  const usedIds = new Set(allEmployees.map((e) => e.id.toLowerCase()));
  const usedEmails = new Set(allEmployees.map((e) => e.email).filter(Boolean));

  let nextOrdinal = 1;
  function nextEmployeeIdentity(roleTag) {
    while (true) {
      const idCandidate = `EMP${String(900000 + nextOrdinal).padStart(6, "0")}`;
      const emailCandidate = `${config.seedPrefix}.${roleTag}.${String(nextOrdinal).padStart(5, "0")}@webknot.in`;
      nextOrdinal += 1;
      if (usedIds.has(idCandidate.toLowerCase())) continue;
      if (usedEmails.has(emailCandidate.toLowerCase())) continue;
      usedIds.add(idCandidate.toLowerCase());
      usedEmails.add(emailCandidate.toLowerCase());
      return { id: idCandidate, email: emailCandidate };
    }
  }

  const createdAdminIds = [];
  const createdManagerIds = [];
  const createdEmployeeIds = [];

  const adminCombos = comboCatalogToList(buildComboCatalog(allEmployees, "admin"));
  const managerCombos = comboCatalogToList(buildComboCatalog(allEmployees, "manager"));
  const employeeCombos = comboCatalogToList(buildComboCatalog(allEmployees, "employee"));
  const allCombos = comboCatalogToList(buildComboCatalog(allEmployees));

  const fallbackBands = uniqueNonBlank([...activeBands, ...defaultBands]).slice(0, 8);
  const fallbackStreams = uniqueNonBlank([...allEmployees.map((e) => e.stream), ...activeStreams, ...defaultStreams.map((s) => s.label)]).slice(0, 8);
  const fallbackCombos = [];
  for (const band of fallbackBands) {
    for (const stream of fallbackStreams) {
      fallbackCombos.push({
        band,
        stream,
        designations: ["Software Engineer", "Senior Software Engineer", "Lead Engineer", "Engineering Manager", "System Admin"],
      });
    }
  }

  const adminSeedCombos = adminCombos.length ? adminCombos : allCombos.length ? allCombos : fallbackCombos;
  const managerSeedCombos = managerCombos.length ? managerCombos : allCombos.length ? allCombos : fallbackCombos;
  const employeeSeedCombos = employeeCombos.length ? employeeCombos : allCombos.length ? allCombos : fallbackCombos;

  async function createUserWithCombos({
    identity,
    index,
    role,
    displayName,
    combos,
    counters,
    onSuccess,
  }) {
    const pool = combos.length ? combos : fallbackCombos;
    const maxAttempts = Math.max(1, Math.min(pool.length, 4));
    const start = (index - 1) % pool.length;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const combo = pool[(start + attempt) % pool.length];
      const designations = Array.isArray(combo?.designations) && combo.designations.length > 0
        ? combo.designations
        : ["Software Engineer"];
      const designation = String(designations[(index + attempt - 1) % designations.length] || "").trim() || "Software Engineer";
      const bandCode = String(combo?.band ?? "").trim();
      const department = String(combo?.stream ?? "").trim() || "Development";
      const bandId = bandCode ? bandCodeToId.get(bandCode.toLowerCase()) : null;
      if (!bandId) continue;

      const payload = {
        email: identity.email,
        name: displayName,
        role: roleLabelForSeed(role),
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

      const result = await safeCreate({
        fn: () => client.request("/api/v1/employees", { method: "POST", body: payload }),
        label: `${String(role).toLowerCase()} ${identity.id}`,
        counters,
        onSuccess: () => {
          if (typeof onSuccess === "function") onSuccess(identity.id);
        },
      });
      if (result.ok) return true;

      const msg = String(result?.err?.message || "").toLowerCase();
      const retryableByCombo =
        msg.includes("designation") ||
        msg.includes("band") ||
        msg.includes("stream") ||
        msg.includes("invalid employee") ||
        msg.includes("required");
      if (!retryableByCombo) return false;
    }
    return false;
  }

  console.log("[seed] creating admin users");
  for (let i = 1; i <= config.adminCount; i += 1) {
    const identity = nextEmployeeIdentity("admin");
    await createUserWithCombos({
      identity,
      index: i,
      role: "Admin",
      displayName: `Seed Admin ${pad(i, 3)}`,
      combos: adminSeedCombos,
      counters: createCounters.admins,
      onSuccess: (id) => createdAdminIds.push(id),
    });
  }

  console.log("[seed] creating manager users");
  for (let i = 1; i <= config.managerCount; i += 1) {
    const identity = nextEmployeeIdentity("manager");
    await createUserWithCombos({
      identity,
      index: i,
      role: "Manager",
      displayName: `Seed Manager ${pad(i, 3)}`,
      combos: managerSeedCombos,
      counters: createCounters.managers,
      onSuccess: (id) => createdManagerIds.push(id),
    });
  }

  const existingManagerIds = allEmployees
    .filter((e) => normalizeRole(e.role) === "manager")
    .map((e) => String(e.id || "").trim())
    .filter(Boolean);

  if (createdManagerIds.length === 0) {
    const managersRaw = await client.request("/employees/managers", { method: "GET", tolerateStatus: [404] });
    if (!(managersRaw && managersRaw.__status === 404)) {
      const managerRows = Array.isArray(managersRaw?.data) ? managersRaw.data : Array.isArray(managersRaw) ? managersRaw : [];
      for (const row of managerRows) {
        const id = String(row?.employeeId ?? row?.id ?? row?.empId ?? "").trim();
        if (id) createdManagerIds.push(id);
      }
    }
  }
  for (const id of existingManagerIds) {
    if (!createdManagerIds.includes(id)) createdManagerIds.push(id);
  }

  if (createdManagerIds.length === 0) {
    console.error("[seed] no managers available. Cannot create employee hierarchy.");
    process.exit(1);
  }

  console.log("[seed] creating employee users");
  for (let i = 1; i <= config.employeeCount; i += 1) {
    const identity = nextEmployeeIdentity("employee");
    await createUserWithCombos({
      identity,
      index: i,
      role: "Employee",
      displayName: `Seed Employee ${pad(i, 4)}`,
      combos: employeeSeedCombos,
      counters: createCounters.employees,
      onSuccess: (id) => createdEmployeeIds.push(id),
    });
  }

  console.log("[seed] refreshing seeded entities");
  const employeesAfterRaw = await fetchAllWithCursor(client, "/employees/getall", { limit: 300 });
  const employeesAfter = employeesAfterRaw.map(normalizeEmployee).filter((e) => e.id);
  const employeeRows = employeesAfter.filter((e) => e.role.toLowerCase() === "employee");
  const managerRows = employeesAfter.filter((e) => e.role.toLowerCase() === "manager");

  const kpisAfterRaw = await fetchAllWithCursor(client, "/kpi-definitions/getall", { limit: 300 });
  const kpisAfter = kpisAfterRaw.map(normalizeKpi).filter((k) => k.id);
  const valuesAfterRaw = await fetchAllWithCursor(client, "/webknot-values/list", {
    limit: 300,
    query: { activeOnly: true },
  });
  const valuesAfter = valuesAfterRaw.map(normalizeValue).filter((v) => v.id);
  const certsAfterRaw = await fetchAllWithCursor(client, "/certifications/list", {
    limit: 300,
    query: { activeOnly: true },
  });
  const certsAfter = certsAfterRaw.map(normalizeCertification).filter((c) => c.name);

  const kpiByBandStream = new Map();
  for (const kpi of kpisAfter) {
    const key = `${cleanKey(kpi.band)}::${cleanKey(kpi.stream)}`;
    const prev = kpiByBandStream.get(key) || [];
    prev.push(kpi);
    kpiByBandStream.set(key, prev);
  }

  function pickKpisForEmployee(emp) {
    const exactKey = `${cleanKey(emp.band)}::${cleanKey(emp.stream)}`;
    const byExact = kpiByBandStream.get(exactKey) || [];
    if (byExact.length) return sample(byExact, Math.min(5, byExact.length));

    const byBand = kpisAfter.filter((k) => cleanKey(k.band) === cleanKey(emp.band));
    if (byBand.length) return sample(byBand, Math.min(5, byBand.length));

    const byStream = kpisAfter.filter((k) => cleanKey(k.stream) === cleanKey(emp.stream));
    if (byStream.length) return sample(byStream, Math.min(5, byStream.length));

    return sample(kpisAfter, Math.min(5, kpisAfter.length));
  }

  if (!config.skipSubmissions) {
    console.log("[seed] seeding employee monthly submissions");
    const submitTargets = sample(employeeRows, Math.min(config.submissionCount, employeeRows.length));

    for (const emp of submitTargets) {
      const selectedKpis = pickKpisForEmployee(emp);
      const selectedValues = sample(valuesAfter, Math.min(4, valuesAfter.length));
      const selectedCerts = sample(certsAfter, Math.min(2, certsAfter.length));

      const kpiRatingsArray = selectedKpis.map((k) => ({
        kpiId: k.id,
        kpiDefinitionId: k.id,
        rating: randomRating(),
      }));

      const valueResponses = selectedValues.map((v) => ({
        valueId: v.id,
        webknotValueId: v.id,
        rating: randomRating(),
      }));
      const valueRatings = Object.fromEntries(valueResponses.map((x) => [x.valueId, x.rating]));

      const payload = {
        month: config.month,
        monthKey: config.month,
        profileVerified: true,
        submissionType: "EMPLOYEE_MONTHLY_SUBMISSION",
        actorRole: "EMPLOYEE",
        targetRole: "MANAGER",
        subjectEmployeeId: emp.id,
        employeeId: emp.id,
        selfReviewText: `Monthly self review for ${emp.name}: delivered sprint commitments, improved quality, and closed blockers.`,
        certifications: selectedCerts.map((c, idx) => ({
          name: c.name,
          certificationName: c.name,
          proof: `https://evidence.webknot.in/cert/${cleanKey(emp.id)}-${idx + 1}`,
        })),
        kpiRatings: kpiRatingsArray,
        webknotValueResponses: valueResponses,
        webknotValues: valueResponses.map((x) => x.valueId),
        webknotValueRatings: valueRatings,
        recognitionsCount: randomInt(0, 3),
        reviewStatus: "SUBMITTED",
        submittedAt: nowIso(),
      };

      await safeCreate({
        fn: () => client.request("/monthly-submissions/submit", { method: "POST", body: payload }),
        label: `employee submission ${emp.id}`,
        counters: createCounters.employeeSubmissions,
      });
    }

    console.log("[seed] seeding manager reviews for team submissions");
    const reviewTargets = sample(submitTargets, Math.min(config.managerReviewCount, submitTargets.length));
    for (const emp of reviewTargets) {
      const selectedKpis = pickKpisForEmployee(emp);
      const selectedValues = sample(valuesAfter, Math.min(4, valuesAfter.length));
      const kpiRatingsArray = selectedKpis.map((k) => ({
        kpiId: k.id,
        kpiDefinitionId: k.id,
        rating: randomRating(),
      }));
      const valueResponses = selectedValues.map((v) => ({
        valueId: v.id,
        webknotValueId: v.id,
        rating: randomRating(),
      }));

      const manager = managerRows.find((m) => String(m.id) === String(emp.managerId)) || sample(managerRows, 1)[0] || null;
      const reviewedBy = manager?.id || createdManagerIds[0] || null;

      const payload = {
        month: config.month,
        monthKey: config.month,
        profileVerified: true,
        submissionType: "EMPLOYEE_MONTHLY_SUBMISSION",
        actorRole: "MANAGER",
        targetRole: "EMPLOYEE",
        workflowStage: "MANAGER_REVIEW",
        subjectEmployeeId: emp.id,
        employeeId: emp.id,
        selfReviewText: `Reviewed submission for ${emp.name}.`,
        certifications: [],
        kpiRatings: kpiRatingsArray,
        webknotValueResponses: valueResponses,
        recognitionsCount: randomInt(0, 2),
        managerEvaluation: {
          kpiRatings: Object.fromEntries(kpiRatingsArray.map((x) => [x.kpiId, x.rating])),
          webknotValueRatings: Object.fromEntries(valueResponses.map((x) => [x.valueId, x.rating])),
          comments: "Manager validated delivery impact and consistency.",
          reviewedAt: nowIso(),
          reviewedBy,
        },
        managerReview: {
          action: "SUBMIT",
          comments: "Approved and forwarded to admin workflow.",
          reviewedAt: nowIso(),
          reviewedBy,
        },
        managerSubmittedAt: nowIso(),
        reviewStatus: "MANAGER_SUBMITTED",
      };

      await safeCreate({
        fn: () => client.request("/monthly-submissions/submit", { method: "POST", body: payload }),
        label: `manager review ${emp.id}`,
        counters: createCounters.managerReviews,
      });
    }

    console.log("[seed] seeding manager self reviews");
    const managerSelfTargets = sample(managerRows, Math.min(config.managerSelfReviewCount, managerRows.length));
    for (const mgr of managerSelfTargets) {
      const selectedKpis = pickKpisForEmployee(mgr);
      const selectedValues = sample(valuesAfter, Math.min(4, valuesAfter.length));
      const kpiRatingsArray = selectedKpis.map((k) => ({
        kpiId: k.id,
        kpiDefinitionId: k.id,
        rating: randomRating(),
      }));
      const valueResponses = selectedValues.map((v) => ({
        valueId: v.id,
        webknotValueId: v.id,
        rating: randomRating(),
      }));

      const payload = {
        month: config.month,
        monthKey: config.month,
        profileVerified: true,
        submissionType: "MANAGER_SELF_REVIEW",
        actorRole: "MANAGER",
        targetRole: "ADMIN",
        subjectEmployeeId: mgr.id,
        selfReviewText: `Manager self review for ${mgr.name}: team delivery improved and review quality remained consistent.`,
        certifications: [],
        kpiRatings: kpiRatingsArray,
        webknotValueResponses: valueResponses,
        recognitionsCount: randomInt(0, 1),
        reviewStatus: "SUBMITTED",
        submittedAt: nowIso(),
      };

      await safeCreate({
        fn: () => client.request("/monthly-submissions/submit", { method: "POST", body: payload }),
        label: `manager self review ${mgr.id}`,
        counters: createCounters.managerSelfReviews,
      });
    }
  }

  console.log("\n[seed] complete");
  console.table(
    Object.fromEntries(
      Object.entries(createCounters).map(([k, v]) => [
        k,
        `${v.created} created | ${v.duplicates} duplicate | ${v.failed} failed`,
      ])
    )
  );
}

main().catch((err) => {
  console.error("[seed] fatal:", err?.message || err);
  process.exit(1);
});
