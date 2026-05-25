// @ts-nocheck
import { useCallback, useState } from "react";
import { ArrowRight, Loader2, Shield } from "lucide-react";
import { getGoogleSignInUrl } from "../../api/auth";
import { WEBKNOT_WORK_EMAIL_SUFFIX, webknotEmailHint } from "../../utils/webknotEmail";
import CompanyLogo from "../shared/CompanyLogo";

function GoogleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-5 w-5 shrink-0" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export default function LoginPage() {
  const googleSignInUrl = getGoogleSignInUrl() || "/api/v1/google-signin";
  const [oauthBusy, setOauthBusy] = useState(false);

  const authErrorKey =
    typeof window === "undefined"
      ? ""
      : String(new URLSearchParams(window.location.search || "").get("error") || "")
          .trim()
          .toLowerCase();

  const authErrorMessage =
    authErrorKey === "invalid_domain"
      ? `Use your company Google account (${WEBKNOT_WORK_EMAIL_SUFFIX}).`
      : authErrorKey === "unregistered_user"
        ? "Your account needs onboarding — contact HR after signing in."
        : authErrorKey === "auth_failed"
          ? "Sign-in could not be completed. Try again."
          : "";

  const onGoogleClick = useCallback(() => {
    setOauthBusy(true);
  }, []);

  return (
    <div className="rt-login-page relative min-h-[100dvh] overflow-hidden">
      <div className="rt-login-bg" aria-hidden />
      <div className="rt-login-grid" aria-hidden />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-6xl flex-col items-center justify-center px-6 py-16">
        <div className="rt-login-card w-full max-w-[440px]">
          <div className="flex flex-col items-center text-center">
            <CompanyLogo size={56} alt="Webknot" className="h-14 w-14 drop-shadow-sm" />
            <p className="rt-kicker mt-6">Webknot Pulse</p>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-[rgb(var(--text))] sm:text-[2rem]">
              Sign in to continue
            </h1>
            <p className="mt-2 text-sm text-[rgb(var(--muted))]">{webknotEmailHint()}</p>
          </div>

          {authErrorMessage ? (
            <div
              role="alert"
              className="mt-6 rounded-[var(--radius-lg)] border border-[rgb(var(--danger))]/25 bg-[rgb(var(--danger-soft))] px-4 py-3 text-sm font-medium text-[rgb(var(--danger))]"
            >
              {authErrorMessage}
            </div>
          ) : null}

          <a
            href={googleSignInUrl}
            onClick={onGoogleClick}
            className="rt-login-oauth-btn mt-8"
            aria-busy={oauthBusy}
          >
            {oauthBusy ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Redirecting to Google…
              </>
            ) : (
              <>
                <GoogleIcon />
                <span className="flex-1 text-center font-semibold">Continue with Google</span>
                <ArrowRight size={18} className="opacity-50" />
              </>
            )}
          </a>

          <div className="mt-8 flex items-start gap-3 rounded-[var(--radius-lg)] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]/80 px-4 py-3 text-left">
            <Shield size={18} className="mt-0.5 shrink-0 text-[rgb(var(--accent))]" />
            <p className="text-xs leading-relaxed text-[rgb(var(--muted))]">
              OAuth 2.0 via Google Workspace. Only <strong className="text-[rgb(var(--text))]">{WEBKNOT_WORK_EMAIL_SUFFIX}</strong>{" "}
              accounts are accepted. Sessions are secured with HttpOnly cookies and CSRF protection.
            </p>
          </div>
        </div>

        <p className="mt-10 text-center text-xs text-[rgb(var(--muted))]">
          KPIs · Webknot values · Reviews · Office · Notes
          <br />
          <span className="opacity-70">&copy; {new Date().getFullYear()} Webknot Technologies</span>
        </p>
      </div>
    </div>
  );
}
