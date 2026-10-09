import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "../../../components/icons";
import { CtaBand, FeatureList, PageHero, ProductGrid } from "../../../components/ui";
import { load, loadSite, mediaUrl, type ProductCard, type Solution } from "../../../lib/content";

export const revalidate = 300;

const getSegment = (slug: string) => load<{ solution: Solution | null; products: ProductCard[] }>(`/public/solutions/${slug}`, 300);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const solution = (await getSegment(slug))?.solution;
  return {
    title: solution?.metaTitle ? { absolute: solution.metaTitle } : solution?.name || "Segment",
    description: solution?.metaDescription || solution?.summary,
    alternates: { canonical: `/segments/${slug}` },
  };
}

export default async function SegmentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [data, site] = await Promise.all([getSegment(slug), loadSite()]);
  const solution = data?.solution;
  if (!solution) notFound();
  const highlights = (solution.features || []).filter((f) => !f.includes("|"));
  const benefits = (solution.features || []).filter((f) => f.includes("|"));
  const paragraphs = solution.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <main>
      <PageHero kicker="Segment" title={solution.name} lead={solution.summary} crumbs={[{ label: "Segments", href: "/segments" }, { label: solution.name }]}>
        <a href="#products" className="btn-primary">View products</a>
        <Link href="/request-quote" className="btn-outline">Request a quote</Link>
      </PageHero>

      <section className="wrap grid gap-12 py-16 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <div>
          <p className="kicker">Overview</p>
          <div className="prose-fx mt-4 text-lg">{paragraphs.map((p) => <p key={p}>{p}</p>)}</div>
          {highlights.length ? (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {highlights.map((h) => (
                <li key={h} className="flex items-center gap-3 border border-steel bg-white px-4 py-3 text-sm font-semibold text-graphite">
                  <span className="flex h-6 w-6 items-center justify-center bg-accent text-white"><Icon name="check" className="h-3.5 w-3.5" /></span>{h}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="relative aspect-square overflow-hidden rounded-full bg-mist">
          {solution.imageKey ? <Image src={mediaUrl(solution.imageKey)!} alt={solution.name} fill sizes="(min-width: 1024px) 40vw, 90vw" className="object-contain p-[15%]" /> : null}
        </div>
      </section>

      {benefits.length ? (
        <section className="border-y border-steel bg-mist">
          <div className="wrap py-16">
            <p className="kicker">Why Fixotec</p>
            <h2 className="h-display mb-8 mt-2 text-3xl">Built for {solution.name} installations</h2>
            <FeatureList items={benefits} />
          </div>
        </section>
      ) : null}

      <section id="products" className="wrap scroll-mt-24 py-16">
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="kicker">Products</p>
            <h2 className="h-display mt-2 text-3xl">{solution.name} product range</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {(site?.segments || []).filter((s) => s.slug !== solution.slug).map((s) => <Link key={s.slug} href={`/segments/${s.slug}`} className="chip hover:border-graphite">{s.name}</Link>)}
          </div>
        </div>
        <ProductGrid products={data.products} />
      </section>
      <CtaBand />
    </main>
  );
}
