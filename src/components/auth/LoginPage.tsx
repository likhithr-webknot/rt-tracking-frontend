// @ts-nocheck
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Loader2,
  Mail,
  Shield,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import {
  completePasswordLogin,
  getGoogleSignInUrl,
  seedDevQaUsers,
} from "../../api/auth";
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

const FEATURES = [
  { icon: Target, label: "Monthly goals & reviews in one place" },
  { icon: Sparkles, label: "Company values — simple scoring" },
  { icon: Users, label: "Separate spaces for you, your manager, and HR" },
];

const QA_HINT = "WebknotQA#Test1";

export default function LoginPage() {
  const googleSignInUrl = getGoogleSignInUrl() || "/api/v1/google-signin";
  const [oauthBusy, setOauthBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedMessage, setSeedMessage] = useState("");

  const authErrorKey =
    typeof window === "undefined"
      ? ""
      : String(new URLSearchParams(window.location.search || "").get("error") || "")
          .trim()
          .toLowerCase();

  const authErrorMessage =
    authErrorKey === "invalid_domain"
      ? `Please use your Webknot Google account (${WEBKNOT_WORK_EMAIL_SUFFIX}).`
      : authErrorKey === "unregistered_user"
        ? "We don't have your account yet. Ask HR to add you, then try again."
        : authErrorKey === "auth_failed"
          ? "Sign-in didn't work. Please try again in a moment."
          : "";

  const onGoogleClick = useCallback(() => {
    setOauthBusy(true);
  }, []);

  const onPasswordSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      setFormError("");
      setPasswordBusy(true);
      try {
        await completePasswordLogin(email, password);
      } catch (err) {
        setFormError(err?.message || "Sign-in failed.");
      } finally {
        setPasswordBusy(false);
      }
    },
    [email, password],
  );

  const onSeedQa = useCallback(async () => {
    setSeedMessage("");
    setSeedBusy(true);
    try {
      const res = await seedDevQaUsers();
      const pw = res?.password || res?.data?.password || QA_HINT;
      setSeedMessage(`QA users ready. Password for qa.* accounts: ${pw}`);
    } catch (err) {
      setSeedMessage(err?.message || "Could not seed QA users. Is Webtrak running with SPRING_PROFILES_ACTIVE=dev?");
    } finally {
      setSeedBusy(false);
    }
  }, []);

  const displayError = formError || authErrorMessage;

  return (
    <div className="rt-login-page relative min-h-[100dvh] overflow-hidden">
      <div className="rt-login-bg" aria-hidden />
      <div className="rt-login-grid" aria-hidden />
      <div className="rt-login-orb rt-login-orb--1" aria-hidden />
      <div className="rt-login-orb rt-login-orb--2" aria-hidden />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col lg:flex-row lg:items-stretch">
        <section className="flex flex-1 flex-col justify-between px-6 py-10 sm:px-10 lg:px-12 lg:py-14">
          <div>
            <div className="flex items-center gap-3">
              <CompanyLogo size={44} alt="Webknot" className="h-11 w-11" />
              <div>
                <p className="text-base font-bold tracking-tight text-[rgb(var(--text))]">Webknot Pulse</p>
                <p className="text-sm text-[rgb(var(--muted))]">Reviews, goals & team growth</p>
              </div>
            </div>

            <h1 className="mt-10 max-w-lg text-3xl sm:text-4xl lg:text-[2.65rem] font-bold tracking-tight text-[rgb(var(--text))] leading-[1.12]">
              Simple monthly reviews — no spreadsheets.
            </h1>
            <p className="mt-4 max-w-lg text-base text-[rgb(var(--muted))] leading-relaxed">
              Employees fill in their review. Managers score their team. HR oversees the cycle — all in one
              friendly app.
            </p>

            <ul className="mt-8 flex flex-col gap-3">
              {FEATURES.map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="flex items-center gap-3 rounded-xl border border-[rgb(var(--border))]/80 bg-[rgb(var(--surface))]/80 px-4 py-3.5 text-[15px] font-medium text-[rgb(var(--text))]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--accent))]/12 text-[rgb(var(--accent))]">
                    <Icon size={20} />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-10 hidden lg:block text-sm text-[rgb(var(--muted))]">
            &copy; {new Date().getFullYear()} Webknot Technologies
          </p>
        </section>

        <section className="flex flex-1 items-center justify-center px-6 pb-10 pt-4 lg:px-10 lg:py-14">
          <div className="rt-login-card w-full max-w-[440px]">
            <div className="lg:hidden flex justify-center mb-6">
              <CompanyLogo size={56} alt="Webknot" className="h-14 w-14" />
            </div>

            <p className="rt-kicker text-center lg:text-left">Sign in</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-[rgb(var(--text))] text-center lg:text-left">
              Google or email & password
            </h2>
            <p className="mt-3 text-[15px] text-[rgb(var(--muted))] text-center lg:text-left leading-relaxed">
              {webknotEmailHint()}
            </p>

            {displayError ? (
              <div
                role="alert"
                className="mt-6 rounded-[var(--radius-lg)] border border-[rgb(var(--danger))]/35 bg-[rgb(var(--danger-soft))] px-4 py-3.5 text-[15px] font-medium text-[rgb(var(--danger))] leading-relaxed"
              >
                {displayError}
              </div>
            ) : null}

            <form className="mt-6 space-y-4" onSubmit={onPasswordSubmit}>
              <label className="block">
                <span className="text-sm font-medium text-[rgb(var(--text))]">Work email</span>
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rt-input mt-1.5 w-full"
                  placeholder={`you${WEBKNOT_WORK_EMAIL_SUFFIX}`}
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-[rgb(var(--text))]">Password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rt-input mt-1.5 w-full"
                  required
                />
              </label>
              <div className="flex items-center justify-between gap-2 text-sm">
                <Link
                  to="/auth/forgot-password"
                  className="font-medium text-[rgb(var(--accent))] hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <button
                type="submit"
                disabled={passwordBusy}
                className="rt-btn-primary w-full flex items-center justify-center gap-2 py-3.5"
              >
                {passwordBusy ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    <Mail size={18} />
                    Sign in with password
                  </>
                )}
              </button>
            </form>

            <div className="rt-login-divider my-7">
              <span className="text-sm text-[rgb(var(--muted))]">or</span>
            </div>

            <a
              href={googleSignInUrl}
              onClick={onGoogleClick}
              className="rt-login-oauth-btn group"
              aria-busy={oauthBusy}
            >
              {oauthBusy ? (
                <>
                  <Loader2 size={22} className="animate-spin text-[rgb(var(--accent))]" />
                  <span className="flex-1 text-center font-semibold text-[15px]">Opening Google…</span>
                </>
              ) : (
                <>
                  <GoogleIcon />
                  <span className="flex-1 text-center font-semibold text-[15px]">Continue with Google</span>
                  <ArrowRight
                    size={20}
                    className="opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:opacity-80"
                  />
                </>
              )}
            </a>

            <div className="mt-6 flex items-start gap-3 rounded-[var(--radius-lg)] border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-4 py-4">
              <Shield size={20} className="mt-0.5 shrink-0 text-[rgb(var(--accent))]" />
              <p className="text-[14px] leading-relaxed text-[rgb(var(--muted))]">
                Google uses your <strong className="font-semibold text-[rgb(var(--text))]">{WEBKNOT_WORK_EMAIL_SUFFIX}</strong>{" "}
                account. Password login uses a secure hash stored on the server (JWT + session cookies).
              </p>
            </div>

            {import.meta.env?.DEV ? (
              <div className="mt-6 rounded-[var(--radius-lg)] border border-dashed border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]/80 px-4 py-4 text-[13px] text-[rgb(var(--muted))] leading-relaxed">
                <p className="font-semibold text-[rgb(var(--text))]">Dev QA accounts</p>
                <p className="mt-1">
                  After seeding: <code className="text-[12px]">{QA_HINT}</code> for{" "}
                  <code className="text-[12px]">qa.*@webknot.in</code>
                </p>
                <ul className="mt-2 list-disc pl-5 space-y-0.5">
                  <li>qa.employee.one@webknot.in — Employee</li>
                  <li>qa.employee.two@webknot.in — Employee</li>
                  <li>qa.manager.one@webknot.in — Manager</li>
                </ul>
                <p className="mt-2 font-medium text-[rgb(var(--text))]">
                  Manager login: use <code className="text-[12px]">qa.manager.one@webknot.in</code> with the password
                  above, then click <strong>Seed QA users</strong> if sign-in fails. You should land in the Manager portal
                  (not Employee). Real managers need Google or a password set by HR.
                </p>
                <p className="mt-2">
                  Backend must run with <code className="text-[12px]">webtrak.env=dev</code> (or default dev) for seeding.
                </p>
                <button
                  type="button"
                  onClick={onSeedQa}
                  disabled={seedBusy}
                  className="mt-3 rt-btn-secondary w-full text-sm py-2.5"
                >
                  {seedBusy ? "Seeding…" : "Seed QA users on backend"}
                </button>
                {seedMessage ? <p className="mt-2 text-[rgb(var(--text))]">{seedMessage}</p> : null}
              </div>
            ) : null}
          </div>

          <p className="lg:hidden absolute bottom-6 left-0 right-0 text-center text-sm text-[rgb(var(--muted))]">
            &copy; {new Date().getFullYear()} Webknot Technologies
          </p>
        </section>
      </div>
    </div>
  );
}
