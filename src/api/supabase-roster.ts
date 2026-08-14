/**
 * Read employee roster rows directly from Supabase `users` when the platform DB
 * is hosted there. Used when Webtrak's Postgres is not the same database as Supabase.
 */

import { getSupabase } from "../lib/supabase";

export function isSupabaseRosterConfigured() {
  return Boolean(getSupabase());
}

export function shouldPreferSupabaseRoster() {
  if (!isSupabaseRosterConfigured()) return false;
  const raw = String(import.meta.env.VITE_USE_SUPABASE_ROSTER ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function mapSupabaseUserRow(row: Record<string, unknown>) {
  const status = String(row.status ?? "").trim().toUpperCase();
  return {
    id: row.id,
    empId: String(row.emp_id ?? row.empId ?? row.id ?? "").trim(),
    email: String(row.email ?? "").trim(),
    name: String(row.name ?? "").trim(),
    status,
    userType: String(row.user_type ?? row.type ?? row.userType ?? "").trim(),
    type: String(row.user_type ?? row.type ?? row.userType ?? "").trim(),
    department: String(row.department ?? "").trim(),
    role: String(row.role ?? "").trim(),
    phoneNumber: String(row.phone_number ?? row.phoneNumber ?? "").trim(),
    onboardingStatus: status === "ACTIVE" ? "ONBOARDED" : "PENDING",
  };
}

export async function fetchSupabaseEmployeeRoster({
  search = "",
  limit = 500,
  offset = 0,
  signal,
}: {
  search?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
} = {}) {
  const supabase = getSupabase();
  if (!supabase) return null;

  const safeLimit = Math.max(Number.parseInt(String(limit ?? 500), 10) || 500, 1);
  const safeOffset = Math.max(Number.parseInt(String(offset ?? 0), 10) || 0, 0);
  const q = String(search ?? "").trim();

  let query = supabase
    .from("users")
    .select(
      "id, emp_id, email, name, status, user_type, type, department, phone_number, role",
      { count: "exact" },
    )
    .order("name", { ascending: true });

  if (q) {
    const pattern = `%${q.replace(/[%_]/g, "")}%`;
    query = query.or(
      `name.ilike.${pattern},email.ilike.${pattern},emp_id.ilike.${pattern}`,
    );
  }

  query = query.range(safeOffset, safeOffset + safeLimit - 1);

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const { data, error, count } = await query;
  if (error) {
    throw new Error(`Supabase users query failed: ${error.message}`);
  }

  const items = (Array.isArray(data) ? data : []).map((row) =>
    mapSupabaseUserRow(row as Record<string, unknown>),
  );

  return {
    items,
    total: typeof count === "number" ? count : items.length,
    fromSupabase: true as const,
  };
}
