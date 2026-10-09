import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "../../components/icons";
import { CtaBand, DocumentRow, PageHero } from "../../components/ui";
import { downloadUrl, formatBytes, load, type DocumentRef } from "../../lib/content";

export const metadata: Metadata = { title: "Technical library", description: "Download the Fixotec product catalogue and datasheets for rails, channels, clamps, fixings and accessories." };

type LibraryDoc = DocumentRef & { updatedAt: string; product?: { name: string; slug: string; family?: { name: string; slug: string } | null; category?: { name: string; slug: string } | null } | null };

export default async function ResourcesPage({ searchParams }: { searchParams: Promise<{ q?: string; family?: string }> }) {
  const { q = "", family = "" } = await searchParams;
  const all = (await load<LibraryDoc[]>("/public/documents", 300)) || [];
  const catalogues = all.filter((d) => d.category === "CATALOGUE");
  const datasheets = all.filter((d) => d.category !== "CATALOGUE");
  const families = Array.from(new Map(datasheets.filter((d) => d.product?.family).map((d) => [d.product!.family!.slug, d.product!.family!.name])).entries()).sort((a, b) => a[1].localeCompare(b[1]));
  const term = q.trim().toLowerCase();
  const filtered = datasheets.filter((d) => {
    if (family && d.product?.family?.slug !== family) return false;
    if (term && !`${d.title} ${d.fileName || ""} ${d.product?.name || ""}`.toLowerCase().includes(term)) return false;
    return true;
  });
  const groups = new Map<string, LibraryDoc[]>();
  for (const d of filtered) {
    const key = d.product?.family?.name || "General";
    groups.set(key, [...(groups.get(key) || []), d]);
  }
  const href = (next: { q?: string; family?: string }) => {
    const params = new URLSearchParams();
    const nq = next.q ?? q;
    const nf = next.family ?? family;
    if (nq) params.set("q", nq);
    if (nf) params.set("family", nf);
    return `/resources${params.size ? `?${params}` : ""}#library`;
  };

  return (
    <main>
      <PageHero kicker="Technical library" title="Catalogue & datasheets" lead={`${all.length} technical documents for the complete Fixotec range, free to download.`} crumbs={[{ label: "Technical library" }]} />

      {catalogues.length ? (
        <section className="wrap py-12">
          <div className="grid gap-5 md:grid-cols-2">
            {catalogues.map((c) => (
              <a key={c.id} href={downloadUrl(c.id)} target="_blank" rel="noreferrer" className="group flex items-center gap-6 bg-ink p-7 text-white hover:bg-graphite">
                <span className="flex h-20 w-16 shrink-0 items-center justify-center bg-accent"><Icon name="file" className="h-8 w-8" /></span>
                <span className="flex-1">
                  <span className="kicker text-white/60">Catalogue</span>
                  <span className="mt-1 block font-display text-2xl font-semibold uppercase leading-tight">{c.title}</span>
                  <span className="mt-1 block font-mono text-xs text-white/50">{c.fileName}{c.sizeBytes ? ` · ${formatBytes(c.sizeBytes)}` : ""}</span>
                </span>
                <Icon name="download" className="h-6 w-6 text-white/60 group-hover:text-white" />
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <section id="library" className="scroll-mt-24 border-t border-steel bg-mist">
        <div className="wrap grid gap-10 py-14 lg:grid-cols-[260px_1fr]">
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <form action="/resources#library" className="mb-6">
              {family ? <input type="hidden" name="family" value={family} /> : null}
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-slate" htmlFor="lib-q">Search</label>
              <div className="flex gap-2">
                <input id="lib-q" name="q" defaultValue={q} placeholder="Product or file name" className="field" />
                <button className="btn-dark px-3" type="submit" aria-label="Search"><Icon name="search" className="h-4 w-4" /></button>
              </div>
            </form>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate">Product family</p>
            <nav className="border border-steel bg-white">
              <Link href={href({ family: "" })} className={`block border-b border-steel px-4 py-2.5 text-sm font-semibold ${!family ? "bg-graphite text-white" : "text-graphite hover:bg-mist"}`}>All families <span className="opacity-60">({datasheets.length})</span></Link>
              {families.map(([slug, name]) => (
                <Link key={slug} href={href({ family: slug })} className={`block border-b border-steel px-4 py-2.5 text-sm last:border-b-0 ${family === slug ? "bg-graphite font-semibold text-white" : "text-graphite hover:bg-mist"}`}>
                  {name} <span className="opacity-60">({datasheets.filter((d) => d.product?.family?.slug === slug).length})</span>
                </Link>
              ))}
            </nav>
          </aside>
          <div>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="h-display text-2xl">{filtered.length} datasheet{filtered.length === 1 ? "" : "s"}</h2>
              {q || family ? <Link href="/resources#library" className="text-sm font-semibold text-accent">Clear filters</Link> : null}
            </div>
            {filtered.length ? (
              Array.from(groups.entries()).map(([name, docs]) => (
                <div key={name} className="mb-8">
                  <p className="mb-2 font-display text-lg font-semibold uppercase text-graphite">{name}</p>
                  <div className="border-x border-t border-steel">
                    {docs.map((d) => <DocumentRow key={d.id} doc={d} />)}
                  </div>
                </div>
              ))
            ) : (
              <p className="border border-dashed border-rule bg-white p-10 text-center text-slate">No datasheets match your search.</p>
            )}
          </div>
        </div>
      </section>
      <CtaBand />
    </main>
  );
}
