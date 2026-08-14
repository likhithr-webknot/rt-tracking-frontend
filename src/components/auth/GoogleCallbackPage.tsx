import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  setAuth,
  fetchMe,
  clearAuth,
  consumeOAuthTokenFromUrl,
  completeGoogleAuthCode,
  stripOAuthParamsFromUrl,
  decodeJwtPayload,
  extractEmailFromSources,
  getAuth,
} from "../../api/auth";
import { isWebknotWorkEmail } from "../../utils/webknotEmail";
import { Loader2 } from "lucide-react";
import CompanyLogo from "../shared/CompanyLogo";

function getCallbackParam(key: string) {
  if (typeof window === "undefined") return "";
  const search = new URLSearchParams(String(window.location.search || ""));
  const hash = new URLSearchParams(
    window.location.hash && window.location.hash.length > 1 ? window.location.hash.slice(1) : ""
  );
  return String(search.get(key) || hash.get(key) || "").trim();
}

function emailFromToken(token: string) {
  const claims = token ? decodeJwtPayload(token) : null;
  return extractEmailFromSources({}, claims || {});
}

export default function GoogleCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

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

        const authCode =
          getCallbackParam("code") ||
          String(searchParams.get("code") || "").trim();

        if (authCode) {
          await completeGoogleAuthCode(authCode);
          if (cancelled) return;
          stripOAuthParamsFromUrl();
          navigate("/", { replace: true });
          return;
        }

        const token =
          consumeOAuthTokenFromUrl() ||
          searchParams.get("token") ||
          searchParams.get("accessToken") ||
          searchParams.get("access_token") ||
          searchParams.get("jwt") ||
          "";

        const email = emailFromToken(token);
        if (email && !isWebknotWorkEmail(email)) {
          clearAuth();
          navigate("/?error=invalid_domain", { replace: true });
          return;
        }

        const existing = getAuth() || {};
        if (token) {
          const claims = decodeJwtPayload(token);
          setAuth({
            ...existing,
            token,
            email: email || existing.email,
            employeeName:
              existing.employeeName ||
              String(claims?.name ?? claims?.given_name ?? "").trim() ||
              undefined,
          });
        }

        try {
          const user = await fetchMe();
          if (cancelled) return;

          if (!user) {
            throw new Error("Not authenticated.");
          }

          const merged = token ? { ...user, token } : user;
          setAuth(merged);
          navigate("/", { replace: true });
        } catch (meErr) {
          if (cancelled) return;
          throw meErr;
        }
      } catch (err) {
        if (cancelled) return;
        const code = String((err as { code?: string })?.code ?? "").trim();
        const message = (err as Error)?.message || "Unable to complete authentication.";
        const errorKey =
          code === "unregistered_user" || /not registered/i.test(message)
            ? "unregistered_user"
            : code === "invalid_domain"
              ? "invalid_domain"
              : "auth_failed";
        setError(`Authentication failed: ${message}. Redirecting to login...`);
        setTimeout(() => navigate(`/?error=${encodeURIComponent(errorKey)}`, { replace: true }), 4000);
      }
    };

    completeAuth();
    return () => {
      cancelled = true;
    };
  }, [searchParams, navigate]);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-black text-white">
      <div className="w-[min(92vw,460px)] rounded-2xl border border-white/10 bg-black/60 px-6 py-7 text-center backdrop-blur-md">
        <CompanyLogo size={44} className="mx-auto h-11 w-11" aria-hidden />
        <div className="mx-auto mt-4 grid h-9 w-9 place-items-center rounded-md border border-blue-500/30 bg-blue-500/10">
          <Loader2 className="animate-spin text-blue-400" size={20} />
        </div>
        <h1 className="mt-4 text-xl font-semibold">Completing sign in</h1>
        <p className="mt-2 text-sm text-slate-400">Securing your session and opening Webknot Pulse.</p>
        {error ? (
          <div className="mt-4 rounded-md border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-300">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
