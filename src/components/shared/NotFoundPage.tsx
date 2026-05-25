// @ts-nocheck
import { motion } from "framer-motion";
import { Home, ArrowLeft } from "lucide-react";
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

const pathDraw = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: {
    pathLength: 1,
    opacity: 1,
    transition: { duration: 1.6, ease: "easeInOut", delay: 1.0 },
  },
};

export default function NotFoundPage({ onGoHome }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[rgb(var(--bg))] px-6 py-12 overflow-hidden relative select-none">
      {/* ── Ambient background blobs ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          className="absolute top-[10%] left-[15%] w-80 h-80 rounded-full bg-blue-500/6 blur-[100px]"
          animate={{ x: [0, 40, 0], y: [0, -25, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-[15%] right-[12%] w-[28rem] h-[28rem] rounded-full bg-blue-500/5 blur-[120px]"
          animate={{ x: [0, -30, 0], y: [0, 20, 0], scale: [1, 1.05, 1] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-[55%] left-[50%] w-64 h-64 rounded-full bg-amber-500/4 blur-[80px]"
          animate={{ x: [0, 25, 0], y: [0, -35, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* ── Floating particles ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-[rgb(var(--primary))]/20"
            style={{
              left: `${15 + i * 14}%`,
              top: `${20 + (i % 3) * 25}%`,
            }}
            animate={{
              y: [0, -30 - i * 8, 0],
              opacity: [0.2, 0.6, 0.2],
            }}
            transition={{
              duration: 3 + i * 0.5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.4,
            }}
          />
        ))}
      </div>

      <motion.div
        className="relative z-10 text-center max-w-lg w-full"
        variants={stagger}
        initial="hidden"
        animate="visible"
      >
        {/* ── Floating logo image ── */}
        <motion.div className="flex justify-center mb-6" variants={scaleIn}>
          <motion.div
            className="relative"
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            {/* glow ring behind image */}
            <motion.div
              className="absolute -inset-3 rounded-full"
              style={{
                background: "radial-gradient(circle, rgb(var(--primary) / 0.15) 0%, transparent 70%)",
              }}
              animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />
            {/* outer ring */}
            <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full border-2 border-[rgb(var(--border))]/50 bg-[rgb(var(--surface))] shadow-xl shadow-black/10 flex items-center justify-center overflow-hidden p-3">
              <motion.div
                animate={{ rotate: [0, 5, -3, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              >
                <CompanyLogo size={88} className="h-20 w-20 sm:h-24 sm:w-24" aria-hidden />
              </motion.div>
            </div>
          </motion.div>
        </motion.div>

        {/* ── 404 number with gradient ── */}
        <motion.div variants={fadeUp} className="relative inline-block">
          <motion.h1
            className="text-[7rem] sm:text-[9rem] font-black tracking-tighter leading-none bg-gradient-to-br from-[rgb(var(--text))] via-blue-500 to-blue-500 bg-clip-text text-transparent"
            animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
            style={{ backgroundSize: "200% 200%" }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          >
            404
          </motion.h1>
          {/* animated underline */}
          <svg className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-36 h-3" viewBox="0 0 160 12" fill="none">
            <motion.path
              d="M4 8 C40 2, 80 2, 120 6 C140 8, 156 6, 156 6"
              stroke="url(#ul-grad)"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
              variants={pathDraw}
            />
            <defs>
              <linearGradient id="ul-grad" x1="0" y1="0" x2="160" y2="0" gradientUnits="userSpaceOnUse">
                <stop stopColor="#2563eb" />
                <stop offset="1" stopColor="#3b82f6" />
              </linearGradient>
            </defs>
          </svg>
        </motion.div>

        {/* ── Text ── */}
        <motion.h2
          variants={fadeUp}
          className="mt-6 text-2xl sm:text-3xl font-bold text-[rgb(var(--text))] tracking-tight"
        >
          Page not found
        </motion.h2>
        <motion.p
          variants={fadeUp}
          className="mt-3 text-sm sm:text-base text-[rgb(var(--muted))] max-w-md mx-auto leading-relaxed"
        >
          The page you're looking for doesn't exist or has been moved.
          Let's get you back on track.
        </motion.p>

        {/* ── Animated dots trail ── */}
        <motion.div variants={fadeUp} className="flex items-center justify-center gap-2 mt-6">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-[rgb(var(--primary))]"
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.3, 0.8, 0.3],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.2,
                ease: "easeInOut",
              }}
            />
          ))}
        </motion.div>

        {/* ── Action buttons ── */}
        <motion.div variants={fadeUp} className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <motion.button
            whileHover={{ scale: 1.04, y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => (onGoHome ? onGoHome() : window.location.replace("/"))}
            className="rt-btn-primary px-7 py-3 text-sm font-semibold inline-flex items-center gap-2.5 shadow-lg shadow-[rgb(var(--primary))]/20"
          >
            <Home size={16} />
            Go to Home
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.04, y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => window.history.back()}
            className="rt-btn-ghost px-7 py-3 text-sm font-semibold inline-flex items-center gap-2.5"
          >
            <ArrowLeft size={16} />
            Go Back
          </motion.button>
        </motion.div>

        {/* ── Footer ── */}
        <motion.p
          variants={fadeUp}
          className="mt-14 text-[10px] uppercase tracking-[0.2em] text-[rgb(var(--muted))] opacity-40 font-medium"
        >
          RT Tracking Tool &middot; Webknot Technologies
        </motion.p>
      </motion.div>
    </div>
  );
}
