"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { SiteData } from "../lib/content";
import { Icon } from "./icons";

type Props = {
  categories: SiteData["categories"];
  segments: SiteData["segments"];
  sectors: SiteData["sectors"];
  links: Array<{ label: string; href: string }>;
};

export function MobileNav({ categories, segments, sectors, links }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);
  let step = 0;
  const stagger = () => ({ animationDelay: `${60 + step++ * 45}ms` });
  return (
    <>
      <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className="flex h-10 w-10 items-center justify-center text-white lg:hidden">
        <Icon name="menu" className="h-6 w-6" />
      </button>
      {open ? (
        <div className="blueprint-dark fixed inset-0 z-50 flex animate-fade flex-col text-white lg:hidden">
          <div className="flex h-[72px] items-center justify-between border-b border-line px-5">
            <span className="font-display text-xl font-bold tracking-[0.18em]">FIXOTEC</span>
            <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="flex h-10 w-10 items-center justify-center hover:text-cyan"><Icon name="close" className="h-6 w-6" /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <form action="/search" className="mb-4 animate-rise" style={stagger()}>
              <input name="q" placeholder="Search products, article numbers, datasheets" className="h-11 w-full border border-line bg-panel px-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-cyan" />
            </form>
            <Group title="Products" href="/products" style={stagger()}>
              {categories.map((c) => <Link key={c.slug} href={`/products/category/${c.slug}`} className="block py-2 text-[15px] text-white/75 hover:text-cyan">{c.name}</Link>)}
            </Group>
            <Group title="Segments" href="/segments" style={stagger()}>
              {segments.map((s) => <Link key={s.slug} href={`/segments/${s.slug}`} className="block py-2 text-[15px] text-white/75 hover:text-cyan">{s.name}</Link>)}
            </Group>
            <Group title="Sectors" href="/sectors" style={stagger()}>
              {sectors.map((s) => <Link key={s.slug} href={`/sectors/${s.slug}`} className="block py-2 text-[15px] text-white/75 hover:text-cyan">{s.name}</Link>)}
            </Group>
            {[...links, { label: "Technical library", href: "/resources" }, { label: "Careers", href: "/careers" }].map((l) => (
              <Link key={l.href} href={l.href} className="flex animate-rise items-center justify-between border-b border-line py-4 font-display text-2xl font-semibold uppercase" style={stagger()}>
                {l.label}
                <Icon name="arrow" className="h-4 w-4 text-accent" />
              </Link>
            ))}
          </div>
          <div className="border-t border-line p-5">
            <Link href="/request-quote" className="btn-glow w-full">Request a quote</Link>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Group({ title, href, children, style }: { title: string; href: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <details className="group animate-rise border-b border-line" style={style}>
      <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-display text-2xl font-semibold uppercase">
        {title}
        <Icon name="chevron" className="h-4 w-4 text-cyan transition-transform group-open:rotate-180" />
      </summary>
      <div className="pb-3 pl-3">
        <Link href={href} className="block py-2 font-mono text-xs uppercase tracking-[0.18em] text-accent">View all {title.toLowerCase()}</Link>
        {children}
      </div>
    </details>
  );
}
