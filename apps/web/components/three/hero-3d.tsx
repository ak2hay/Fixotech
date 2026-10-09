"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { AssemblyBlueprint } from "../fx/assembly-blueprint";
import type { SceneMode } from "./pipe-support-scene";

const Scene = dynamic(() => import("./pipe-support-scene"), {
  ssr: false,
  loading: () => <AssemblyBlueprint immediate className="h-full w-full px-6 pb-6 pt-14" />,
});

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function Hero3D() {
  const ref = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [active, setActive] = useState(true);
  const [mode, setMode] = useState<SceneMode>("render");

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setEnabled(!reduced && supportsWebGL());
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { threshold: 0.05 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="relative h-full w-full">
      {enabled ? <Scene mode={mode} active={active} /> : <AssemblyBlueprint immediate className="h-full w-full px-6 pb-6 pt-14" />}
      {enabled ? (
        <div className="absolute right-3 top-3 flex border border-white/15 bg-void/70 font-mono text-[10px] uppercase tracking-[0.18em] backdrop-blur">
          {(["render", "cad"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`px-3 py-1.5 transition-colors ${mode === m ? "bg-cyan text-void" : "text-white/60 hover:text-white"}`}
            >
              {m === "render" ? "Render" : "CAD"}
            </button>
          ))}
        </div>
      ) : null}
      {enabled ? <p className="pointer-events-none absolute bottom-3 right-3 font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">Hover a component</p> : null}
    </div>
  );
}
