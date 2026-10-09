"use client";

import { useEffect, useRef, useState } from "react";

// Children should set pathLength={1} on stroked elements so the CSS dash animation is length-independent.
export function DrawSvg({ children, viewBox, className = "", immediate = false, label }: { children: React.ReactNode; viewBox: string; className?: string; immediate?: boolean; label?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [visible, setVisible] = useState(immediate);
  useEffect(() => {
    if (immediate) {
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "0px 0px -10% 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [immediate]);
  return (
    <svg
      ref={ref}
      viewBox={viewBox}
      className={`reveal-draw ${visible ? "is-visible" : ""} ${className}`}
      style={{ ["--len" as string]: 1 }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {children}
    </svg>
  );
}
