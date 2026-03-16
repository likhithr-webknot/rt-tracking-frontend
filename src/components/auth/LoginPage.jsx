import { useState, useCallback, useRef } from "react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import {
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

import Toast from "../shared/Toast.jsx";

function GoogleIcon() {
  return (
    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5">
      <g>
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
        <path fill="none" d="M0 0h48v48H0z"></path>
      </g>
    </svg>
  );
}


export default function LoginPage() {
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const showToast = useCallback((next) => {
    setToast(next);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3000);
  }, []);


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

  return (
    <div className="rt-login-shell relative w-full grid grid-cols-1 xl:grid-cols-[minmax(360px,480px)_1fr] text-[rgb(var(--text))] bg-[rgb(var(--bg))]">
      <section className="rt-login-panel relative z-20 grid grid-rows-[auto_1fr_auto] border-r border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-4 sm:px-8 sm:py-6 lg:px-10 lg:py-8">
        <header className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/unnamed.webp"
              alt="Webknot Technologies logo"
              className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg object-cover border border-[rgb(var(--border))] bg-white"
            />
            <div className="min-w-0">
              <div className="text-base sm:text-lg font-bold tracking-tight leading-tight">Webknot</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[rgb(var(--muted))]">Performance OS</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAdminModal(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))] px-2.5 py-1.5 text-xs font-medium text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-3))] transition-colors"
          >
            <Headset size={14} /> Support
          </button>
        </header>

        <div className="rt-login-main relative mt-6 sm:mt-8 flex flex-col max-w-md min-h-0">
          <div className="rt-login-kicker inline-flex items-center gap-2 rounded-md border border-[rgb(var(--primary)/0.2)] bg-[rgb(var(--primary-soft))] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[rgb(var(--primary))] w-fit">
            <Activity size={12} /> Secure Access
          </div>
          <h1 className="rt-login-hero mt-4 sm:mt-5 leading-[1.15] tracking-tight font-bold">
            Sign in to your
            <span className="block text-[rgb(var(--muted))]">performance workspace</span>
          </h1>
          <p className="rt-login-subcopy mt-2 sm:mt-3 text-sm text-[rgb(var(--muted))] leading-relaxed">
            Single Sign-On via Google. Use your corporate account to access employee submissions, manager evaluations, and admin workflows.
          </p>

          <div className="relative mt-8">
             <Motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="rt-login-form relative"
              >
                <a
                  href="/api/v1/google-signin"
                  className="w-full rt-btn-primary flex items-center justify-center gap-3 transition-all text-base"
                >
                  <GoogleIcon />
                  Sign in with Google
                </a>
                <p className="mt-4 text-center text-xs text-[rgb(var(--muted))]">
                  You will be redirected to Google for authentication.
                </p>
            </Motion.div>
          </div>
        </div>

        <footer className="rt-login-footer relative mt-6 sm:mt-8 flex items-center justify-between gap-2 text-xs text-[rgb(var(--muted))] border-t border-[rgb(var(--border))] pt-3 sm:pt-4">
          <span>&copy; 2026 Webknot Technologies</span>
          <span className="hidden sm:inline">Talent Operations Platform</span>
        </footer>
      </section>

      <section className="rt-login-visual relative hidden xl:flex flex-col overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(160deg,_rgb(15_23_42)_0%,_rgb(30_41_59)_50%,_rgb(15_23_42)_100%)]" />
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "linear-gradient(to right, rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.3) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        <div className="absolute -top-32 -right-20 h-[30rem] w-[30rem] rounded-full bg-blue-500/10 blur-[140px]" />
        <div className="absolute -bottom-28 -left-20 h-[24rem] w-[24rem] rounded-full bg-slate-400/10 blur-[120px]" />

        <div className="relative z-10 h-full min-h-0 px-8 py-8 2xl:px-12 2xl:py-10 flex flex-col overflow-y-auto">
          <Motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: "easeOut" }} className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-md bg-white/10 border border-white/15 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.06em] text-white/85">
              <Activity size={12} className="text-blue-300" /> Performance OS
            </div>
            <h2 className="mt-5 text-[clamp(2rem,4vw,3.5rem)] leading-[1.05] tracking-[-0.02em] font-bold text-white">
              Structured Performance Reviews
              <span className="block text-white/50 mt-1">Clear process. Reliable outcomes.</span>
            </h2>
            <p className="mt-4 max-w-2xl text-sm text-white/65 leading-relaxed">
              A focused workspace for monthly submissions, manager evaluations, and admin oversight.
            </p>
          </Motion.div>

          <div className="relative mt-8 grid grid-cols-12 gap-5 flex-1 min-h-0">
            <Motion.div
              className="col-span-7 rounded-md border border-white/10 bg-white/5 backdrop-blur-md p-5 flex flex-col gap-4"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.06em] text-white/70">
                  <TrendingUp size={15} className="text-blue-300" /> Growth Graph
                </span>
                <span className="inline-flex items-center gap-2 rounded-md bg-white/8 px-2.5 py-1 text-[11px] font-medium text-white/70">
                  <ShieldCheck size={14} className="text-emerald-400" /> Steady Gain
                </span>
              </div>

              <div className="relative overflow-hidden rounded-lg border border-white/8 bg-white/5 p-4">
                <div className="flex items-center justify-between text-white/75 text-xs font-medium">
                  <span>Cycle Readiness</span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-white/8 px-2 py-1 text-[11px] font-medium">
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
                    className="absolute right-3 bottom-3 rounded-md bg-white/8 px-3 py-2 text-white/80 text-xs font-medium border border-white/10"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut", delay: 0.2 }}
                  >
                    <div className="text-[10px] font-medium text-white/55">Current</div>
                    <div className="flex items-center gap-2 text-base font-semibold">
                      {growthSeries[growthSeries.length - 1]}%
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                        <TrendingUp size={13} /> +3.5%
                      </span>
                    </div>
                  </Motion.div>
                </div>
              </div>
            </Motion.div>

            <Motion.div
              className="col-span-5 rounded-md border border-white/10 bg-white/5 backdrop-blur-md p-5 flex flex-col gap-3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut", delay: 0.05 }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.06em] text-white/70">
                  <ClipboardCheck size={15} className="text-blue-300" /> Monthly Flow
                </span>
                <span className="rounded-md bg-white/8 px-2 py-1 text-[10px] font-medium text-white/65">
                  {activeWorkflowPreview.label}
                </span>
              </div>

              <div className="mt-1 text-sm font-semibold text-white/90">{activeWorkflowPreview.title}</div>
              <div className="text-xs leading-relaxed text-white/60">{activeWorkflowPreview.detail}</div>

              <div className="mt-2 space-y-2">
                {activeWorkflowPreview.checkpoints.map((point, idx) => (
                  <Motion.div
                    key={`${activeWorkflowPreview.id}:${point}`}
                    className="flex items-start gap-2 text-xs text-white/70"
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut", delay: 0.04 * idx }}
                  >
                    <span className="mt-[5px] h-1.5 w-1.5 rounded-full bg-blue-400" />
                    <span className="leading-relaxed">{point}</span>
                  </Motion.div>
                ))}
              </div>

              <div className="mt-auto flex items-center gap-2 text-[11px] text-white/50">
                <BadgeCheck size={14} className="text-blue-300" /> Guardrails active during review cycles.
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
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="relative w-full max-w-sm rt-panel rounded-lg p-6 shadow-lg my-6 max-h-[90vh] overflow-y-auto"
            >
              <h3 className="text-xl font-bold tracking-tight">Support</h3>
              <p className="mt-2 text-sm text-[rgb(var(--muted))]">Talent Desk Assistance</p>
              <div className="mt-4 flex items-center justify-between p-3 rounded-md rt-panel-subtle overflow-hidden">
                <span className="text-sm font-medium text-[rgb(var(--primary))] truncate mr-2">{hrEmail}</span>
                <button
                  onClick={handleCopy}
                  className="p-2 text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] shrink-0 transition-colors"
                >
                  {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                </button>
              </div>
              <button
                onClick={() => setShowAdminModal(false)}
                className="mt-6 w-full rt-btn-ghost rounded-md transition-all"
              >
                Close
              </button>
            </Motion.div>
          </div>
        ) : null}
      </AnimatePresence>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
