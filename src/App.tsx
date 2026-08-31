import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, Navigate, useNavigate } from "react-router-dom";

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
  logout as logoutApi,
  markManualLogout,
  setAuth,
  stripOAuthParamsFromUrl,
} from "./api/auth";
import { isWebknotWorkEmail } from "./utils/webknotEmail";
import { isHrPortalUser } from "./utils/hrRatingsFilter";
import { mapPulsePortalRoleToAppRoute, resolvePortalRoleLabel } from "./utils/portalRole";
import { bootstrapWebtrakHandoffSession, isWebtrakHandoff } from "./api/webtrakSso";
import PortalLoadingScreen from "./components/shared/PortalLoadingScreen";
import SessionTimeoutManager from "./components/shared/SessionTimeoutManager";
import NotFoundPage from "./components/shared/NotFoundPage";

const EMPLOYEE_LEGACY_TABS = new Set([
  "profile",
  "projects",
  "account",
  "kpis",
  "values",
  "certifications",
  "recognitions",
  "review",
  "performance",
  "settings",
]);
const MANAGER_LEGACY_TABS = new Set(["team", "self-review", "account", "settings"]);

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

function canAccessManagerPortal(auth, activePortalRole, isHrUser, hasReportees) {
  if (activePortalRole === "Manager" || activePortalRole === "Admin") return true;
  if (isHrUser) return true;
  if (hasReportees === true) return true;
  const obj = auth && typeof auth === "object" ? auth : {};
  const claims = obj?.claims && typeof obj.claims === "object" ? obj.claims : {};
  const explicit = normalizePortalRole(
    obj?.role ??
    obj?.empRole ??
    obj?.userRole ??
    obj?.roleName ??
    claims?.role
  );
  return explicit === "Manager";
}

function resolvePortalRole(auth) {
  const obj = auth && typeof auth === "object" ? auth : {};
  const portalLabel = resolvePortalRoleLabel(
    obj.portalRole,
    obj.empRole,
    obj.role,
    obj.portal,
    obj.activeRole,
    obj.currentRole,
  );
  if (portalLabel) {
    return mapPulsePortalRoleToAppRoute(portalLabel);
  }
  return "Employee";
}

/** Shared loading fallback for Suspense / cold auth bootstrap */
function PortalLoader() {
  return (
    <PortalLoadingScreen
      title="Loading workspace"
      subtitle="Just a moment…"
      className="min-h-[100dvh]"
    />
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

function AppNotFound() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <NotFoundPage
      attemptedPath={location.pathname}
      onGoHome={() => navigate("/")}
    />
  );
}

