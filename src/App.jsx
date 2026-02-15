import { useEffect, useMemo, useState } from "react";
import AdminControlCenter from "./components/AdminControlCenter.jsx";
import EmployeePortal from "./components/EmployeePortal.jsx";
import LoginPage from "./components/LoginPage.jsx";
import SubmissionWindowClosed from "./components/SubmissionWindowClosed.jsx";
import { clearAuth, getAuth } from "./api/auth.js";

const PORTAL_WINDOW_STORAGE_KEY = "rt_tracking_portal_window_v1";

function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function parseLocalDateTime(value) {
  const v = String(value ?? "").trim();
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function defaultPortalWindow() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(18, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setHours(18, 0, 0, 0);
  return {
    start: toLocalInputValue(start),
    end: toLocalInputValue(end),
    meta: { lastAction: "default", updatedAt: Date.now() },
  };
}

function loadPortalWindowFromStorage() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PORTAL_WINDOW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    const start = typeof parsed?.start === "string" ? parsed.start : "";
    const end = typeof parsed?.end === "string" ? parsed.end : "";
    if (!start) return null;

    const meta = parsed?.meta && typeof parsed.meta === "object" ? parsed.meta : {};
    return {
      start,
      end,
      meta: {
        lastAction: typeof meta.lastAction === "string" ? meta.lastAction : "unknown",
        updatedAt: typeof meta.updatedAt === "number" ? meta.updatedAt : null,
      },
    };
  } catch {
    return null;
  }
}

function resolvePortalWindowNow() {
  const saved = loadPortalWindowFromStorage();
  if (!saved) return defaultPortalWindow();

  const now = new Date();
  const start = parseLocalDateTime(saved.start);
  const end = saved.end ? parseLocalDateTime(saved.end) : null;

  const looksManuallyStopped = Boolean(start && end && end <= start);
  const wasStopped = saved?.meta?.lastAction === "stop" || looksManuallyStopped;

  if (!wasStopped && end && end < now) {
    const next = {
      ...defaultPortalWindow(),
      meta: { lastAction: "autoroll", updatedAt: Date.now() },
    };
    try {
      window.localStorage.setItem(PORTAL_WINDOW_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    return next;
  }

  return saved;
}

function isPortalWindowOpen(portalWindow, now) {
  const start = parseLocalDateTime(portalWindow?.start);
  if (!start) return false;

  const endRaw = String(portalWindow?.end ?? "").trim();
  const end = endRaw ? parseLocalDateTime(endRaw) : null;

  if (endRaw && !end) return false;
  if (end && end <= start) return false;

  const t = now instanceof Date ? now : new Date();
  if (t < start) return false;
  if (!end) return true;
  return t <= end;
}

function isSamePortalWindowIdentity(a, b) {
  if (!a || !b) return false;
  return (
    String(a.start ?? "") === String(b.start ?? "") &&
    String(a.end ?? "") === String(b.end ?? "") &&
    String(a?.meta?.lastAction ?? "") === String(b?.meta?.lastAction ?? "")
  );
}

export default function App() {
  const [auth, setAuthState] = useState(() => getAuth());
  const [portalWindow, setPortalWindow] = useState(() => resolvePortalWindowNow());
  const [nowTick, setNowTick] = useState(() => Date.now());

  const roleLabel = useMemo(() => {
    const role = String(auth?.role ?? "").trim();
    if (!role) return "Employee";
    if (role.toLowerCase() === "admin") return "Admin";
    if (role.toLowerCase() === "manager") return "Manager";
    return role;
  }, [auth?.role]);

  useEffect(() => {
    // Keep the gate responsive to time passing and cross-tab admin changes.
    const interval = window.setInterval(() => {
      setNowTick(Date.now());
      // Also autoroll when needed (unless manually stopped).
      setPortalWindow((prev) => {
        const next = resolvePortalWindowNow();
        return isSamePortalWindowIdentity(prev, next) ? prev : next;
      });
    }, 10_000);
    function onStorage(e) {
      if (e?.key === PORTAL_WINDOW_STORAGE_KEY) {
        setPortalWindow((prev) => {
          const next = resolvePortalWindowNow();
          return isSamePortalWindowIdentity(prev, next) ? prev : next;
        });
      }
    }
    function onPortalWindowChanged() {
      setPortalWindow((prev) => {
        const next = resolvePortalWindowNow();
        return isSamePortalWindowIdentity(prev, next) ? prev : next;
      });
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("rt_tracking_portal_window_changed_v1", onPortalWindowChanged);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("rt_tracking_portal_window_changed_v1", onPortalWindowChanged);
    };
  }, []);

  function logout() {
    clearAuth();
    setAuthState(null);
    // Ensure the next login sees the latest window state without waiting for the polling tick.
    setPortalWindow(resolvePortalWindowNow());
  }

  if (!auth) {
    return (
      <LoginPage
        onLoginSuccess={(nextAuth) => {
          setAuthState(nextAuth);
          setPortalWindow(resolvePortalWindowNow());
        }}
      />
    );
  }

  if (roleLabel === "Admin") {
    return <AdminControlCenter onLogout={logout} auth={auth} />;
  }

  const isWindowOpen = isPortalWindowOpen(portalWindow, new Date(nowTick));
  if (!isWindowOpen) {
    return <SubmissionWindowClosed portalWindow={portalWindow} />;
  }

  return <EmployeePortal onLogout={logout} auth={auth} />;
}
