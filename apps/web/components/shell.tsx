import Image from "next/image";
import Link from "next/link";
import { FALLBACK_CONTACT, downloadUrl, loadSite, mediaUrl, type SiteData } from "../lib/content";
import { DEMO_MODE } from "../lib/demo";
import { DrawSvg } from "./fx/draw-svg";
import { HeaderScroll } from "./header-scroll";
import { MobileNav } from "./mobile-nav";
import { Icon } from "./icons";
import { RfqLink } from "./rfq-link";

export async function Shell({ children }: { children: React.ReactNode }) {
  const site = await loadSite();
  return (
    <div className="flex min-h-screen flex-col">
      {DEMO_MODE ? <DemoBanner /> : null}
      <TopBar site={site} />
      <Header site={site} />
      <div className="flex-1">{children}</div>
      <Footer site={site} />
    </div>
  );
}

function DemoBanner() {
  return (
    <div role="note" className="bg-accent px-4 py-1.5 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-white">
      Concept demo prepared for Fixotec Pipe Supports Pvt. Ltd. Not the official website. Content sourced from in.fixotec.global.
    </div>
  );
}

function TopBar({ site }: { site: SiteData | null }) {
  const contact = site?.contact || FALLBACK_CONTACT;
  return (
    <div className="hidden border-b border-line bg-void font-mono text-[11px] text-white/60 lg:block">
      <div className="wrap flex h-9 items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-2 whitespace-nowrap uppercase tracking-[0.2em] text-white/45">
            <span className="h-1.5 w-1.5 animate-pulse-node rounded-full bg-cyan" />
            Fixotec <span className="text-accent">//</span> German-engineered <span className="text-accent">//</span> Made in India
          </span>
        </div>
        <div className="flex items-center gap-5">
          {contact.phones.map((phone) => (
            <a key={phone} href={`tel:${phone.replace(/\s/g, "")}`} className="flex items-center gap-1.5 transition-colors hover:text-cyan">
              <Icon name="phone" className="h-3.5 w-3.5" />
              {phone}
            </a>
          ))}
          <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 transition-colors hover:text-cyan">
            <Icon name="mail" className="h-3.5 w-3.5" />
            {contact.email}
          </a>
          <Social site={site} className="text-white/60" />
        </div>
      </div>
    </div>
  );
}

const PRIMARY = [
  ["Services", "/services"],
  ["About", "/about"],
  ["News", "/news"],
  ["Contact", "/contact"],
] as const;

