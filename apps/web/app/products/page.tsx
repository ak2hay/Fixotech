import type { Metadata } from "next";
import Link from "next/link";
import { CategoryTile, CtaBand, PageHero, ProductGrid } from "../../components/ui";
import { load, type CategoryNode, type ProductCard, type Solution } from "../../lib/content";

export const metadata: Metadata = {
  title: "Products",
  description: "German-engineered mounting rails, channels, heavy rail profiles, pipe clamps, fixings and ground mounting systems for MEP installations.",
};

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ segment?: string; q?: string }> }) {
  const { segment, q } = await searchParams;
  const query = new URLSearchParams();
  if (segment) query.set("segment", segment);
  if (q) query.set("q", q);
  const [categories, products, segments] = await Promise.all([
    load<CategoryNode[]>("/public/categories", 300),
    load<ProductCard[]>(`/public/products${query.size ? `?${query}` : ""}`, 300),
    load<Solution[]>("/public/solutions", 300),
  ]);
  const filtered = Boolean(segment || q);

  return (
    <main>
      <PageHero
        kicker="Product range"
        title="Installation & support systems"
        lead="Modular rails, channels, heavy profiles, clamps, fixings and roof mounting systems, engineered to work together on every MEP project."
        crumbs={[{ label: "Products" }]}
      />

      {!filtered ? (
        <section className="wrap py-16">
          <h2 className="h-display text-3xl">Browse by category</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(categories || []).map((c) => (
              <CategoryTile key={c.slug} name={c.name} slug={c.slug} imageKey={c.imageKey} count={c.productCount} subtitle={c.children.length ? c.children.map((k) => k.name).join(" · ") : undefined} />
            ))}
          </div>
        </section>
      ) : null}

      <section id="all" className="border-t border-steel bg-mist">
        <div className="wrap py-16">
          <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="h-display text-3xl">{filtered ? "Filtered products" : "All products"}</h2>
              <p className="mt-1 text-sm text-slate">{(products || []).length} products{q ? ` matching “${q}”` : ""}</p>
            </div>
            <form action="/products#all" className="flex w-full max-w-md gap-2">
              {segment ? <input type="hidden" name="segment" value={segment} /> : null}
              <input name="q" defaultValue={q} placeholder="Search name or article number" className="field" />
              <button className="btn-dark" type="submit">Search</button>
            </form>
          </div>
          <div className="mb-8 flex flex-wrap gap-2">
            <Link href="/products#all" className={`chip ${!segment ? "border-graphite bg-graphite text-white" : "hover:border-graphite"}`}>All segments</Link>
            {(segments || []).map((s) => (
              <Link key={s.slug} href={`/products?segment=${s.slug}#all`} className={`chip ${segment === s.slug ? "border-graphite bg-graphite text-white" : "hover:border-graphite"}`}>{s.name}</Link>
            ))}
          </div>
          <ProductGrid products={products || []} />
        </div>
      </section>
      <CtaBand />
    </main>
  );
}
