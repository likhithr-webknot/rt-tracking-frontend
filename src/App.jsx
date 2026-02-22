import { useCallback, useEffect, useMemo, useState } from "react";
import AdminControlCenter from "./components/admin/AdminControlCenter.jsx";
import EmployeePortal from "./components/employee/EmployeePortal.jsx";
import ManagerPortal from "./components/manager/ManagerPortal.jsx";
import LoginPage from "./components/auth/LoginPage.jsx";
import SubmissionWindowClosed from "./components/employee/SubmissionWindowClosed.jsx";
import {
  clearAuth,
  clearManualLogoutMark,
  fetchMe,
  getAuth,
  hasManualLogoutMark,
  markManualLogout,
  setAuth,
} from "./api/auth.js";
import {
  fetchSubmissionWindowCurrent,
} from "./api/submission-window.js";
import { fetchManagerReportees, normalizeEmployees } from "./api/employees.js";

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
  const [windowData, setWindowData] = useState(null);
  const [windowLoading, setWindowLoading] = useState(false);
  const [windowError, setWindowError] = useState("");
  const [windowRefreshNonce, setWindowRefreshNonce] = useState(0);
  const [managerAccessLoading, setManagerAccessLoading] = useState(false);
  const [managerHasReportees, setManagerHasReportees] = useState(null);

  const authEmployeeId = useMemo(
    () => String(
      auth?.employeeId ??
      auth?.empId ??
      auth?.id ??
      auth?.claims?.employeeId ??
      auth?.claims?.empId ??
      ""
    ).trim(),
    [auth?.claims?.empId, auth?.claims?.employeeId, auth?.empId, auth?.employeeId, auth?.id]
  );

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
    if (!auth || roleLabel !== "Manager") {
      setManagerAccessLoading(false);
      setManagerHasReportees(null);
      return;
    }

    if (!authEmployeeId) {
      setManagerAccessLoading(false);
      setManagerHasReportees(false);
      return;
    }

    let alive = true;
    const controller = new AbortController();

    (async () => {
      setManagerAccessLoading(true);
      try {
        const data = await fetchManagerReportees(authEmployeeId, { signal: controller.signal });
        if (!alive) return;
        const count = normalizeEmployees(data).length;
        setManagerHasReportees(count > 0);
      } catch (err) {
        if (!alive) return;
        if (err?.name === "AbortError") return;
        setManagerHasReportees(false);
      } finally {
        if (alive) setManagerAccessLoading(false);
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [auth, authEmployeeId, roleLabel]);

  const effectivePortalRole = useMemo(() => {
    if (roleLabel !== "Manager") return roleLabel;
    return managerHasReportees ? "Manager" : "Employee";
  }, [managerHasReportees, roleLabel]);

  useEffect(() => {
    // Restore session from cookie on refresh/new tab.
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
          // Server says no session: clear any client-side cached session and go to login.
          clearAuth();
          setAuthState(null);
          return;
        }
        setAuth(me);
        setAuthState(getAuth() || me);
      } catch {
        if (!alive) return;
        // If /auth/me fails, fall back to whatever sessionStorage has.
        setAuthState(getAuth());
      } finally {
        const stillAlive = alive;
        if (stillAlive) setAuthChecking(false);
      }
    }
    run();
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    // Gate Employee/Manager portal by the server submission-window state.
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
        const globalWindow = await fetchSubmissionWindowCurrent({ signal: controller.signal });
        const data = withWindowSource(globalWindow, "global");

        if (!alive) return;
        setWindowData(data);
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!alive) return;
        if (err?.status === 401) {
          // Some backends return 401 for "not permitted" (not just "not authenticated").
          // Confirm whether the session is actually gone before forcing a logout.
          try {
            const me = await fetchMe({ signal: controller.signal }).catch(() => null);
            if (!me) {
              clearAuth();
              setAuthState(null);
              return;
            }
            setAuth(me);
            setAuthState(getAuth() || me);
          } catch {
            // If we can't verify, keep the session and show an error instead of looping to login.
          }
        }
        setWindowError(err?.message || "Failed to load submission window status.");
        setWindowData(null);
      } finally {
        const stillAlive = alive;
        if (stillAlive) {
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
  }, [auth, authEmployeeId, effectivePortalRole, windowRefreshNonce]);

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
          <div className="mt-2 rt-title">
            Restoring Session
          </div>
          <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">Checking authentication…</div>
        </div>
      </div>
    );
  }

  if (!auth) {
    return (
      <LoginPage
        onLoginSuccess={(nextAuth) => {
          clearManualLogoutMark();
          setAuthState(nextAuth);
          setWindowRefreshNonce((n) => n + 1);
        }}
      />
    );
  }

  if (roleLabel === "Admin") {
    return <AdminControlCenter onLogout={logout} auth={auth} />;
  }

  if (roleLabel === "Manager" && managerAccessLoading) {
    return (
      <div className="rt-shell grid place-items-center px-6">
        <div className="rt-panel text-center px-8 py-10 w-full max-w-xl">
          <div className="rt-kicker">Loading</div>
          <div className="mt-2 rt-title">Checking Manager Access</div>
          <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">Validating reportees…</div>
        </div>
      </div>
    );
  }

  if (windowLoading && !windowData) {
    return (
      <div className="rt-shell grid place-items-center px-6">
        <div className="rt-panel text-center px-8 py-10 w-full max-w-xl">
          <div className="rt-kicker">Loading</div>
          <div className="mt-2 rt-title">
            Checking Submission Window
          </div>
          <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">Please wait…</div>
        </div>
      </div>
    );
  }

  if (!windowData) {
    return (
      <SubmissionWindowClosed
        portalWindow={null}
        error={windowError || "Unable to determine whether submissions are open."}
        onRetry={() => setWindowRefreshNonce((n) => n + 1)}
      />
    );
  }

  if (!windowData.isOpen) {
    return (
      <SubmissionWindowClosed
        portalWindow={windowData}
        onRetry={() => setWindowRefreshNonce((n) => n + 1)}
      />
    );
  }

  if (effectivePortalRole === "Manager") {
    return <ManagerPortal onLogout={logout} auth={auth} />;
  }

  return <EmployeePortal onLogout={logout} auth={auth} />;
}
