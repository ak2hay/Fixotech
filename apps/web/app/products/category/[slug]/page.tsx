import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryTile, CtaBand, PageHero, ProductGrid, type Crumb } from "../../../../components/ui";
import { load, loadSite, mediaUrl, type CategoryNode, type ProductCard } from "../../../../lib/content";

export const revalidate = 300;

type CategoryPage = { category: CategoryNode | null; trail: Array<{ name: string; slug: string }>; products: ProductCard[] };

const getCategory = (slug: string) => load<CategoryPage>(`/public/categories/${slug}`, 300);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getCategory(slug);
  const name = data?.category ? [...(data.trail || []).map((t) => t.name), data.category.name].join(" – ") : "Category";
  return { title: name, description: data?.category?.description || `${name}: German-engineered MEP support systems by Fixotec.`, alternates: { canonical: `/products/category/${slug}` } };
}

export default async function CategoryPageView({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [data, site] = await Promise.all([getCategory(slug), loadSite()]);
  if (!data?.category) notFound();
  const { category, trail, products } = data;
  const crumbs: Crumb[] = [{ label: "Products", href: "/products" }, ...trail.map((t) => ({ label: t.name, href: `/products/category/${t.slug}` })), { label: category.name }];
  const root = trail[0] ? site?.categories.find((c) => c.slug === trail[0].slug) : site?.categories.find((c) => c.slug === category.slug);
  const siblings = root?.children || [];
  const heroImage = mediaUrl(category.imageKey || root?.imageKey);

  return (
    <main>
      <PageHero kicker={trail.length ? trail[trail.length - 1].name : "Product category"} title={category.name} lead={category.description || `${category.productCount} product${category.productCount === 1 ? "" : "s"} in this range.`} crumbs={crumbs}>
        <Link href="/request-quote" className="btn-primary">Request a quote</Link>
      </PageHero>

      <div className="wrap grid gap-10 py-14 lg:grid-cols-[260px_1fr]">
        <aside className="lg:sticky lg:top-28 lg:self-start">
          {heroImage ? (
            <div className="relative mb-6 hidden aspect-[4/3] border border-steel bg-mist lg:block">
              <Image src={heroImage} alt="" fill sizes="260px" className="object-contain p-4" />
            </div>
          ) : null}
          <p className="kicker mb-3">Categories</p>
          <nav className="border border-steel">
            {(site?.categories || []).map((c) => {
              const active = c.slug === category.slug || c.slug === root?.slug;
              return (
                <div key={c.slug} className="border-b border-steel last:border-b-0">
                  <Link href={`/products/category/${c.slug}`} className={`block px-4 py-2.5 text-sm font-semibold ${c.slug === category.slug ? "bg-graphite text-white" : active ? "text-accent" : "text-graphite hover:bg-mist"}`}>{c.name}</Link>
                  {active && c.children.length ? (
                    <ul className="pb-2">
                      {c.children.map((k) => (
                        <li key={k.slug}>
                          <Link href={`/products/category/${k.slug}`} className={`block py-1.5 pl-7 pr-4 text-[13px] ${k.slug === category.slug ? "font-semibold text-accent" : "text-slate hover:text-accent"}`}>{k.name} <span className="text-slate/60">({k.productCount})</span></Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </nav>
        </aside>

        <div>
          {category.children.length ? (
            <div className="mb-12">
              <h2 className="h-display text-2xl">Sub-categories</h2>
              <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {category.children.map((k) => <CategoryTile key={k.slug} name={k.name} slug={k.slug} imageKey={k.imageKey || category.imageKey} count={k.productCount} />)}
              </div>
            </div>
          ) : siblings.length && trail.length ? (
            <div className="mb-8 flex flex-wrap gap-2">
              {siblings.map((k) => <Link key={k.slug} href={`/products/category/${k.slug}`} className={`chip ${k.slug === category.slug ? "border-graphite bg-graphite text-white" : "hover:border-graphite"}`}>{k.name}</Link>)}
            </div>
          ) : null}
          <h2 className="h-display mb-5 text-2xl">{products.length} product{products.length === 1 ? "" : "s"}</h2>
          <ProductGrid products={products} />
        </div>
      </div>
      <CtaBand />
    </main>
  );
}
