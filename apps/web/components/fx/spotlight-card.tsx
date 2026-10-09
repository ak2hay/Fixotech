"use client";

import Link from "next/link";
import { useRef } from "react";

export function SpotlightCard({ href, children, className = "" }: { href?: string; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLElement | null>(null);
  const onMove = (e: React.PointerEvent) => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    node.style.setProperty("--my", `${e.clientY - rect.top}px`);
  };
  const classes = `hud-corners group relative isolate block overflow-hidden border border-line bg-panel transition-colors duration-300 hover:border-cyan/40 ${className}`;
  const inner = (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: "radial-gradient(420px circle at var(--mx, 50%) var(--my, 50%), rgba(63,208,255,0.14), transparent 45%)" }}
      />
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-gradient-to-r from-cyan via-cyan to-transparent transition-transform duration-500 group-hover:scale-x-100" />
      {children}
    </>
  );
  if (href) {
    return <Link href={href} ref={(n) => { ref.current = n; }} onPointerMove={onMove} className={classes}>{inner}</Link>;
  }
  return <div ref={(n) => { ref.current = n; }} onPointerMove={onMove} className={classes}>{inner}</div>;
}
