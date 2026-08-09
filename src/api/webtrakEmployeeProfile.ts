// @ts-nocheck
import { parseResponse, toHttpError } from "./http";
import { buildWebtrakUrl, getWebtrakAuthHeaders } from "./webtrak";

function unwrapData(raw) {
  if (!raw || typeof raw !== "object") return {};
  if (raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)) return raw.data;
  return raw;
}

function pick(obj, keys) {
  const row = obj && typeof obj === "object" ? obj : {};
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return undefined;
}

async function webtrakGet(path, { signal } = {}) {
  const res = await fetch(buildWebtrakUrl(path), {
    method: "GET",
    signal,
    credentials: "omit",
    headers: getWebtrakAuthHeaders(),
  });
  if (!res.ok) {
    throw await toHttpError(res, { method: "GET", path });
  }
  return parseResponse(res, {});
}

async function webtrakPut(path, body, { signal } = {}) {
  const res = await fetch(buildWebtrakUrl(path), {
    method: "PUT",
    signal,
    credentials: "omit",
    headers: getWebtrakAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body && typeof body === "object" ? body : {}),
  });
  if (!res.ok) {
    throw await toHttpError(res, { method: "PUT", path });
  }
  return parseResponse(res, {});
}

export function displayOrDash(value) {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => {
        if (item && typeof item === "object") {
          const skill = String(item.skill ?? item.name ?? "").trim();
          if (!skill) return "";
          const selfRating = item.self_rating ?? item.selfRating ?? item.rating ?? item.level;
          const wk = item.webknot_rating ?? item.webknotRating;
          if (wk != null && String(wk).trim() !== "") {
            return `${skill} (Self: ${selfRating}/5, WK: ${wk}/5)`;
          }
          if (selfRating != null && String(selfRating).trim() !== "") {
            return `${skill} (Self: ${selfRating}/5)`;
          }
          return skill;
        }
        return String(item ?? "").trim();
      })
      .filter(Boolean);
    return parts.length ? parts.join(", ") : "—";
  }
  const text = String(value).trim();
  return text || "—";
}

export function formatProfileDate(raw, dateFormat = "DD/MM/YYYY") {
  const text = String(raw ?? "").trim();
  if (!text || text === "—") return "—";
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!iso) return text;
  const [, y, m, d] = iso;
  const fmt = String(dateFormat || "DD/MM/YYYY").toUpperCase();
  if (fmt.includes("MM/DD")) return `${m}/${d}/${y}`;
  if (fmt.includes("YYYY-MM-DD")) return `${y}-${m}-${d}`;
  return `${d}/${m}/${y}`;
}

export function profileFromDirectoryEmployee(employee) {
  const emp = employee && typeof employee === "object" ? employee : {};
  return {
    raw: emp,
    userId: String(emp.userId ?? emp.user_id ?? "").trim(),
    empId: String(emp.empId ?? emp.id ?? "").trim(),
    name: String(emp.name ?? "").trim(),
    email: String(emp.email ?? "").trim().toLowerCase(),
    personalEmail: String(emp.personalEmail ?? emp.personal_email ?? "").trim(),
    phone: String(emp.phoneNumber ?? emp.phone_number ?? emp.phone ?? "").trim(),
    status: String(emp.status ?? emp.userStatus ?? emp.user_status ?? "").trim(),
    designation: String(emp.designation ?? emp.role ?? "").trim(),
    department: String(emp.stream ?? emp.department ?? "").trim(),
    band: String(emp.band ?? emp.bandName ?? emp.band_name ?? "").trim(),
    bandId: emp.bandId ?? emp.band_id ?? null,
    userType: String(emp.userType ?? emp.user_type ?? "").trim(),
    category: String(emp.category ?? "").trim(),
    workMode: String(emp.workMode ?? emp.work_mode ?? "").trim(),
    workLocation: String(emp.workLocation ?? emp.work_location_type ?? "").trim(),
    doj: emp.doj ?? emp.dateOfJoining ?? emp.date_of_joining ?? null,
    reportingManager: String(emp.reportingManager ?? emp.reporting_manager ?? emp.managerName ?? "").trim(),
    primarySkills: Array.isArray(emp.primarySkills) ? emp.primarySkills : [],
    secondarySkills: Array.isArray(emp.secondarySkills) ? emp.secondarySkills : [],
    webknotExperience: String(emp.webknotExperience ?? emp.webknot_experience ?? "").trim(),
    totalExperience: String(emp.totalExperience ?? emp.total_experience ?? emp.yoe ?? "").trim(),
    experienceSummary: String(emp.experience ?? emp.experienceSummary ?? "").trim(),
    gender: String(emp.gender ?? "").trim(),
    maritalStatus: String(emp.maritalStatus ?? emp.marital_status ?? "").trim(),
    localAddress: String(emp.localAddress ?? emp.local_address ?? "").trim(),
    permanentAddress: String(emp.permanentAddress ?? emp.permanent_address ?? "").trim(),
    panOnFile: Boolean(emp.panOnFile ?? emp.pan_card_on_file),
    profilePhoto: emp.profilePhoto ?? emp.profile_photo ?? null,
    resumeShareLink: emp.resumeShareLink ?? emp.resume_share_link ?? null,
    portalRoles: Array.isArray(emp.portalRoles)
      ? emp.portalRoles
      : emp.empRole || emp.portalRole
        ? [emp.empRole || emp.portalRole]
        : [],
    userTypeTransitions: [],
  };
}

