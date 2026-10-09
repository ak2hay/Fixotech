"use client";

import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useRef, useState } from "react";

export type ExplodedStep = { title: string; text: string; metric: string };

type Layer = { id: string; label: string; dx: number; dy: number; lx: number; ly: number; draw: React.ReactNode };

const ROD_X = 430;
const CH_Y = 400;
const PIPE = { cx: 240, cy: CH_Y - 8 - 62, r: 62 };

const LAYERS: Layer[] = [
  {
    id: "anchor", label: "Ceiling anchor plate", dx: 0, dy: -46, lx: 470, ly: 64,
    draw: <rect x={ROD_X - 32} y={60} width={64} height={12} />,
  },
  {
    id: "rod", label: "M10 threaded rod", dx: 0, dy: -22, lx: 470, ly: 220,
    draw: (
      <>
        <line x1={ROD_X} y1={72} x2={ROD_X} y2={CH_Y + 56} />
        {Array.from({ length: 22 }, (_, i) => <line key={i} x1={ROD_X - 5} y1={84 + i * 16} x2={ROD_X + 5} y2={78 + i * 16} strokeOpacity={0.5} />)}
      </>
    ),
  },
  {
    id: "nutTop", label: "Hex nut + washer", dx: 70, dy: -26, lx: 520, ly: CH_Y - 40,
    draw: <><rect x={ROD_X - 18} y={CH_Y - 16} width={36} height={12} /><rect x={ROD_X - 24} y={CH_Y - 4} width={48} height={4} /></>,
  },
  {
    id: "channel", label: "FXT channel 41×41", dx: 0, dy: 70, lx: 110, ly: CH_Y + 110,
    draw: (
      <>
        <rect x={110} y={CH_Y} width={380} height={38} />
        <line x1={110} y1={CH_Y + 6} x2={490} y2={CH_Y + 6} strokeOpacity={0.5} />
        {Array.from({ length: 9 }, (_, i) => <rect key={i} x={130 + i * 40} y={CH_Y + 16} width={18} height={8} strokeOpacity={0.6} />)}
      </>
    ),
  },
  {
    id: "nutBottom", label: "Lock nut", dx: 0, dy: 120, lx: 470, ly: CH_Y + 170,
    draw: <rect x={ROD_X - 18} y={CH_Y + 40} width={36} height={12} />,
  },
  {
    id: "clamp", label: "Pipe clamp M8/M10", dx: -30, dy: -96, lx: 60, ly: 120,
    draw: (
      <>
        <circle cx={PIPE.cx} cy={PIPE.cy} r={PIPE.r + 12} />
        <rect x={PIPE.cx - 14} y={PIPE.cy - PIPE.r - 32} width={10} height={22} />
        <rect x={PIPE.cx + 4} y={PIPE.cy - PIPE.r - 32} width={10} height={22} />
        <line x1={PIPE.cx - 24} y1={PIPE.cy - PIPE.r - 22} x2={PIPE.cx + 24} y2={PIPE.cy - PIPE.r - 22} />
        <line x1={PIPE.cx} y1={PIPE.cy + PIPE.r + 12} x2={PIPE.cx} y2={CH_Y} />
      </>
    ),
  },
  {
    id: "insert", label: "EPDM acoustic insert", dx: -120, dy: -50, lx: 30, ly: 250,
    draw: <circle cx={PIPE.cx} cy={PIPE.cy} r={PIPE.r + 5} strokeDasharray="3 4" />,
  },
  {
    id: "pipe", label: "Service pipe DN150", dx: -150, dy: 10, lx: 30, ly: 340,
    draw: (
      <>
        <circle cx={PIPE.cx} cy={PIPE.cy} r={PIPE.r} />
        <circle cx={PIPE.cx} cy={PIPE.cy} r={PIPE.r - 7} strokeOpacity={0.5} />
        <line x1={PIPE.cx - PIPE.r - 16} y1={PIPE.cy} x2={PIPE.cx + PIPE.r + 16} y2={PIPE.cy} strokeOpacity={0.35} strokeDasharray="6 5" />
      </>
    ),
  },
];