function Header({ site }: { site: SiteData | null }) {
  const logo = mediaUrl(site?.brand?.logoWhiteKey || site?.brand?.logoKey);
  const categories = site?.categories || [];
  const segments = site?.segments || [];
  const sectors = site?.sectors || [];
  return (
    <HeaderScroll>
      <div className="wrap flex h-[72px] items-center justify-between gap-6 transition-[height] duration-300 group-data-[scrolled=true]/header:h-16">
        <Link href="/" className="flex shrink-0 items-center" aria-label="Fixotec home">
          {logo ? <Image src={logo} alt="Fixotec" width={168} height={48} priority className="h-10 w-auto transition-all duration-300 group-data-[scrolled=true]/header:h-8" /> : <span className="font-display text-2xl font-bold tracking-[0.18em] text-white">FIXOTEC</span>}
        </Link>
        <nav className="hidden h-full items-stretch lg:flex">
          <MegaItem label="Products" href="/products">
            <div className="grid grid-cols-[1fr_280px] gap-8">
              <div className="grid grid-cols-3 gap-x-6 gap-y-6">
                {categories.map((c, i) => (
                  <div key={c.slug} className="min-w-0 animate-rise pr-4" style={{ animationDelay: `${i * 35}ms` }}>
                    <Link href={`/products/category/${c.slug}`} className="group/cat flex items-center gap-3">
                      <span className="relative h-11 w-11 shrink-0 overflow-hidden border border-line bg-gradient-to-b from-[#eef2f5] to-[#cfd8df]">
                        {c.imageKey ? <Image src={mediaUrl(c.imageKey)!} alt="" fill sizes="44px" className="object-contain p-1 mix-blend-multiply" /> : null}
                      </span>
                      <span className="text-sm font-semibold leading-tight text-white group-hover/cat:text-cyan">{c.name}</span>
                    </Link>
                    {c.children.length ? (
                      <ul className="mt-2 space-y-1 pl-14">
                        {c.children.map((k) => (
                          <li key={k.slug}>
                            <Link href={`/products/category/${k.slug}`} className="text-[13px] text-white/55 hover:text-cyan">{k.name}</Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="blueprint-dark hud-corners flex flex-col justify-between border border-line p-5">
                <div>
                  <p className="kicker-cyan">Catalogue</p>
                  <p className="mt-3 font-display text-2xl font-semibold uppercase leading-tight text-white">Complete product range in one PDF</p>
                </div>
                <div className="mt-6 flex flex-col gap-2">
                  {site?.catalogue ? <a href={downloadUrl(site.catalogue.id)} className="btn-glow" target="_blank" rel="noreferrer"><Icon name="download" className="h-4 w-4" />Download catalogue</a> : null}
                  <Link href="/products" className="btn-ghost-light">All products</Link>
                </div>
              </div>
            </div>
          </MegaItem>
          <MegaItem label="Segments" href="/segments" narrow>
            <ul className="grid gap-1">
              {segments.map((s, i) => (
                <li key={s.slug} className="animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
                  <Link href={`/segments/${s.slug}`} className="group/seg flex items-center justify-between px-3 py-2.5 text-sm font-semibold text-white/85 transition-colors hover:bg-white/5 hover:text-cyan">
                    <span><span className="mr-3 font-mono text-[10px] text-accent">{String(i + 1).padStart(2, "0")}</span>{s.name}</span>
                    <Icon name="arrow" className="h-4 w-4 opacity-40 transition-transform group-hover/seg:translate-x-1 group-hover/seg:opacity-100" />
                  </Link>
                </li>
              ))}
            </ul>
          </MegaItem>
          <MegaItem label="Sectors" href="/sectors">
            <div className="grid grid-cols-2 gap-8">
              {(["BUILDINGS", "INDUSTRIES"] as const).map((group) => (
                <div key={group}>
                  <p className="kicker-cyan mb-4">{group === "BUILDINGS" ? "Buildings" : "Industries"}</p>
                  <div className="grid grid-cols-2 gap-3">
                    {sectors.filter((s) => s.group === group).map((s, i) => (
                      <Link key={s.slug} href={`/sectors/${s.slug}`} className="zoom scanline group/sec relative block aspect-[16/9] animate-rise overflow-hidden border border-line bg-panel" style={{ animationDelay: `${i * 45}ms` }}>
                        {s.imageKey ? <Image src={mediaUrl(s.imageKey)!} alt="" fill sizes="200px" className="object-cover opacity-75 transition-opacity group-hover/sec:opacity-100" /> : null}
                        <span className="absolute inset-0 bg-gradient-to-t from-void/90 via-void/20 to-transparent" />
                        <span className="absolute bottom-2 left-3 right-3 text-sm font-semibold text-white">{s.name}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </MegaItem>
          {PRIMARY.map(([label, href]) => (
            <Link key={href} href={href} className="link-draw flex items-center px-3.5 text-[15px] font-semibold text-white/80 transition-colors hover:text-white">{label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/search" aria-label="Search" className="hidden h-10 w-10 items-center justify-center text-white/80 transition-colors hover:text-cyan md:flex"><Icon name="search" className="h-5 w-5" /></Link>
          <RfqLink />
          <Link href="/request-quote" className="btn-glow hidden md:inline-flex">Request a quote</Link>
          <MobileNav categories={categories} segments={segments} sectors={sectors} links={PRIMARY.map(([label, href]) => ({ label, href }))} />
        </div>
      </div>
    </HeaderScroll>
  );
}

function MegaItem({ label, href, children, narrow }: { label: string; href: string; children: React.ReactNode; narrow?: boolean }) {
  return (
    <div className={`group ${narrow ? "relative" : ""} flex items-stretch`}>
      <Link href={href} className="link-draw flex items-center gap-1 px-3.5 text-[15px] font-semibold text-white/80 transition-colors group-hover:text-white">
        {label}
        <Icon name="chevron" className="h-3.5 w-3.5 transition-transform group-hover:rotate-180" />
      </Link>
      <div className={`invisible absolute top-full z-50 translate-y-2 border-t border-cyan/60 bg-panel/95 opacity-0 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl transition-all duration-200 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 ${narrow ? "left-0 w-72 border-x border-b border-x-line border-b-line p-3" : "inset-x-0 border-b border-b-line"}`}>
        {narrow ? children : <div className="wrap py-8">{children}</div>}
      </div>
    </div>
  );
}

export function Social({ site, className = "" }: { site: SiteData | null; className?: string }) {
  const social = site?.contact?.social || {};
  const order = ["linkedin", "instagram", "youtube", "twitter"] as const;
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {order.filter((k) => social[k]).map((k) => (
        <a key={k} href={social[k]} target="_blank" rel="noreferrer" aria-label={k} className="transition-colors hover:text-cyan">
          <Icon name={k} className="h-4 w-4" />
        </a>
      ))}
    </div>
  );
}

function FooterRail() {
  const clamps = [120, 300, 480, 660, 840, 1020];
  return (
    <DrawSvg viewBox="0 0 1200 70" className="h-14 w-full text-cyan/60">
      <g fill="none" stroke="currentColor" strokeWidth="1">
        <rect x="20" y="40" width="1160" height="14" pathLength={1} />
        <line x1="20" y1="45" x2="1180" y2="45" pathLength={1} strokeOpacity="0.4" />
        {Array.from({ length: 28 }, (_, i) => <rect key={i} x={40 + i * 41.5} y="47" width="10" height="4" pathLength={1} strokeOpacity="0.5" />)}
        {clamps.map((x, i) => (
          <g key={x}>
            <circle cx={x} cy={40 - (12 + (i % 3) * 4)} r={10 + (i % 3) * 4} pathLength={1} />
            <line x1={x} y1="40" x2={x} y2={40 - 2 * (12 + (i % 3) * 4) - 6} pathLength={1} strokeOpacity="0.4" />
          </g>
        ))}
      </g>
    </DrawSvg>
  );
}

function Footer({ site }: { site: SiteData | null }) {
  const contact = site?.contact || FALLBACK_CONTACT;
  const logo = mediaUrl(site?.brand?.logoWhiteKey);
  return (
    <footer className="blueprint-dark relative mt-auto overflow-hidden border-t border-line text-white/65">
      <div className="wrap pt-10"><FooterRail /></div>
      <div className="wrap relative grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div>
          {logo ? <Image src={logo} alt="Fixotec" width={150} height={44} className="h-9 w-auto" /> : <p className="font-display text-2xl font-bold tracking-[0.18em] text-white">FIXOTEC</p>}
          <p className="mt-4 max-w-xs text-sm leading-relaxed">German-engineered installation and support systems for HVAC, plumbing, electrical and fire-fighting services. Technology partner of Fixotec Befestigungstechnik GmbH.</p>
          <Social site={site} className="mt-5 text-white/60" />
        </div>
        <FooterList title="Products" links={(site?.categories || []).slice(0, 7).map((c) => [c.name, `/products/category/${c.slug}`])} />
        <FooterList
          title="Company"
          links={[
            ["About Fixotec", "/about"],
            ["Services", "/services"],
            ["Segments", "/segments"],
            ["Sectors", "/sectors"],
            ["News", "/news"],
            ["Careers", "/careers"],
            ["Technical library", "/resources"],
          ]}
        />
        <div className="text-sm">
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.2em] text-cyan/70">Contact</p>
          <p className="font-semibold text-white">{contact.company}</p>
          <p className="mt-2 leading-relaxed">{contact.address}</p>
          <div className="mt-4 space-y-1.5">
            {contact.phones.map((phone) => <a key={phone} href={`tel:${phone.replace(/\s/g, "")}`} className="flex items-center gap-2 transition-colors hover:text-cyan"><Icon name="phone" className="h-3.5 w-3.5" />{phone}</a>)}
            <a href={`mailto:${contact.email}`} className="flex items-center gap-2 transition-colors hover:text-cyan"><Icon name="mail" className="h-3.5 w-3.5" />{contact.email}</a>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/request-quote" className="btn-glow h-10">Request a quote</Link>
            {site?.catalogue ? <a href={downloadUrl(site.catalogue.id)} target="_blank" rel="noreferrer" className="btn-ghost-light h-10"><Icon name="download" className="h-4 w-4" />Catalogue</a> : null}
          </div>
        </div>
      </div>
      <p aria-hidden="true" className="text-outline pointer-events-none select-none whitespace-nowrap text-center font-display text-[22vw] font-bold uppercase leading-[0.8] tracking-[0.02em]">Fixotec</p>
      <div className="relative border-t border-line bg-void/80">
        <div className="wrap flex flex-col gap-2 py-5 font-mono text-[11px] text-white/40 md:flex-row md:items-center md:justify-between">
          {DEMO_MODE ? <p>Concept demo. All content and trademarks belong to Fixotec Pipe Supports Pvt. Ltd.</p> : <p>© {new Date().getFullYear()} Fixotec Pipe Supports Pvt. Ltd. All rights reserved.</p>}
          <p className="uppercase tracking-[0.18em]">DPIIT recognised <span className="text-accent">//</span> German technology transfer</p>
        </div>
      </div>
    </footer>
  );
}

function FooterList({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <div className="text-sm">
      <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.2em] text-cyan/70">{title}</p>
      <ul className="space-y-2">
        {links.map(([label, href]) => (
          <li key={href}>
            <Link href={href} className="group inline-flex items-center gap-2 transition-colors hover:text-white">
              <span className="h-px w-0 bg-accent transition-all duration-300 group-hover:w-3" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
