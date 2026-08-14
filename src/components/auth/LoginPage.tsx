// @ts-nocheck
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, Shield, Sparkles, Target, Users } from "lucide-react";
import { getGoogleSignInUrl, seedDevQaUsers } from "../../api/auth";
import { WEBKNOT_WORK_EMAIL_SUFFIX, webknotEmailHint } from "../../utils/webknotEmail";
import { QA_DEV_ACCOUNTS, normalizeQaSeedResponse } from "../../utils/qaDevAccounts";
import CompanyLogo from "../shared/CompanyLogo";
import ThemeToggle from "../shared/ThemeToggle";
import Toast from "../shared/Toast";

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

const FEATURES = [
  { icon: Target, label: "Monthly goals & reviews", detail: "One place for the whole cycle" },
  { icon: Sparkles, label: "Company values", detail: "Simple, consistent scoring" },
  { icon: Users, label: "Role-based workspaces", detail: "Employee, manager & HR views" },
];

function resolveAuthErrorKey() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search || "");
  const fromQuery = String(params.get("error") || "").trim().toLowerCase();
  if (fromQuery) return fromQuery;

  const segment = window.location.pathname.replace(/^\//, "").split("/").filter(Boolean)[0] || "";
  const lower = segment.toLowerCase();
  if (lower.startsWith("error-")) return lower.slice("error-".length);
  if (lower === "error") return fromQuery || "auth_failed";
  return "";
}

function authErrorCopy(key) {
  if (key === "invalid_domain") {
    return {
      title: "Wrong Google account",
      message: `Please sign in with your Webknot work email (${WEBKNOT_WORK_EMAIL_SUFFIX}).`,
    };
  }
  if (key === "unregistered_user") {
    return {
      title: "Account not found",
      message: "We don't have your profile yet. Ask HR to add you in Webtrak, then try again.",
    };
  }
  if (key === "auth_failed" || key === "oauth_login_cancelled") {
    return {
      title: "Sign-in interrupted",
      message: "Google couldn't complete sign-in. Check your connection and try again.",
    };
  }
  if (key) {
    return {
      title: "Sign-in issue",
      message: "Something went wrong during authentication. Please try again.",
    };
  }
  return null;
}

function normalizeLoginUrl() {
  if (typeof window === "undefined") return;
  const key = resolveAuthErrorKey();
  const path = window.location.pathname;
  if (key && path !== "/" && path !== "") {
    window.history.replaceState({}, "", `/?error=${encodeURIComponent(key)}`);
  } else if (key && path === "/" && window.location.search.includes("error=")) {
    return;
  } else if (!key && (path.startsWith("/error") || window.location.search.includes("error="))) {
    window.history.replaceState({}, "", "/");
  }
}

