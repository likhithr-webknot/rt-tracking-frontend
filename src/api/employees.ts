import type { ApiOptions } from "../types/api-options";
import { formatEmployeeBandCode, formatEmployeeDesignation } from "./band-stream-directory";
import type { PromotionBandType } from "../utils/careerPromotion";
import { getAuthHeader } from "./auth";
import { isSuperAdminEmployee } from "../utils/portalAccess";
import { formatPortalRoleLabel, resolvePortalRoleLabel } from "../utils/portalRole";
import { todayWebtrakDate, toWebtrakDate } from "../utils/webtrakDate";
import {
  buildApiUrl,
  ensureCsrfCookie,
  parseResponse,
  requestWithFallbacks,
  toHttpError,
  withCsrfHeaders,
} from "./http";
import { fetchUser } from "./user";
import {
  buildEmployeeRosterUrl,
  employeeRosterFetchCredentials,
  getEmployeeRosterAuthHeaders,
  buildWebtrakUrl,
  getWebtrakAuthHeaders,
  resolveWebtrakProfilePhotoUrl,
  toWebtrakPortalRoleToken,
  webtrakFetchCredentials,
} from "./webtrak";
import { loadTeamListCache, saveTeamListCache } from "../utils/teamListCache";
import { fetchSupabaseEmployeeRoster, shouldPreferSupabaseRoster } from "./supabase-roster";

function employeeRoleStats(users: unknown[]) {
  let managerCount = 0;
  let adminCount = 0;
  let employeeCount = 0;
  for (const u of users) {
    const bucket = resolveRoleStatsBucket(u);
    if (bucket === "admin") adminCount += 1;
    else if (bucket === "manager") managerCount += 1;
    else employeeCount += 1;
  }
  return {
    managerCount,
    adminCount,
    employeeCount,
    bandCount: new Set(
      users
        .map((u) =>
          String((u as { band?: string; level?: string })?.band ?? (u as { level?: string })?.level ?? "").trim(),
        )
        .filter(Boolean),
    ).size,
  };
}

