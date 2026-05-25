// @ts-nocheck
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

const WARP_Z_FAR = 1;
const WARP_Z_NEAR = 0.02;

function spawnWarpStar() {
  return {
    x: (Math.random() - 0.5) * 2,
    y: (Math.random() - 0.5) * 2,
    z: WARP_Z_NEAR + Math.random() * (WARP_Z_FAR - WARP_Z_NEAR),
    prevSx: null,
    prevSy: null,
  };
}

function initWarpStars(width, height) {
  const count = Math.min(600, Math.max(220, Math.floor((width * height) / 4500)));
  return Array.from({ length: count }, spawnWarpStar);
}

function projectWarpStar(star, cx, cy) {
  const invZ = 1 / Math.max(star.z, WARP_Z_NEAR);
  return { sx: cx + star.x * invZ * cx * 0.98, sy: cy + star.y * invZ * cy * 0.98, invZ };
}

const KNOT_NODES = [
  { x: 18, y: 22 },
  { x: 82, y: 18 },
  { x: 72, y: 78 },
  { x: 22, y: 82 },
  { x: 50, y: 50 },
];

const KNOT_EDGES = [
  [0, 4],
  [1, 4],
  [2, 4],
  [3, 4],
  [0, 1],
  [2, 3],
];

function WarpCanvas() {
  const canvasRef = useRef(null);
  const starsRef = useRef([]);
  const sizeRef = useRef({ w: 0, h: 0 });
  const rafRef = useRef(0);
  const lastTimeRef = useRef(0);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    const motionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = motionMq.matches;
    const onMotionChange = (e) => {
      reducedMotionRef.current = e.matches;
    };
    motionMq.addEventListener("change", onMotionChange);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      const changed = sizeRef.current.w !== w || sizeRef.current.h !== h;
      sizeRef.current = { w, h };
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (changed || starsRef.current.length === 0) {
        starsRef.current = initWarpStars(w, h);
      }
    };

    resize();
    window.addEventListener("resize", resize);

    const draw = (time) => {
      const w = sizeRef.current.w || window.innerWidth;
      const h = sizeRef.current.h || window.innerHeight;
      if (!w || !h) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const cx = w * 0.5;
      const cy = h * 0.5;
      const dt = Math.min((time - (lastTimeRef.current || time)) / 1000, 0.05);
      lastTimeRef.current = time;

      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, h);

      const animate = !reducedMotionRef.current;

      for (const star of starsRef.current) {
        if (animate) star.z -= 0.38 * dt;
        if (star.z <= WARP_Z_NEAR) {
          Object.assign(star, spawnWarpStar());
          star.prevSx = null;
          star.prevSy = null;
          continue;
        }

        const { sx, sy, invZ } = projectWarpStar(star, cx, cy);
        if (sx < -40 || sx > w + 40 || sy < -40 || sy > h + 40) {
          star.prevSx = null;
          star.prevSy = null;
          continue;
        }

        const depth = 1 - star.z / WARP_Z_FAR;
        const alpha = 0.25 + depth * 0.75;
        const lineWidth = Math.min(3.2, Math.max(0.6, invZ * 0.9));
        const streak =
          star.prevSx != null &&
          (Math.abs(sx - star.prevSx) > 1 || Math.abs(sy - star.prevSy) > 1);

        if (animate && streak) {
          const grad = ctx.createLinearGradient(star.prevSx, star.prevSy, sx, sy);
          grad.addColorStop(0, `rgba(99, 102, 241, ${alpha * 0.06})`);
          grad.addColorStop(0.55, `rgba(167, 139, 250, ${alpha * 0.35})`);
          grad.addColorStop(1, `rgba(255, 255, 255, ${Math.min(1, alpha)})`);
          ctx.strokeStyle = grad;
          ctx.lineWidth = lineWidth;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(star.prevSx, star.prevSy);
          ctx.lineTo(sx, sy);
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(sx, sy, Math.min(2, lineWidth * 0.55), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();

        star.prevSx = sx;
        star.prevSy = sy;
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener("resize", resize);
      motionMq.removeEventListener("change", onMotionChange);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 block h-full w-full bg-black"
      aria-hidden
    />
  );
}

export default function PulseLoginBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-black" aria-hidden>
      <WarpCanvas />

      {/* Pulse rings — heartbeat ripples */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute left-1/2 top-1/2 h-[min(70vw,520px)] w-[min(70vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-500/20"
            initial={{ scale: 0.35, opacity: 0.5 }}
            animate={{ scale: [0.35, 1.15], opacity: [0.45, 0] }}
            transition={{
              duration: 3.2,
              repeat: Infinity,
              delay: i * 1.05,
              ease: "easeOut",
            }}
          />
        ))}
        <motion.div
          className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/10 blur-3xl"
          animate={{ scale: [1, 1.25, 1], opacity: [0.35, 0.65, 0.35] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Knot motif — connected nodes (Webknot) */}
      <svg
        className="absolute left-1/2 top-1/2 h-[min(42vw,280px)] w-[min(42vw,280px)] -translate-x-1/2 -translate-y-1/2 opacity-[0.14]"
        viewBox="0 0 100 100"
        aria-hidden
      >
        {KNOT_EDGES.map(([a, b], idx) => (
          <line
            key={idx}
            x1={KNOT_NODES[a].x}
            y1={KNOT_NODES[a].y}
            x2={KNOT_NODES[b].x}
            y2={KNOT_NODES[b].y}
            stroke="rgb(167, 139, 250)"
            strokeWidth="0.6"
            opacity="0.45"
          />
        ))}
        {KNOT_NODES.map((node, idx) => (
          <motion.circle
            key={idx}
            cx={node.x}
            cy={node.y}
            r={idx === 4 ? 3.2 : 2}
            fill={idx === 4 ? "rgb(139, 92, 246)" : "rgb(199, 210, 254)"}
            animate={{ scale: [1, 1.35, 1] }}
            transition={{ duration: 2.2, repeat: Infinity, delay: idx * 0.2, ease: "easeInOut" }}
          />
        ))}
      </svg>

    </div>
  );
}