export function normalizeWebtrakEmployeeProfile(raw) {
  const data = unwrapData(raw);
  const skills = (keyA, keyB) => {
    const value = pick(data, [keyA, keyB]);
    return Array.isArray(value) ? value : [];
  };
  return {
    raw: data,
    userId: String(pick(data, ["user_id", "userId", "id"]) ?? "").trim(),
    empId: String(pick(data, ["emp_id", "empId", "employee_id"]) ?? "").trim(),
    name: String(pick(data, ["name", "employee_name", "employeeName"]) ?? "").trim(),
    email: String(pick(data, ["email", "work_email", "workEmail"]) ?? "")
      .trim()
      .toLowerCase(),
    personalEmail: String(pick(data, ["personal_email", "personalEmail"]) ?? "").trim(),
    phone: String(pick(data, ["phone_number", "phoneNumber", "phone"]) ?? "").trim(),
    status: String(pick(data, ["user_status", "status", "userStatus"]) ?? "").trim(),
    designation: String(pick(data, ["role", "designation", "designation_name"]) ?? "").trim(),
    department: String(pick(data, ["department", "stream"]) ?? "").trim(),
    band: String(pick(data, ["band_name", "bandName", "band"]) ?? "").trim(),
    bandId: pick(data, ["band_id", "bandId"]) ?? null,
    userType: String(pick(data, ["user_type", "userType"]) ?? "").trim(),
    category: String(pick(data, ["category", "delivery_status", "deliveryStatus"]) ?? "").trim(),
    workMode: String(pick(data, ["work_mode", "workMode"]) ?? "").trim(),
    workLocation: String(
      pick(data, ["work_location_type", "workLocationType", "work_location", "workLocation"]) ?? "",
    ).trim(),
    doj: pick(data, ["doj", "date_of_joining", "dateOfJoining", "joining_date"]),
    reportingManager: String(
      pick(data, [
        "reporting_manager",
        "reportingManager",
        "manager_name",
        "managerName",
        "manager",
      ]) ?? "",
    ).trim(),
    primarySkills: skills("primary_skills", "primarySkills"),
    secondarySkills: skills("secondary_skills", "secondarySkills"),
    webknotExperience: String(
      pick(data, ["webknot_experience", "webknotExperience"]) ?? "",
    ).trim(),
    totalExperience: String(
      pick(data, [
        "total_experience",
        "totalExperience",
        "yoe",
        "years_of_experience",
        "yearsOfExperience",
      ]) ?? "",
    ).trim(),
    experienceSummary: String(
      pick(data, ["experience", "experience_summary", "experienceSummary"]) ?? "",
    ).trim(),
    gender: String(pick(data, ["gender"]) ?? "").trim(),
    maritalStatus: String(pick(data, ["marital_status", "maritalStatus"]) ?? "").trim(),
    localAddress: String(pick(data, ["local_address", "localAddress", "current_address"]) ?? "").trim(),
    permanentAddress: String(
      pick(data, ["permanent_address", "permanentAddress"]) ?? "",
    ).trim(),
    panOnFile: Boolean(data.pan_card_on_file ?? data.panCardOnFile) ||
      Boolean(String(pick(data, ["pan_card", "panCard"]) ?? "").trim()),
    profilePhoto: pick(data, ["profile_photo", "profilePhoto", "photo_url", "photoUrl"]) ?? null,
    resumeShareLink: pick(data, ["resume_share_link", "resumeShareLink", "personal_resume"]) ?? null,
    portalRoles: Array.isArray(data.portal_roles)
      ? data.portal_roles
      : Array.isArray(data.portalRoles)
        ? data.portalRoles
        : [],
    userTypeTransitions: Array.isArray(data.user_type_transitions)
      ? data.user_type_transitions
      : Array.isArray(data.userTypeTransitions)
        ? data.userTypeTransitions
        : [],
  };
}

