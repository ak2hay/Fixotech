import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "../../../components/icons";
import { CtaBand, FeatureList, PageHero, ProductGrid } from "../../../components/ui";
import { load, loadSite, mediaUrl, type Industry, type ProductCard } from "../../../lib/content";

export const revalidate = 300;

type SectorPage = Industry & { products: ProductCard[]; solutions: Array<{ slug: string; name: string; summary: string; imageKey?: string | null }> };

const getSector = (slug: string) => load<SectorPage>(`/public/industries/${slug}`, 300);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const sector = await getSector(slug);
  return {
    title: sector?.metaTitle ? { absolute: sector.metaTitle } : sector?.name || "Sector",
    description: sector?.metaDescription || sector?.summary,
    alternates: { canonical: `/sectors/${slug}` },
  };
}

function sections(body: string) {
  return body
    .split(/\n+(?=#{1,2} )/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith("#"))
    .map((chunk) => {
      const [heading, ...rest] = chunk.split("\n");
      const level = heading.startsWith("## ") ? 2 : 1;
      return { level, title: heading.replace(/^#{1,2} /, "").trim(), text: rest.join(" ").trim() };
    });
}

export default async function SectorPageView({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [sector, site] = await Promise.all([getSector(slug), loadSite()]);
  if (!sector) notFound();
  const parsed = sections(sector.body);
  const apps = parsed.filter((s) => s.level === 2);
  const statements = parsed.filter((s) => s.level === 1 && s.text);
  const intro = parsed.length ? "" : sector.body;
  const others = (site?.sectors || []).filter((s) => s.slug !== sector.slug && s.group === sector.group);

  return (
    <main>
      <PageHero kicker={sector.group === "BUILDINGS" ? "Buildings sector" : "Industries sector"} title={sector.name} lead={sector.summary} crumbs={[{ label: "Sectors", href: "/sectors" }, { label: sector.name }]} imageKey={sector.heroImageKey || sector.imageKey}>
        <Link href="/request-quote" className="btn-primary">Discuss your project</Link>
        <a href="#products" className="btn-ghost-light">Recommended products</a>
      </PageHero>

      {apps.length ? (
        <section className="wrap py-16">
          <p className="kicker">Applications</p>
          <h2 className="h-display mt-2 text-3xl">Where our systems are used</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {apps.map((a, i) => (
              <div key={a.title} className="tile border border-steel p-6">
                <span className="flex h-10 w-10 items-center justify-center bg-graphite font-mono text-sm text-white">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-4 font-display text-xl font-semibold uppercase leading-tight text-graphite">{a.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate">{a.text}</p>
              </div>
            ))}
          </div>
        </section>
      ) : intro ? (
        <section className="wrap py-16"><div className="prose-fx max-w-3xl text-lg"><p>{intro}</p></div></section>
      ) : null}

      {sector.features?.length ? (
        <section className="border-y border-steel bg-mist">
          <div className="wrap py-16">
            <p className="kicker">Benefits</p>
            <h2 className="h-display mb-3 mt-2 text-3xl">{statements[0]?.title || `Why ${sector.name.toLowerCase()} choose Fixotec`}</h2>
            {statements[0] && statements[0].text !== sector.summary ? <p className="mb-8 max-w-3xl leading-relaxed text-slate">{statements[0].text}</p> : <div className="mb-8" />}
            <FeatureList items={sector.features} />
          </div>
        </section>
      ) : null}

      {statements.slice(sector.features?.length ? 1 : 0).map((s) => (
        <section key={s.title} className="bg-graphite text-white">
          <div className="wrap grid gap-6 py-14 md:grid-cols-[1fr_1.4fr] md:items-center">
            <h2 className="font-display text-3xl font-semibold uppercase leading-tight">{s.title}</h2>
            <p className="leading-relaxed text-white/75">{s.text}</p>
          </div>
        </section>
      ))}

      {sector.solutions.length ? (
        <section className="wrap pt-16">
          <p className="kicker">Segments</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {sector.solutions.map((s) => (
              <Link key={s.slug} href={`/segments/${s.slug}`} className="tile group flex items-center gap-4 border border-steel p-4">
                <span className="relative h-14 w-14 shrink-0 bg-mist">{s.imageKey ? <Image src={mediaUrl(s.imageKey)!} alt="" fill sizes="56px" className="object-contain p-1.5" /> : null}</span>
                <span className="font-display text-lg font-semibold uppercase text-graphite group-hover:text-accent">{s.name}</span>
                <Icon name="arrow" className="ml-auto h-4 w-4 text-slate" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section id="products" className="wrap scroll-mt-24 py-16">
        <p className="kicker">Recommended products</p>
        <h2 className="h-display mb-8 mt-2 text-3xl">Systems for {sector.name.toLowerCase()}</h2>
        <ProductGrid products={sector.products} />
      </section>

      {others.length ? (
        <section className="border-t border-steel bg-mist">
          <div className="wrap py-14">
            <p className="kicker mb-5">Other sectors</p>
            <div className="grid gap-4 sm:grid-cols-3">
              {others.map((s) => (
                <Link key={s.slug} href={`/sectors/${s.slug}`} className="zoom group relative block aspect-[16/9] overflow-hidden bg-steel">
                  {s.imageKey ? <Image src={mediaUrl(s.imageKey)!} alt="" fill sizes="33vw" className="object-cover" /> : null}
                  <span className="absolute inset-0 bg-gradient-to-t from-ink/85 to-transparent" />
                  <span className="absolute bottom-3 left-4 font-display text-xl font-semibold uppercase text-white">{s.name}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}
      <CtaBand />
    </main>
  );
}
