import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, Navigate } from "react-router-dom";

/* ── Lazy-loaded portals (code-split per role) ─────────────── */
const AdminControlCenter = lazy(() => import("./components/admin/AdminControlCenter"));
const EmployeePortal = lazy(() => import("./components/employee/EmployeePortal"));
const ManagerPortal = lazy(() => import("./components/manager/ManagerPortal"));
const LoginPage = lazy(() => import("./components/auth/LoginPage"));

import { fetchManagerReportees, normalizeEmployees } from "./api/employees";
import {
  clearAuth,
  clearManualLogoutMark,
  consumeOAuthTokenFromUrl,
  decodeJwtPayload,
  extractEmailFromSources,
  fetchMe,
  getAuth,
  getAuthHeader,
  hasManualLogoutMark,
  hasRecoverableSession,
  isPortalAdminEmail,
  logout as logoutApi,
  markManualLogout,
  setAuth,
  stripOAuthParamsFromUrl,
} from "./api/auth";
import { isWebknotWorkEmail } from "./utils/webknotEmail";
import CompanyLogo from "./components/shared/CompanyLogo";

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
  if (cleaned.includes("finance") || cleaned.includes("asset_manager")) return "Admin";
  return "";
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
  if (keys.some((k) => k.includes("finance") || k.includes("asset"))) return "Admin";
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

/** Shared loading fallback for Suspense boundaries */
function PortalLoader() {
  return (
    <div className="rt-shell grid min-h-[100dvh] place-items-center px-6">
      <div className="rt-panel w-full max-w-md px-10 py-12 text-center">
        <CompanyLogo size={48} className="mx-auto h-12 w-12" aria-hidden />
        <p className="rt-kicker mt-6">Webknot Pulse</p>
        <h1 className="rt-title mt-2">Loading workspace</h1>
        <p className="mt-2 text-sm text-[rgb(var(--muted))]">Please wait a moment…</p>
        <div className="mx-auto mt-6 h-1 w-32 overflow-hidden rounded-full bg-[rgb(var(--surface-3))]">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-[rgb(var(--primary))]" />
        </div>
      </div>
    </div>
  );
}

function getAuthEmailForPortal(auth) {
  const obj = auth && typeof auth === "object" ? auth : {};
  const claims = obj?.claims && typeof obj.claims === "object" ? obj.claims : {};
  const candidates = [
    obj?.email,
    obj?.employeeEmail,
    obj?.mail,
    obj?.userEmail,
    claims?.email,
    claims?.mail,
    typeof claims?.sub === "string" && String(claims.sub).includes("@") ? claims.sub : "",
    claims?.preferred_username,
    claims?.upn,
    claims?.unique_name,
  ];
  for (const c of candidates) {
    const t = String(c ?? "").trim().toLowerCase();
    if (t) return t;
  }
  return "";
}