export function normalizeLeaveBalances(raw) {
  const data = unwrapData(raw);
  const leave = data.leave && typeof data.leave === "object" ? data.leave : {};
  return {
    empId: String(data.emp_id ?? data.empId ?? "").trim(),
    primary: Number(leave.primary ?? 0),
    secondary: Number(leave.secondary ?? 0),
    carryForward: Number(leave.carry_forward ?? leave.carryForward ?? 0),
    total: Number(leave.total ?? 0),
    compOff: Number(data.comp_off_balance ?? data.compOffBalance ?? 0),
  };
}

export function normalizePreferences(raw) {
  const data = unwrapData(raw);
  return {
    timezone: String(data.timezone ?? "").trim(),
    theme: String(data.theme ?? "system").trim(),
    density: String(data.density ?? "").trim(),
    dateFormat: String(data.date_format ?? data.dateFormat ?? "DD/MM/YYYY").trim() || "DD/MM/YYYY",
    weekStartsOn: data.week_starts_on ?? data.weekStartsOn ?? 1,
    emailNotifications: Boolean(data.email_notifications ?? data.emailNotifications),
    desktopNotifications: Boolean(data.desktop_notifications ?? data.desktopNotifications),
    reduceMotion: Boolean(data.reduce_motion ?? data.reduceMotion),
  };
}

export async function fetchWebtrakEmployeeProfile(empId, { signal } = {}) {
  const id = String(empId ?? "").trim();
  if (!id) throw new Error("Employee id is required.");
  const raw = await webtrakGet(`/api/v1/employee-profile/${encodeURIComponent(id)}`, { signal });
  return normalizeWebtrakEmployeeProfile(raw);
}

export async function updateWebtrakEmployeeProfile(empId, payload, { signal } = {}) {
  const id = String(empId ?? "").trim();
  if (!id) throw new Error("Employee id is required.");
  const raw = await webtrakPut(
    `/api/v1/employee-profile/${encodeURIComponent(id)}`,
    payload,
    { signal },
  );
  return normalizeWebtrakEmployeeProfile(raw);
}

export async function fetchWebtrakEmployeeBalances(empId, { signal } = {}) {
  const id = String(empId ?? "").trim();
  if (!id) throw new Error("Employee id is required.");
  const raw = await webtrakGet(
    `/api/v1/employee-profile/${encodeURIComponent(id)}/balances`,
    { signal },
  );
  return normalizeLeaveBalances(raw);
}

export async function fetchWebtrakPreferences({ signal } = {}) {
  const raw = await webtrakGet("/api/v1/profile/preferences", { signal });
  return normalizePreferences(raw);
}

export async function fetchWebtrakTrainings({ signal } = {}) {
  const raw = await webtrakGet("/api/v1/trainings", { signal });
  const data = unwrapData(raw);
  const list =
    (Array.isArray(raw) && raw) ||
    (Array.isArray(data) && data) ||
    (Array.isArray(data.content) && data.content) ||
    (Array.isArray(data.items) && data.items) ||
    (Array.isArray(data.trainings) && data.trainings) ||
    (Array.isArray(raw?.data) && raw.data) ||
    [];
  return list
    .map((row, i) => {
      if (!row || typeof row !== "object") return null;
      const id = String(row.id ?? row.training_id ?? row.trainingId ?? "").trim();
      if (!id) return null;
      return {
        id,
        name: String(row.name ?? row.training_name ?? row.trainingName ?? `Training ${i + 1}`).trim(),
        status: String(row.status ?? "").trim(),
      };
    })
    .filter(Boolean);
}

function findTraineeScore(scoresPayload, { userId, email }) {
  const root = unwrapData(scoresPayload);
  const participants =
    (Array.isArray(root.participants) && root.participants) ||
    (Array.isArray(root.scores) && root.scores) ||
    (Array.isArray(root.items) && root.items) ||
    (Array.isArray(root) && root) ||
    [];
  const emailLower = String(email ?? "").trim().toLowerCase();
  const uid = String(userId ?? "").trim();
  const match = participants.find((p) => {
    if (!p || typeof p !== "object") return false;
    const pEmail = String(p.email ?? p.user_email ?? p.userEmail ?? "").trim().toLowerCase();
    const pUser = String(p.user_id ?? p.userId ?? p.trainee_id ?? p.traineeId ?? "").trim();
    const pEmp = String(p.emp_id ?? p.empId ?? "").trim();
    if (emailLower && pEmail && pEmail === emailLower) return true;
    if (uid && (pUser === uid || pEmp === uid)) return true;
    return false;
  });
  if (!match) return null;
  const overall =
    match.overall_score ??
    match.overallScore ??
    match.overall_percent ??
    match.overallPercent ??
    match.score ??
    null;
  return {
    overall: overall == null || overall === "" ? null : Number(overall),
    status: String(match.status ?? match.enrollment_status ?? "").trim(),
    completionDate: String(
      match.completion_date ?? match.completionDate ?? match.completed_at ?? "",
    ).trim(),
  };
}

