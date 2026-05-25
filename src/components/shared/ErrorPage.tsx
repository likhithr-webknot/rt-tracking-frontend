// @ts-nocheck
import { motion } from "framer-motion";
import { Home, ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { clearAuth } from "../../api/auth";
import CompanyLogo from "./CompanyLogo";

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15, delayChildren: 0.3 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

export default function ErrorPage({
  code = "!",
  title = "Something Broke",
  message = "An unexpected error occurred. You can reload or clear your session.",
  error = null,
  onGoHome,
}) {
  const errorDetail = error?.message ? String(error.message) : null;

  return (
    <div className="rt-shell relative min-h-screen w-full flex items-center justify-center p-6 bg-[rgb(var(--bg))] overflow-hidden">
      {/* ── Background decoration ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-40">
        <motion.div
          className="absolute top-[10%] left-[15%] w-96 h-96 rounded-full bg-[rgb(var(--primary))]/10 blur-[120px]"
          animate={{ x: [0, 40, 0], y: [0, -25, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-[10%] right-[15%] w-80 h-80 rounded-full bg-rose-500/10 blur-[100px]"
          animate={{ x: [0, -30, 0], y: [0, 40, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <motion.div
        className="relative z-10 text-center max-w-lg w-full"
        initial="hidden"
        animate="visible"
        variants={stagger}
      >
        {/* ── Floating logo icon ── */}
        <motion.div className="flex justify-center mb-10" variants={scaleIn}>
          <motion.div
            className="relative"
            animate={{ y: [0, -12, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <motion.div
              className="absolute -inset-6 rounded-full"
              style={{
                background: "radial-gradient(circle, rgb(45 212 191 / 0.15) 0%, transparent 70%)",
              }}
              animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.8, 0.4] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="relative w-32 h-32 rounded-[2.5rem] border-2 border-[rgb(var(--primary))]/30 bg-[rgb(var(--surface))] dark:bg-slate-900/80 backdrop-blur-2xl shadow-[0_0_50px_rgba(45,212,191,0.15)] flex items-center justify-center overflow-hidden p-4">
              <CompanyLogo size={72} className="h-full w-full" aria-hidden />
            </div>
          </motion.div>
        </motion.div>

        {/* ── Error code with gradient ── */}
        <motion.div className="mb-4" variants={fadeUp}>
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-[rgb(var(--primary))] ml-1">
            System Fault {code}
          </span>
          <h1 className="mt-4 text-5xl sm:text-6xl font-black tracking-tighter text-[rgb(var(--text))] uppercase italic">
            Disrupted
          </h1>
        </motion.div>

        <motion.p className="text-[rgb(var(--muted))] text-base font-medium leading-relaxed mb-10 px-4" variants={fadeUp}>
          {message}
        </motion.p>

        {/* ── Error detail ── */}
        {errorDetail ? (
          <motion.div
            variants={fadeUp}
            className="mb-8 mx-auto max-w-md rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-left text-red-700 dark:text-red-400 font-mono break-words"
          >
            {errorDetail}
          </motion.div>
        ) : null}

        {/* ── Action Buttons ── */}
        <motion.div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4" variants={fadeUp}>
          <button
            onClick={() => window.location.reload()}
            className="rt-btn-primary !py-3.5 !rounded-2xl"
          >
            <RotateCcw size={18} />
            Attempt Recovery
          </button>
          <button
            onClick={() => {
               if (onGoHome) onGoHome();
               else window.location.assign("/");
            }}
            className="rt-btn-ghost !py-3.5 !rounded-2xl !bg-[rgb(var(--surface-2))] !border-[rgb(var(--border))] text-[rgb(var(--text))]"
          >
            <Home size={18} />
            Return Home
          </button>
        </motion.div>

        {/* ── Branding ── */}
        <motion.p
          variants={fadeUp}
          className="mt-16 text-[10px] uppercase tracking-[0.3em] text-[rgb(var(--muted))] font-black opacity-70"
        >
          Webknot Performance OS &middot; Secure Instance
        </motion.p>
      </motion.div>
    </div>
  );
}