export function normalizeEmployees(data) {
  const root = data && typeof data === "object" ? data : {};
  const nested = root?.data && typeof root.data === "object" ? root.data : null;
  const arr =
    (Array.isArray(data) && data) ||
    (Array.isArray(root?.data) && root.data) ||
    (Array.isArray(root?.employees) && root.employees) ||
    (Array.isArray(root?.reportees) && root.reportees) ||
    (Array.isArray(root?.items) && root.items) ||
    (Array.isArray(root?.results) && root.results) ||
    (Array.isArray(root?.content) && root.content) ||
    (Array.isArray(nested?.employees) && nested.employees) ||
    (Array.isArray(nested?.reportees) && nested.reportees) ||
    (Array.isArray(nested?.items) && nested.items) ||
    (Array.isArray(nested?.results) && nested.results) ||
    (Array.isArray(nested?.content) && nested.content) ||
    [];

  /** Derive a display name from an email address (e.g. "alice.johnson@x.com" → "Alice Johnson") */
  function nameFromEmail(email) {
    const raw = String(email ?? "").trim();
    if (!raw || !raw.includes("@")) return "";
    const local = raw.split("@")[0];
    return local
      .replace(/[._+-]+/g, " ")
      .replace(/\d+/g, "")
      .trim()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }

  return arr.map((e, i) => {
    const toNumber = (v) => {
      const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
      return Number.isFinite(n) ? n : null;
    };

    const submissionAbility = toNumber(
      e.submissionAbility ??
      e.abilityScore ??
      e.avgScore ??
      e.averageScore ??
      e.performanceScore ??
      e.ability ??
      e.score
    );
    const abilityFromRatings = toNumber(
      e.abilityScoreFromRatings ?? e.abilityFromRatings ?? e.managerAbility ?? e.managerScore
    );

    const rawName = String(
      e.employeeName ?? e.employee_name ?? e.name ?? e.fullName ?? e.full_name ?? e.displayName ?? e.display_name ?? ""
    ).trim();

    const empId = String(e.empId ?? e.emp_id ?? e.employeeId ?? e.employee_id ?? "").trim();
    const dbId = String(e.id ?? e.userId ?? e.user_id ?? "").trim();
    const primaryId = empId || dbId || `EMP_${i}`;
    const userIdRaw = String(e.userId ?? e.user_id ?? e.appUserId ?? e.accountId ?? "").trim();

    const rawDesignation = String(e.designation ?? e.title ?? e.jobTitle ?? "").trim();
    const rawRoleField = String(e.role ?? "").trim();
    const portalRolesList = Array.isArray(e.portal_roles)
      ? e.portal_roles
      : Array.isArray(e.portalRoles)
        ? e.portalRoles
        : [];
    const portalRoleFromList = pickPrimaryPortalRoleToken(portalRolesList);
    const portalRole =
      resolvePortalRoleLabel(
        e.empRole,
        e.portalRole,
        portalRoleFromList,
        formatPortalRoleLabel(rawRoleField) ? rawRoleField : null,
        e.userRole,
      ) || "Employee";
    const jobTitle =
      rawDesignation ||
      (rawRoleField && !formatPortalRoleLabel(rawRoleField) ? rawRoleField : "");

    const profilePhotoRaw =
      e.profilePhoto ?? e.profile_photo ?? e.photoUrl ?? e.photo_url ?? e.picture ?? e.avatarUrl ?? "";
    const profilePhoto = resolveWebtrakProfilePhotoUrl(profilePhotoRaw);
    const isOnline = Boolean(e.isOnline ?? e.is_online ?? e.online ?? false);
    const lastSeenAt = e.lastSeenAt ?? e.last_seen_at ?? null;

    return {
      id: primaryId,
      /** Webtrak path key for PUT/DELETE — always the HR empId when the API provides it. */
      empId: empId || primaryId,
      /** Numeric auth row id when exposed separately from empId. */
      userId: userIdRaw && userIdRaw !== primaryId ? userIdRaw : dbId && dbId !== primaryId ? dbId : "",
      name: rawName || nameFromEmail(e.email ?? e.employeeEmail ?? e.mail) || "Unknown",
      email: String(e.email ?? e.employeeEmail ?? e.mail ?? ""),
      role: portalRole,
      empRole: portalRole,
      userType: String(e.userType ?? e.user_type ?? e.type ?? "").trim(),
      workMode: String(e.workMode ?? e.work_mode ?? "").trim(),
      phoneNumber: String(e.phoneNumber ?? e.phone_number ?? e.phone ?? "").trim(),
      profilePhoto,
      picture: profilePhoto,
      isOnline,
      lastSeenAt: lastSeenAt ? String(lastSeenAt) : null,
      designation:
        formatEmployeeDesignation(jobTitle, e.band ?? e.level ?? "") ||
        jobTitle,
      band: formatEmployeeBandCode(e.band ?? e.level ?? "") || String(e.band ?? e.level ?? "B4").trim() || "B4",
      stream: String(e.department ?? e.stream ?? e.context ?? ""),
      project: String(e.project ?? e.projectName ?? e.account ?? e.client ?? ""),
      managerId: String(e.managerId ?? e.manager_id ?? e.reportingManagerId ?? e.managerEmpId ?? ""),
      createdAt: e.createdAt ? String(e.createdAt) : e.onboardedDate ? String(e.onboardedDate) : e.onboarded_date ? String(e.onboarded_date) : null,
      updatedAt: e.updatedAt ? String(e.updatedAt) : null,
      lastPromotionDate: e.lastPromotionDate ?? e.last_promotion_date ?? null,
      status: String(e.userStatus ?? e.status ?? e.onboardingStatus ?? e.onboarding_status ?? "").trim(),
      submitted: Boolean(e.submitted ?? e.hasSubmitted ?? false),
      recognitions: Number(e.recognitions ?? e.recognitionCount ?? 0) || 0,
      certifications: Array.isArray(e.certifications) ? e.certifications : [],
      submissionAbility,
      abilityScore: submissionAbility ?? abilityFromRatings,
      avgScore: submissionAbility ?? abilityFromRatings,
      abilityScoreFromRatings: abilityFromRatings,
      abilityFromRatings,
    };
  }).filter((e) => {
    const st = String(e.status || "").trim().toLowerCase();
    if (!st) return true;
    // Only omit clearly purged rows. Inactive/disabled users often stay in the DB and still
    // block duplicate email on create — hiding them made them "invisible" in this directory.
    return !["deleted", "removed", "purged"].includes(st);
  });
}

/**
 * Map arbitrary backend role strings onto directory stat buckets.
 * Aligns with {@link normalizeEmployees} (uses empRole / role / userRole) and avoids under-counting
 * when the API sends ROLE_* enums, title case, or non-standard labels.
 */
export function resolveRoleStatsBucket(empLike) {
  const portalRoles = Array.isArray(empLike?.portal_roles)
    ? empLike.portal_roles
    : Array.isArray(empLike?.portalRoles)
      ? empLike.portalRoles
      : [];
  const raw = String(
    empLike?.empRole ??
      empLike?.portalRole ??
      empLike?.userRole ??
      pickPrimaryPortalRoleToken(portalRoles) ??
      empLike?.role ??
      "",
  ).trim();
  const key = raw.toLowerCase().replace(/^role_/, "");
  if (key === "admin" || key.includes("admin") || key === "hr" || key.includes("human resource")) return "admin";
  if (key === "manager" || key.includes("manager")) return "manager";
  return "employee";
}

/** When onboard returns multiple portal roles, pick one for directory display. */
function pickPrimaryPortalRoleToken(roles: unknown) {
  const list = (Array.isArray(roles) ? roles : [])
    .map((r) => String(r ?? "").trim())
    .filter(Boolean);
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  // Prefer a singular portal identity. Alphabetical ROLE_ADMIN+ROLE_HR previously
  // always showed Super Admin even after set-portal-role assigned HR.
  const priority = [
    "ROLE_HR",
    "HR",
    "ROLE_FINANCE",
    "FINANCE",
    "ROLE_MANAGER",
    "MANAGER",
    "ROLE_AM",
    "AM",
    "ROLE_DM",
    "DM",
    "ROLE_ADMIN",
    "ADMIN",
    "ROLE_EMPLOYEE",
    "EMPLOYEE",
  ];
  const upper = new Map(list.map((r) => [r.toUpperCase(), r]));
  for (const token of priority) {
    const hit = upper.get(token);
    if (hit) return hit;
  }
  return list[0];
}

