import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";

/* ── Lazy-loaded portals (code-split per role) ─────────────── */
const AdminControlCenter = lazy(() => import("./components/admin/AdminControlCenter.jsx"));
const EmployeePortal = lazy(() => import("./components/employee/EmployeePortal.jsx"));
const ManagerPortal = lazy(() => import("./components/manager/ManagerPortal.jsx"));
const LoginPage = lazy(() => import("./components/auth/LoginPage.jsx"));
const SubmissionWindowClosed = lazy(() => import("./components/employee/SubmissionWindowClosed.jsx"));

import { fetchManagerReportees, normalizeEmployees } from "./api/employees.js";
import {
  clearAuth,
  clearManualLogoutMark,
  fetchMe,
  getAuth,
  getOAuthTokenFromWindow,
  hasManualLogoutMark,
  logout as logoutApi,
  markManualLogout,
  setAuth,
} from "./api/auth.js";
import { fetchSubmissionWindowCurrent, fetchRoleSubmissionWindow } from "./api/submission-window.js";

const ROLE_SWITCH_ALLOWED_EMAIL = "likhith.r@webknot.in";
const ROLE_PREVIEW_STORAGE_KEY = "rt_tracking_role_preview_v1";
const DEFAULT_ROLE_OPTIONS = ["Admin", "Manager", "Employee"];

function normalizePortalRole(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  const cleaned = raw.replace(/^role[_-]/, "");
  if (cleaned === "admin" || cleaned === "hr") return "Admin";
  if (cleaned === "manager") return "Manager";
  if (cleaned === "employee" || cleaned === "user") return "Employee";
  if (cleaned.includes("admin")) return "Admin";
  if (cleaned.includes("manager")) return "Manager";
  if (cleaned.includes("employee") || cleaned.includes("user")) return "Employee";
  return "";
}

function normalizeRoleList(input) {
  const arr = Array.isArray(input) ? input : [input];
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    if (item == null) continue;

    if (typeof item === "object") {
      const role = normalizePortalRole(
        item?.role || item?.authority || item?.name || item?.value || item?.code || ""
      );
      if (role && !seen.has(role)) {
        seen.add(role);
        out.push(role);
      }
      continue;
    }

    const text = String(item || "").trim();
    if (!text) continue;

    // Accept formats like "ADMIN,MANAGER", "ROLE_ADMIN ROLE_MANAGER".
    const parts = text.split(/[\s,|;]+/).filter(Boolean);
    for (const part of (parts.length ? parts : [text])) {
      const role = normalizePortalRole(part);
      if (!role || seen.has(role)) continue;
      seen.add(role);
      out.push(role);
    }
  }
  return out;
}

function inferAvailableRoles(source) {
  const obj = source && typeof source === "object" ? source : {};
  const claims = obj?.claims && typeof obj.claims === "object" ? obj.claims : {};
  const byPayload = normalizeRoleList([
    ...(Array.isArray(obj?.availableRoles) ? obj.availableRoles : []),
    ...(Array.isArray(obj?.roles) ? obj.roles : []),
    ...(Array.isArray(obj?.authorities) ? obj.authorities : []),
    ...(Array.isArray(obj?.grantedAuthorities) ? obj.grantedAuthorities : []),
    ...(Array.isArray(claims?.roles) ? claims.roles : []),
    ...(Array.isArray(claims?.authorities) ? claims.authorities : []),
    ...(Array.isArray(claims?.grantedAuthorities) ? claims.grantedAuthorities : []),
    obj?.activeRole,
    obj?.currentRole,
    obj?.selectedRole,
    obj?.role,
    obj?.empRole,
    obj?.userRole,
    obj?.roleName,
    obj?.roleType,
    claims?.activeRole,
    claims?.role,
  ]);
  return byPayload;
}

