import { useState } from "react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import {
  Eye,
  EyeOff,
  Headset,
  Copy,
  Check,
  Activity,
  ShieldCheck,
  Workflow,
  TimerReset,
  ClipboardCheck,
  BadgeCheck,
  TrendingUp,
  UserCircle2,
} from "lucide-react";
import { fetchMe, getAuth, login, setAuth, forgotPassword } from "../../api/auth.js";
import { fetchPortalAdmin, fetchPortalEmployee, fetchPortalManager } from "../../api/portal.js";

export default function LoginPage({ onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  const [resetEmail, setResetEmail] = useState("");
  const [resetRequestId, setResetRequestId] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");

  const hrEmail = "hr@webknot.in";
  const cockpitModes = [
    {
      id: "execution",
      label: "Execution",
      headline: "Submission Command Center",
      summary: "Track employee and manager throughput with approval-readiness controls.",
      readiness: 92,
      cycle: "Nov-Apr 2026 Cycle",
      stats: [
        { label: "On-time", value: "96%" },
        { label: "Escalations", value: "02" },
        { label: "SLA", value: "2.4h" },
      ],
      stages: [
        { title: "Employee Monthly Submit", detail: "312 finalized this cycle", status: "stable" },
        { title: "Manager Evaluations", detail: "284 reviewed with comments", status: "active" },
        { title: "Admin Decision Queue", detail: "41 pending actions", status: "watch" },
      ],
      icon: <Workflow size={16} className="text-cyan-200" />,
    },
    {
      id: "quality",
      label: "Quality",
      headline: "Review Quality Guardrail",
      summary: "Keep manager scoring consistent and reduce rejection churn across teams.",
      readiness: 88,
      cycle: "Nov-Apr 2026 Cycle",
      stats: [
        { label: "Coverage", value: "94%" },
        { label: "Re-opened", value: "11" },
        { label: "Drift", value: "3.2%" },
      ],
      stages: [
        { title: "Score Validation", detail: "Automated checks passed for 94%", status: "stable" },
        { title: "Policy Compliance", detail: "3 records flagged for review", status: "watch" },
        { title: "Feedback Quality", detail: "Average comment depth improved", status: "active" },
      ],
      icon: <ShieldCheck size={16} className="text-cyan-200" />,
    },
    {
      id: "cadence",
      label: "Cadence",
      headline: "Cycle Cadence Monitor",
      summary: "Protect monthly review rhythm and reduce approval bottlenecks.",
      readiness: 90,
      cycle: "Nov-Apr 2026 Cycle",
      stats: [
        { label: "Monthly Pulse", value: "Healthy" },
        { label: "Late Items", value: "07" },
        { label: "Avg Turnaround", value: "28h" },
      ],
      stages: [
        { title: "Window Management", detail: "Submission windows synced", status: "stable" },
        { title: "Review Load Balance", detail: "Manager load spread optimized", status: "active" },
        { title: "Finalization", detail: "Admin closure within target", status: "stable" },
      ],
      icon: <TimerReset size={16} className="text-cyan-200" />,
    },
  ];
  const activeCockpit = cockpitModes[0];
  const workflowPreview = [
    {
      id: "employee",
      label: "Employee",
      icon: <UserCircle2 size={13} className="text-cyan-200" />,
      title: "Employee Monthly Input",
      detail: "Employee submits one monthly review with KPI and Webknot ratings.",
      checkpoints: [
        "Profile verification complete",
        "Self review and ratings submitted",
        "Submission locked for manager review",
      ],
    },
    {
      id: "manager",
      label: "Manager",
      icon: <ClipboardCheck size={13} className="text-cyan-200" />,
      title: "Manager Evaluation",
      detail: "Manager reviews employee input, scores KPI/value items, and either submits or rejects with comments.",
      checkpoints: [
        "Employee submission alert received",
        "Manager ratings and comments added",
        "Reject or submit decision recorded",
      ],
    },
    {
      id: "admin",
      label: "Admin",
      icon: <BadgeCheck size={13} className="text-cyan-200" />,
      title: "Admin Closure",
      detail: "Admin validates cycle compliance and finalizes monthly outcomes with audit visibility.",
      checkpoints: [
        "Queue visibility by month and cycle",
        "Final validation on manager scores",
        "Decision closed with audit trail",
      ],
    },
  ];
  const activeWorkflowPreview = workflowPreview[0];

  const growthSeries = [82, 85, 86, 88, 90, 93, 95];
  const growthMin = Math.min(...growthSeries) - 2;
  const growthMax = Math.max(...growthSeries) + 2;
  const growthRange = Math.max(growthMax - growthMin, 1);
  const graphWidth = 280;
  const graphHeight = 140;
  const growthPoints = growthSeries.map((value, idx) => {
    const x = (idx / (growthSeries.length - 1 || 1)) * graphWidth;
    const y = graphHeight - ((value - growthMin) / growthRange) * graphHeight;
    return { x, y };
  });
  const growthPath = growthPoints
    .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");

  const handleCopy = () => {
    navigator.clipboard.writeText(hrEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const canSubmit = email.trim().length >= 5 && password.length >= 8;
  const canRequestReset = resetEmail.trim().toLowerCase().endsWith("@webknot.in");

  return (
    <div className="rt-login-shell relative w-full grid grid-cols-1 xl:grid-cols-[minmax(360px,500px)_1fr] text-[rgb(var(--text))] bg-[rgb(var(--bg))]">
      <div className="pointer-events-none absolute inset-0 opacity-70" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(88,170,255,0.18),transparent_34%),radial-gradient(circle_at_82%_18%,rgba(12,160,210,0.16),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.8),rgba(236,243,252,0.6))]" />
        <div className="absolute inset-0 blur-3xl bg-[linear-gradient(140deg,rgba(255,255,255,0.0),rgba(88,170,255,0.14),rgba(16,102,202,0.08))]" />
        <div className="rt-noise" />
      </div>
      <section className="rt-login-panel relative z-20 grid grid-rows-[auto_1fr_auto] border-r border-[rgb(var(--border))] bg-[rgb(var(--surface))]/92 px-4 py-4 sm:px-8 sm:py-6 lg:px-10 lg:py-8 backdrop-blur-xl shadow-[0_24px_64px_rgba(8,26,56,0.14)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-[rgb(var(--primary-soft))/0.85] to-transparent" />
        <header className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/unnamed.webp"
              alt="Webknot Technologies logo"
              className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl sm:rounded-2xl object-cover border border-[rgb(var(--border))] bg-white shadow-sm"
            />
            <div className="min-w-0">
              <div className="text-base sm:text-lg font-black uppercase tracking-tight leading-tight">Webknot</div>
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-600">Performance OS</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAdminModal(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-2.5 py-2 text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-3))] transition-colors"
          >
            <Headset size={14} /> Support
          </button>
        </header>

        <div className="rt-login-main relative mt-3 sm:mt-4 flex flex-col max-w-md min-h-0">
          <div className="rt-login-kicker inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300 w-fit">
            <Activity size={12} /> Secure Access
          </div>
          <h1 className="rt-login-hero mt-3 sm:mt-4 leading-[1.04] tracking-tight font-black">
            Sign In To Your
            <span className="block text-[rgb(var(--muted))]">Performance Workspace</span>
          </h1>
          <p className="rt-login-subcopy mt-2 sm:mt-3 text-sm text-[rgb(var(--muted))]">
            Structured access for employee submissions, manager evaluations, and admin review workflows.
          </p>

          <div className="rt-login-micro mt-4 sm:mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-2 text-center">
              <div className="text-[9px] font-black uppercase tracking-[0.16em] text-[rgb(var(--muted))]">Cycles</div>
              <div className="mt-1 text-sm font-black">2 / Year</div>
            </div>
            <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-2 text-center">
              <div className="text-[9px] font-black uppercase tracking-[0.16em] text-[rgb(var(--muted))]">Reviews</div>
              <div className="mt-1 text-sm font-black">Monthly</div>
            </div>
            <div className="rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-3 py-2 text-center">
              <div className="text-[9px] font-black uppercase tracking-[0.16em] text-[rgb(var(--muted))]">Security</div>
              <div className="mt-1 text-sm font-black">SSO Ready</div>
            </div>
          </div>

          <div className="relative mt-4 sm:mt-5">
            <Motion.div
              aria-hidden
              initial={{ opacity: 0.42, scale: 0.98 }}
              animate={{ opacity: [0.42, 0.72, 0.42], scale: [0.98, 1.02, 0.98] }}
              transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
              className="pointer-events-none absolute -inset-4 sm:-inset-5 rounded-[1.8rem] bg-[radial-gradient(circle_at_20%_30%,rgba(88,170,255,0.22),transparent_38%),radial-gradient(circle_at_80%_60%,rgba(15,122,177,0.18),transparent_40%),linear-gradient(135deg,rgba(255,255,255,0.7),rgba(236,243,252,0.55))] blur-3xl"
            />
            <Motion.form
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, ease: "easeOut" }}
              className="rt-login-form relative rt-panel rounded-[1.35rem] sm:rounded-[1.65rem] p-4 sm:p-5 space-y-4 sm:space-y-5 shadow-[0_24px_64px_rgba(8,26,56,0.16)]"
              onSubmit={async (e) => {
              e.preventDefault();
              if (!canSubmit || submitting) return;
              setSubmitError("");
              setSubmitSuccess("");
              setSubmitting(true);
              try {
                const emailValue = email.trim().toLowerCase();
                const authRes = await login({ email: emailValue, password });
                setAuth({ ...authRes, email: emailValue });

                const inferPortalKind = (obj) => {
                  const rawPortal = String(obj?.portal ?? "").trim().toLowerCase();
                  const rawRole = String(obj?.role ?? obj?.empRole ?? obj?.userRole ?? "").trim().toLowerCase();
                  if (rawPortal.includes("admin") || rawRole === "admin") return "admin";
                  if (rawPortal.includes("manager") || rawRole === "manager") return "manager";
                  return "employee";
                };
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
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-[rgb(var(--muted))]">Corporate Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rt-input text-base"
                placeholder="name@webknot.in"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-[rgb(var(--muted))]">Access Key</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rt-input pr-12 text-base"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[rgb(var(--muted))] hover:bg-[rgb(var(--surface-2))] hover:text-[rgb(var(--text))] transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              disabled={!canSubmit || submitting}
              className="w-full rt-btn-primary py-3.5 font-black uppercase disabled:opacity-30 active:scale-[0.99] transition-all text-sm"
            >
              {submitting ? "Signing In…" : "Sign In"}
            </button>

            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="text-[10px] uppercase tracking-[0.16em] text-[rgb(var(--muted))] font-bold">Use corporate credentials</div>
              <button
                type="button"
                onClick={() => {
                  setShowResetModal(true);
                  setResetError("");
                  setResetSuccess("");
                  setResetRequestId("");
                  setResetEmail(email.trim() || "");
                }}
                className="text-xs font-black uppercase tracking-widest text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] transition-colors"
              >
                Forgot password?
              </button>
            </div>

            {submitError ? (
              <div className="text-sm text-red-700 dark:text-red-200 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                {submitError}
              </div>
            ) : null}
            {submitSuccess ? (
              <div className="text-sm text-emerald-700 dark:text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                {submitSuccess}
              </div>
            ) : null}
            </Motion.form>
          </div>
        </div>

        <footer className="rt-login-footer relative mt-4 sm:mt-6 flex items-center justify-between gap-2 text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-[rgb(var(--muted))] border-t border-[rgb(var(--border))] pt-3 sm:pt-4">
          <span>© 2026 Webknot</span>
          <span className="hidden sm:inline">Talent Operations Platform</span>
        </footer>
      </section>

      <section className="rt-login-visual relative hidden xl:flex flex-col overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(148deg,_rgb(8_24_48)_0%,_rgb(9_54_102)_46%,_rgb(5_124_174)_100%)]" />
        <div className="absolute inset-0 opacity-[0.14]" style={{ backgroundImage: "linear-gradient(to right, rgba(255,255,255,0.28) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.28) 1px, transparent 1px)", backgroundSize: "36px 36px" }} />
        <div className="absolute -top-24 -right-20 h-[26rem] w-[26rem] rounded-full bg-cyan-300/25 blur-[120px]" />
        <div className="absolute -bottom-28 -left-20 h-[28rem] w-[28rem] rounded-full bg-blue-500/25 blur-[140px]" />

        <Motion.div
          aria-hidden
          className="absolute right-10 top-16 h-20 w-20 rounded-full bg-white/10 border border-white/20 rt-float-slow"
          animate={{ y: [0, -8, 0], scale: [1, 1.04, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <Motion.div
          aria-hidden
          className="absolute left-16 bottom-10 h-16 w-16 rounded-2xl bg-white/8 border border-white/16 rt-float-slow"
          animate={{ y: [0, 10, 0], rotate: [0, -4, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="relative z-10 h-full min-h-0 px-8 py-7 2xl:px-12 2xl:py-8 flex flex-col overflow-y-auto">
          <Motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/30 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/90">
              <Activity size={12} className="text-emerald-300" /> Performance OS
            </div>
            <h2 className="mt-4 text-[clamp(2.5rem,4.6vw,4.4rem)] leading-[0.96] tracking-[-0.03em] font-black text-white">
              Calm, Precise Reviews
              <span className="block text-white/60">Less clutter. More signal.</span>
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-white/82">
              A focused command view for monthly submissions, manager scoring, and admin closure.
            </p>
          </Motion.div>

          <div className="relative mt-6 grid grid-cols-12 gap-4 flex-1 min-h-0">
            <Motion.div
              className="col-span-7 rounded-[1.5rem] border border-white/20 bg-white/10 backdrop-blur-xl p-5 flex flex-col gap-4 shadow-[0_24px_64px_rgba(4,12,30,0.35)]"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-white/80">
                  <TrendingUp size={15} className="text-emerald-300" /> Growth Graph
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-black text-white/85">
                  <ShieldCheck size={14} className="text-emerald-300" /> Steady Gain
                </span>
              </div>

              <div className="relative overflow-hidden rounded-[1.25rem] border border-white/14 bg-white/8 p-4 shadow-[0_14px_44px_rgba(4,12,30,0.32)]">
                <div className="absolute inset-0 bg-gradient-to-b from-white/6 via-transparent to-transparent" aria-hidden />
                <div className="flex items-center justify-between text-white/85 text-xs font-semibold">
                  <span>Cycle Readiness</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[11px] font-black">
                    {activeCockpit.cycle}
                  </span>
                </div>
                <div className="mt-3 h-[180px] relative">
                  <svg viewBox={`0 0 ${graphWidth} ${graphHeight}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
                    <defs>
                      <linearGradient id="rtGrowthStroke" x1="0" x2="1" y1="0" y2="0">
                        <stop offset="0%" stopColor="rgba(125, 249, 255, 0.9)" />
                        <stop offset="55%" stopColor="rgba(102, 181, 255, 0.95)" />
                        <stop offset="100%" stopColor="rgba(86, 231, 186, 0.95)" />
                      </linearGradient>
                      <linearGradient id="rtGrowthFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="rgba(125, 249, 255, 0.24)" />
                        <stop offset="100%" stopColor="rgba(125, 249, 255, 0)" />
                      </linearGradient>
                    </defs>
                    <Motion.path
                      d={`${growthPath}`}
                      fill="none"
                      stroke="url(#rtGrowthStroke)"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 1.6, ease: "easeInOut" }}
                    />
                    <Motion.path
                      d={`${growthPath} L ${graphWidth} ${graphHeight} L 0 ${graphHeight} Z`}
                      fill="url(#rtGrowthFill)"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
                    />
                    {growthPoints.map((p, idx) => (
                      <circle
                        key={`pt-${idx}`}
                        cx={p.x}
                        cy={p.y}
                        r={idx === growthPoints.length - 1 ? 4.2 : 2.6}
                        fill={idx === growthPoints.length - 1 ? "#7df9ff" : "#ffffff"}
                        opacity={idx === growthPoints.length - 1 ? 1 : 0.72}
                      />
                    ))}
                  </svg>
                  <Motion.div
                    className="absolute right-3 bottom-3 rounded-xl bg-white/12 px-3 py-2 text-white/88 text-xs font-semibold border border-white/14"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: "easeOut", delay: 0.25 }}
                  >
                    <div className="uppercase tracking-[0.14em] text-[10px] font-black text-white/70">Now</div>
                    <div className="flex items-center gap-2 text-base font-black">
                      {growthSeries[growthSeries.length - 1]}%
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-200">
                        <TrendingUp size={13} /> +3.5%
                      </span>
                    </div>
                  </Motion.div>
                </div>
              </div>
            </Motion.div>

            <Motion.div
              className="col-span-5 rounded-[1.5rem] border border-white/18 bg-white/10 backdrop-blur-xl p-5 flex flex-col gap-3 shadow-[0_20px_54px_rgba(4,12,30,0.32)]"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: "easeOut", delay: 0.06 }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-white/78">
                  <ClipboardCheck size={15} className="text-cyan-200" /> Monthly Flow
                </span>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-black text-white/80">
                  {activeWorkflowPreview.label}
                </span>
              </div>

              <div className="mt-1 text-sm font-semibold text-white">{activeWorkflowPreview.title}</div>
              <div className="text-xs leading-snug text-white/78">{activeWorkflowPreview.detail}</div>

              <div className="mt-2 space-y-2.5">
                {activeWorkflowPreview.checkpoints.map((point, idx) => (
                  <Motion.div
                    key={`${activeWorkflowPreview.id}:${point}`}
                    className="flex items-start gap-2 text-xs text-white/85"
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut", delay: 0.05 * idx }}
                  >
                    <span className="mt-[5px] h-1.5 w-1.5 rounded-full bg-cyan-200" />
                    <span className="leading-snug">{point}</span>
                  </Motion.div>
                ))}
              </div>

              <div className="mt-auto flex items-center gap-2 text-[11px] text-white/72">
                <BadgeCheck size={16} className="text-emerald-300" /> Guardrails stay on during submissions and approvals.
              </div>
            </Motion.div>
          </div>
        </div>
      </section>

      <AnimatePresence>
        {showAdminModal ? (
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
            <Motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAdminModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <Motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="relative w-full max-w-sm rt-panel rounded-[2rem] p-7 shadow-2xl my-6 max-h-[90vh] overflow-y-auto"
            >
              <h3 className="text-2xl font-black tracking-tight">Support</h3>
              <p className="mt-3 text-sm text-[rgb(var(--muted))]">Talent Desk Assistance</p>
              <div className="mt-5 flex items-center justify-between p-4 rounded-xl rt-panel-subtle overflow-hidden">
                <span className="text-sm font-semibold text-blue-600 truncate mr-2">{hrEmail}</span>
                <button
                  onClick={handleCopy}
                  className="p-2 text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] shrink-0 transition-colors"
                >
                  {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                </button>
              </div>
              <button
                onClick={() => setShowAdminModal(false)}
                className="mt-8 w-full py-3 rt-btn-ghost font-black rounded-xl uppercase tracking-widest active:scale-95 transition-all"
              >
                Close
              </button>
            </Motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showResetModal ? (
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
              className="relative w-full max-w-lg rounded-[2rem] rt-panel p-6 sm:p-8 shadow-2xl my-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-black tracking-tight">Reset Password</h3>
                  <p className="mt-2 text-sm text-[rgb(var(--muted))]">
                    Submit a reset request. A random verification code is sent to admins for approval.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="rounded-xl p-2 text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-2))] transition"
                  aria-label="Close"
                  title="Close"
                >
                  ×
                </button>
              </div>

              <div className="mt-7 space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[rgb(var(--muted))]">Email</label>
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="rt-input py-3 px-4 text-sm"
                    placeholder="name@webknot.in"
                  />
                </div>

                {resetRequestId ? (
                  <div className="text-xs text-blue-700 dark:text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                    Request ID: <span className="font-mono">{resetRequestId}</span>
                  </div>
                ) : null}

                {resetError ? (
                  <div className="text-sm text-red-700 dark:text-red-200 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                    {resetError}
                  </div>
                ) : null}
                {resetSuccess ? (
                  <div className="text-sm text-emerald-700 dark:text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                    {resetSuccess}
                  </div>
                ) : null}

                <button
                  type="button"
                  disabled={!canRequestReset || resetLoading}
                  onClick={async () => {
                    if (!canRequestReset || resetLoading) return;
                    setResetError("");
                    setResetSuccess("");
                    setResetRequestId("");
                    setResetLoading(true);
                    try {
                      const res = await forgotPassword({ email: resetEmail.trim() });
                      const requestId = String(res?.requestId ?? "").trim();
                      if (requestId) setResetRequestId(requestId);
                      setResetSuccess(
                        String(res?.message || "").trim() ||
                        "Reset request submitted. Please contact admin for approval."
                      );
                      setSubmitError("");
                      setSubmitSuccess("Reset request submitted. Admin approval is required.");
                      setEmail(resetEmail.trim());
                    } catch (err) {
                      setResetError(err?.message || "Password reset request failed.");
                    } finally {
                      setResetLoading(false);
                    }
                  }}
                  className="w-full rt-btn-primary py-3.5 font-black uppercase disabled:opacity-30 active:scale-[0.99] transition-all text-sm"
                >
                  {resetLoading ? "Submitting…" : "Send Reset Request"}
                </button>
              </div>
            </Motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
