import Image from "next/image";
import Link from "next/link";
import { Crosshair } from "../components/fx/crosshair";
import { DimensionStat } from "../components/fx/count-up";
import { DrawSvg } from "../components/fx/draw-svg";
import { Marquee } from "../components/fx/marquee";
import { ScrollExploded, type ExplodedStep } from "../components/fx/scroll-exploded";
import { SegmentIcon } from "../components/fx/segment-icon";
import { SpotlightCard } from "../components/fx/spotlight-card";
import { Hero } from "../components/hero";
import { Icon } from "../components/icons";
import { Reveal } from "../components/reveal";
import { ArrowLink, CtaBand, NewsCard, ProductTile, SectionHeader } from "../components/ui";
import { blockOf, downloadUrl, load, loadSite, mediaUrl, type CmsBlock, type Industry, type PostCard, type ProductCard, type ServiceArea, type Solution } from "../lib/content";

export const revalidate = 300;

type Home = { blocks: CmsBlock[]; solutions: Solution[]; industries: Industry[]; products: ProductCard[]; services: ServiceArea[]; news: PostCard[] };
type BannerData = Array<{ title: string; subtitle?: string; features?: string[]; href?: string; imageKey?: string }>;

const STANDARDS = ["German engineering", "Hot-dip galvanised", "Load-tested systems", "Modular · no welding", "BIM & CAD support", "Made in India"];

const ENGINEERED_STEPS: ExplodedStep[] = [
  { title: "Load path", metric: "Tested", text: "Every component in the assembly is rated, so loads travel from pipe to clamp, channel, rod and anchor through a calculated path." },
  { title: "Corrosion", metric: "HDG / ZnNi", text: "Electro-galvanised, hot-dip galvanised and stainless options matched to the exposure class of each project." },
  { title: "Modularity", metric: "No-weld", text: "Channels, brackets and clamps bolt together on site, so supports adapt to clashes and late design changes without hot work." },
  { title: "Install speed", metric: "Faster", text: "Pre-engineered kits and slotted channel cut installation time and keep MEP crews moving on the critical path." },
];