export default function App() {
  const location = useLocation();
  const path = location.pathname;

  const [auth, setAuthState] = useState(() => getAuth());
  const [authChecking, setAuthChecking] = useState(true);
  const [hasReportees, setHasReportees] = useState(null);
  const bootstrapGeneration = useRef(0);

  const roleLabel = useMemo(() => resolvePortalRole(auth), [auth]);

  const isHrUser = useMemo(() => isHrPortalUser(auth), [auth]);

  useEffect(() => {
    if (!auth) {
      setHasReportees(null);
      return;
    }
    if (roleLabel === "Admin" || roleLabel === "Manager" || roleLabel === "Employee") {
      setHasReportees(false);
      return;
    }

    const obj = auth && typeof auth === "object" ? auth : {};
    const claims = obj?.claims && typeof obj.claims === "object" ? obj.claims : {};
    if (normalizePortalRole(obj?.role ?? obj?.empRole ?? obj?.userRole ?? claims?.role) === "Manager") {
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
    const obj = auth && typeof auth === "object" ? auth : {};
    const claims = obj?.claims && typeof obj.claims === "object" ? obj.claims : {};
    if (normalizePortalRole(obj?.role ?? obj?.empRole ?? obj?.userRole ?? claims?.role) === "Manager") {
      return "Manager";
    }
    return "Employee";
  }, [auth, hasReportees, roleLabel]);

  const roleProbeLoading = Boolean(auth) && !roleLabel && hasReportees === null;

  useEffect(() => {
    const generation = ++bootstrapGeneration.current;
    let alive = true;
    const controller = new AbortController();

    async function run() {
      const hadSession = hasRecoverableSession();
      if (hadSession) {
        setAuthState(getAuth());
        // Paint the app immediately; refresh /me in the background.
        setAuthChecking(false);
      } else {
        setAuthChecking(true);
      }

      try {
        const hadManualLogoutMark = hasManualLogoutMark();
        const existing = getAuth() || {};
        const callbackToken = consumeOAuthTokenFromUrl();
        const handoffFromWebtrak = isWebtrakHandoff();

        if (callbackToken) {
          const claims = decodeJwtPayload(callbackToken);
          const email = extractEmailFromSources(existing, claims || {});
          setAuth({
            ...existing,
            token: callbackToken,
            accessToken: callbackToken,
            email: email || existing.email,
            employeeName:
              existing.employeeName ||
              String(claims?.name ?? claims?.given_name ?? "").trim() ||
              undefined,
            picture: existing.picture || claims?.picture || undefined,
            profilePic: existing.profilePic || claims?.picture || undefined,
          });
          setAuthState(getAuth());
          setAuthChecking(false);
        }

        let me = null;
        try {
          if (handoffFromWebtrak || callbackToken) {
            me = await bootstrapWebtrakHandoffSession({
              signal: controller.signal,
              hasToken: Boolean(callbackToken),
            });
            if (!alive || generation !== bootstrapGeneration.current) return;
            if (!me && handoffFromWebtrak && !hasRecoverableSession()) {
              return;
            }
          }
          if (!me) {
            me = await fetchMe({ signal: controller.signal });
          }
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
        if (isHrUser) return <Navigate to="/employee" replace />;
        if (activePortalRole === "Admin") return <Navigate to="/admin" replace />;
        if (activePortalRole === "Manager") return <Navigate to="/manager" replace />;
        return <Navigate to="/employee" replace />;
    }

    if (path.startsWith("/admin")) {
        if (activePortalRole !== "Admin" && !isHrUser) return <Navigate to="/" replace />;
        return <AdminControlCenter onLogout={logout} auth={auth} />;
    }

    if (path.startsWith("/manager")) {
        if (!canAccessManagerPortal(auth, activePortalRole, isHrUser, hasReportees)) {
          return <Navigate to="/" replace />;
        }
        return <ManagerPortal onLogout={logout} auth={auth} />;
    }

    if (path.startsWith("/employee")) {
        if (activePortalRole !== "Employee" && activePortalRole !== "Admin" && !isHrUser) {
          return <Navigate to="/" replace />;
        }
        return <EmployeePortal onLogout={logout} auth={auth} />;
    }

    const legacySegment = path.replace(/^\//, "").split("/")[0];
    if (EMPLOYEE_LEGACY_TABS.has(legacySegment)) {
      if (activePortalRole === "Employee" || activePortalRole === "Admin") {
        const dest = legacySegment === "profile" ? "/employee" : `/employee/${legacySegment}`;
        return <Navigate to={dest} replace />;
      }
    }
    if (MANAGER_LEGACY_TABS.has(legacySegment)) {
      if (canAccessManagerPortal(auth, activePortalRole, isHrUser, hasReportees)) {
        const dest = legacySegment === "team" ? "/manager" : `/manager/${legacySegment}`;
        return <Navigate to={dest} replace />;
      }
    }

    return <AppNotFound />;
  };

  return (
    <>
      <SessionTimeoutManager signedIn={Boolean(auth)} onExpire={logout} />
      <Suspense fallback={<PortalLoader />}>{renderPortal()}</Suspense>
    </>
  );
}
