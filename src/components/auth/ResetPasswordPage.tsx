import { useState, useCallback, useRef, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, KeyRound } from "lucide-react";
import Toast from "../shared/Toast";
import CompanyLogo from "../shared/CompanyLogo";
import { resetPasswordWithCode } from "../../api/password-auth";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(() => String(searchParams.get("email") || "").trim());
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  useEffect(() => {
    const e = String(searchParams.get("email") || "").trim();
    if (e) setEmail(e);
  }, [searchParams]);

  const showToast = useCallback((next) => {
    setToast(next);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    const em = String(email).trim();
    const c = String(code).trim();
    if (!em || !c) {
      showToast({ title: "Missing fields", message: "Email and the code from your email are required.", tone: "error" });
      return;
    }
    if (newPassword.length < 8) {
      showToast({ title: "Password too short", message: "Use at least 8 characters.", tone: "error" });
      return;
    }
    if (newPassword !== confirm) {
      showToast({ title: "Mismatch", message: "New password and confirmation do not match.", tone: "error" });
      return;
    }
    setBusy(true);
    try {
      await resetPasswordWithCode({ email: em, code: c, newPassword });
      showToast({ title: "Password updated", message: "You can sign in with your new password.", tone: "primary" });
      setTimeout(() => {
        window.location.assign("/");
      }, 1200);
    } catch (err) {
      showToast({
        title: "Reset failed",
        message: err?.message || "Invalid code or expired link.",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

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
        <h1 className="text-xl font-bold mt-2 tracking-tight flex items-center gap-2">
          <KeyRound size={22} className="text-[rgb(var(--primary))]" />
          Set new password
        </h1>
        <p className="text-sm text-[rgb(var(--muted))] mt-2 leading-relaxed">
          Enter the code from your email, then choose a new password. After success, sign in with email and password.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="rp-email" className="block text-xs font-medium text-[rgb(var(--muted))] mb-1.5">
              Email
            </label>
            <input
              id="rp-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rt-input w-full py-2.5 text-sm"
              placeholder="you@company.com"
              disabled={busy}
            />
          </div>
          <div>
            <label htmlFor="rp-code" className="block text-xs font-medium text-[rgb(var(--muted))] mb-1.5">
              Code from email
            </label>
            <input
              id="rp-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="rt-input w-full py-2.5 text-sm font-mono tracking-wider"
              placeholder="6–8 digit code"
              disabled={busy}
            />
          </div>
          <div>
            <label htmlFor="rp-pw" className="block text-xs font-medium text-[rgb(var(--muted))] mb-1.5">
              New password
            </label>
            <input
              id="rp-pw"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="rt-input w-full py-2.5 text-sm"
              placeholder="At least 8 characters"
              disabled={busy}
            />
          </div>
          <div>
            <label htmlFor="rp-pw2" className="block text-xs font-medium text-[rgb(var(--muted))] mb-1.5">
              Confirm new password
            </label>
            <input
              id="rp-pw2"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="rt-input w-full py-2.5 text-sm"
              disabled={busy}
            />
          </div>
          <button type="submit" disabled={busy} className="w-full rt-btn-primary flex items-center justify-center gap-2 py-2.5">
            {busy ? <Loader2 size={16} className="animate-spin" /> : null}
            Update password
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-[rgb(var(--muted))]">
          Did not get a code?{" "}
          <Link to="/auth/forgot-password" className="text-[rgb(var(--primary))] underline underline-offset-2">
            Request again
          </Link>
        </p>
      </div>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
