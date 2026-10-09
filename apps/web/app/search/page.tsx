import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "../../components/icons";
import { PageHero, ProductGrid } from "../../components/ui";
import { downloadUrl, formatDate, load, type Industry, type ProductCard, type Solution, type Study } from "../../lib/content";

export const metadata: Metadata = { title: "Search", robots: { index: false } };

type Result = {
  products: ProductCard[];
  solutions: Solution[];
  industries: Industry[];
  studies: Study[];
  documents: Array<{ id: string; title: string; category: string }>;
  news: Array<{ slug: string; title: string; publishedAt: string }>;
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const result = q.trim() ? await load<Result>(`/public/search?q=${encodeURIComponent(q.trim())}`) : null;
  const total = result ? result.products.length + result.solutions.length + result.industries.length + result.studies.length + result.documents.length + result.news.length : 0;

  return (
    <main>
      <PageHero kicker="Search" title={q ? `Results for “${q}”` : "Search Fixotec"} crumbs={[{ label: "Search" }]}>
        <form action="/search" className="flex w-full max-w-2xl gap-2">
          <input name="q" defaultValue={q} autoFocus placeholder="Product name, article number (FX-2416), datasheet…" className="field h-12 text-base" />
          <button className="btn-primary h-12" type="submit"><Icon name="search" className="h-4 w-4" />Search</button>
        </form>
      </PageHero>
      <div className="wrap space-y-14 py-14">
        {result && !total ? <p className="border border-dashed border-rule p-10 text-center text-slate">Nothing matched “{q}”. Try a product name, size or article number.</p> : null}
        {result?.products.length ? <Group title="Products" count={result.products.length}><ProductGrid products={result.products} /></Group> : null}
        {result?.documents.length ? (
          <Group title="Datasheets" count={result.documents.length}>
            <div className="grid gap-3 md:grid-cols-2">
              {result.documents.map((d) => (
                <a key={d.id} href={downloadUrl(d.id)} target="_blank" rel="noreferrer" className="group flex items-center gap-3 border border-steel bg-white p-4 hover:border-accent">
                  <Icon name="file" className="h-5 w-5 text-accent" />
                  <span className="flex-1 text-sm font-semibold text-graphite">{d.title}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate">{d.category}</span>
                  <Icon name="download" className="h-4 w-4 text-slate group-hover:text-accent" />
                </a>
              ))}
            </div>
          </Group>
        ) : null}
        {result && (result.solutions.length || result.industries.length) ? (
          <Group title="Segments & sectors" count={result.solutions.length + result.industries.length}>
            <div className="grid gap-3 md:grid-cols-2">
              {result.solutions.map((s) => <ResultLink key={s.slug} href={`/segments/${s.slug}`} label="Segment" title={s.name} text={s.summary} />)}
              {result.industries.map((s) => <ResultLink key={s.slug} href={`/sectors/${s.slug}`} label="Sector" title={s.name} text={s.summary} />)}
            </div>
          </Group>
        ) : null}
        {result?.news.length ? (
          <Group title="News" count={result.news.length}>
            <div className="grid gap-3 md:grid-cols-2">
              {result.news.map((n) => <ResultLink key={n.slug} href={`/news/${n.slug}`} label={formatDate(n.publishedAt)} title={n.title} />)}
            </div>
          </Group>
        ) : null}
        {result?.studies.length ? (
          <Group title="Projects" count={result.studies.length}>
            <div className="grid gap-3 md:grid-cols-2">
              {result.studies.map((s) => <ResultLink key={s.slug} href={`/projects/${s.slug}`} label={s.sector || "Project"} title={s.title} text={s.summary} />)}
            </div>
          </Group>
        ) : null}
      </div>
    </main>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-5 flex items-baseline gap-3 font-display text-2xl font-semibold uppercase text-graphite">{title}<span className="font-mono text-sm font-normal text-slate">{count}</span></h2>
      {children}
    </section>
  );
}

function ResultLink({ href, label, title, text }: { href: string; label: string; title: string; text?: string }) {
  return (
    <Link href={href} className="group block border border-steel bg-white p-5 hover:border-accent">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold uppercase leading-tight text-graphite group-hover:text-accent">{title}</p>
      {text ? <p className="mt-1 line-clamp-2 text-sm text-slate">{text}</p> : null}
    </Link>
  );
}
