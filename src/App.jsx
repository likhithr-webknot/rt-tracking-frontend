import { useEffect, useMemo, useState } from "react";
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
import { fetchSubmissionWindowCurrent } from "./api/submission-window.js";

export default function App() {
  const [auth, setAuthState] = useState(() => getAuth());
  const [authChecking, setAuthChecking] = useState(() => !getAuth());
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
    if (roleLabel !== "Employee") return;

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
        const data = await fetchSubmissionWindowCurrent({ signal: controller.signal });
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
  }, [auth, roleLabel, windowRefreshNonce]);

  function logout() {
    markManualLogout();
    clearAuth();
    setAuthState(null);
    setAuthChecking(false);
    setWindowData(null);
    setWindowError("");
    setWindowLoading(false);
  }

  if (authChecking && (!auth || (!auth?.email && !auth?.employeeName))) {
    return (
      <div className="min-h-screen bg-[#0F0F0F] text-slate-100 grid place-items-center px-6">
        <div className="text-center">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Loading</div>
          <div className="mt-2 text-2xl font-black uppercase tracking-tighter italic">
            Restoring Session
          </div>
          <div className="mt-2 text-sm text-gray-400">Checking authentication…</div>
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

  if (roleLabel === "Manager") {
    return <ManagerPortal onLogout={logout} auth={auth} />;
  }

  if (windowLoading && !windowData) {
    return (
      <div className="min-h-screen bg-[#080808] text-slate-100 grid place-items-center px-6">
        <div className="text-center">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Loading</div>
          <div className="mt-2 text-2xl font-black uppercase tracking-tighter italic">
            Checking Submission Window
          </div>
          <div className="mt-2 text-sm text-gray-400">Please wait…</div>
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

  return <EmployeePortal onLogout={logout} auth={auth} />;
}