/**
 * Load trainings list, then resolve scores for this employee (same pattern as WebTrak HR card).
 */
export async function fetchEmployeeTrainingScores(
  { userId, email },
  { signal, limit = 30 } = {},
) {
  const trainings = await fetchWebtrakTrainings({ signal });
  const slice = trainings.slice(0, Math.max(1, Number(limit) || 30));
  const settled = await Promise.allSettled(
    slice.map(async (training) => {
      const raw = await webtrakGet(`/api/v1/trainings/${encodeURIComponent(training.id)}/scores`, {
        signal,
      });
      const hit = findTraineeScore(raw, { userId, email });
      if (!hit) return null;
      return {
        trainingId: training.id,
        trainingName: training.name,
        scoresLabel: hit.overall != null && Number.isFinite(hit.overall) ? `${Math.round(hit.overall)}%` : "—",
        status: hit.status || training.status || "",
        completionDate: hit.completionDate || "",
      };
    }),
  );
  return settled
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter(Boolean);
}

export function buildHrProfileUpdatePayload(form, { statusOnly = false } = {}) {
  const f = form && typeof form === "object" ? form : {};
  if (statusOnly) {
    return { user_status: String(f.user_status ?? f.status ?? "").trim() };
  }
  const payload = {
    name: String(f.name ?? "").trim(),
    email: String(f.email ?? "").trim().toLowerCase(),
    phone_number: String(f.phone_number ?? f.phone ?? "").trim(),
    department: String(f.department ?? "").trim(),
    role: String(f.role ?? f.designation ?? "").trim(),
    user_status: String(f.user_status ?? f.status ?? "").trim(),
    work_mode: String(f.work_mode ?? "").trim(),
    work_location_type: String(f.work_location_type ?? "").trim(),
    primary_skills: Array.isArray(f.primary_skills) ? f.primary_skills : [],
    secondary_skills: Array.isArray(f.secondary_skills) ? f.secondary_skills : [],
  };
  const bandId = f.band_id ?? f.bandId;
  if (bandId != null && String(bandId).trim() !== "") {
    const n = Number(bandId);
    payload.band_id = Number.isFinite(n) ? n : bandId;
  }
  return payload;
}

export function profileToEditForm(profile) {
  const p = profile || {};
  const mapSkills = (list) =>
    (Array.isArray(list) ? list : [])
      .map((item) => {
        if (!item || typeof item !== "object") {
          const skill = String(item ?? "").trim();
          return skill ? { skill, self_rating: 3 } : null;
        }
        const skill = String(item.skill ?? item.name ?? "").trim();
        if (!skill) return null;
        return {
          skill,
          self_rating: Number(item.self_rating ?? item.selfRating ?? item.rating ?? 3),
          webknot_rating:
            item.webknot_rating != null || item.webknotRating != null
              ? Number(item.webknot_rating ?? item.webknotRating)
              : undefined,
        };
      })
      .filter(Boolean);

  return {
    name: p.name || "",
    email: p.email || "",
    phone_number: p.phone || "",
    department: p.department || "",
    role: p.designation || "",
    user_status: p.status || "ACTIVE",
    work_mode: p.workMode || "",
    work_location_type: p.workLocation || "",
    band_id: p.bandId != null ? String(p.bandId) : "",
    primary_skills: mapSkills(p.primarySkills),
    secondary_skills: mapSkills(p.secondarySkills),
  };
}

export function formatUserTypeHistory(transitions) {
  if (!Array.isArray(transitions) || !transitions.length) return "—";
  const lines = transitions
    .map((row) => {
      if (!row || typeof row !== "object") return "";
      const from = String(row.from_type ?? row.fromType ?? "").trim();
      const to = String(row.to_type ?? row.toType ?? "").trim();
      const date = String(row.transition_date ?? row.transitionDate ?? "").trim();
      if (!from || !to) return "";
      return date ? `${from} → ${to} (${date})` : `${from} → ${to}`;
    })
    .filter(Boolean);
  return lines.length ? lines.join("; ") : "—";
}
