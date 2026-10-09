"use client";

import { useEffect, useRef } from "react";

const VARIANT_CLASS = { fade: "reveal", clip: "reveal-clip", draw: "reveal-draw" } as const;

export function Reveal({ children, className = "", delay = 0, variant = "fade" }: { children: React.ReactNode; className?: string; delay?: number; variant?: keyof typeof VARIANT_CLASS }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={`${VARIANT_CLASS[variant]} ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}
