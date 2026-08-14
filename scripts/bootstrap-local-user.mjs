#!/usr/bin/env node

/**
 * Bootstrap a Webknot Pulse user on local webtrak when Google OAuth returns
 * "unregistered_user" (no row in `users` yet).
 *
 * Uses webtrak's dev admin Authorization header (not your Google password).
 *
 * Usage:
 *   node scripts/bootstrap-local-user.mjs \
 *     --email likhith.r@webknot.in \
 *     --name "Likhith Raju"
 *
 * Env (optional):
 *   SEED_API_BASE_URL=http://localhost:8080
 *   WEBTRAK_ADMIN_PASSWORD=...   (defaults to application.yml dev value)
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const DEFAULT_ADMIN_PASSWORD = "moo$aidTheC0W";

function loadWebtrakEnv() {
  const envPath = path.resolve(process.cwd(), "../webtrak/.env");
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

function parseArgs(argv) {
  const out = { email: "", name: "", roles: ["ADMIN", "HR"] };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--email") out.email = String(argv[++i] || "").trim().toLowerCase();
    else if (arg === "--name") out.name = String(argv[++i] || "").trim();
    else if (arg === "--roles") {
      out.roles = String(argv[++i] || "")
        .split(",")
        .map((r) => r.trim().toUpperCase())
        .filter(Boolean);
    }
  }
  return out;
}

function toWebtrakStartDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

async function api(baseUrl, adminPassword, path, { method = "GET", body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: adminPassword,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    const msg = parsed?.message || parsed?.error || text || res.statusText;
    const err = new Error(`${method} ${path} failed (${res.status}): ${msg}`);
    err.status = res.status;
    throw err;
  }
  return parsed;
}

function parseJdbcUrl(jdbcUrl) {
  const raw = String(jdbcUrl || "").trim();
  const match = raw.match(/^jdbc:postgresql:\/\/([^:/]+)(?::(\d+))?\/([^?]+)/i);
  if (!match) return null;
  return {
    host: match[1],
    port: match[2] || "5432",
    database: match[3],
  };
}

function runPsql(webtrakEnv, sql) {
  const jdbc = parseJdbcUrl(webtrakEnv.DATASOURCE_URL);
  const username = String(webtrakEnv.DATASOURCE_USERNAME || "").trim();
  const password = String(webtrakEnv.DATASOURCE_PASSWORD || "").trim();
  if (!jdbc || !username || !password) {
    throw new Error(
      "Cannot seed bands — set DATASOURCE_URL, DATASOURCE_USERNAME, DATASOURCE_PASSWORD in webtrak/.env",
    );
  }
  const result = spawnSync(
    "psql",
    [
      "-h",
      jdbc.host,
      "-p",
      jdbc.port,
      "-U",
      username,
      "-d",
      jdbc.database,
      "-v",
      "ON_ERROR_STOP=1",
      "-t",
      "-A",
      "-c",
      sql,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, PGPASSWORD: password },
    },
  );
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "").trim();
    throw new Error(detail || "psql command failed");
  }
  return String(result.stdout || "").trim();
}

function ensureMinimalBand(webtrakEnv) {
  const count = Number(runPsql(webtrakEnv, "SELECT COUNT(*) FROM band;") || "0");
  if (count > 0) return;
  runPsql(
    webtrakEnv,
    `INSERT INTO band (name, designation, kpis)
     VALUES ('B4', 'Software Engineer', '[]'::jsonb);`,
  );
  console.log("[bootstrap] inserted minimal band B4 (database had no bands)");
}

async function resolveBandId(baseUrl, adminPassword, webtrakEnv) {
  let res = await api(baseUrl, adminPassword, "/api/v1/band-list");
  let rows = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
  if (rows.length === 0) {
    ensureMinimalBand(webtrakEnv);
    res = await api(baseUrl, adminPassword, "/api/v1/band-list");
    rows = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
  }
  const preferred = rows.find((b) =>
    String(b?.band ?? b?.name ?? b?.bandCode ?? b?.code ?? "")
      .toUpperCase()
      .startsWith("B4"),
  );
  const pick = preferred || rows[0];
  const id = pick?.id ?? pick?.bandId;
  if (!id) throw new Error("No bands in database — could not seed a default band.");
  return Number(id);
}

async function userExists(baseUrl, adminPassword, email) {
  try {
    const res = await api(
      baseUrl,
      adminPassword,
      `/api/v1/user?email=${encodeURIComponent(email)}`,
    );
    return Boolean(res?.data?.id || res?.data?.email);
  } catch (err) {
    if (err.status === 400 || err.status === 404) return false;
    throw err;
  }
}

async function createUser(baseUrl, adminPassword, { email, name, bandId }) {
  return api(baseUrl, adminPassword, "/api/v1/user/onboard", {
    method: "POST",
    body: {
      email,
      name,
      role: "Admin",
      department: "Development",
      bandId,
      userType: "FULLTIME",
      workMode: "HYBRID",
      startDate: toWebtrakStartDate(),
      assetRequired: false,
      salaryDetails: {
        base: 1,
        variable: 1,
        payoutCycle: "monthly",
        description: "Local dev bootstrap",
      },
    },
  });
}

async function assignRole(baseUrl, adminPassword, email, roleName) {
  return api(baseUrl, adminPassword, "/api/v1/assign-role", {
    method: "POST",
    body: { userEmail: email, roleName },
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const webtrakEnv = loadWebtrakEnv();
  const baseUrl = String(process.env.SEED_API_BASE_URL || "http://localhost:8080")
    .trim()
    .replace(/\/+$/, "");
  const adminPassword = String(
    process.env.WEBTRAK_ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD,
  ).trim();

  if (!args.email) {
    console.error("Missing --email (e.g. likhith.r@webknot.in)");
    process.exit(1);
  }
  if (!args.name) {
    args.name = args.email.split("@")[0].replace(/\./g, " ");
  }

  console.log(`[bootstrap] backend: ${baseUrl}`);
  console.log(`[bootstrap] user: ${args.email}`);

  const exists = await userExists(baseUrl, adminPassword, args.email);
  if (exists) {
    console.log("[bootstrap] user already exists — assigning roles only");
  } else {
    const bandId = await resolveBandId(baseUrl, adminPassword, webtrakEnv);
    await createUser(baseUrl, adminPassword, {
      email: args.email,
      name: args.name,
      bandId,
    });
    console.log("[bootstrap] created user row");
  }

  for (const role of args.roles) {
    try {
      await assignRole(baseUrl, adminPassword, args.email, role);
      console.log(`[bootstrap] assigned ${role}`);
    } catch (err) {
      const msg = String(err.message || "").toLowerCase();
      if (msg.includes("already") || msg.includes("exists")) {
        console.log(`[bootstrap] ${role} already assigned`);
      } else {
        throw err;
      }
    }
  }

  console.log("");
  console.log("Done. Sign in with:");
  console.log(`  • Google: Continue with Google (${args.email})`);
  console.log("  • Dev password: WebknotQA#Test1 (same for all local users)");
  console.log("");
  console.log("Note: local DB is configured in webtrak/.env (currently DATASOURCE_URL → database `rt`).");
  if (webtrakEnv.DATASOURCE_URL && !webtrakEnv.DATASOURCE_URL.includes("/rt")) {
    console.log(`  DB URL: ${webtrakEnv.DATASOURCE_URL}`);
  }
}

main().catch((err) => {
  console.error(`[bootstrap] ${err.message}`);
  process.exit(1);
});