export default async function HomePage() {
  const [home, site] = await Promise.all([load<Home>("/public/home", 300), loadSite()]);
  const blocks = home?.blocks || [];
  const hero = blockOf(blocks, "hero");
  const banners = blockOf<BannerData>(blocks, "banners")?.data || [];
  const milestones = blockOf<Array<{ label: string; value: string }>>(blocks, "milestones")?.data || [];
  const why = blockOf<Array<{ title: string; text: string }>>(blocks, "why");
  const servicesBlock = blockOf(blocks, "services");
  const catalogue = blockOf<{ documentId?: string }>(blocks, "catalogue");
  const categories = site?.categories || [];
  const segments = home?.solutions || [];
  const sectors = home?.industries || [];
  const services = home?.services || [];
  const news = home?.news || [];
  const products = home?.products || [];
  const ticker = why?.data?.length ? [...why.data.map((w) => w.title), ...STANDARDS] : STANDARDS;

  return (
    <main className="bg-void text-white">
      <Hero
        kicker={hero?.title || "German-engineered installation systems"}
        banners={banners.map((b) => ({ title: b.title, subtitle: b.subtitle, features: b.features, href: b.href }))}
      />

      <section className="border-b border-line bg-panel" aria-label="Why Fixotec">
        <Marquee items={ticker} />
      </section>

      <section className="blueprint-dark relative overflow-hidden py-24 md:py-32">
        <Crosshair />
        <div className="wrap relative">
          <Reveal>
            <SectionHeader dark kicker="Product range" title="Complete modular support systems" lead={hero?.subtitle} action={<ArrowLink dark href="/products">View all products</ArrowLink>} />
          </Reveal>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c, i) => {
              const image = mediaUrl(c.imageKey);
              return (
                <Reveal key={c.slug} delay={(i % 3) * 90}>
                  <SpotlightCard href={`/products/category/${c.slug}`} className="h-full">
                    <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-b from-[#eef2f5] to-[#c9d3db]">
                      {image ? <Image src={image} alt={c.name} fill sizes="(min-width: 1024px) 33vw, 50vw" className="object-contain p-6 mix-blend-multiply transition-transform duration-700 group-hover:scale-105" /> : null}
                      <span className="absolute left-3 top-3 font-mono text-[11px] text-graphite/60">{String(i + 1).padStart(2, "0")}</span>
                      <span className="scanline absolute inset-0" />
                    </div>
                    <div className="flex items-center justify-between gap-3 px-5 py-4">
                      <div className="min-w-0">
                        <h3 className="font-display text-xl font-semibold uppercase leading-tight text-white">{c.name}</h3>
                        <p className="mt-0.5 truncate font-mono text-[11px] uppercase tracking-[0.12em] text-haze">
                          {c.children.length ? c.children.map((k) => k.name).join(" · ") : `${c.productCount} product${c.productCount === 1 ? "" : "s"}`}
                        </p>
                      </div>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-line text-white transition-colors group-hover:border-accent group-hover:bg-accent">
                        <Icon name="arrow" className="h-4 w-4" />
                      </span>
                    </div>
                  </SpotlightCard>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <ScrollExploded kicker="How it's engineered" title="Every part carries its share" steps={ENGINEERED_STEPS} />

      {segments.length ? (
        <section className="border-y border-line bg-panel py-24 md:py-28">
          <div className="wrap">
            <Reveal>
              <SectionHeader dark kicker="Segments" title="Support for every building service" action={<ArrowLink dark href="/segments">All segments</ArrowLink>} />
            </Reveal>
          </div>
          <div className="no-scrollbar flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-4 md:px-[max(2rem,calc((100vw-84rem)/2+2rem))]">
            {segments.map((s, i) => (
              <SpotlightCard key={s.slug} href={`/segments/${s.slug}`} className="w-[300px] shrink-0 snap-start md:w-[340px]">
                <div className="flex h-full flex-col p-7">
                  <div className="flex items-start justify-between">
                    <span className="font-mono text-xs text-accent">{String(i + 1).padStart(2, "0")}</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-haze">Segment</span>
                  </div>
                  <SegmentIcon name={`${s.slug} ${s.name}`} className="my-8 h-20 w-20 text-cyan" />
                  <h3 className="font-display text-3xl font-semibold uppercase leading-none">{s.name}</h3>
                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-white/60">{s.summary}</p>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-white/80 group-hover:text-white">
                    Explore <Icon name="arrow" className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </SpotlightCard>
            ))}
          </div>
        </section>
      ) : null}

      {sectors.length ? (
        <section className="wrap py-24 md:py-32">
          <Reveal>
            <SectionHeader dark kicker="Sectors" title="Engineered for demanding projects" lead="From high-rise towers and hospitals to data centres and heavy industry, Fixotec systems carry the services that keep buildings running." action={<ArrowLink dark href="/sectors">All sectors</ArrowLink>} />
          </Reveal>
          {(["BUILDINGS", "INDUSTRIES"] as const).map((group) => (
            <div key={group} className="mb-12 last:mb-0">
              <p className="mb-5 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.24em] text-haze">
                <span className="h-px w-10 bg-accent" />{group === "BUILDINGS" ? "Buildings" : "Industries"}
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {sectors.filter((s) => s.group === group).map((s, i) => (
                  <Reveal key={s.slug} delay={i * 80} variant="clip">
                    <Link href={`/sectors/${s.slug}`} className="hud-corners scanline zoom group relative block aspect-[4/5] overflow-hidden bg-panel">
                      {s.imageKey ? <Image src={mediaUrl(s.imageKey)!} alt={s.name} fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-cover opacity-80 grayscale-[35%] transition duration-700 group-hover:opacity-100 group-hover:grayscale-0" /> : null}
                      <span className="absolute inset-0 bg-gradient-to-t from-void via-void/30 to-transparent" />
                      <span className="absolute left-4 top-4 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan opacity-0 transition-opacity group-hover:opacity-100">SEC-{String(i + 1).padStart(2, "0")}</span>
                      <span className="absolute inset-x-0 bottom-0 p-5">
                        <span className="block font-display text-2xl font-semibold uppercase leading-tight text-white">{s.name}</span>
                        <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-white/70 group-hover:text-white">Learn more <Icon name="arrow" className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
                      </span>
                    </Link>
                  </Reveal>
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {milestones.length ? (
        <section className="relative overflow-hidden bg-accent text-white">
          <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(to_right,rgba(255,255,255,0.25)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.25)_1px,transparent_1px)] [background-size:48px_48px]" />
          <div className="wrap relative grid gap-8 py-20 md:grid-cols-[1fr_2fr] md:items-center">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/75">Our milestones</p>
              <h2 className="mt-3 font-display text-4xl font-semibold uppercase leading-[0.95] md:text-5xl">Growing with India&apos;s MEP industry</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4">
              {milestones.map((m) => <DimensionStat key={m.label} value={m.value} label={m.label} />)}
            </div>
          </div>
        </section>
      ) : null}

      {services.length ? (
        <section className="blueprint-dark relative overflow-hidden border-b border-line py-24 md:py-32">
          <Crosshair />
          <div className="wrap relative">
            <Reveal>
              <SectionHeader dark kicker="Services" title={servicesBlock?.title || "Design and technical support"} lead={servicesBlock?.body} action={<ArrowLink dark href="/services">Our services</ArrowLink>} />
            </Reveal>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((s, i) => (
                <Reveal key={s.slug} delay={(i % 3) * 90}>
                  <SpotlightCard className="h-full">
                    <div className="flex h-full gap-5 p-6">
                      <span className="relative h-16 w-16 shrink-0">
                        <DrawSvg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full text-cyan">
                          <g fill="none" stroke="currentColor" strokeWidth="1">
                            <circle cx="32" cy="32" r="30" pathLength={1} />
                            <path d="M32 0v10M32 54v10M0 32h10M54 32h10" pathLength={1} />
                          </g>
                        </DrawSvg>
                        {s.iconKey ? <Image src={mediaUrl(s.iconKey)!} alt="" fill sizes="64px" className="object-contain p-4 brightness-0 invert" /> : null}
                      </span>
                      <div>
                        <p className="font-mono text-[10px] text-accent">SRV-{String(i + 1).padStart(2, "0")}</p>
                        <h3 className="mt-1 font-display text-xl font-semibold uppercase leading-tight">{s.title}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-white/60">{s.summary}</p>
                      </div>
                    </div>
                  </SpotlightCard>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {products.length ? (
        <section className="wrap py-24 md:py-28">
          <Reveal>
            <SectionHeader dark kicker="Featured" title="Popular products" action={<ArrowLink dark href="/products">Browse catalogue</ArrowLink>} />
          </Reveal>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {products.slice(0, 8).map((p, i) => (
              <Reveal key={p.id} delay={(i % 4) * 70}>
                <ProductTile product={p} dark />
              </Reveal>
            ))}
          </div>
        </section>
      ) : null}

      {catalogue?.data?.documentId ? (
        <section className="wrap pb-24">
          <div className="hud-corners relative grid items-center gap-8 overflow-hidden border border-line bg-panel p-8 md:grid-cols-[auto_1fr_auto] md:p-10">
            <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 opacity-30 md:block">
              <DrawSvg viewBox="0 0 300 160" className="h-full w-full">
                <g fill="none" stroke="#3fd0ff" strokeWidth="0.8">
                  <rect x="20" y="20" width="260" height="120" pathLength={1} />
                  <path d="M20 50h260M20 80h260M20 110h260M90 20v120M160 20v120M230 20v120" pathLength={1} />
                </g>
              </DrawSvg>
            </div>
            <span className="relative flex h-16 w-16 items-center justify-center bg-accent shadow-glow-red"><Icon name="file" className="h-8 w-8" /></span>
            <div className="relative">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan">Spec sheet · PDF</p>
              <h2 className="mt-1 font-display text-3xl font-semibold uppercase leading-tight">{catalogue.title}</h2>
              <p className="mt-1 text-white/60">{catalogue.subtitle}</p>
            </div>
            <div className="relative flex flex-wrap gap-3">
              <a href={downloadUrl(catalogue.data.documentId)} target="_blank" rel="noreferrer" className="btn-glow"><Icon name="download" className="h-4 w-4" />Download PDF</a>
              <Link href="/resources" className="btn-ghost-light">Technical library</Link>
            </div>
          </div>
        </section>
      ) : null}

      {news.length ? (
        <section className="border-t border-line bg-panel py-24 md:py-28">
          <div className="wrap">
            <Reveal>
              <SectionHeader dark kicker="News" title="Latest from Fixotec" action={<ArrowLink dark href="/news">All news</ArrowLink>} />
            </Reveal>
            <div className="grid gap-6 md:grid-cols-3">
              {news.map((post) => <NewsCard key={post.slug} post={post} dark />)}
            </div>
          </div>
        </section>
      ) : null}

      <CtaBand />
    </main>
  );
}