function LayerGroup({ layer, explode, labelOpacity }: { layer: Layer; explode: MotionValue<number>; labelOpacity: MotionValue<number> }) {
  const x = useTransform(explode, (v) => v * layer.dx);
  const y = useTransform(explode, (v) => v * layer.dy);
  return (
    <motion.g style={{ x, y }}>
      <g stroke="#3fd0ff" strokeWidth={1.4} fill="none">{layer.draw}</g>
      <motion.g style={{ opacity: labelOpacity }}>
        <text x={layer.lx} y={layer.ly} fill="#ffffff" fillOpacity={0.85} fontFamily="var(--font-mono)" fontSize={11} letterSpacing={1.5}>
          {layer.label.toUpperCase()}
        </text>
        <line x1={layer.lx} y1={layer.ly + 6} x2={layer.lx + layer.label.length * 7.6} y2={layer.ly + 6} stroke="#e21f26" strokeWidth={1} />
      </motion.g>
    </motion.g>
  );
}

export function ScrollExploded({ steps, kicker, title }: { steps: ExplodedStep[]; kicker: string; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const explode = useTransform(scrollYProgress, (p) => (reduced ? 1 : Math.sin(Math.min(Math.max((p - 0.05) / 0.9, 0), 1) * Math.PI)));
  const labelOpacity = useTransform(explode, [0.55, 0.9], [0, 1]);
  const bar = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);
  const [active, setActive] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (p) => setActive(Math.min(steps.length - 1, Math.floor(p * steps.length))));

  return (
    <section ref={ref} className={`blueprint-dark relative text-white ${reduced ? "" : "h-[320vh]"}`}>
      <div className={`${reduced ? "" : "sticky top-0 h-screen"} flex items-center overflow-hidden`}>
        <div className="wrap grid w-full items-center gap-10 py-16 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="kicker-cyan">{kicker}</p>
            <h2 className="h-display-light mt-4 text-4xl md:text-6xl">{title}</h2>
            <div className="relative mt-10 border-l border-white/10 pl-6">
              <motion.span className="absolute -left-px top-0 w-px bg-accent" style={{ height: bar }} />
              <ol className="space-y-6">
                {steps.map((s, i) => (
                  <li key={s.title} className={`transition-all duration-500 ${i === active || reduced ? "opacity-100" : "opacity-35"}`}>
                    <p className="flex items-baseline gap-3">
                      <span className="font-mono text-xs text-accent">{String(i + 1).padStart(2, "0")}</span>
                      <span className="font-display text-2xl font-semibold uppercase">{s.title}</span>
                      <span className="ml-auto font-mono text-xs uppercase tracking-[0.18em] text-cyan">{s.metric}</span>
                    </p>
                    <p className={`overflow-hidden text-sm leading-relaxed text-white/65 transition-all duration-500 ${i === active || reduced ? "mt-2 max-h-24" : "max-h-0"}`}>{s.text}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <div className="hud-corners relative border border-white/10 bg-void/50">
            <div className="absolute left-3 top-3 font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
              <p className="text-cyan">Exploded view</p>
              <p>DWG FXT-TR-01 · rev C</p>
            </div>
            <svg viewBox="0 0 600 600" className="h-auto w-full" role="img" aria-label="Exploded view of a Fixotec trapeze support assembly">
              <line x1={40} y1={60} x2={560} y2={60} stroke="#3fd0ff" strokeOpacity={0.5} />
              {Array.from({ length: 26 }, (_, i) => <line key={i} x1={44 + i * 20} y1={60} x2={34 + i * 20} y2={48} stroke="#3fd0ff" strokeOpacity={0.25} />)}
              {LAYERS.map((layer) => <LayerGroup key={layer.id} layer={layer} explode={explode} labelOpacity={labelOpacity} />)}
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