function getAuthEmail(auth) {
  const obj = auth && typeof auth === "object" ? auth : {};
  const claims = obj?.claims && typeof obj.claims === "object" ? obj.claims : {};
  const candidates = [
    obj?.email,
    obj?.userEmail,
    obj?.mail,
    claims?.email,
    claims?.upn,
    claims?.preferred_username,
  ];
  for (const candidate of candidates) {
    const text = String(candidate ?? "").trim().toLowerCase();
    if (text) return text;
  }
  return "";
}

/** Shared loading fallback for Suspense boundaries */
function PortalLoader() {
  return (
    <div className="rt-shell grid place-items-center px-6">
      <div className="rt-panel text-center px-8 py-10 w-full max-w-xl">
        <div className="rt-kicker">Loading</div>
        <div className="mt-2 rt-title">Loading Portal</div>
        <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">Please wait…</div>
      </div>
    </div>
  );
}

function RolePreviewSwitcher({
  visible,
  currentRole,
  options,
  busy,
  error,
  previewMode,
  onSelect,
  onClear,
}) {
  if (!visible) return null;
  return (
    <div className="fixed right-4 bottom-4 z-[80]">
      <div className="rt-panel p-3 sm:p-4 shadow-xl border-[rgb(var(--primary))]/20">
        <div className="rt-kicker">Role Preview</div>
        <div className="text-xs text-[rgb(var(--muted))] mt-1 mb-2">Local view-only switch for your account</div>
        <div className="flex items-center gap-2">
          <select
            className="rt-input py-2 px-3 text-sm min-w-[160px]"
            value={normalizePortalRole(currentRole) || ""}
            disabled={busy}
            onChange={(e) => onSelect?.(e.target.value)}
          >
            {(Array.isArray(options) && options.length ? options : ["Admin", "Manager", "Employee"]).map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={onClear}
            disabled={busy || !previewMode}
            className="rt-btn-ghost rt-btn-sm"
          >
            Clear
          </button>
        </div>
        {error ? <div className="text-[11px] text-red-600 dark:text-red-400 mt-2">{error}</div> : null}
      </div>
    </div>
  );
}

function withWindowSource(data, source) {
  const obj = data && typeof data === "object" ? data : {};
  const existingSource = String(obj?.source ?? "").trim();
  return {
    ...obj,
    source: existingSource || source,
  };
}

function normalizeRoleKey(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  return raw.startsWith("role_") ? raw.slice(5) : raw;
}

function resolveRoleFromCandidates(candidates) {
  const keys = [];
  for (const candidate of candidates) {
    if (candidate == null) continue;
    if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        if (entry == null) continue;
        if (typeof entry === "string") {
          const key = normalizeRoleKey(entry);
          if (key) keys.push(key);
        } else if (typeof entry === "object") {
          const key = normalizeRoleKey(
            String(entry?.role || entry?.authority || entry?.name || entry?.value || "")
          );
          if (key) keys.push(key);
        }
      }
      continue;
    }
    const key = normalizeRoleKey(candidate);
    if (key) keys.push(key);
  }

  if (keys.some((k) => k.includes("admin") || k === "hr")) return "Admin";
  if (keys.some((k) => k.includes("manager"))) return "Manager";
  if (keys.some((k) => k.includes("employee") || k.includes("user"))) return "Employee";
  return null;
}

function resolvePortalRole(auth) {
  const obj = auth && typeof auth === "object" ? auth : {};
  const claims = obj?.claims && typeof obj.claims === "object" ? obj.claims : {};

  const explicit = normalizePortalRole(
    obj?.activeRole ||
    obj?.currentRole ||
    obj?.selectedRole ||
    obj?.role ||
    obj?.empRole ||
    obj?.userRole ||
    obj?.roleName ||
    obj?.roleType ||
    claims?.activeRole ||
    claims?.role
  );
  if (explicit) return explicit;

  return resolveRoleFromCandidates([
    obj?.roles,
    obj?.authorities,
    obj?.grantedAuthorities,
    claims?.roles,
    claims?.authorities,
    claims?.grantedAuthorities,
    obj?.portal,
  ]);
}

