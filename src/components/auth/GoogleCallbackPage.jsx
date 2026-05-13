import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  setAuth,
  fetchMe,
  clearAuth,
  clearManualLogoutMark,
  getOAuthTokenFromWindow,
  getAuth,
} from "../../api/auth.js";
import { Activity } from "lucide-react";

function getCallbackParam(key) {
  if (typeof window === "undefined") return "";
  const search = new URLSearchParams(String(window.location.search || ""));
  const hash = new URLSearchParams(
    window.location.hash && window.location.hash.length > 1 ? window.location.hash.slice(1) : ""
  );
  return String(search.get(key) || hash.get(key) || "").trim();
}

export default function GoogleCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const completeAuth = async () => {
      try {
        const callbackError = getCallbackParam("error");
        if (callbackError) {
          clearAuth();
          navigate(`/?error=${encodeURIComponent(callbackError)}`, { replace: true });
          return;
        }

        const token = getOAuthTokenFromWindow() ||
          searchParams.get("token") ||
          searchParams.get("accessToken") ||
          searchParams.get("access_token") ||
          searchParams.get("jwt") ||
          "";

        if (token) {
          clearAuth();
          setAuth({ token });
        }

        const user = await fetchMe();
        if (cancelled) return;
        if (!user) throw new Error("Not authenticated.");

        clearManualLogoutMark();
        /* Spread user first so URL/hash token wins over null/empty accessToken from API */
        setAuth(token ? { ...user, token } : user);
        console.log("[oauth] signed-in user role:", getAuth()?.role || "(not resolved)");
        navigate("/", { replace: true });
      } catch (err) {
        if (cancelled) return;
        const message = err?.message || "Unable to complete authentication.";
        setError(`Authentication failed: ${message}. Redirecting to login...`);
        setTimeout(() => navigate(`/?error=${encodeURIComponent("auth_failed")}`, { replace: true }), 4000);
      }
    };

    completeAuth();
    return () => {
      cancelled = true;
    };
  }, [searchParams, navigate]);

  return (
    <div className="w-full h-screen flex flex-col items-center justify-center bg-[rgb(var(--bg))] text-[rgb(var(--text))]">
      <div className="rt-panel w-[min(92vw,460px)] px-6 py-7 text-center">
        <div className="mx-auto h-11 w-11 rounded-md border border-[rgb(var(--primary)/0.25)] bg-[rgb(var(--primary-soft))] grid place-items-center">
          <Activity className="animate-spin text-[rgb(var(--primary))]" size={22} />
        </div>
        <h1 className="mt-4 text-xl font-semibold">Completing sign in</h1>
        <p className="mt-2 text-sm text-[rgb(var(--muted))]">
          Securing your session and opening the right workspace.
        </p>
        {error && (
          <div className="mt-4 text-red-500 bg-red-500/10 border border-red-500/20 rounded-md px-4 py-2 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
