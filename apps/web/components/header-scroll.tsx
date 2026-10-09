"use client";

import { useEffect, useState } from "react";

export function HeaderScroll({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header
      data-scrolled={scrolled}
      className={`group/header sticky top-0 z-40 border-b text-white backdrop-blur-xl transition-all duration-300 ${scrolled ? "border-white/10 bg-void/85 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.8)]" : "border-line bg-void"}`}
    >
      {children}
      <span aria-hidden="true" className={`absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-cyan/60 to-transparent transition-opacity duration-500 ${scrolled ? "opacity-100" : "opacity-0"}`} />
    </header>
  );
}
