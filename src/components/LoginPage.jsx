import { useState, useEffect } from "react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Briefcase, Award, TrendingUp as Profit, Headset, Zap, Copy, Check, Activity } from "lucide-react";
import { fetchMe, getAuth, login, setAuth, forgotPassword, resetPassword } from "../api/auth.js";
import { fetchPortalAdmin, fetchPortalEmployee, fetchPortalManager } from "../api/portal.js";

export default function LoginPage({ onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [metricIndex, setMetricIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");

  const hrEmail = "hr@webknot.in";
  const metrics = [
    { label: "Career Growth", value: "+42% Yearly", icon: <Briefcase size={20} className="text-blue-400" />, color: "bg-blue-500/10" },
    { label: "Salary Increment", value: "Top 5% Tier", icon: <Profit size={20} className="text-emerald-400" />, color: "bg-emerald-500/10" },
    { label: "Skill Mastery", value: "Level 9 Expert", icon: <Award size={20} className="text-purple-400" />, color: "bg-purple-500/10" }
  ];

  const chartData = [80, 140, 200, 260, 360, 290, 400, 320];
  const barWidth = 35;
  const spacing = 75;
  const chartBaseY = 450;
  const startX = 50;

  useEffect(() => {
    const timer = setInterval(() => {
      setMetricIndex((prev) => (prev + 1) % metrics.length);
    }, 3500);
    return () => clearInterval(timer);
  }, [metrics.length]);

  const handleCopy = () => {
    navigator.clipboard.writeText(hrEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const canSubmit = email.trim().length >= 5 && password.length >= 8;
  const canRequestReset = resetEmail.trim().toLowerCase().endsWith("@webknot.in");
  const passwordsMatch = newPassword.length >= 8 && newPassword === confirmNewPassword;

  const bounceTransition = (i) => ({
    duration: 3,
    repeat: Infinity,
    ease: "easeInOut",
    delay: i * 0.15,
  });

  return (
      <div className="fixed inset-0 flex flex-col md:flex-row w-full bg-[#0F0F0F] font-sans selection:bg-purple-500/30 overflow-hidden text-slate-100">

        {/* Left Panel - Responsive container */}
        <div className="flex w-full md:w-[35%] lg:w-[30%] xl:w-[25%] flex-col justify-between p-6 md:p-10 lg:p-12 z-40 bg-[#0F0F0F] border-r border-white/5 shadow-2xl overflow-y-auto">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl md:rounded-2xl bg-purple-600 text-white shadow-lg">
              <Zap size={22} fill="currentColor" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg md:text-xl font-black uppercase italic tracking-tight">Webknot</span>
              <span className="text-[10px] font-bold text-purple-400 uppercase tracking-[0.3em]">Technologies</span>
            </div>
          </div>

          <div className="w-full max-w-sm mx-auto my-8 md:my-0">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tighter">Login</h1>
            <p className="mt-2 text-sm text-gray-500 font-medium">Professional growth starts here.</p>

	            <form
	              className="mt-10 md:mt-12 space-y-6 md:space-y-8"
	              onSubmit={async (e) => {
	                e.preventDefault();
	                if (!canSubmit || submitting) return;
	                setSubmitError("");
                  setSubmitSuccess("");
			                setSubmitting(true);
			                try {
			                  const emailValue = email.trim().toLowerCase();
			                  const authRes = await login({ email: emailValue, password });
                      // Prime auth so portal calls can include a bearer token if the backend returns one.
                      setAuth({ ...authRes, email: emailValue });

                      const inferPortalKind = (obj) => {
                        const rawPortal = String(obj?.portal ?? "").trim().toLowerCase();
                        const rawRole = String(obj?.role ?? obj?.empRole ?? obj?.userRole ?? "").trim().toLowerCase();
                        if (rawPortal.includes("admin") || rawRole === "admin") return "admin";
                        if (rawPortal.includes("manager") || rawRole === "manager") return "manager";
                        return "employee";
                      };

                      // Prefer /auth/me when available, but fall back to the role-specific portal endpoint.
                      const me = await fetchMe().catch(() => null);
                      if (me) {
                        setAuth({ ...me, email: emailValue });
                        onLoginSuccess?.(getAuth() || me);
                        return;
                      }

                      const kind = inferPortalKind(authRes);
                      const fetchPortal =
                        kind === "admin"
                          ? fetchPortalAdmin
                          : kind === "manager"
                            ? fetchPortalManager
                            : fetchPortalEmployee;

                      let portal;
                      try {
                        portal = await fetchPortal();
                      } catch (err) {
                        if (err?.status === 403) {
                          throw new Error("Your account is not authorized for this portal.");
                        }
                        throw err;
                      }

                      const root =
                        portal?.data && typeof portal.data === "object" && !Array.isArray(portal.data)
                          ? portal.data
                          : portal;

                      // Try common shapes to extract user info.
                      const account =
                        root?.account ||
                        root?.employee ||
                        root?.me ||
                        root?.user ||
                        root?.profile ||
                        null;

                      setAuth({
                        ...(account && typeof account === "object" ? account : {}),
                        email: emailValue,
                        portal: kind,
                        role:
                          (account && (account.role || account.empRole || account.userRole)) ||
                          authRes?.role ||
                          authRes?.empRole ||
                          (kind === "admin" ? "Admin" : kind === "manager" ? "Manager" : "Employee"),
                      });
                      const finalAuth = getAuth();
                      onLoginSuccess?.(
                        finalAuth || {
                          email: emailValue,
                          portal: kind,
                          role: kind === "admin" ? "Admin" : kind === "manager" ? "Manager" : "Employee",
                        }
                      );
		                } catch (err) {
		                  const status = err?.status;
                      if (status === 401) {
                        setSubmitError("Invalid credentials or session not established.");
                      } else {
                        setSubmitError(err?.message || "Login failed. Please try again.");
                      }
		                } finally {
	                  setSubmitting(false);
	                }
	              }}
	            >
              <div className="space-y-1.5 md:space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Corporate Email</label>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border-b border-white/10 bg-transparent pb-2 md:pb-3 outline-none focus:border-purple-500 transition-all text-base md:text-lg"
                    placeholder="name@webknot.in"
                />
              </div>

              <div className="space-y-1.5 md:space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Access Key</label>
                <div className="relative">
                  <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full border-b border-white/10 bg-transparent pb-2 md:pb-3 pr-10 outline-none focus:border-purple-500 transition-all text-base md:text-lg"
                      placeholder="••••••••"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-0 bottom-3 text-gray-600 hover:text-purple-400">
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

		              <button
		                  disabled={!canSubmit || submitting}
		                  className="w-full rounded-xl bg-purple-600 py-3 md:py-4 font-black uppercase text-white hover:bg-purple-500 disabled:opacity-20 active:scale-95 transition-all shadow-lg text-sm md:text-base"
		              >
		                {submitting ? "Signing In…" : "Sign In"}
		              </button>

                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setShowResetModal(true);
                        setResetError("");
                        setResetSuccess("");
                        setResetEmail(email.trim() || "");
                      }}
                      className="text-xs font-black uppercase tracking-widest text-gray-500 hover:text-purple-300 transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
		
		              {submitError ? (
		                <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
		                  {submitError}
		                </div>
		              ) : null}
                  {submitSuccess ? (
                    <div className="text-sm text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                      {submitSuccess}
                    </div>
                  ) : null}
		            </form>
		          </div>

          <div className="flex justify-between items-center text-[10px] text-gray-700 font-bold uppercase tracking-widest">
            <span>© 2026 Webknot</span>
            <button onClick={() => setShowAdminModal(true)} className="hover:text-purple-500 transition-colors">
              <Headset size={14} className="inline mr-1" /> Support
            </button>
          </div>
        </div>

        {/* Right Visual Panel - Relative sizing for fit */}
        <div className="relative hidden md:flex flex-1 flex-col items-center justify-center bg-[#6344F5] overflow-hidden">
          <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: `linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)`, backgroundSize: '40px 40px' }} />
          <div className="absolute h-[50vw] w-[50vw] bg-white/10 rounded-full blur-[120px] animate-pulse" />

          <div className="relative z-10 w-full max-w-4xl text-center px-4">
            <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-[10px] font-bold text-white mb-4 uppercase tracking-widest">
                <Activity size={12} className="text-emerald-400" /> System Synchronized
              </div>
              <h2 className="text-[4rem] lg:text-[6rem] font-black text-white leading-tight tracking-tighter">PRECISION</h2>
              <h2 className="text-[4rem] lg:text-[6rem] font-black text-white/40 leading-[0.5] tracking-tighter">TRACKING</h2>
            </Motion.div>

            <div className="relative flex justify-center items-center w-full max-h-[500px]">
              {/* ViewBox based SVG for perfect screen fit */}
              <svg viewBox="0 0 650 500" className="w-full h-auto max-w-[650px] overflow-visible">
                <defs>
                  <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0.05)" />
                  </linearGradient>
                </defs>

	                {chartData.map((h, i) => {
	                  const x = startX + i * spacing;
	                  const nextH = chartData[i + 1];
	                  const nextX = startX + (i + 1) * spacing;
	                  const hVal = Number(h);
	                  const nextHVal = nextH === undefined ? null : Number(nextH);
	                  const safeH = Number.isFinite(hVal) ? hVal : 0;
	                  const safeNextH = nextHVal != null && Number.isFinite(nextHVal) ? nextHVal : null;
	                  const y = chartBaseY - safeH;

	                  return (
	                      <g key={`vis-${i}`}>
	                        <Motion.rect
	                            x={x}
	                            y={y}
	                            width={barWidth}
	                            height={safeH}
	                            rx="4"
	                            fill="url(#barGrad)"
	                            stroke="rgba(255,255,255,0.15)"
	                            initial={{ height: safeH, y }}
	                            animate={{ height: [safeH, safeH + 20, safeH], y: [y, y - 20, y] }}
	                            transition={bounceTransition(i)}
	                        />
	                        {safeNextH != null && (
	                            <Motion.line
	                                x1={x + barWidth / 2}
	                                y1={y}
	                                x2={nextX + barWidth / 2}
	                                y2={chartBaseY - safeNextH}
	                                stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeDasharray="4 4"
	                                initial={{
	                                  y1: y,
	                                  y2: chartBaseY - safeNextH,
	                                }}
	                                animate={{
	                                  y1: [y, y - 20, y],
	                                  y2: [
	                                    chartBaseY - safeNextH,
	                                    chartBaseY - (safeNextH + 20),
	                                    chartBaseY - safeNextH,
	                                  ],
	                                }}
	                                transition={bounceTransition(i)}
	                            />
	                        )}
	                        <Motion.circle
	                            cx={x + barWidth / 2}
	                            cy={y}
	                            r="4"
	                            fill="white"
	                            style={{ filter: "drop-shadow(0 0 8px #fff)" }}
	                            initial={{ cy: y, scale: 1 }}
	                            animate={{ cy: [y, y - 20, y], scale: [1, 1.2, 1] }}
	                            transition={bounceTransition(i)}
	                        />
	                      </g>
	                  );
	                })}
              </svg>

              {/* Metric Card - Percentage positioned */}
              <AnimatePresence mode="wait">
                <Motion.div
                    key={metricIndex}
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1, y: [0, -10, 0] }}
                    exit={{ x: -20, opacity: 0 }}
                    transition={{ x: { duration: 0.3 }, y: { duration: 4, repeat: Infinity, ease: "easeInOut" } }}
                    className="absolute -right-4 lg:-right-12 top-0 rounded-[2rem] bg-white p-6 lg:p-10 shadow-2xl w-64 lg:w-80 text-gray-900 border border-white/20"
                >
                  <div className="flex items-center gap-4 lg:gap-6">
                    <div className={`h-12 w-12 lg:h-16 lg:w-16 rounded-xl lg:rounded-2xl ${metrics[metricIndex].color} flex items-center justify-center`}>
                      {metrics[metricIndex].icon}
                    </div>
                    <div className="text-left overflow-hidden">
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 truncate">{metrics[metricIndex].label}</p>
                      <p className="text-xl lg:text-2xl font-black tracking-tighter whitespace-nowrap">{metrics[metricIndex].value}</p>
                    </div>
                  </div>
                </Motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Support Modal */}
          <AnimatePresence>
          {showAdminModal && (
              <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
                <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAdminModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
                <Motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-sm rounded-[2.5rem] bg-[#121212] border border-white/10 p-8 sm:p-10 shadow-2xl my-6 max-h-[90vh] overflow-y-auto">
                  <h3 className="text-2xl font-bold text-white tracking-tight">Support</h3>
                  <p className="mt-4 text-gray-400 text-sm">Talent Desk Assistance:</p>
                  <div className="mt-6 flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                    <span className="text-sm font-medium text-purple-300 truncate mr-2">{hrEmail}</span>
                    <button onClick={handleCopy} className="p-2 text-gray-400 hover:text-white shrink-0 transition-colors">
                      {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                    </button>
                  </div>
                  <button onClick={() => setShowAdminModal(false)} className="mt-10 w-full py-4 bg-white text-black font-black rounded-xl uppercase tracking-widest active:scale-95 transition-all">Close</button>
                </Motion.div>
              </div>
          )}
        </AnimatePresence>

        {/* Reset Password Modal */}
          <AnimatePresence>
          {showResetModal && (
            <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
              <Motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowResetModal(false)}
                className="absolute inset-0 bg-black/80 backdrop-blur-md"
              />
              <Motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="relative w-full max-w-lg rounded-[2.5rem] bg-[#121212] border border-white/10 p-6 sm:p-10 shadow-2xl my-6 max-h-[90vh] overflow-y-auto"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-black text-white tracking-tight">Reset Password</h3>
                    <p className="mt-2 text-sm text-gray-400">Request a reset token and set a new password.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowResetModal(false)}
                    className="rounded-xl p-2 text-gray-400 hover:text-white hover:bg-white/5 transition"
                    aria-label="Close"
                    title="Close"
                  >
                    ×
                  </button>
                </div>

                <div className="mt-8 space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Email</label>
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all"
                      placeholder="name@webknot.in"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">New Password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all"
                        placeholder="NewPass@123"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Confirm</label>
                      <input
                        type="password"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        className="w-full bg-[#0c0c0c] border border-white/10 rounded-2xl py-3 px-4 text-sm focus:border-purple-500 outline-none transition-all"
                        placeholder="Repeat password"
                      />
                    </div>
                  </div>

                  {resetError ? (
                    <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                      {resetError}
                    </div>
                  ) : null}
                  {resetSuccess ? (
                    <div className="text-sm text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                      {resetSuccess}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    disabled={!canRequestReset || !passwordsMatch || resetLoading}
                    onClick={async () => {
                      if (!canRequestReset || !passwordsMatch || resetLoading) return;
                      setResetError("");
                      setResetSuccess("");
                      setResetLoading(true);
                      try {
                        const tokenRes = await forgotPassword({ email: resetEmail.trim() });
                        const token = String(tokenRes?.resetToken ?? "").trim();
                        if (!token) throw new Error("Failed to generate reset token. Please contact support.");

                        const res = await resetPassword({ token, newPassword });
                        const text = typeof res === "string" ? res : "Password reset successful";
                        setResetSuccess(text || "Password reset successful");
                        setPassword("");
                        setSubmitError("");
                        setSubmitSuccess("Password reset successful. Please sign in again.");
                        setEmail(resetEmail.trim());
                        setShowResetModal(false);
                      } catch (err) {
                        setResetError(err?.message || "Password reset failed.");
                      } finally {
                        setResetLoading(false);
                      }
                    }}
                    className="w-full rounded-2xl bg-purple-600 py-4 font-black uppercase text-white hover:bg-purple-500 disabled:opacity-30 active:scale-[0.99] transition-all shadow-lg shadow-purple-900/20 text-sm"
                  >
                    {resetLoading ? "Resetting…" : "Reset Password"}
                  </button>
                </div>
              </Motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
  );
}
