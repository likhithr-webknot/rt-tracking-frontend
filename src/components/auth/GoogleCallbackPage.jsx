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

export default function GoogleCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const completeAuth = async () => {
      try {
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
        setTimeout(() => navigate("/", { replace: true }), 4000);
      }
    };

    completeAuth();
    return () => {
      cancelled = true;
    };
  }, [searchParams, navigate]);

  return (
    <div className="w-full h-screen flex flex-col items-center justify-center bg-[rgb(var(--bg))] text-[rgb(var(--text))]">
      <div className="flex items-center gap-3 text-lg font-semibold">
        <Activity className="animate-spin text-[rgb(var(--primary))]" size={24} />
        <p>Completing authentication, please wait...</p>
      </div>
      {error && (
        <div className="mt-4 text-red-500 bg-red-500/10 border border-red-500/20 rounded-md px-4 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