export default function App() {
  const location = useLocation();
  const path = location.pathname;

  const [auth, setAuthState] = useState(() => getAuth());
  const [authChecking, setAuthChecking] = useState(true);
  const [hasReportees, setHasReportees] = useState(null);
  const bootstrapGeneration = useRef(0);

  const roleLabel = useMemo(() => {
    const email = getAuthEmailForPortal(auth);
    if (email && isPortalAdminEmail(email)) return "Admin";
    return resolvePortalRole(auth);
  }, [auth]);

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

  const activePortalRole = useMemo(() => {
    if (roleLabel === "Admin") return "Admin";
    if (roleLabel === "Manager") return "Manager";
    if (roleLabel === "Employee") return "Employee";
    if (hasReportees === true) return "Manager";
    return "Employee";
  }, [hasReportees, roleLabel]);

  const roleProbeLoading = Boolean(auth) && !roleLabel && hasReportees === null;

  useEffect(() => {
    const generation = ++bootstrapGeneration.current;
    let alive = true;
    const controller = new AbortController();

    async function run() {
      setAuthChecking(true);
      if (hasRecoverableSession()) {
        setAuthState(getAuth());
      }

      try {
        const hadManualLogoutMark = hasManualLogoutMark();
        const existing = getAuth() || {};
        const callbackToken = consumeOAuthTokenFromUrl();

        if (callbackToken) {
          const claims = decodeJwtPayload(callbackToken);
          const email = extractEmailFromSources(existing, claims || {});
          setAuth({
            ...existing,
            token: callbackToken,
            email: email || existing.email,
            employeeName:
              existing.employeeName ||
              String(claims?.name ?? claims?.given_name ?? "").trim() ||
              undefined,
          });
        }

        let me = null;
        try {
          me = await fetchMe({ signal: controller.signal });
        } catch (meErr) {
          if (!alive || generation !== bootstrapGeneration.current) return;
          console.warn("[auth] fetchMe failed:", meErr);
        }

        if (!alive || generation !== bootstrapGeneration.current) return;

        if (!me) {
          if (hasRecoverableSession()) {
            setAuthState(getAuth());
            stripOAuthParamsFromUrl();
            return;
          }
          if (hadManualLogoutMark) {
            clearAuth();
            setAuthState(null);
            return;
          }
          clearAuth();
          setAuthState(null);
          stripOAuthParamsFromUrl();
          return;
        }

        const email = getAuthEmailForPortal(me);
        if (email && !isWebknotWorkEmail(email)) {
          clearAuth();
          setAuthState(null);
          stripOAuthParamsFromUrl();
          window.history.replaceState({}, "", "/?error=invalid_domain");
          return;
        }

        clearManualLogoutMark();
        const merged = callbackToken ? { ...me, token: callbackToken } : me;
        setAuth(merged);
        setAuthState(getAuth() || merged);
        stripOAuthParamsFromUrl();
      } catch (err) {
        if (!alive || generation !== bootstrapGeneration.current) return;
        console.warn("[auth] session restore failed:", err);
        if (hasRecoverableSession()) {
          setAuthState(getAuth());
        } else {
          setAuthState(null);
        }
      } finally {
        if (alive && generation === bootstrapGeneration.current) {
          setAuthChecking(false);
        }
      }
    }

    run();
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    function onAuthChanged() {
      const session = getAuth();
      const signedIn = Boolean(session?.email || session?.accessToken || getAuthHeader());
      if (!signedIn) {
        setAuthState(null);
        return;
      }
      setAuthState(session);
      setAuthChecking(false);
    }
    window.addEventListener("rt-auth-changed", onAuthChanged);
    return () => window.removeEventListener("rt-auth-changed", onAuthChanged);
  }, []);

  const logout = useCallback(() => {
    markManualLogout();
    void logoutApi().catch(() => {});
    clearAuth();
    setAuthState(null);
    setAuthChecking(false);
  }, []);

  if (authChecking) {
    return <PortalLoader />;
  }

  if (!auth) {
    return (
      <Suspense fallback={<PortalLoader />}>
        <LoginPage />
      </Suspense>
    );
  }

  if (roleProbeLoading) {
    return (
      <div className="rt-shell grid min-h-[100dvh] place-items-center px-6">
        <div className="rt-panel w-full max-w-md px-8 py-10 text-center">
          <p className="rt-kicker">Access</p>
          <h1 className="rt-title mt-2">Resolving permissions</h1>
          <p className="mt-2 text-sm text-[rgb(var(--muted))]">Verifying your workspace…</p>
        </div>
      </div>
    );
  }

  const renderPortal = () => {
    if (path === "/") {
        if (activePortalRole === "Admin") return <Navigate to="/admin" replace />;
        if (activePortalRole === "Manager") return <Navigate to="/manager" replace />;
        return <Navigate to="/employee" replace />;
    }

    if (path.startsWith("/admin")) {
        if (activePortalRole !== "Admin") return <Navigate to="/" replace />;
        return <AdminControlCenter onLogout={logout} auth={auth} />;
    }

    if (path.startsWith("/manager")) {
        if (activePortalRole !== "Manager" && activePortalRole !== "Admin") return <Navigate to="/" replace />;
        return <ManagerPortal onLogout={logout} auth={auth} />;
    }

    if (path.startsWith("/employee")) {
        if (activePortalRole !== "Employee" && activePortalRole !== "Admin") {
          return <Navigate to="/" replace />;
        }
        return <EmployeePortal onLogout={logout} auth={auth} />;
    }

    return <Navigate to="/" replace />;
  };

  return (
    <Suspense fallback={<PortalLoader />}>
      {renderPortal()}
    </Suspense>
  );
}
