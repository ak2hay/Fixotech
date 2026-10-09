"use client";

import { useEffect, useRef, useState } from "react";

// Animates the leading number in values like "25+", "1,200" or "40 000 t"; any prefix/suffix is preserved.
function parse(value: string) {
  const match = value.match(/^(\D*)([\d.,\s]*\d)(.*)$/);
  if (!match) return null;
  const raw = match[2].replace(/[,\s]/g, "");
  const target = Number(raw);
  if (!Number.isFinite(target)) return null;
  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
  return { prefix: match[1], target, decimals, suffix: match[3], grouped: /[,\s]/.test(match[2]) };
}

export function CountUp({ value, duration = 1800, className = "" }: { value: string; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const parsed = parse(value);
  const [shown, setShown] = useState(parsed ? 0 : null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !parsed) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(parsed.target);
      return;
    }
    let frame = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min((now - start) / duration, 1);
        setShown(parsed.target * (1 - Math.pow(1 - t, 3)));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, duration]);

  if (!parsed || shown === null) return <span className={className}>{value}</span>;
  const number = shown.toFixed(parsed.decimals);
  const formatted = parsed.grouped ? Number(number).toLocaleString("en-IN", { minimumFractionDigits: parsed.decimals }) : number;
  return (
    <span ref={ref} className={`tabular-nums ${className}`} aria-label={value}>
      {parsed.prefix}{formatted}{parsed.suffix}
    </span>
  );
}

export function DimensionStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="relative px-6 py-8">
      <div className="dim-line mb-5 text-white/50" />
      <p className="font-display text-5xl font-semibold leading-none md:text-6xl"><CountUp value={value} /></p>
      <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-white/75">{label}</p>
    </div>
  );
}
