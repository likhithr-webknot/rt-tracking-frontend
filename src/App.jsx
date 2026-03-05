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
  hasManualLogoutMark,
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

export default function App() {
  const [auth, setAuthState] = useState(() => getAuth());
  const [authChecking, setAuthChecking] = useState(() => !getAuth());
  const [hasReportees, setHasReportees] = useState(null);
  const [windowData, setWindowData] = useState(null);
  const [windowLoading, setWindowLoading] = useState(false);
  const [windowError, setWindowError] = useState("");
  const [windowRefreshNonce, setWindowRefreshNonce] = useState(0);

  const roleLabel = useMemo(() => {
    const role = String(auth?.role ?? "").trim();
    if (role) {
      const key = role.toLowerCase();
      if (key === "admin") return "Admin";
      if (key === "manager") return "Manager";
      return role;
    }

    const portal = String(auth?.portal ?? "").trim().toLowerCase();
    if (portal.includes("admin")) return "Admin";
    if (portal.includes("manager")) return "Manager";
    if (portal.includes("employee")) return "Employee";
    return "Employee";
  }, [auth?.portal, auth?.role]);

  useEffect(() => {
    if (!auth) {
      setHasReportees(null);
      return;
    }
    if (roleLabel === "Admin") {
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
        setHasReportees(roleLabel === "Manager");
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [auth, roleLabel]);

  const effectivePortalRole = useMemo(() => {
    if (roleLabel === "Admin") return "Admin";
    if (hasReportees === true) return "Manager";
    return "Employee";
  }, [hasReportees, roleLabel]);

  const roleProbeLoading = Boolean(auth) && roleLabel !== "Admin" && hasReportees === null;

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    async function run() {
      setAuthChecking(true);
      if (hasManualLogoutMark()) {
        clearAuth();
        setAuthState(null);
        setAuthChecking(false);
        return;
      }

      try {
        const me = await fetchMe({ signal: controller.signal });
        if (!alive) return;
        if (!me) {
          clearAuth();
          setAuthState(null);
          return;
        }
        setAuth(me);
        setAuthState(getAuth() || me);
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
        <LoginPage
          onLoginSuccess={(nextAuth) => {
            clearManualLogoutMark();
            setAuthState(nextAuth);
            setWindowRefreshNonce((n) => n + 1);
          }}
        />
      </Suspense>
    );
  }

  if (roleLabel === "Admin") {
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
