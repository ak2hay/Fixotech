"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { Hero3D } from "./three/hero-3d";

export type HeroBanner = { title: string; subtitle?: string; features?: string[]; href?: string };

const DEFAULT_BANNER: HeroBanner = {
  title: "Engineered to carry the building",
  subtitle: "Modular MEP support systems, pipe clamps, channels and fixings, engineered in Germany and made in India.",
  features: ["Load-tested assemblies", "Hot-dip galvanised finishes", "Modular, no-weld installation", "Engineering & BIM support"],
};

function SplitHeadline({ text }: { text: string }) {
  let i = 0;
  return (
    <h1 aria-label={text} className="h-display-light text-[2.9rem] [perspective:600px] sm:text-6xl lg:text-[5.25rem]">
      {text.split(" ").map((word, w) => (
        <span key={w} aria-hidden="true" className="mr-[0.22em] inline-block whitespace-nowrap">
          {word.split("").map((ch) => {
            const delay = i++ * 28;
            return (
              <span key={delay} className="inline-block animate-letter-in motion-reduce:animate-none" style={{ animationDelay: `${delay}ms` }}>
                {ch}
              </span>
            );
          })}
        </span>
      ))}
    </h1>
  );
}

export function Hero({ banners, kicker }: { banners: HeroBanner[]; kicker: string }) {
  const slides = banners.length ? banners : [DEFAULT_BANNER];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || slides.length < 2) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % slides.length), 8000);
    return () => window.clearInterval(timer);
  }, [paused, slides.length]);
  const slide = slides[index];
  const specs = slide.features?.length ? slide.features : DEFAULT_BANNER.features!;

  return (
    <section className="blueprint-dark is-panning vignette relative overflow-hidden border-b border-line text-white" aria-roledescription="carousel">
      <div className="pointer-events-none absolute -left-40 top-1/3 h-[480px] w-[480px] rounded-full bg-accent/20 blur-[120px]" />
      <div className="pointer-events-none absolute -right-20 top-10 h-[420px] w-[420px] rounded-full bg-cyan/15 blur-[120px]" />
      <div className="wrap relative grid min-h-[min(calc(100svh-72px),920px)] items-center gap-10 py-14 lg:grid-cols-[1.05fr_1fr] lg:py-10" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <div className="relative z-10">
          <p className="kicker-cyan">{kicker}</p>
          <div key={index} className="mt-6">
            <SplitHeadline text={slide.title} />
            {slide.subtitle ? <p className="mt-6 max-w-xl animate-rise text-lg leading-relaxed text-white/65 [animation-delay:400ms]">{slide.subtitle}</p> : null}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={slide.href || "/products"} className="btn-glow">Explore the range <Icon name="arrow" className="h-4 w-4" /></Link>
            <Link href="/request-quote" className="btn-ghost-light">Request a quote</Link>
          </div>

          <div key={`spec-${index}`} className="glass-panel mt-10 max-w-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
              <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 animate-pulse-node rounded-full bg-cyan" />Spec readout</span>
              <span>{String(index + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}</span>
            </div>
            <ul className="grid sm:grid-cols-2">
              {specs.slice(0, 4).map((f, i) => (
                <li key={f} className="flex animate-rise items-start gap-3 border-white/10 px-4 py-3 text-sm text-white/85 sm:odd:border-r [&:nth-child(-n+2)]:border-b" style={{ animationDelay: `${500 + i * 90}ms` }}>
                  <span className="mt-0.5 font-mono text-[10px] text-accent">[{String(i + 1).padStart(2, "0")}]</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {slides.length > 1 ? (
            <div className="mt-8 flex items-center gap-3">
              {slides.map((s, i) => (
                <button key={s.title} type="button" onClick={() => setIndex(i)} aria-label={`Slide ${i + 1}`} aria-current={i === index} className="group relative h-6 w-12">
                  <span className="absolute inset-x-0 top-1/2 h-px bg-white/20" />
                  <span className={`absolute left-0 top-1/2 h-px bg-accent transition-all duration-500 ${i === index ? "w-full" : "w-0 group-hover:w-1/2"}`} />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="hud-corners relative h-[380px] w-full border border-white/10 bg-void/40 sm:h-[480px] lg:h-[600px]">
          <div className="absolute left-3 top-3 z-10 font-mono text-[10px] uppercase leading-relaxed tracking-[0.2em] text-white/45">
            <p className="text-cyan">FXT-TRAPEZE / 3D</p>
            <p>Scale 1:10 · ISO view</p>
          </div>
          <Hero3D />
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-white/40 lg:flex">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em]">Scroll</span>
        <span className="relative h-12 w-px bg-white/25">
          <span className="absolute -left-[3px] top-0 h-px w-[7px] bg-white/40" />
          <span className="absolute -left-[3px] bottom-0 h-px w-[7px] bg-white/40" />
          <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 animate-drop rounded-full bg-accent" />
        </span>
      </div>
    </section>
  );
}
