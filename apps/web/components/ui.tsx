import Image from "next/image";
import Link from "next/link";
import { downloadUrl, formatBytes, formatDate, mediaUrl, splitFeature, type DocumentRef, type PostCard, type ProductCard } from "../lib/content";
import { AssemblyBlueprint } from "./fx/assembly-blueprint";
import { Icon } from "./icons";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items, light }: { items: Crumb[]; light?: boolean }) {
  return (
    <nav aria-label="Breadcrumb" className={`flex flex-wrap items-center gap-1.5 text-[13px] ${light ? "text-white/70" : "text-slate"}`}>
      <Link href="/" className={light ? "hover:text-white" : "hover:text-accent"}>Home</Link>
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span className="opacity-50">/</span>
          {item.href ? <Link href={item.href} className={light ? "hover:text-white" : "hover:text-accent"}>{item.label}</Link> : <span className={light ? "text-white" : "text-graphite"}>{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function PageHero({ kicker, title, lead, crumbs = [], imageKey, children }: { kicker?: string; title: string; lead?: string | null; crumbs?: Crumb[]; imageKey?: string | null; children?: React.ReactNode }) {
  const image = mediaUrl(imageKey);
  return (
    <section className="blueprint-dark is-panning relative overflow-hidden border-b border-line text-white">
      {image ? (
        <>
          <Image src={image} alt="" fill priority sizes="100vw" className="object-cover opacity-45 grayscale-[30%]" />
          <div className="absolute inset-0 bg-gradient-to-r from-void via-void/80 to-void/20" />
        </>
      ) : (
        <>
          <div className="pointer-events-none absolute -right-24 top-0 h-[360px] w-[360px] rounded-full bg-cyan/10 blur-[110px]" />
          <AssemblyBlueprint immediate className="pointer-events-none absolute -right-10 top-1/2 hidden h-[115%] -translate-y-1/2 opacity-25 lg:block" />
        </>
      )}
      <div className="wrap relative py-14 md:py-20">
        <Breadcrumbs items={crumbs} light />
        {kicker ? <p className="kicker-cyan mt-8">{kicker}</p> : null}
        <h1 className="h-display-light mt-4 max-w-4xl animate-rise text-4xl md:text-6xl">{title}</h1>
        <span className="mt-6 block h-px w-24 origin-left animate-grow bg-accent" />
        {lead ? <p className="mt-6 max-w-2xl animate-rise text-lg leading-relaxed text-white/70 [animation-delay:150ms]">{lead}</p> : null}
        {children ? <div className="on-dark mt-8 flex flex-wrap gap-3">{children}</div> : null}
      </div>
    </section>
  );
}

export function SectionHeader({ kicker, title, lead, action, dark }: { kicker?: string; title: string; lead?: string | null; action?: React.ReactNode; dark?: boolean }) {
  return (
    <div className="mb-12 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        {kicker ? <p className={dark ? "kicker-cyan" : "kicker"}>{kicker}</p> : null}
        <h2 className={`${dark ? "h-display-light" : "h-display"} mt-3 text-3xl md:text-5xl`}>{title}</h2>
        {lead ? <p className={`mt-4 leading-relaxed ${dark ? "text-white/60" : "text-slate"}`}>{lead}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ArrowLink({ href, children, className = "", dark }: { href: string; children: React.ReactNode; className?: string; dark?: boolean }) {
  return (
    <Link href={href} className={`group inline-flex items-center gap-2 text-sm font-semibold ${dark ? "text-white/80 hover:text-white" : "text-graphite hover:text-accent"} ${className}`}>
      <span className="relative">
        {children}
        <span className="absolute -bottom-1 left-0 h-px w-full origin-left scale-x-0 bg-accent transition-transform duration-300 group-hover:scale-x-100" />
      </span>
      <Icon name="arrow" className="h-4 w-4 transition-transform group-hover:translate-x-1" />
    </Link>
  );
}

export function ProductTile({ product, dark }: { product: ProductCard; dark?: boolean }) {
  const image = mediaUrl(product.heroImageKey || product.imageKeys[0]);
  return (
    <Link
      href={`/products/${product.slug}`}
      className={`hud-corners zoom group flex h-full flex-col border transition-all duration-300 ${dark ? "border-line bg-panel hover:border-cyan/40" : "tile border-steel hover:border-graphite/30"}`}
    >
      <div className={`scanline relative aspect-square overflow-hidden ${dark ? "bg-gradient-to-b from-[#eef2f5] to-[#cfd8df]" : "bg-white"}`}>
        {image ? <Image src={image} alt={product.name} fill sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" className={`object-contain p-6 ${dark ? "mix-blend-multiply" : ""}`} /> : <div className="blueprint h-full" />}
        {product.variantCount > 1 ? <span className="absolute left-3 top-3 bg-graphite px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white">{product.variantCount} variants</span> : null}
      </div>
      <div className={`flex flex-1 flex-col border-t p-5 ${dark ? "border-line" : "border-steel"}`}>
        {product.category ? <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">{product.category.name}</p> : null}
        <h3 className={`mt-1.5 font-display text-xl font-semibold uppercase leading-tight ${dark ? "text-white" : "text-graphite group-hover:text-accent"}`}>{product.name}</h3>
        {product.description ? <p className={`mt-2 line-clamp-2 text-sm leading-relaxed ${dark ? "text-white/55" : "text-slate"}`}>{product.description}</p> : null}
        <span className={`mt-auto inline-flex items-center gap-1.5 pt-4 text-[13px] font-semibold ${dark ? "text-white/80 group-hover:text-cyan" : "text-graphite"}`}>
          View specifications <Icon name="arrow" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
}

export function ProductGrid({ products }: { products: ProductCard[] }) {
  if (!products.length) return <p className="border border-dashed border-rule p-10 text-center text-slate">No products are published here yet.</p>;
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => <ProductTile key={product.id} product={product} />)}
    </div>
  );
}

export function CategoryTile({ name, slug, imageKey, count, subtitle }: { name: string; slug: string; imageKey?: string | null; count?: number; subtitle?: string }) {
  const image = mediaUrl(imageKey);
  return (
    <Link href={`/products/category/${slug}`} className="tile hud-corners zoom group relative flex flex-col border border-steel hover:border-graphite/30">
      <div className="scanline relative aspect-[4/3] overflow-hidden bg-mist">
        {image ? <Image src={image} alt={name} fill sizes="(min-width: 1024px) 33vw, 50vw" className="object-contain p-4" /> : null}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-steel bg-white px-5 py-4">
        <div>
          <h3 className="font-display text-lg font-semibold uppercase leading-tight text-graphite group-hover:text-accent">{name}</h3>
          {subtitle || count ? <p className="mt-0.5 text-xs text-slate">{subtitle || `${count} product${count === 1 ? "" : "s"}`}</p> : null}
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-steel text-graphite transition-colors group-hover:border-accent group-hover:bg-accent group-hover:text-white">
          <Icon name="arrow" className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}

export function FeatureList({ items, columns = 3 }: { items: string[]; columns?: 2 | 3 }) {
  return (
    <div className={`grid gap-px bg-steel sm:grid-cols-2 ${columns === 3 ? "lg:grid-cols-3" : ""}`}>
      {items.map((raw, index) => {
        const { title, text } = splitFeature(raw);
        return (
          <div key={raw} className="group relative bg-white p-6 transition-colors hover:bg-mist">
            <span className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-accent transition-transform duration-500 group-hover:scale-x-100" />
            <p className="font-mono text-xs text-accent">{String(index + 1).padStart(2, "0")}</p>
            <h3 className="mt-2 font-display text-xl font-semibold uppercase leading-tight text-graphite">{title}</h3>
            {text ? <p className="mt-2 text-sm leading-relaxed text-slate">{text}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

export function DocumentRow({ doc, productName }: { doc: DocumentRef & { product?: { name: string; slug: string } | null }; productName?: string }) {
  return (
    <a href={downloadUrl(doc.id)} target="_blank" rel="noreferrer" className="group relative flex items-center gap-4 border-b border-steel bg-white px-4 py-3.5 transition-colors hover:bg-mist">
      <span className="absolute inset-y-0 left-0 w-0.5 origin-top scale-y-0 bg-accent transition-transform duration-300 group-hover:scale-y-100" />
      <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-accent-soft text-accent transition-colors group-hover:bg-accent group-hover:text-white"><Icon name="file" className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-graphite group-hover:text-accent">{doc.title}</span>
        <span className="block truncate font-mono text-[11px] uppercase tracking-[0.12em] text-slate">
          {doc.category} · {doc.fileName}{doc.sizeBytes ? ` · ${formatBytes(doc.sizeBytes)}` : ""}{productName || doc.product?.name ? ` · ${productName || doc.product?.name}` : ""}
        </span>
      </span>
      <Icon name="download" className="h-5 w-5 shrink-0 text-slate group-hover:text-accent" />
    </a>
  );
}

export function CtaBand({ title = "Need help selecting a support system?", lead = "Share your drawings or BOQ. Our engineers respond with a technical recommendation and quotation." }: { title?: string; lead?: string }) {
  return (
    <section className="blueprint-dark relative overflow-hidden border-t border-line text-white">
      <div className="pointer-events-none absolute -left-32 top-0 h-[320px] w-[320px] rounded-full bg-accent/25 blur-[110px]" />
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[46%] opacity-40 md:block">
        <AssemblyBlueprint className="h-full w-full" />
      </div>
      <div className="wrap relative flex flex-col items-start justify-between gap-8 py-20 md:flex-row md:items-center">
        <div className="max-w-2xl">
          <p className="kicker-cyan">Engineering desk</p>
          <h2 className="h-display-light mt-4 text-4xl md:text-5xl">{title}</h2>
          <p className="mt-4 max-w-xl text-white/65">{lead}</p>
        </div>
        <div className="glass-panel flex shrink-0 flex-wrap gap-3 p-4">
          <Link href="/request-quote" className="btn-glow">Request a quote <Icon name="arrow" className="h-4 w-4" /></Link>
          <Link href="/contact" className="btn-ghost-light">Talk to engineering</Link>
        </div>
      </div>
    </section>
  );
}

// Renders the importer's light markdown: "# " section headings, "## " sub-headings, blank-line paragraphs.
export function SimpleMarkdown({ text }: { text: string }) {
  const parts = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="prose-fx">
      {parts.map((part, index) => {
        const [first, ...rest] = part.split("\n");
        if (first.startsWith("## ")) return <div key={index}><h3>{first.slice(3)}</h3>{rest.length ? <p>{rest.join(" ")}</p> : null}</div>;
        if (first.startsWith("# ")) return <div key={index}><h2>{first.slice(2)}</h2>{rest.length ? <p>{rest.join(" ")}</p> : null}</div>;
        return <p key={index}>{part}</p>;
      })}
    </div>
  );
}

export function NewsCard({ post, dark }: { post: PostCard; dark?: boolean }) {
  const image = mediaUrl(post.imageKey);
  return (
    <Link href={`/news/${post.slug}`} className={`hud-corners zoom group flex h-full flex-col border transition-colors duration-300 ${dark ? "border-line bg-void hover:border-cyan/40" : "tile border-steel"}`}>
      <div className={`scanline relative aspect-[16/10] overflow-hidden ${dark ? "bg-panel" : "bg-mist"}`}>
        {image ? <Image src={image} alt="" fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover" /> : <div className={`${dark ? "blueprint-dark" : "blueprint"} h-full`} />}
      </div>
      <div className="flex flex-1 flex-col p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">{formatDate(post.publishedAt)}</p>
        <h3 className={`mt-2 font-display text-xl font-semibold uppercase leading-tight ${dark ? "text-white" : "text-graphite group-hover:text-accent"}`}>{post.title}</h3>
        {post.excerpt ? <p className={`mt-3 line-clamp-3 text-sm leading-relaxed ${dark ? "text-white/55" : "text-slate"}`}>{post.excerpt}</p> : null}
        <span className={`mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-semibold ${dark ? "text-white/80 group-hover:text-cyan" : "text-graphite"}`}>Read more <Icon name="arrow" className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
      </div>
    </Link>
  );
}