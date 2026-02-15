import { useEffect, useMemo, useState } from "react";
import AdminControlCenter from "./components/AdminControlCenter.jsx";
import EmployeePortal from "./components/EmployeePortal.jsx";
import LoginPage from "./components/LoginPage.jsx";
import SubmissionWindowClosed from "./components/SubmissionWindowClosed.jsx";
import { clearAuth, getAuth } from "./api/auth.js";
import { fetchSubmissionWindowCurrent } from "./api/submission-window.js";

export default function App() {
  const [auth, setAuthState] = useState(() => getAuth());
  const [windowData, setWindowData] = useState(null);
  const [windowLoading, setWindowLoading] = useState(false);
  const [windowError, setWindowError] = useState("");
  const [windowRefreshNonce, setWindowRefreshNonce] = useState(0);

  const roleLabel = useMemo(() => {
    const role = String(auth?.role ?? "").trim();
    if (!role) return "Employee";
    if (role.toLowerCase() === "admin") return "Admin";
    if (role.toLowerCase() === "manager") return "Manager";
    return role;
  }, [auth?.role]);

  useEffect(() => {
    // Gate Employee/Manager portal by the server submission-window state.
    if (!auth?.accessToken) {
      setWindowData(null);
      setWindowError("");
      setWindowLoading(false);
      return;
    }
    if (roleLabel === "Admin") return;

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
  }, [auth?.accessToken, roleLabel, windowRefreshNonce]);

  function logout() {
    clearAuth();
    setAuthState(null);
    setWindowData(null);
    setWindowError("");
    setWindowLoading(false);
  }

  if (!auth) {
    return (
      <LoginPage
        onLoginSuccess={(nextAuth) => {
          setAuthState(nextAuth);
          setWindowRefreshNonce((n) => n + 1);
        }}
      />
    );
  }

  if (roleLabel === "Admin") {
    return <AdminControlCenter onLogout={logout} auth={auth} />;
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
