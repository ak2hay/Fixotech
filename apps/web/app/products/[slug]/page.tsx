import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CadDownloads } from "../../../components/cad-downloads";
import { Icon } from "../../../components/icons";
import { ProductGallery } from "../../../components/product-gallery";
import { Breadcrumbs, CtaBand, DocumentRow, ProductTile, type Crumb } from "../../../components/ui";
import { VariantTable } from "../../../components/variant-table";
import { load, mediaUrl, type Product } from "../../../lib/content";
import { jsonLd as ldJson } from "../../../lib/rich-text";

export const revalidate = 300;

const CAD_CATEGORIES = ["CAD", "BIM", "DRAWING"];

const SEGMENT_NAMES: Record<string, string> = { hvac: "HVAC", plumbing: "Plumbing", electrical: "Electrical", "fire-fighting": "Fire Fighting", "multiple-services": "Multiple Services" };

const getProduct = (slug: string) => load<Product>(`/public/products/${slug}`, 300);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  const image = mediaUrl(product?.heroImageKey);
  return {
    title: product?.metaTitle ? { absolute: product.metaTitle } : product?.name || "Product",
    description: product?.metaDescription || product?.description || undefined,
    alternates: { canonical: `/products/${slug}` },
    openGraph: image ? { images: [{ url: image }] } : undefined,
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const images = Array.from(new Set([product.heroImageKey, ...product.imageKeys].filter(Boolean) as string[])).map((k) => mediaUrl(k)!);
  const crumbs: Crumb[] = [{ label: "Products", href: "/products" }];
  if (product.category?.parent) crumbs.push({ label: product.category.parent.name, href: `/products/category/${product.category.parent.slug}` });
  if (product.category) crumbs.push({ label: product.category.name, href: `/products/category/${product.category.slug}` });
  crumbs.push({ label: product.name });

  const specs = [
    ["Finish", product.coating || product.finish],
    ["Material", product.material],
    ["Thread", product.thread],
    ["Pipe size", product.pipeSize],
    ["Length", product.lengthLabel],
    ["Load capacity", product.loadCapacity],
  ].filter(([, v]) => v) as Array<[string, string]>;
  const variants = product.variants || [];
  const allDocuments = product.documents || [];
  const models = allDocuments.filter((d) => CAD_CATEGORIES.includes(d.category));
  const documents = allDocuments.filter((d) => !CAD_CATEGORIES.includes(d.category));
  const datasheet = documents.find((d) => d.category === "DATASHEET") || documents[0];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    description: product.description,
    image: images,
    category: product.category?.name,
    brand: { "@type": "Brand", name: "Fixotec" },
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(jsonLd) }} />
      <div className="border-b border-steel bg-mist">
        <div className="wrap py-4"><Breadcrumbs items={crumbs} /></div>
      </div>

      <section className="wrap grid gap-10 py-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        <ProductGallery images={images} name={product.name} />
        <div>
          {product.category ? <Link href={`/products/category/${product.category.slug}`} className="kicker hover:underline">{product.category.name}</Link> : null}
          <h1 className="h-display mt-3 text-4xl md:text-5xl">{product.name}</h1>
          {product.description ? <p className="mt-4 text-lg leading-relaxed text-slate">{product.description}</p> : null}

          {product.segments?.length ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {product.segments.map((s) => <Link key={s} href={`/segments/${s}`} className="chip hover:border-accent hover:text-accent">{SEGMENT_NAMES[s] || s}</Link>)}
            </div>
          ) : null}

          {specs.length ? (
            <dl className="mt-8 grid gap-px border border-steel bg-steel sm:grid-cols-2">
              {specs.map(([label, value]) => (
                <div key={label} className="bg-white px-4 py-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate">{label}</dt>
                  <dd className="mt-1 text-sm font-semibold text-graphite">{value}</dd>
                </div>
              ))}
              <div className="bg-white px-4 py-3">
                <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate">Variants</dt>
                <dd className="mt-1 text-sm font-semibold text-graphite">{variants.length}</dd>
              </div>
            </dl>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#variants" className="btn-primary"><Icon name="plus" className="h-4 w-4" />Add variants to RFQ</a>
            {datasheet ? <a href={`#downloads`} className="btn-outline"><Icon name="download" className="h-4 w-4" />Datasheet</a> : null}
            {models.length ? <a href={`#bim`} className="btn-outline"><Icon name="download" className="h-4 w-4" />CAD / BIM</a> : null}
            <Link href={`/contact?topic=${encodeURIComponent(product.name)}`} className="btn-outline">Talk to engineering</Link>
          </div>

          {product.applications?.length ? (
            <div className="mt-10">
              <h2 className="font-display text-xl font-semibold uppercase text-graphite">Application</h2>
              <ul className="mt-3 space-y-2">
                {product.applications.map((a) => <li key={a} className="flex gap-2 text-sm leading-relaxed text-slate"><span className="mt-2 h-1.5 w-1.5 shrink-0 bg-accent" />{a}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      {product.features?.length ? (
        <section className="border-y border-steel bg-mist">
          <div className="wrap py-14">
            <p className="kicker">Features &amp; benefits</p>
            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {product.features.map((f) => (
                <div key={f} className="flex gap-3 border border-steel bg-white p-5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center bg-accent text-white"><Icon name="check" className="h-3.5 w-3.5" /></span>
                  <p className="text-sm leading-relaxed text-graphite">{f}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {variants.length ? (
        <section id="variants" className="wrap scroll-mt-24 py-14">
          <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="kicker">Article list</p>
              <h2 className="h-display mt-2 text-3xl">Variants &amp; article numbers</h2>
            </div>
            <p className="max-w-md text-sm text-slate">Add the sizes you need to your RFQ basket. Pricing is quoted by our sales team based on quantity and project.</p>
          </div>
          <VariantTable variants={variants} productSlug={product.slug} />
        </section>
      ) : null}

      {documents.length ? (
        <section id="downloads" className="wrap scroll-mt-24 pb-14">
          <p className="kicker">Downloads</p>
          <h2 className="h-display mt-2 text-3xl">Datasheets</h2>
          <div className="mt-6 border-x border-t border-steel">
            {documents.map((d) => <DocumentRow key={d.id} doc={d} />)}
          </div>
        </section>
      ) : null}

      {models.length ? (
        <section id="bim" className="wrap scroll-mt-24 pb-14">
          <p className="kicker">BIM library</p>
          <h2 className="h-display mt-2 text-3xl">CAD &amp; BIM models</h2>
          <CadDownloads documents={models} productSlug={product.slug} productName={product.name} />
        </section>
      ) : null}

      {product.related?.length ? (
        <section className="border-t border-steel bg-mist">
          <div className="wrap py-14">
            <p className="kicker">Related</p>
            <h2 className="h-display mt-2 text-3xl">You may also need</h2>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {product.related.map((p) => <ProductTile key={p.id} product={p} />)}
            </div>
          </div>
        </section>
      ) : null}

      <CtaBand />
    </main>
  );
}
