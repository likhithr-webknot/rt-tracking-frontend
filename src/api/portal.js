import { getAuth, getAuthHeader } from "./auth.js";
import { buildApiUrl, parseResponse, requestWithFallbacks, toHttpError, withCsrfHeaders } from "./http.js";

function authHeaders(extra = {}) {
  const auth = getAuthHeader();
  return withCsrfHeaders({
    ...(auth ? { Authorization: auth } : {}),
    ...extra,
  });
}

function unwrap(data) {
  if (!data || typeof data !== "object") return data;
  return data.data ?? data;
}

async function requestJson(path, { method = "GET", body, signal, ignore = [] } = {}) {
  const headers = authHeaders(body != null ? { "Content-Type": "application/json" } : {});
  const res = await fetch(buildApiUrl(path), {
    method,
    signal,
    credentials: "include",
    headers,
    ...(body != null ? { body: JSON.stringify(body && typeof body === "object" ? body : {}) } : {}),
  });
  if (!res.ok) {
    const err = await toHttpError(res);
    if (ignore.includes(res.status)) return null;
    throw err;
  }
  return parseResponse(res, {});
}

async function firstOk(paths, options = {}) {
  return requestWithFallbacks(paths, {
    ...options,
    headers: authHeaders(),
    notFoundMessage: options.notFoundMessage || "Portal endpoint not found.",
  });
}

export async function fetchPortalEmployee({ signal } = {}) {
  const [profile, projectStatus, projects] = await Promise.all([
    firstOk(["/api/v1/profile", "/api/v1/user/onboard"], {
      signal,
      notFoundMessage: "Employee profile endpoint not found.",
    }),
    firstOk(["/api/v1/client-proj-status"], {
      signal,
      notFoundMessage: "Employee project-status endpoint not found.",
    }).catch(() => ({})),
    firstOk(["/api/v1/project-assigned-to-user"], {
      signal,
      notFoundMessage: "Employee assigned-projects endpoint not found.",
    }).catch(() => ({})),
  ]);

  return {
    data: {
      employee: unwrap(profile),
      me: unwrap(profile),
      clientProjectStatus: unwrap(projectStatus),
      projects: unwrap(projects),
    },
  };
}

export async function updatePortalEmployee(payload, { signal } = {}) {
  const body = payload && typeof payload === "object" ? payload : {};
  const auth = getAuth();
  const empId = String(body.employeeId ?? body.empId ?? auth?.employeeId ?? "").trim();
  if (empId) {
    return requestJson(`/api/v1/employee-profile/${encodeURIComponent(empId)}`, {
      method: "PUT",
      signal,
      body,
    });
  }
  throw new Error("Employee id is required to update profile details.");
}

export async function fetchPortalManager({ signal } = {}) {
  const [profile, managerProjects, allocationEndingSoon] = await Promise.all([
    firstOk(["/api/v1/profile"], {
      signal,
      notFoundMessage: "Manager profile endpoint not found.",
    }),
    firstOk(["/api/v1/manager-projects-with-roles", "/api/v1/manager-projects"], {
      signal,
      notFoundMessage: "Manager projects endpoint not found.",
    }),
    firstOk(["/api/v1/manager/allocation-ending-soon?page=0&size=10"], {
      signal,
      notFoundMessage: "Allocation-ending-soon endpoint not found.",
    }).catch(() => ({})),
  ]);

  return {
    data: {
      manager: unwrap(profile),
      me: unwrap(profile),
      projects: unwrap(managerProjects),
      allocationEndingSoon: unwrap(allocationEndingSoon),
    },
  };
}

export async function fetchPortalAdmin({ signal } = {}) {
  const [profile, users, projects] = await Promise.all([
    firstOk(["/api/v1/profile"], {
      signal,
      notFoundMessage: "Admin profile endpoint not found.",
    }),
    firstOk(["/api/v1/users?page=0&size=1", "/api/v1/employee-profile?page=0&size=1"], {
      signal,
      notFoundMessage: "Admin users endpoint not found.",
    }),
    firstOk(["/api/v1/projects/all", "/api/v1/projects?page=0&size=1"], {
      signal,
      notFoundMessage: "Admin projects endpoint not found.",
    }).catch(() => ({})),
  ]);

  return {
    data: {
      admin: unwrap(profile),
      me: unwrap(profile),
      users: unwrap(users),
      projects: unwrap(projects),
    },
  };
}
