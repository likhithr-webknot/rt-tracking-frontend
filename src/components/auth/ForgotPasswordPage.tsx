import { useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import Toast from "../shared/Toast";
import CompanyLogo from "../shared/CompanyLogo";
import { requestPasswordReset } from "../../api/password-auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const showToast = useCallback((next) => {
    setToast(next);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    const em = String(email).trim();
    if (!em) {
      showToast({ title: "Email required", message: "Enter the email you use to sign in.", tone: "error" });
      return;
    }
    setBusy(true);
    try {
      await requestPasswordReset(em);
      setDone(true);
      showToast({ title: "Request sent", message: "If that account exists, a reset message was queued.", tone: "primary" });
    } catch (err) {
      showToast({
        title: "Request failed",
        message: err?.message || "Could not start password reset.",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  const q = encodeURIComponent(String(email).trim());

  return (
    <div className="rt-shell grid place-items-center px-4 py-10 min-h-screen bg-[rgb(var(--bg))] text-[rgb(var(--text))]">
      <div className="w-full max-w-md rt-panel p-6 sm:p-8 shadow-xl">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--muted))] hover:text-[rgb(var(--primary))] mb-6"
        >
          <ArrowLeft size={14} /> Back to sign in
        </Link>
        <CompanyLogo size={40} className="h-10 w-10 mb-4" aria-hidden />
        <div className="rt-kicker">Account recovery</div>
        <h1 className="text-xl font-bold mt-2 tracking-tight">Forgot password</h1>
        <p className="text-sm text-[rgb(var(--muted))] mt-2 leading-relaxed">
          Enter your email. If it matches an account, you will receive a message with a one-time code. Then you can choose a new password.
        </p>

        {done ? (
          <div className="mt-6 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
            If an account exists for that address, check your inbox for the code, then continue to reset your password.
            <div className="mt-4">
              <Link
                to={q ? `/auth/reset-password?email=${q}` : "/auth/reset-password"}
                className="rt-btn-primary inline-flex items-center justify-center w-full text-sm"
              >
                Enter code and new password
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="fp-email" className="block text-xs font-medium text-[rgb(var(--muted))] mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgb(var(--muted))]" />
                <input
                  id="fp-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rt-input w-full pl-10 py-2.5 text-sm"
                  placeholder="you@company.com"
                  disabled={busy}
                />
              </div>
            </div>
            <button type="submit" disabled={busy} className="w-full rt-btn-primary flex items-center justify-center gap-2 py-2.5">
              {busy ? <Loader2 size={16} className="animate-spin" /> : null}
              Send reset email
            </button>
          </form>
        )}
      </div>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