function resolvePagedListTotal(raw, pageData, fallbackLen) {
  const tryNum = (v) => {
    const n = typeof v === "number" ? v : Number.parseInt(String(v ?? "").trim(), 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const sources = [
    pageData,
    raw,
    pageData?.page,
    raw?.page,
    typeof pageData?.data === "object" && pageData?.data,
    typeof raw?.data === "object" && raw?.data,
  ].filter((x) => x && typeof x === "object" && !Array.isArray(x));
  const keys = ["totalElements", "totalElement", "total", "totalCount", "totalRecords"];
  for (const obj of sources) {
    for (const k of keys) {
      const n = tryNum(obj[k]);
      if (n != null) return n;
    }
  }
  return fallbackLen;
}

function extractUsersArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const root = raw;
  const nested = root?.data && typeof root.data === "object" ? root.data : null;
  const candidates = [
    root?.items,
    root?.managers,
    root?.managerList,
    root?.users,
    root?.employees,
    root?.results,
    root?.content,
    root?.data,
    nested?.items,
    nested?.managers,
    nested?.managerList,
    nested?.users,
    nested?.employees,
    nested?.results,
    nested?.content,
    nested?.data,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  return [];
}

/** Employee roster — `GET /api/v1/user/onboard` on Webtrak (webknot-dev.in by default). */
function buildEmployeeListCandidates(page, size, { searchQ = "", typeQ = "", statusQ = "" } = {}) {
  const onboardParams = new URLSearchParams();
  onboardParams.set("page", String(page));
  onboardParams.set("size", String(size));
  if (searchQ) onboardParams.set("search", searchQ);
  if (typeQ) onboardParams.set("type", typeQ);
  if (statusQ) onboardParams.set("onboardingStatus", statusQ);

  return [`/api/v1/user/onboard?${onboardParams.toString()}`];
}

/** GET employee roster via remote Webtrak (`/__webtrak` → webknot-dev.in). */
async function fetchEmployeeListPage(
  path,
  { signal, headers, fallbackStatuses = [404, 405] }: ApiOptions & {
    headers?: HeadersInit;
    fallbackStatuses?: number[];
  } = {},
) {
  const res = await fetch(buildEmployeeRosterUrl(path), {
    method: "GET",
    signal,
    credentials: employeeRosterFetchCredentials(),
    headers,
  });
  if (res.ok) return parseResponse(res, {});
  const err = await toHttpError(res, { method: "GET", path });
  if (fallbackStatuses.includes(res.status)) return null;
  throw err;
}

export async function fetchEmployees({
  limit = null,
  cursor = null,
  signal,
  search = "",
  type = "",
  onboardingStatus = "",
} = {} as ApiOptions & {
  search?: string;
  type?: string;
  onboardingStatus?: string;
}) {
  const fallbackLimit = 500;
  const parsedLimit = limit != null ? Number.parseInt(String(limit), 10) : fallbackLimit;
  const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : fallbackLimit;
  const parsedOffset = cursor != null ? Number.parseInt(String(cursor), 10) : 0;
  const safeOffset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
  const startPage = Math.floor(safeOffset / Math.min(safeLimit, 500));
  const searchQ = String(search ?? "").trim();
  const typeQ = String(type ?? "").trim();
  const statusQ = String(onboardingStatus ?? "").trim();

  const onboardBase = buildEmployeeRosterUrl("/api/v1/user/onboard");
  const onboardHeaders = getEmployeeRosterAuthHeaders();
  const pageSize = Math.min(safeLimit, 500);
  const collected = [];
  let reportedTotal = null;
  let usedOnboard = false;
  let onboardFailed = false;
  let onboardError: Error | null = null;

  for (let page = startPage; page < startPage + 8; page += 1) {
    const remaining = safeLimit - collected.length;
    if (remaining <= 0) break;
    const size = Math.min(pageSize, remaining);
    try {
      const candidates = buildEmployeeListCandidates(page, size, { searchQ, typeQ, statusQ });
      let raw = null;
      let lastListErr = null;
      for (const candidatePath of candidates) {
        try {
          raw = await fetchEmployeeListPage(candidatePath, {
            signal,
            headers: onboardHeaders,
            fallbackStatuses: [404, 405],
          });
          if (raw) break;
        } catch (err) {
          if (err?.name === "AbortError") throw err;
          lastListErr = err instanceof Error ? err : new Error(String(err?.message || err || "Employee list failed"));
          if ([401, 403].includes(Number((lastListErr as { status?: number })?.status))) {
            throw lastListErr;
          }
        }
      }
      if (!raw) {
        throw (
          lastListErr ||
          new Error("Employee list endpoint not found.")
        );
      }
      usedOnboard = true;
      const batch = extractUsersArray(raw);
      const root = raw && typeof raw === "object" ? raw : {};
      const data = root?.data && typeof root.data === "object" ? root.data : root;
      const total = resolvePagedListTotal(raw, data, null);
      if (total != null) reportedTotal = total;
      if (!batch.length) break;
      collected.push(...batch);
      if (batch.length < size) break;
      if (reportedTotal != null && safeOffset + collected.length >= reportedTotal) break;
      if (collected.length >= safeLimit) break;
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      if (collected.length === 0) {
        onboardFailed = true;
        onboardError = err instanceof Error ? err : new Error(String(err?.message || err || "Onboard failed"));
      }
      break;
    }
  }

  const roleStats = employeeRoleStats;

  // List fetch failed with no rows: optional Supabase roster, then local cache (never mask 401/403).
  if ((onboardFailed || !usedOnboard) && collected.length === 0) {
    const authBlocked = [401, 403].includes(Number((onboardError as { status?: number })?.status));

    if (!authBlocked && shouldPreferSupabaseRoster()) {
      try {
        const supabasePage = await fetchSupabaseEmployeeRoster({
          search: searchQ,
          limit: safeLimit,
          offset: safeOffset,
          signal,
        });
        if (supabasePage?.items?.length) {
          let items = supabasePage.items as unknown[];
          if (typeQ) {
            items = items.filter(
              (u) =>
                String((u as { type?: string; userType?: string })?.type ?? (u as { userType?: string })?.userType ?? "")
                  .trim()
                  .toUpperCase() === typeQ.toUpperCase(),
            );
          }
          if (statusQ) {
            items = items.filter((u) => {
              const onboarding = String((u as { onboardingStatus?: string })?.onboardingStatus ?? "").trim().toUpperCase();
              const status = String((u as { status?: string })?.status ?? "").trim().toUpperCase();
              if (statusQ.toUpperCase() === "ONBOARDED") {
                return onboarding === "ONBOARDED" || status === "ACTIVE";
              }
              if (statusQ.toUpperCase() === "PENDING") {
                return onboarding === "PENDING" || status === "ONBOARDING";
              }
              return true;
            });
          }
          const total = supabasePage.total ?? items.length;
          const stats = roleStats(items);
          return {
            items,
            nextCursor: safeOffset + items.length < total ? String(safeOffset + items.length) : null,
            total,
            ...stats,
            fromCache: false,
            fromSupabase: true,
          };
        }
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") throw err;
        console.warn("[employees] Supabase roster fallback failed:", err);
      }
    }

    if (authBlocked) {
      throw onboardError;
    }

    const cached = await loadTeamListCache();
    if (cached?.items?.length) {
      const allUsers = cached.items as unknown[];
      const total = cached.total != null ? cached.total : allUsers.length;
      const pageItems =
        allUsers.length > safeLimit
          ? allUsers.slice(safeOffset, safeOffset + safeLimit)
          : allUsers.slice(safeOffset);
      const nextCursor =
        safeOffset + pageItems.length < total ? String(safeOffset + pageItems.length) : null;
      const stats = roleStats(allUsers);
      return {
        items: pageItems,
        nextCursor,
        total,
        managerCount: cached.managerCount ?? stats.managerCount,
        adminCount: cached.adminCount ?? stats.adminCount,
        employeeCount: cached.employeeCount ?? stats.employeeCount,
        bandCount: cached.bandCount ?? stats.bandCount,
        fromCache: true,
        cachedAt: cached.fetchedAt,
      };
    }
    const detail = onboardError?.message
      ? String(onboardError.message).trim()
      : "Webtrak onboard failed and no cached roster.";
    const err = new Error(
      detail.startsWith("Team List unavailable")
        ? detail
        : `Team List unavailable: ${detail}`,
    ) as Error & { status?: number; path?: string; method?: string };
    err.status = typeof (onboardError as { status?: number })?.status === "number"
      ? (onboardError as { status?: number }).status
      : 503;
    err.path = onboardBase;
    err.method = "GET";
    throw err;
  }

  const allUsers = collected;
  const total = reportedTotal != null ? reportedTotal : safeOffset + allUsers.length;
  const items = allUsers.length > safeLimit ? allUsers.slice(0, safeLimit) : allUsers;
  const nextCursor = safeOffset + items.length < total ? String(safeOffset + items.length) : null;
  const stats = roleStats(allUsers);

  // Persist successful external fetch for offline / outage fallback.
  if (!searchQ && !typeQ && !statusQ && safeOffset === 0) {
    void saveTeamListCache({
      fetchedAt: new Date().toISOString(),
      items: allUsers,
      total,
      ...stats,
    });
  }

  return {
    items,
    nextCursor,
    total,
    ...stats,
    fromCache: false,
  };
}

/**
 * Webtrak user create body for POST /api/v1/employees (UserCreateDTO).
 * Requires numeric `bandId` from the band directory.
 */
export function toWebtrakUserCreatePayload(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const name = String(p.employeeName ?? p.name ?? "").trim();
  const email = String(p.email ?? "").trim().toLowerCase();
  const portalRole = String(p.empRole ?? p.portalRole ?? p.role ?? "Employee").trim() || "Employee";
  const department = String(p.stream ?? p.department ?? "").trim() || null;
  const designation = String(p.designation ?? p.jobTitle ?? "").trim();
  const userType = (String(p.userType ?? "FULLTIME").trim().toUpperCase() || "FULLTIME");
  const workMode = (String(p.workMode ?? "HYBRID").trim().toUpperCase() || "HYBRID");
  const startDate =
    toWebtrakDate(String(p.startDate ?? "").trim()) || todayWebtrakDate();

  const bandIdRaw = p.bandId ?? p.band_id;
  let bandId = null;
  if (bandIdRaw != null && /^\d+$/.test(String(bandIdRaw))) {
    bandId = Number.parseInt(String(bandIdRaw), 10);
  }

  const body: Record<string, unknown> = {
    email,
    name,
    role: designation,
    portalRole,
    department,
    bandId,
    userType,
    workMode,
    startDate,
    assetRequired: false,
    salaryDetails: { description: designation },
  };

  if (userType === "FULLTIME") {
    body.salaryDetails = {
      base: 1,
      variable: 1,
      payoutCycle: "monthly",
      description: designation,
    };
  } else if (userType === "INTERN") {
    const duration = Number.parseInt(String(p.internshipDuration ?? 3), 10);
    body.internshipDuration = Number.isFinite(duration) && duration > 0 ? duration : 3;
    body.salaryDetails = { stipend: 0, description: designation };
  } else if (userType === "FREELANCER") {
    body.salaryDetails = {
      payPerHour: 1,
      projectDuration: String(p.projectDuration ?? "3 months").trim() || "3 months",
      description: designation,
    };
  }

  return body;
}

/**
 * Resolve a band code (e.g. B4L) from API display text or directory option rows.
 */
export function resolveBandCodeFromDisplay(
  raw,
  options = [] as { value?: string; label?: string }[],
) {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  const opts = Array.isArray(options) ? options : [];
  const exact = opts.find((o) => o?.value === text || o?.label === text);
  if (exact?.value) return String(exact.value).trim();
  const lower = text.toLowerCase();
  const byPrefix = opts.find((o) => {
    const v = String(o?.value ?? "").trim();
    const l = String(o?.label ?? "").trim();
    if (!v) return false;
    return (
      lower === v.toLowerCase() ||
      lower.startsWith(`${v.toLowerCase()} `) ||
      lower.startsWith(`${v.toLowerCase()}—`) ||
      lower.startsWith(`${v.toLowerCase()}-`) ||
      (l && lower === l.toLowerCase())
    );
  });
  if (byPrefix?.value) return String(byPrefix.value).trim();
  const token = text.split(/[\s—–-]+/)[0]?.trim();
  return token || text;
}

/**
 * Webtrak HR profile update body for PUT /api/v1/employees/{empId} (UserProfileHrUpdateDto).
 */
export function toWebtrakUserProfileUpdatePayload(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const name = String(p.name ?? p.employeeName ?? "").trim();
  const email = String(p.email ?? "").trim().toLowerCase();
  const portalRole = String(p.portalRole ?? p.empRole ?? "").trim();
  const designation = String(p.designation ?? p.jobTitle ?? "").trim();
  const department = String(p.department ?? p.stream ?? "").trim();
  const phoneNumber = String(p.phoneNumber ?? p.phone ?? "").trim();

  const body: Record<string, unknown> = {};
  if (name) body.name = name;
  if (email) body.email = email;
  if (portalRole) body.portalRole = portalRole;
  if (designation) body.designation = designation;
  // Omit empty department — backend rejects blank values and validates against the directory.
  if (department) body.department = department;
  if (phoneNumber) body.phoneNumber = phoneNumber;

  const bandIdRaw = p.bandId ?? p.band_id;
  if (bandIdRaw != null && /^\d+$/.test(String(bandIdRaw))) {
    body.band = { bandId: Number.parseInt(String(bandIdRaw), 10) };
  }

  const status = String(p.userStatus ?? p.status ?? "").trim().toUpperCase();
  if (status === "INACTIVE" || status === "ACTIVE" || status === "ONBOARDING") {
    body.userStatus = status;
  }

  const userType = String(p.userType ?? "").trim().toUpperCase();
  if (userType === "FULLTIME" || userType === "INTERN" || userType === "FREELANCER") {
    body.userType = userType;
  }

  const workMode = String(p.workMode ?? "").trim().toUpperCase();
  if (workMode === "REMOTE" || workMode === "HYBRID" || workMode === "OFFICE") {
    body.workMode = workMode;
  }

  return body;
}

function unwrapUserLookup(raw) {
  if (!raw || typeof raw !== "object") return null;
  const data = raw.data && typeof raw.data === "object" ? raw.data : raw;
  if (data.user && typeof data.user === "object") return data.user;
  if (data.employee && typeof data.employee === "object") return data.employee;
  return data;
}

/**
 * Resolve the empId string required by PUT /api/v1/employees/{empId}.
 * Falls back to email lookup when the directory row only has a numeric list id.
 */
export async function resolveEmployeeEmpId(
  row,
  { signal } = {} as ApiOptions,
) {
  const direct = String(row?.empId ?? row?.id ?? "").trim();
  if (direct && !/^EMP_\d+$/i.test(direct)) return direct;

  const email = String(row?.email ?? "").trim().toLowerCase();
  if (!email) {
    throw new Error("Cannot resolve employee id without empId or email.");
  }

  const raw = await fetchUser({ email, signal });
  const user = unwrapUserLookup(raw);
  const resolved = String(user?.empId ?? user?.employeeId ?? user?.emp_id ?? "").trim();
  if (resolved) return resolved;

  throw new Error(`Could not resolve empId for ${email}. Refresh the directory and try again.`);
}

/** @deprecated Use {@link toWebtrakUserCreatePayload}. */
export function toAddEmployeePayload(payload) {
  return toWebtrakUserCreatePayload(payload);
}

/** @deprecated Use {@link toWebtrakUserCreatePayload}. */
export const toLegacyAddEmployeePayload = toWebtrakUserCreatePayload;

/** @deprecated Use {@link toWebtrakUserCreatePayload}. */
export const toV1AddEmployeePayload = toWebtrakUserCreatePayload;

function isHttpMethodNotSupportedMessage(text) {
  const m = String(text ?? "").toLowerCase();
  return (
    m.includes("httprequestmethodnotsupported") ||
    m.includes("method not supported") ||
    m.includes("request method") && m.includes("not supported")
  );
}

function isCreateRouteRetryable(status, message) {
  if ([404, 405].includes(status)) return true;
  if (isHttpMethodNotSupportedMessage(message)) return true;
  return false;
}

async function postEmployeeCreate(path, body, { signal, headers }) {
  const headerBase =
    headers && typeof headers === "object"
      ? headers
      : withCsrfHeaders({ "Content-Type": "application/json" });

  const doFetch = () =>
    fetch(buildApiUrl(path), {
      method: "POST",
      signal,
      credentials: "include",
      headers: withCsrfHeaders(headerBase),
      body,
    });

  let res = await doFetch();
  if (res.status === 403) {
    await ensureCsrfCookie({ signal, headers: headerBase, forceRefresh: true }).catch(() => {});
    res = await doFetch();
  }

  if (res.ok) {
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const json = await res.json().catch(() => ({}));
      const envelopeMsg = String(json?.message ?? json?.error ?? "");
      if (isHttpMethodNotSupportedMessage(envelopeMsg)) {
        const err = new Error(envelopeMsg || "HTTP method not supported for this path.");
        err.status = res.status;
        err.path = path;
        return { err, retryable: true };
      }
      if (json?.success === false || (json?.error != null && String(json.error).trim())) {
        const err = new Error(
          String(json?.message || json?.error || "Employee create failed.").trim() ||
            "Employee create failed.",
        );
        err.status = res.status;
        err.path = path;
        return { err, retryable: false };
      }
      return json;
    }
    return { success: true };
  }

  const err = await toHttpError(res, { method: "POST", path });
  err.path = path;
  err.status = res.status;
  return { err, retryable: isCreateRouteRetryable(res.status, err.message) };
}

export async function addEmployee(payload, { signal } = {} as ApiOptions) {
  const auth = getAuthHeader();
  const headerBase = {
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  };
  await ensureCsrfCookie({ signal, headers: headerBase }).catch(() => {});

  const headers = withCsrfHeaders(headerBase);
  const body = JSON.stringify(toWebtrakUserCreatePayload(payload));

  const attempts = [
    { path: "/api/v1/employees", body },
    { path: "/api/v1/user/onboard", body },
    { path: "/api/v1/users", body },
  ];

  let lastErr = null;
  for (const { path, body: requestBody } of attempts) {
    const result = await postEmployeeCreate(path, requestBody, { signal, headers });
    if (result && typeof result === "object" && !("err" in result)) return result;
    if (result?.retryable) {
      lastErr = result.err;
      continue;
    }
    if (result?.err) throw result.err;
  }

  const err = lastErr || new Error("Employee create endpoint not found.");
  if (lastErr?.path && !String(err.message).includes(lastErr.path)) {
    err.message = `${err.message} (last: POST ${lastErr.path})`;
  }
  throw err;
}

/** @deprecated Use {@link addEmployee} — manager assignment is not required at create time. */
export async function addEmployeeWithManager(payload, options = {} as ApiOptions) {
  return addEmployee(payload, options);
}
/**
 * POST /api/v1/roles/set-portal-role via /__webtrak (same-origin proxy).
 * Body matches webtrak1.0 AssignRoleRequest: target_email + role.
 */
export async function setPortalRole(
  {
    email,
    role,
  }: {
    email?: string | null;
    role?: string | null;
  },
  { signal } = {} as ApiOptions,
) {
  const targetEmail = String(email ?? "").trim().toLowerCase();
  if (!targetEmail || !targetEmail.includes("@")) {
    throw new Error("A valid employee email is required to set the portal role.");
  }
  const roleToken = toWebtrakPortalRoleToken(role);
  const body = {
    target_email: targetEmail,
    role: roleToken,
  };

  const res = await fetch(buildWebtrakUrl("/api/v1/roles/set-portal-role"), {
    method: "POST",
    signal,
    credentials: webtrakFetchCredentials(),
    headers: getWebtrakAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw await toHttpError(res, {
      method: "POST",
      path: "/api/v1/roles/set-portal-role",
    });
  }

  return parseResponse(res, {});
}

export async function updateEmployee(employeeId, payload, { signal } = {} as ApiOptions) {
  const empId = String(employeeId ?? "").trim();
  if (!empId || /^EMP_\d+$/i.test(empId)) {
    throw new Error("A valid employee id (empId) is required to update this profile.");
  }
  const safeId = encodeURIComponent(empId);
  const auth = getAuthHeader();
  const body = JSON.stringify(
    toWebtrakUserProfileUpdatePayload(payload && typeof payload === "object" ? payload : {}),
  );

  const endpoints = [
    `/api/v1/employees/${safeId}`,
    `/api/v1/employee-profile/${safeId}`,
  ];

  const headerBase = withCsrfHeaders({
    "Content-Type": "application/json",
    ...(auth ? { Authorization: auth } : {}),
  });

  for (const path of endpoints) {
    const doPut = async () =>
      fetch(buildApiUrl(path), {
        method: "PUT",
        signal,
        credentials: "include",
        headers: headerBase,
        body,
      });

    let res = await doPut();
    if (res.status === 403) {
      await ensureCsrfCookie({ signal, headers: headerBase, forceRefresh: true }).catch(() => {});
      res = await doPut();
    }
    if (res.ok) return parseResponse(res, {});
    const err = await toHttpError(res);
    if (res.status === 404 || res.status === 405) continue;
    throw err;
  }

  throw new Error("Employee edit endpoint not found.");
}

/** Mark an employee inactive (legacy soft remove). */
export async function deactivateEmployee(employeeId, { signal } = {} as ApiOptions) {
  return updateEmployee(employeeId, { userStatus: "INACTIVE" }, { signal });
}

export async function deleteEmployee(
  employeeId,
  {
    signal,
    hardDelete = true,
    alternateIds = [],
  } = {} as ApiOptions & { hardDelete?: boolean; alternateIds?: (string | number | null | undefined)[] },
) {
  const auth = getAuthHeader();
  const headerBase = auth ? { Authorization: auth } : undefined;

  await ensureCsrfCookie({ signal, headers: headerBase }).catch(() => {});

  const rawIds = [employeeId, ...(Array.isArray(alternateIds) ? alternateIds : [])]
    .map((v) => String(v ?? "").trim())
    .filter((v) => Boolean(v) && !/^EMP_\d+$/i.test(v));
  const ids = [...new Set(rawIds)];

  if (!ids.length) {
    throw new Error(
      "Cannot remove: this row has no valid empId. Refresh the directory and try again.",
    );
  }

  if (!hardDelete) {
    let lastErr: Error | null = null;
    for (const id of ids) {
      try {
        return await deactivateEmployee(id, { signal });
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
      }
    }
    throw lastErr || new Error("Could not deactivate employee.");
  }

  const pathsFor = (id) => {
    const enc = encodeURIComponent(id);
    return [`/api/v1/employees/${enc}`, `/api/v1/employee-profile/${enc}`];
  };

  let lastErr: Error | null = null;

  for (const id of ids) {
    for (const path of pathsFor(id)) {
      const doFetch = () =>
        fetch(buildApiUrl(path), {
          method: "DELETE",
          signal,
          credentials: "include",
          headers: withCsrfHeaders(headerBase),
        });

      let res = await doFetch();
      if (res.status === 403) {
        await ensureCsrfCookie({ signal, headers: headerBase, forceRefresh: true }).catch(() => {});
        res = await doFetch();
      }
      if (res.ok) return parseResponse(res, true);
      const err = await toHttpError(res);
      if ([404, 405, 400].includes(res.status)) {
        lastErr = err;
        continue;
      }
      lastErr = err;
    }
  }

  throw lastErr || new Error("Employee delete endpoint not found.");
}

export function normalizeManagers(data) {
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : [];
  const toRoleKey = (value) => String(value ?? "").trim().toLowerCase().replace(/^role_/, "");
  return arr.map((m, i) => {
    const rawMgrName = String(
      m.employeeName ?? m.employee_name ?? m.name ?? m.fullName ?? m.full_name ?? m.displayName ?? m.display_name ?? ""
    ).trim();
    const employeeId = String(m.employeeId ?? m.id ?? m.empId ?? `MGR_${i}`);
    const roleKey = toRoleKey(m.empRole ?? m.role ?? m.userRole ?? "manager");
    const role = roleKey === "admin" ? "Admin" : roleKey === "employee" ? "Employee" : "Manager";
    return {
      id: employeeId,
      employeeId,
      name: rawMgrName || "Unknown",
      email: String(m.email ?? m.employeeEmail ?? m.mail ?? ""),
      role,
      designation: String(m.designation ?? m.title ?? m.jobTitle ?? ""),
      band: String(m.band ?? m.level ?? ""),
    };
  });
}
export function normalizeSuperAdminReviewers(data) {
  return normalizeEmployees(data)
    .filter((emp) => isSuperAdminEmployee(emp))
    .map((emp) => ({
      id: String(emp?.id ?? emp?.empId ?? emp?.employeeId ?? "").trim(),
      name: String(emp?.name ?? "").trim() || String(emp?.email ?? "").trim() || "Super Admin",
      email: String(emp?.email ?? "").trim(),
    }))
    .filter((row) => Boolean(row.id));
}

/** Super Admin portal accounts eligible to review manager/admin self-reviews. */
export async function fetchSuperAdminReviewers({ signal } = {} as ApiOptions) {
  const auth = getAuthHeader();
  try {
    const res = await fetch(buildApiUrl("/api/v1/portal/super-admin-reviewers"), {
      signal,
      credentials: "include",
      headers: auth ? { Authorization: auth } : undefined,
    });
    if (res.ok) {
      const raw = await parseResponse(res, {});
      const rows = extractUsersArray(raw?.data ?? raw);
      if (rows.length) return normalizeSuperAdminReviewers(rows);
    }
  } catch (err) {
    if (err?.name === "AbortError") throw err;
  }

  const rows = [];
  let cursor = null;
  for (let page = 0; page < 200; page += 1) {
    const data = await fetchEmployees({ cursor, limit: 100, signal });
    const batch = Array.isArray(data?.items) ? data.items : [];
    if (batch.length) rows.push(...batch);
    if (!data?.nextCursor) break;
    cursor = data.nextCursor;
  }
  return normalizeSuperAdminReviewers(rows);
}

export async function fetchManagers({ signal } = {} as ApiOptions) {
  const auth = getAuthHeader();
  const endpoints = [
    "/employees/managers/registered",
    "/api/v1/employees/managers/registered",
    "/employees/managers",
    "/api/v1/employees/managers",
    "/api/v1/manager/list",
    "/api/v1/manager",
    "/api/v1/",
  ];

  const toRoleKey = (value) => String(value ?? "").trim().toLowerCase().replace(/^role_/, "");
  for (const endpoint of endpoints) {
    const raw = await requestWithFallbacks([endpoint], {
      signal,
      headers: auth ? { Authorization: auth } : undefined,
      fallbackStatuses: [400, 403, 404, 405],
      notFoundMessage: "Managers endpoint not found.",
    }).catch((err) => {
      if (err?.name === "AbortError" || err?.status === 401) throw err;
      return null;
    });
    if (!raw) continue;
    const rows = extractUsersArray(raw);
    if (!Array.isArray(rows)) return [];

    // Manager endpoints are expected to already be manager-only.
    const endpointLooksManagerSpecific = endpoint.includes("managers") || endpoint.includes("/manager");
    if (endpointLooksManagerSpecific) return rows;

    const managerOnly = rows.filter((row) => {
      const roleKey = toRoleKey(row?.empRole ?? row?.role ?? row?.userRole ?? "");
      return roleKey === "manager";
    });
    if (managerOnly.length > 0) return managerOnly;
  }
  return [];
}
export async function fetchManagerReportees(managerId, { signal } = {} as ApiOptions) {
  void managerId;
  const auth = getAuthHeader();
  const path = "/api/v1/manager-projects-with-roles";
  const res = await fetch(buildApiUrl(path), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res, { method: "GET", path });
  return parseResponse(res, {});
}

/**
 * HR promotion: POST /api/v1/user/promote?empId=…&bandType=TECH|NON_TECH|BOTH
 * (webtrak UserServiceController.promoteUser / UserService.promoteUser).
 */
export async function fetchPromotionEligibility(employeeId, { signal } = {} as ApiOptions) {
  const empId = String(employeeId ?? "").trim();
  if (!empId) throw new Error("Employee id is required.");
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl(`/api/v1/employees/${encodeURIComponent(empId)}/promotion-eligibility`), {
    signal,
    credentials: "include",
    headers: auth ? { Authorization: auth } : undefined,
  });
  if (!res.ok) throw await toHttpError(res);
  const raw = await parseResponse(res, {});
  return raw?.data ?? raw;
}

export async function promoteEmployee(
  employeeId,
  bandType: PromotionBandType = "BOTH",
  { forceOverride = false, signal } = {} as ApiOptions,
) {
  const empId = String(employeeId ?? "").trim();
  if (!empId) throw new Error("Employee id is required.");
  const bt = String(bandType ?? "BOTH").trim().toUpperCase();
  if (bt !== "TECH" && bt !== "NON_TECH" && bt !== "BOTH") {
    throw new Error("bandType must be TECH, NON_TECH, or BOTH.");
  }

  const qs = new URLSearchParams({ empId, bandType: bt });
  if (forceOverride) qs.set("forceOverride", "true");
  const path = `/api/v1/user/promote?${qs.toString()}`;
  const auth = getAuthHeader();
  const res = await fetch(buildApiUrl(path), {
    method: "POST",
    signal,
    credentials: "include",
    headers: withCsrfHeaders(auth ? { Authorization: auth } : undefined),
  });
  if (!res.ok) throw await toHttpError(res, { method: "POST", path: "/api/v1/user/promote" });
  return parseResponse(res, {});
}
