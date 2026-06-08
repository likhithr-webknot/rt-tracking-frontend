#!/usr/bin/env node
/**
 * Delete QA Employee One's monthly submission(s).
 *
 * By default deletes ALL submissions for the QA employee. Set SEED_MONTH=YYYY-MM to
 * delete only that month.
 *
 * Usage:
 *   SEED_ADMIN_EMAIL=likhith.r@webknot.in \
 *   SEED_ADMIN_PASSWORD='WebknotQA#Test1' \
 *   node scripts/delete-qa-employee-submission.mjs
 */

import process from "node:process";

const QA_EMPLOYEE_EMAIL = "qa.employee.one@webknot.in";

function formatYearMonth(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

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
    const tokenRaw = root.accessToken ?? root.access_token ?? root.token ?? root.jwt ?? null;
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
    for (const path of ["/auth/me", "/portal/admin"]) {
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
    const data = await this.request("/api/v1/auth/login", {
      method: "POST",
      body: { email, password },
      useCsrf: false,
    });
    this.setAuthFromLogin(data?.data ?? data);
    return data;
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
    const text = await res.text().catch(() => "");
    const parsed = extractFirstJsonObject(text);
    if (!res.ok && tolerateStatus.includes(res.status)) return { __status: res.status, parsed };
    if (!res.ok) {
      const message = parsed?.message || parsed?.error || text || `HTTP ${res.status}`;
      const err = new Error(`${upperMethod} ${normalizedPath} failed: ${message}`);
      err.status = res.status;
      throw err;
    }
    return parsed && typeof parsed === "object" ? parsed : {};
  }
}

function extractEmployees(data) {
  const root = data && typeof data === "object" ? data : {};
  const nested = root?.data && typeof root.data === "object" && !Array.isArray(root.data) ? root.data : null;
  const arr =
    (nested && Array.isArray(nested.data) && nested.data) ||
    (Array.isArray(root?.data) && root.data) ||
    (Array.isArray(root?.content) && root.content) ||
    (Array.isArray(root?.items) && root.items) ||
    [];
  return arr;
}

function extractSubmissions(data) {
  const root = data?.data && typeof data.data === "object" ? data.data : data;
  if (Array.isArray(root)) return root;
  if (Array.isArray(root?.items)) return root.items;
  if (Array.isArray(root?.content)) return root.content;
  if (Array.isArray(root?.data)) return root.data;
  return [];
}

async function main() {
  const baseUrl = String(process.env.SEED_API_BASE_URL || "http://localhost:8080").trim().replace(/\/+$/, "");
  const adminEmail = String(process.env.SEED_ADMIN_EMAIL || "likhith.r@webknot.in").trim();
  const adminPassword = String(process.env.SEED_ADMIN_PASSWORD || "WebknotQA#Test1").trim();
  const monthFilter = String(process.env.SEED_MONTH || "").trim();

  const client = new ApiClient(baseUrl);
  await client.login(adminEmail, adminPassword);
  await client.ensureCsrf();

  const employeesRes = await client.request("/api/v1/employees?limit=1000&cursor=0");
  const employees = extractEmployees(employeesRes);
  const qaEmployee = employees.find(
    (e) => String(e.email ?? e.employeeEmail ?? "").trim().toLowerCase() === QA_EMPLOYEE_EMAIL,
  );
  if (!qaEmployee) {
    console.error(`QA employee not found: ${QA_EMPLOYEE_EMAIL}`);
    process.exit(1);
  }

  const empKey = String(qaEmployee.empId ?? qaEmployee.employeeId ?? qaEmployee.id ?? "").trim();
  const qaUserId = String(qaEmployee.id ?? qaEmployee.userId ?? "").trim();
  console.log(`Found ${QA_EMPLOYEE_EMAIL} (${empKey})`);

  const listPath = monthFilter
    ? `/api/v1/admin/monthly-submissions?month=${encodeURIComponent(monthFilter)}`
    : "/api/v1/admin/monthly-submissions";
  const listRes = await client.request(listPath);
  const submissions = extractSubmissions(listRes);
  const matches = submissions.filter((row) => {
    const email = String(row.email ?? row.employeeEmail ?? "").trim().toLowerCase();
    const empId = String(row.empId ?? row.employeeId ?? row.subjectEmployeeId ?? "").trim();
    const userId = String(row.userId ?? "").trim();
    return email === QA_EMPLOYEE_EMAIL || empId === empKey || (qaUserId && userId === qaUserId);
  });

  if (!matches.length) {
    console.log(
      monthFilter
        ? `No submission found for ${QA_EMPLOYEE_EMAIL} in ${monthFilter}.`
        : `No submissions found for ${QA_EMPLOYEE_EMAIL}.`,
    );
    return;
  }

  console.log(
    monthFilter
      ? `Deleting ${matches.length} submission(s) for ${monthFilter}…`
      : `Deleting ${matches.length} submission(s) for ${QA_EMPLOYEE_EMAIL}…`,
  );

  for (const match of matches) {
    const submissionId = match.id ?? match.submissionId;
    const month = match.month ?? match.monthKey ?? monthFilter ?? "unknown";
    console.log(`  id=${submissionId} month=${month}`);
    try {
      await client.request(`/api/v1/admin/monthly-submissions/${encodeURIComponent(String(submissionId))}`, {
        method: "DELETE",
      });
    } catch (err) {
      if (err.status === 404 || err.status === 405) {
        console.error("DELETE endpoint unavailable — restart backend after pulling latest changes.");
      }
      throw err;
    }
  }

  console.log("Deleted successfully.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
