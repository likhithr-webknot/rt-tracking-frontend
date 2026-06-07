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
import { QA_DEV_ACCOUNTS, normalizeQaSeedResponse } from "../../utils/qaDevAccounts";
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
  { icon: Target, label: "Monthly goals and reviews in one place" },
  { icon: Sparkles, label: "Company values with simple scoring" },
  { icon: Users, label: "Separate spaces for employees, managers, and HR" },
];

export default function LoginPage() {
  const googleSignInUrl = getGoogleSignInUrl() || "/api/v1/google-signin";
  const [oauthBusy, setOauthBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedMessage, setSeedMessage] = useState("");
  const [seededAccounts, setSeededAccounts] = useState(QA_DEV_ACCOUNTS);

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
      const accounts = normalizeQaSeedResponse(res);
      if (accounts.length) setSeededAccounts(accounts);
      setSeedMessage("QA test users seeded (qa.* only). Super Admin accounts are not modified by this app.");
    } catch (err) {
      setSeedMessage(err?.message || "Could not seed QA users. Is Webtrak running with SPRING_PROFILES_ACTIVE=dev?");
    } finally {
      setSeedBusy(false);
    }
  }, []);

  const displayError = formError || authErrorMessage;

  return (
    <div className="pulse-login">
      <div className="pulse-login-shell">
        <section className="pulse-login-intro">
          <div className="flex items-center gap-3">
            <CompanyLogo size={44} alt="Webknot" className="h-11 w-11" />
            <div>
              <p className="text-base font-bold tracking-tight text-[rgb(var(--text))]">Webknot Pulse</p>
              <p className="text-sm text-[rgb(var(--muted))]">Reviews, goals, and team growth</p>
            </div>
          </div>

          <div className="mt-10 space-y-4">
            <p className="pulse-eyebrow">Welcome</p>
            <h1 className="pulse-title max-w-lg">Simple monthly reviews — no spreadsheets.</h1>
            <p className="pulse-lead max-w-lg">
              Employees submit reviews. Managers score their teams. HR oversees the cycle — all in one
              place.
            </p>
          </div>

          <ul className="mt-8 space-y-3">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="pulse-login-feature">
                <span className="pulse-section-icon bg-[rgb(var(--accent-soft))] text-[rgb(var(--accent))]">
                  <Icon size={18} />
                </span>
                <span className="text-[15px] font-medium text-[rgb(var(--text))]">{label}</span>
              </li>
            ))}
          </ul>

          <p className="mt-auto hidden pt-10 text-sm text-[rgb(var(--muted))] lg:block">
            &copy; {new Date().getFullYear()} Webknot Technologies
          </p>
        </section>

        <section className="pulse-login-panel-wrap">
          <div className="pulse-surface pulse-login-card">
            <div className="lg:hidden mb-6 flex justify-center">
              <CompanyLogo size={56} alt="Webknot" className="h-14 w-14" />
            </div>

            <p className="pulse-eyebrow">Sign in</p>
            <h2 className="mt-2 pulse-title text-[1.65rem] sm:text-[1.85rem]">Continue to Pulse</h2>
            <p className="mt-2 pulse-lead">{webknotEmailHint()}</p>

            {displayError ? (
              <div role="alert" className="pulse-callout pulse-callout--warn mt-6">
                {displayError}
              </div>
            ) : null}

            <form className="mt-6 space-y-4" onSubmit={onPasswordSubmit}>
              <label className="block">
                <span className="text-sm font-semibold text-[rgb(var(--text))]">Work email</span>
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
                <span className="text-sm font-semibold text-[rgb(var(--text))]">Password</span>
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
                <Link to="/auth/forgot-password" className="font-semibold text-[rgb(var(--accent))] hover:underline">
                  Forgot password?
                </Link>
              </div>
              <button
                type="submit"
                disabled={passwordBusy}
                className="rt-btn-primary flex w-full items-center justify-center gap-2 py-3"
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

            <div className="pulse-login-divider my-7">
              <span>or</span>
            </div>

            <a
              href={googleSignInUrl}
              onClick={onGoogleClick}
              className="pulse-login-oauth group"
              aria-busy={oauthBusy}
            >
              {oauthBusy ? (
                <>
                  <Loader2 size={22} className="animate-spin text-[rgb(var(--accent))]" />
                  <span className="flex-1 text-center font-semibold">Opening Google…</span>
                </>
              ) : (
                <>
                  <GoogleIcon />
                  <span className="flex-1 text-center font-semibold">Continue with Google</span>
                  <ArrowRight
                    size={20}
                    className="opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:opacity-80"
                  />
                </>
              )}
            </a>

            <div className="pulse-callout pulse-callout--info mt-6">
              <Shield size={20} className="mt-0.5 shrink-0 text-[rgb(var(--accent))]" />
              <p className="text-[14px] leading-relaxed">
                Google uses your <strong className="font-semibold text-[rgb(var(--text))]">{WEBKNOT_WORK_EMAIL_SUFFIX}</strong>{" "}
                account. Password login uses a secure hash stored on the server.
              </p>
            </div>

            {import.meta.env?.DEV && String(import.meta.env?.VITE_ENABLE_DEV_QA ?? "") === "true" ? (
              <div className="pulse-surface-muted mt-6 text-[13px] leading-relaxed text-[rgb(var(--muted))]">
                <p className="font-semibold text-[rgb(var(--text))]">Dev QA accounts</p>
                <p className="mt-1 text-[12px]">
                  Run <code className="text-[11px]">npm run seed:minimal</code> for directory rows + QA Demo Project.
                </p>
                <div className="mt-3 overflow-x-auto rounded-lg border border-[rgb(var(--border))]">
                  <table className="w-full min-w-[20rem] text-left text-[12px]">
                    <thead className="bg-[rgb(var(--surface-2))] text-[10px] uppercase tracking-wider text-[rgb(var(--muted))]">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Role</th>
                        <th className="px-3 py-2 font-semibold">Email</th>
                        <th className="px-3 py-2 font-semibold">Password</th>
                      </tr>
                    </thead>
                    <tbody>
                      {seededAccounts.map((row) => (
                        <tr key={row.email} className="border-t border-[rgb(var(--border))]">
                          <td className="px-3 py-2 text-[rgb(var(--text))]">{row.role}</td>
                          <td className="px-3 py-2 font-mono text-[11px] break-all">{row.email}</td>
                          <td className="px-3 py-2 font-mono text-[11px] text-[rgb(var(--text))]">{row.password}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button type="button" onClick={onSeedQa} disabled={seedBusy} className="rt-btn-secondary mt-3 w-full text-sm py-2.5">
                  {seedBusy ? "Seeding…" : "Seed QA users on backend"}
                </button>
                {seedMessage ? <p className="mt-2 text-[rgb(var(--text))]">{seedMessage}</p> : null}
              </div>
            ) : null}
          </div>

          <p className="mt-6 text-center text-sm text-[rgb(var(--muted))] lg:hidden">
            &copy; {new Date().getFullYear()} Webknot Technologies
          </p>
        </section>
      </div>
    </div>
  );
}