export default function LoginPage() {
  const googleSignInUrl = getGoogleSignInUrl();
  const [oauthBusy, setOauthBusy] = useState(false);
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedMessage, setSeedMessage] = useState("");
  const [toast, setToast] = useState(null);
  const toastBootstrapped = useRef(false);

  const dismissToast = useCallback(() => {
    setToast(null);
    if (typeof window !== "undefined" && window.location.search.includes("error=")) {
      window.history.replaceState({}, "", "/");
    }
  }, []);

  useEffect(() => {
    normalizeLoginUrl();
    if (toastBootstrapped.current) return;
    toastBootstrapped.current = true;

    const key = resolveAuthErrorKey();
    const copy = authErrorCopy(key);
    if (copy) {
      setToast({ title: copy.title, message: copy.message, tone: "error", ts: Date.now() });
      return;
    }

    if (!googleSignInUrl) {
      setToast({
        title: "Google sign-in not configured",
        message: "Add VITE_GOOGLE_CLIENT_ID to .env.local and restart the dev server.",
        tone: "error",
        ts: Date.now(),
      });
    }
  }, [googleSignInUrl]);

  const onGoogleClick = useCallback(() => {
    if (!googleSignInUrl) return;
    setOauthBusy(true);
  }, [googleSignInUrl]);

  const onSeedQa = useCallback(async () => {
    setSeedMessage("");
    setSeedBusy(true);
    try {
      const res = await seedDevQaUsers();
      const accounts = normalizeQaSeedResponse(res);
      setToast({
        title: "QA users seeded",
        message: `${accounts.length || QA_DEV_ACCOUNTS.length} dev accounts ready on the backend.`,
        tone: "success",
        ts: Date.now(),
      });
    } catch (err) {
      setToast({
        title: "Seed failed",
        message: err?.message || "Could not seed QA users.",
        tone: "error",
        ts: Date.now(),
      });
    } finally {
      setSeedBusy(false);
    }
  }, []);

  return (
    <div className="pulse-login-v2">
      <Toast toast={toast} onDismiss={dismissToast} durationMs={toast?.tone === "error" ? 6000 : 3200} />

      <div className="pulse-login-v2__layout">
        <aside className="pulse-login-v2__brand" aria-label="Webknot Pulse overview">
          <div className="pulse-login-v2__brand-glow" aria-hidden />
          <div className="pulse-login-v2__brand-grid" aria-hidden />

          <div className="pulse-login-v2__brand-inner">
            <header className="flex items-center gap-3">
              <div className="pulse-login-v2__brand-mark">
                <CompanyLogo size={28} alt="" className="h-7 w-7" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-bold tracking-tight text-white">Webknot Pulse</p>
                <p className="truncate text-sm text-blue-100/85">Reviews, goals & team growth</p>
              </div>
            </header>

            <div className="mt-8 space-y-4 sm:mt-10 lg:mt-14">
              <span className="pulse-login-v2__eyebrow">Welcome back</span>
              <h1 className="pulse-login-v2__headline">
                Monthly reviews without the spreadsheet chaos.
              </h1>
              <p className="pulse-login-v2__subcopy max-w-lg">
                Employees submit, managers score, HR oversees — one calm workspace for your whole
                review cycle.
              </p>
            </div>

            <ul className="mt-8 hidden space-y-3 md:block lg:mt-10">
              {FEATURES.map(({ icon: Icon, label, detail }) => (
                <li key={label} className="pulse-login-v2__feature">
                  <span className="pulse-login-v2__feature-icon">
                    <Icon size={18} strokeWidth={2} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-white">{label}</span>
                    <span className="mt-0.5 block text-[13px] text-blue-100/75">{detail}</span>
                  </span>
                </li>
              ))}
            </ul>

            <p className="pulse-login-v2__brand-footer hidden md:block">
              &copy; {new Date().getFullYear()} Webknot Technologies
            </p>
          </div>
        </aside>

        <main className="pulse-login-v2__panel">
          <div className="pulse-login-v2__panel-toolbar">
            <ThemeToggle compact />
          </div>

          <div className="pulse-login-v2__panel-body">
            <div className="pulse-login-v2__card">
              <div className="pulse-login-v2__card-header">
                <div className="pulse-login-v2__card-logo md:hidden">
                  <CompanyLogo size={32} alt="Webknot" className="h-8 w-8" />
                </div>
                <p className="pulse-login-v2__kicker">Sign in</p>
                <h2 className="pulse-login-v2__card-title">Continue to Pulse</h2>
                <p className="pulse-login-v2__card-lead">{webknotEmailHint()}</p>
              </div>

              {googleSignInUrl ? (
                <a
                  href={googleSignInUrl}
                  onClick={onGoogleClick}
                  className="pulse-login-v2__google group"
                  aria-busy={oauthBusy}
                >
                  {oauthBusy ? (
                    <>
                      <Loader2 size={22} className="animate-spin text-[rgb(var(--accent))]" />
                      <span className="flex-1 text-center text-[15px] font-semibold">Opening Google…</span>
                    </>
                  ) : (
                    <>
                      <span className="pulse-login-v2__google-icon">
                        <GoogleIcon />
                      </span>
                      <span className="flex-1 text-center text-[15px] font-semibold text-[rgb(var(--text))]">
                        Continue with Google
                      </span>
                      <ArrowRight
                        size={18}
                        className="text-[rgb(var(--muted))] transition-transform group-hover:translate-x-0.5 group-hover:text-[rgb(var(--accent))]"
                      />
                    </>
                  )}
                </a>
              ) : (
                <button type="button" disabled className="pulse-login-v2__google opacity-60 cursor-not-allowed">
                  <span className="pulse-login-v2__google-icon">
                    <GoogleIcon />
                  </span>
                  <span className="flex-1 text-center text-[15px] font-semibold text-[rgb(var(--muted))]">
                    Google sign-in unavailable
                  </span>
                </button>
              )}

              <div className="pulse-login-v2__notice">
                <Shield size={18} className="mt-0.5 shrink-0 text-[rgb(var(--accent))]" strokeWidth={2} />
                <p>
                  Use your{" "}
                  <strong className="font-semibold text-[rgb(var(--text))]">{WEBKNOT_WORK_EMAIL_SUFFIX}</strong>{" "}
                  Google account. Password login is disabled.
                </p>
              </div>

              <ul className="mt-5 flex flex-wrap gap-2 md:hidden">
                {FEATURES.map(({ icon: Icon, label }) => (
                  <li key={label} className="pulse-login-v2__chip">
                    <Icon size={13} className="text-[rgb(var(--accent))]" />
                    {label}
                  </li>
                ))}
              </ul>

              {import.meta.env?.DEV && String(import.meta.env?.VITE_ENABLE_DEV_QA ?? "") === "true" ? (
                <details className="pulse-login-v2__dev mt-5">
                  <summary>Dev: QA seed</summary>
                  <p className="mt-2">Run <code>npm run seed:minimal</code> for demo data.</p>
                  <button type="button" onClick={onSeedQa} disabled={seedBusy} className="rt-btn-secondary mt-3 w-full py-2 text-sm">
                    {seedBusy ? "Seeding…" : "Seed QA users on backend"}
                  </button>
                  {seedMessage ? <p className="mt-2 text-[rgb(var(--text))]">{seedMessage}</p> : null}
                </details>
              ) : null}
            </div>

            <p className="pulse-login-v2__mobile-footer md:hidden">
              &copy; {new Date().getFullYear()} Webknot Technologies
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
