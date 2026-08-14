#!/usr/bin/env node

/**
 * Quick health check before starting local dev.
 * Usage: node scripts/check-local-setup.mjs
 */

import process from "node:process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const apiBase = String(process.env.VITE_API_DEV_PROXY || "http://localhost:8080").replace(/\/+$/, "");
const root = resolve(process.cwd());

function ok(label, detail = "") {
  console.log(`✓ ${label}${detail ? ` — ${detail}` : ""}`);
}

function warn(label, detail = "") {
  console.log(`! ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label, detail = "") {
  console.log(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

async function ping(url) {
  try {
    const res = await fetch(url, { method: "GET" });
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

console.log("Pulse / RT Tracking — local setup check\n");

const nodeMajor = Number.parseInt(String(process.versions.node || "0").split(".")[0], 10);
if (nodeMajor >= 20) ok("Node.js", process.versions.node);
else fail("Node.js", `${process.versions.node} (need 20+)`);

if (existsSync(resolve(root, "node_modules"))) ok("Frontend dependencies", "node_modules present");
else warn("Frontend dependencies", "run npm install");

if (existsSync(resolve(root, ".env")) || existsSync(resolve(root, ".env.local"))) {
  ok("Frontend env", ".env or .env.local found");
} else {
  warn("Frontend env", "copy .env.example to .env");
}

const health = await ping(`${apiBase}/actuator/health`);
if (health.ok) ok("Backend API", `${apiBase} (HTTP ${health.status})`);
else fail("Backend API", `${apiBase} — ${health.error || "not reachable"}`);

const adminPassword = String(process.env.WEBTRAK_ADMIN_PASSWORD || "moo$aidTheC0W").trim();
try {
  const rosterRes = await fetch(`${apiBase}/api/v1/user/onboard?page=0&size=5`, {
    headers: { Authorization: adminPassword, Accept: "application/json" },
  });
  if (rosterRes.ok) {
    const payload = await rosterRes.json();
    const data = payload?.data ?? {};
    const total = Number(data.totalElement ?? data.totalElements ?? 0);
    if (total <= 5) {
      warn(
        "Webtrak employee roster",
        `${total} user(s) in backend DB — Team List reads local Postgres, not Supabase cloud`,
      );
      console.log("    → Add VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY to .env.local");
      console.log("    → Or point webtrak/.env DATASOURCE_URL at your Supabase Postgres URI");
    } else {
      ok("Webtrak employee roster", `${total} users visible to backend`);
    }
  }
} catch {
  warn("Webtrak employee roster", "could not query /api/v1/user/onboard");
}

const hasSupabase = Boolean(
  String(process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim(),
);
if (hasSupabase) ok("Supabase roster env", "VITE_SUPABASE_URL configured");
else if (health.ok) warn("Supabase roster env", "not set — Team List will only show local Webtrak DB users");

console.log("\nNext steps:");
console.log("  1. Backend (webtrak): ./gradlew bootRun  (port 8080, PostgreSQL required)");
console.log("  2. Frontend:          npm run dev       (port 3000)");
console.log("  3. QA seed (optional): npm run seed:minimal");
console.log("\nSee docs/LOCAL_SETUP.md for full instructions.");

process.exit(health.ok ? 0 : 1);
