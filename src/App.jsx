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
  return resolveRoleFromCandidates([
    obj?.role,
    obj?.roleName,
    obj?.roleType,
    obj?.empRole,
    obj?.userRole,
    obj?.roles,
    obj?.authorities,
    obj?.grantedAuthorities,
    claims?.role,
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

  const roleProbeLoading = Boolean(auth) && !roleLabel && hasReportees === null;

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
    if (effectivePortalRole !== "Employee" && effectivePortalRole !== "Manager") return;

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
          windowResult = await fetchRoleSubmissionWindow(effectivePortalRole, { signal: controller.signal });
        } catch {
          windowResult = await fetchSubmissionWindowCurrent({ signal: controller.signal });
        }
        if (!alive) return;
        setWindowData(withWindowSource(windowResult, effectivePortalRole.toLowerCase()));
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
  }, [auth, effectivePortalRole, windowRefreshNonce]);

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

  if (roleLabel === "Admin" || effectivePortalRole === "Admin") {
    return <Suspense fallback={<PortalLoader />}><AdminControlCenter onLogout={logout} auth={auth} /></Suspense>;
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
      <Suspense fallback={<PortalLoader />}>
        <SubmissionWindowClosed
          portalWindow={windowData}
          onRetry={() => setWindowRefreshNonce((n) => n + 1)}
          onLogout={logout}
        />
      </Suspense>
    );
  }

  if (effectivePortalRole === "Manager") {
    return <Suspense fallback={<PortalLoader />}><ManagerPortal onLogout={logout} auth={auth} /></Suspense>;
  }

  return <Suspense fallback={<PortalLoader />}><EmployeePortal onLogout={logout} auth={auth} /></Suspense>;
}
