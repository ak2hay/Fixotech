"use client";

import { useEffect, useRef, useState } from "react";

// Desktop-only CAD crosshair with coordinate readout, scoped to its parent section.
export function Crosshair() {
  const ref = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setEnabled(fine && !reduced);
  }, []);

  useEffect(() => {
    const node = ref.current;
    const host = node?.parentElement;
    if (!enabled || !node || !host) return;
    const h = node.querySelector<HTMLElement>("[data-h]")!;
    const v = node.querySelector<HTMLElement>("[data-v]")!;
    const label = node.querySelector<HTMLElement>("[data-l]")!;
    let frame = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = host.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        h.style.transform = `translateY(${y}px)`;
        v.style.transform = `translateX(${x}px)`;
        label.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
        label.textContent = `X ${String(Math.round(x)).padStart(4, "0")}  Y ${String(Math.round(y)).padStart(4, "0")}`;
        node.style.opacity = "1";
      });
    };
    const leave = () => { node.style.opacity = "0"; };
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-0 transition-opacity duration-300">
      <div data-h className="absolute inset-x-0 top-0 h-px bg-cyan/20" />
      <div data-v className="absolute inset-y-0 left-0 w-px bg-cyan/20" />
      <div data-l className="absolute left-0 top-0 whitespace-pre font-mono text-[10px] tracking-[0.15em] text-cyan/70" />
    </div>
  );
}