export default function App() {
  const [auth, setAuthState] = useState(() => getAuth());
  const [authChecking, setAuthChecking] = useState(() => !getAuth());
  const [hasReportees, setHasReportees] = useState(null);
  const [roleSwitchBusy, setRoleSwitchBusy] = useState(false);
  const [roleSwitchError, setRoleSwitchError] = useState("");
  const [roleSwitchAllowed, setRoleSwitchAllowed] = useState(false);
  const [roleSwitchOptions, setRoleSwitchOptions] = useState(DEFAULT_ROLE_OPTIONS);
  const [rolePreview, setRolePreview] = useState(() => {
    if (typeof window === "undefined") return "";
    return normalizePortalRole(window.localStorage.getItem(ROLE_PREVIEW_STORAGE_KEY) || "");
  });
  const [windowData, setWindowData] = useState(null);
  const [windowLoading, setWindowLoading] = useState(false);
  const [windowError, setWindowError] = useState("");
  const [windowRefreshNonce, setWindowRefreshNonce] = useState(0);

  const roleLabel = useMemo(() => resolvePortalRole(auth), [auth]);

  useEffect(() => {
    if (!auth) {
      setHasReportees(null);
      return;
    }
    if (roleLabel === "Admin" || roleLabel === "Manager" || roleLabel === "Employee") {
      setHasReportees(false);
      return;
    }

    const managerId = String(auth?.employeeId ?? auth?.empId ?? auth?.id ?? "").trim();
    if (!managerId) {
      setHasReportees(false);
      return;
    }

    let alive = true;
    const controller = new AbortController();
    setHasReportees(null);

    (async () => {
      try {
        const data = await fetchManagerReportees(managerId, { signal: controller.signal });
        if (!alive) return;
        const list = normalizeEmployees(data);
        setHasReportees(list.length > 0);
      } catch (err) {
        if (!alive || err?.name === "AbortError") return;
        setHasReportees(false);
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [auth, roleLabel]);

  const effectivePortalRole = useMemo(() => {
    if (roleLabel === "Admin") return "Admin";
    if (roleLabel === "Manager") return "Manager";
    if (roleLabel === "Employee") return "Employee";
    if (hasReportees === true) return "Manager";
    return "Admin";
  }, [hasReportees, roleLabel]);

  const authEmail = useMemo(() => getAuthEmail(auth), [auth]);

  useEffect(() => {
    if (!authEmail) {
      setRoleSwitchAllowed(false);
      return;
    }
    setRoleSwitchAllowed(authEmail === ROLE_SWITCH_ALLOWED_EMAIL);
  }, [authEmail]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!roleSwitchAllowed) {
      setRolePreview("");
      window.localStorage.removeItem(ROLE_PREVIEW_STORAGE_KEY);
      return;
    }
    const stored = normalizePortalRole(window.localStorage.getItem(ROLE_PREVIEW_STORAGE_KEY) || "");
    setRolePreview(stored);
  }, [roleSwitchAllowed]);

  useEffect(() => {
    if (!roleSwitchAllowed) {
      setRoleSwitchOptions(DEFAULT_ROLE_OPTIONS);
      return;
    }

    const inferred = inferAvailableRoles(auth);
    const nextOptions = inferred.length ? inferred : DEFAULT_ROLE_OPTIONS;
    setRoleSwitchOptions(nextOptions);
    setRolePreview((prev) => {
      if (!prev) return prev;
      if (nextOptions.includes(prev)) return prev;
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(ROLE_PREVIEW_STORAGE_KEY);
      }
      return "";
    });
  }, [auth, roleSwitchAllowed]);

  const roleProbeLoading = Boolean(auth) && !roleLabel && hasReportees === null;

  const activePortalRole = useMemo(() => {
    if (roleSwitchAllowed && rolePreview) return rolePreview;
    return effectivePortalRole;
  }, [effectivePortalRole, rolePreview, roleSwitchAllowed]);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    async function run() {
      setAuthChecking(true);

      try {
        const path = typeof window !== "undefined" ? String(window.location.pathname || "") : "";
        const callbackToken = getOAuthTokenFromWindow();
        const isAuthCallbackPath = path === "/auth/callback";
        const hadManualLogoutMark = hasManualLogoutMark();

        if (callbackToken) {
          clearAuth();
          setAuth({ token: callbackToken });
        }

        const me = await fetchMe({ signal: controller.signal });
        if (!alive) return;
        if (!me) {
          clearAuth();
          setAuthState(null);
          if (hadManualLogoutMark) {
            // Keep user logged out when backend session is absent.
            return;
          }
          if ((isAuthCallbackPath || callbackToken) && typeof window !== "undefined") {
            window.history.replaceState({}, "", "/");
          }
          return;
        }
        clearManualLogoutMark();
        setAuth(callbackToken ? { ...me, token: callbackToken } : me);
        setAuthState(getAuth() || me);
        if (callbackToken) {
          console.log("[auth] signed-in user role:", getAuth()?.role || "(not resolved)");
        }
        if ((isAuthCallbackPath || callbackToken) && typeof window !== "undefined") {
          window.history.replaceState({}, "", "/");
        }
      } catch {
        if (!alive) return;
        setAuthState(getAuth());
      } finally {
        if (alive) setAuthChecking(false);
      }
    }

    run();
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!auth) {
      setWindowData(null);
      setWindowError("");
      setWindowLoading(false);
      return;
    }
    if (activePortalRole !== "Employee" && activePortalRole !== "Manager") return;

    let alive = true;
    let timer = null;
    let controller = null;

    async function load({ showSpinner } = {}) {
      if (!alive) return;
      if (controller) controller.abort();
      controller = new AbortController();

      if (showSpinner) setWindowLoading(true);
      setWindowError("");

      try {
        /* Try role-specific window first, fall back to global */
        let windowResult;
        try {
          windowResult = await fetchRoleSubmissionWindow(activePortalRole, { signal: controller.signal });
        } catch {
          windowResult = await fetchSubmissionWindowCurrent({ signal: controller.signal });
        }
        if (!alive) return;
        setWindowData(withWindowSource(windowResult, activePortalRole.toLowerCase()));
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!alive) return;

        if (err?.status === 401) {
          try {
            const me = await fetchMe({ signal: controller.signal }).catch(() => null);
            if (!me) {
              clearAuth();
              setAuthState(null);
              return;
            }
            setAuth(me);
            setAuthState(getAuth() || me);
          } catch { void 0; }
        }

        setWindowError(err?.message || "Failed to load submission window status.");
        setWindowData(null);
      } finally {
        if (alive) {
          setWindowLoading(false);
          timer = window.setTimeout(() => load({ showSpinner: false }), 30_000);
        }
      }
    }

    load({ showSpinner: true });

    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
      if (controller) controller.abort();
    };
  }, [activePortalRole, auth, windowRefreshNonce]);

  const handleRolePreviewSelect = useCallback(async (value) => {
    const normalized = normalizePortalRole(value);
    if (!normalized || !roleSwitchAllowed || roleSwitchBusy) return;
    setRoleSwitchBusy(true);
    setRoleSwitchError("");
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(ROLE_PREVIEW_STORAGE_KEY, normalized);
      }
      setRolePreview(normalized);
      setWindowRefreshNonce((n) => n + 1);
      setAuthState(getAuth());
    } catch (err) {
      setRoleSwitchError(err?.message || "Role preview failed.");
    } finally {
      setRoleSwitchBusy(false);
    }
  }, [roleSwitchAllowed, roleSwitchBusy]);

  const clearRolePreview = useCallback(() => {
    if (!roleSwitchAllowed) return;
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ROLE_PREVIEW_STORAGE_KEY);
    }
    setRolePreview("");
    setRoleSwitchError("");
    setWindowRefreshNonce((n) => n + 1);
  }, [roleSwitchAllowed]);

  const logout = useCallback(() => {
    markManualLogout();
    void logoutApi().catch(() => {});
    clearAuth();
    setAuthState(null);
    setAuthChecking(false);
    setWindowData(null);
    setWindowError("");
    setWindowLoading(false);
  }, []);

  if (authChecking && (!auth || (!auth?.email && !auth?.employeeName))) {
    return (
      <div className="rt-shell grid place-items-center px-6">
        <div className="rt-panel text-center px-8 py-10 w-full max-w-xl">
          <div className="rt-kicker">Loading</div>
          <div className="mt-2 rt-title">Restoring Session</div>
          <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">Checking authentication…</div>
        </div>
      </div>
    );
  }

  if (!auth) {
    return (
      <Suspense fallback={<PortalLoader />}>
        <LoginPage />
      </Suspense>
    );
  }

  if (activePortalRole === "Admin") {
    return (
      <>
        <Suspense fallback={<PortalLoader />}><AdminControlCenter onLogout={logout} auth={auth} /></Suspense>
        <RolePreviewSwitcher
          visible={roleSwitchAllowed}
          currentRole={activePortalRole}
          options={roleSwitchOptions}
          busy={roleSwitchBusy}
          error={roleSwitchError}
          previewMode={Boolean(rolePreview)}
          onSelect={handleRolePreviewSelect}
          onClear={clearRolePreview}
        />
      </>
    );
  }

  if (roleProbeLoading) {
    return (
      <div className="rt-shell grid place-items-center px-6">
        <div className="rt-panel text-center px-8 py-10 w-full max-w-xl">
          <div className="rt-kicker">Loading</div>
          <div className="mt-2 rt-title">Resolving Access</div>
          <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">Checking reportee access…</div>
        </div>
      </div>
    );
  }

  if (windowLoading && !windowData) {
    return (
      <div className="rt-shell grid place-items-center px-6">
        <div className="rt-panel text-center px-8 py-10 w-full max-w-xl">
          <div className="rt-kicker">Loading</div>
          <div className="mt-2 rt-title">Checking Submission Window</div>
          <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">Please wait…</div>
        </div>
      </div>
    );
  }

  if (!windowData) {
    return (
      <Suspense fallback={<PortalLoader />}>
        <SubmissionWindowClosed
          portalWindow={null}
          error={windowError || "Unable to determine whether submissions are open."}
          onRetry={() => setWindowRefreshNonce((n) => n + 1)}
          onLogout={logout}
        />
      </Suspense>
    );
  }

  if (!windowData.isOpen) {
    return (
      <>
        <Suspense fallback={<PortalLoader />}>
          <SubmissionWindowClosed
            portalWindow={windowData}
            onRetry={() => setWindowRefreshNonce((n) => n + 1)}
            onLogout={logout}
          />
        </Suspense>
        <RolePreviewSwitcher
          visible={roleSwitchAllowed}
          currentRole={activePortalRole}
          options={roleSwitchOptions}
          busy={roleSwitchBusy}
          error={roleSwitchError}
          previewMode={Boolean(rolePreview)}
          onSelect={handleRolePreviewSelect}
          onClear={clearRolePreview}
        />
      </>
    );
  }

  if (activePortalRole === "Manager") {
    return (
      <>
        <Suspense fallback={<PortalLoader />}><ManagerPortal onLogout={logout} auth={auth} /></Suspense>
        <RolePreviewSwitcher
          visible={roleSwitchAllowed}
          currentRole={activePortalRole}
          options={roleSwitchOptions}
          busy={roleSwitchBusy}
          error={roleSwitchError}
          previewMode={Boolean(rolePreview)}
          onSelect={handleRolePreviewSelect}
          onClear={clearRolePreview}
        />
      </>
    );
  }

  return (
    <>
      <Suspense fallback={<PortalLoader />}><EmployeePortal onLogout={logout} auth={auth} /></Suspense>
      <RolePreviewSwitcher
        visible={roleSwitchAllowed}
        currentRole={activePortalRole}
        options={roleSwitchOptions}
        busy={roleSwitchBusy}
        error={roleSwitchError}
        previewMode={Boolean(rolePreview)}
        onSelect={handleRolePreviewSelect}
        onClear={clearRolePreview}
      />
    </>
  );
}
