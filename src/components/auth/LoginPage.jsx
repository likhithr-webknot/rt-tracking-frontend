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
  UserCircle2,
  ClipboardCheck,
  BadgeCheck,
} from "lucide-react";
import { fetchMe, getAuth, login, setAuth, forgotPassword } from "../../api/auth.js";
import { fetchPortalAdmin, fetchPortalEmployee, fetchPortalManager } from "../../api/portal.js";

export default function LoginPage({ onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [cockpitMode, setCockpitMode] = useState("execution");
  const [workflowPreviewStep, setWorkflowPreviewStep] = useState("employee");
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
  const activeCockpit = cockpitModes.find((item) => item.id === cockpitMode) || cockpitModes[0];
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
  const activeWorkflowPreview =
    workflowPreview.find((item) => item.id === workflowPreviewStep) || workflowPreview[0];

  const handleCopy = () => {
    navigator.clipboard.writeText(hrEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const canSubmit = email.trim().length >= 5 && password.length >= 8;
  const canRequestReset = resetEmail.trim().toLowerCase().endsWith("@webknot.in");

  return (
    <div className="rt-login-shell w-full grid grid-cols-1 xl:grid-cols-[minmax(360px,500px)_1fr] text-[rgb(var(--text))] bg-[rgb(var(--bg))]">
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

          <form
            className="rt-login-form mt-4 sm:mt-5 rt-panel rounded-[1.35rem] sm:rounded-[1.65rem] p-4 sm:p-5 space-y-4 sm:space-y-5"
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
          </form>
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

        <div className="relative z-10 h-full min-h-0 px-8 py-7 2xl:px-12 2xl:py-8 flex flex-col overflow-y-auto">
          <Motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/30 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/90">
              <Activity size={12} className="text-emerald-300" /> Workflow Engine
            </div>
            <h2 className="mt-4 text-[clamp(2.6rem,5.1vw,4.8rem)] leading-[0.95] tracking-[-0.03em] font-black text-white">
              Performance Review
              <span className="block text-white/55">Control Studio</span>
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-white/80">
              Interactive review orchestration across employee, manager, and admin workflows.
            </p>
          </Motion.div>

          <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/85">
            <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5">May-Oct Cycle</span>
            <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5">Nov-Apr Cycle</span>
            <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5">Monthly Checkpoints</span>
          </div>

          <div className="mt-5 flex-1 min-h-0">
            <div className="h-full rounded-[2rem] border border-white/25 bg-white/8 backdrop-blur-md p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/75">Interactive Workspace</div>
                <div className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/10 p-1">
                  {cockpitModes.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setCockpitMode(mode.id)}
                      className={[
                        "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] transition",
                        cockpitMode === mode.id
                          ? "bg-white/90 text-slate-900"
                          : "text-white/75 hover:bg-white/12 hover:text-white",
                      ].join(" ")}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
                <AnimatePresence mode="wait">
                  <Motion.div
                    key={`cockpit:${activeCockpit.id}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="col-span-6 rounded-2xl border border-white/22 bg-white/10 p-4 flex flex-col"
                  >
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/70">
                      {activeCockpit.icon} Mode Overview
                    </div>
                    <Motion.div
                      animate={{ rotate: [0, 0.8, -0.8, 0] }}
                      transition={{ duration: 6.5, ease: "easeInOut", repeat: Infinity }}
                      className="relative mx-auto mt-3 h-36 w-36 rounded-full p-[9px]"
                      style={{
                        background: `conic-gradient(rgba(138,241,255,0.96) 0deg ${Math.round(activeCockpit.readiness * 3.6)}deg, rgba(255,255,255,0.2) ${Math.round(activeCockpit.readiness * 3.6)}deg 360deg)`,
                      }}
                    >
                      <div className="grid h-full w-full place-items-center rounded-full border border-white/20 bg-slate-950/35 text-center">
                        <div className="text-[9px] font-black uppercase tracking-[0.15em] text-white/70">{activeCockpit.cycle}</div>
                        <div className="mt-1 text-3xl font-black text-white">{activeCockpit.readiness}%</div>
                      </div>
                    </Motion.div>
                    <div className="mt-3 text-sm font-bold text-white">{activeCockpit.headline}</div>
                    <div className="mt-1 text-xs text-white/75 leading-snug">{activeCockpit.summary}</div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {activeCockpit.stats.map((stat) => (
                        <div key={`${activeCockpit.id}:${stat.label}`} className="rounded-xl border border-white/18 bg-white/8 px-2.5 py-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.13em] text-white/70">{stat.label}</div>
                          <div className="mt-1 text-lg font-black text-white">{stat.value}</div>
                        </div>
                      ))}
                    </div>
                  </Motion.div>
                </AnimatePresence>

                <div className="col-span-6 rounded-2xl border border-white/22 bg-white/10 p-4 flex flex-col">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/70">Process Preview</div>
                  <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 p-1">
                    {workflowPreview.map((stage) => (
                      <button
                        key={stage.id}
                        type="button"
                        onClick={() => setWorkflowPreviewStep(stage.id)}
                        className={[
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] transition",
                          workflowPreviewStep === stage.id
                            ? "bg-white text-slate-900"
                            : "text-white/80 hover:bg-white/12 hover:text-white",
                        ].join(" ")}
                      >
                        {stage.icon} {stage.label}
                      </button>
                    ))}
                  </div>

                  <AnimatePresence mode="wait">
                    <Motion.div
                      key={`workflow:${activeWorkflowPreview.id}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.22, ease: "easeOut" }}
                      className="mt-3 rounded-xl border border-white/18 bg-white/8 p-3 flex-1"
                    >
                      <div className="text-sm font-bold text-white">{activeWorkflowPreview.title}</div>
                      <div className="mt-1 text-xs text-white/75 leading-snug">{activeWorkflowPreview.detail}</div>
                      <div className="mt-3 space-y-2">
                        {activeWorkflowPreview.checkpoints.map((point) => (
                          <div key={`${activeWorkflowPreview.id}:${point}`} className="flex items-start gap-2 text-xs">
                            <span className="mt-[3px] h-1.5 w-1.5 rounded-full bg-cyan-200" />
                            <span className="text-white/88 leading-snug">{point}</span>
                          </div>
                        ))}
                      </div>
                    </Motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </div>
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
