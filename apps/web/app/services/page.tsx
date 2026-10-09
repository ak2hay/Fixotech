import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CtaBand, FeatureList, PageHero } from "../../components/ui";
import { blockOf, load, mediaUrl, type CmsBlock, type ServiceArea } from "../../lib/content";

export const revalidate = 300;
export const metadata: Metadata = { title: "Services", description: "Onsite support, design and BIM, load calculations, technical submittals and training from the Fixotec engineering team." };

const PROCESS = [
  ["Brief", "Share drawings, BOQ or a site photo. We confirm services, loads and constraints."],
  ["Design", "Support layouts, BIM models and load calculations prepared by our engineers."],
  ["Submit", "Datasheets, drawings and calculations compiled for consultant approval."],
  ["Install", "Onsite guidance and training so crews install the system right first time."],
];

export default async function ServicesPage() {
  const home = await load<{ blocks: CmsBlock[]; services: ServiceArea[] }>("/public/home", 300);
  const intro = blockOf(home?.blocks, "services");
  const why = blockOf<Array<{ title: string; text: string }>>(home?.blocks, "why");
  const services = home?.services || [];

  return (
    <main>
      <PageHero kicker="Services" title={intro?.title || "Design and technical support"} lead={intro?.body} crumbs={[{ label: "Services" }]}>
        <Link href="/contact" className="btn-primary">Talk to an engineer</Link>
        <Link href="/resources" className="btn-outline">Technical library</Link>
      </PageHero>

      <section className="wrap py-16">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {services.map((s, i) => (
            <article key={s.slug} className="tile flex flex-col border border-steel p-7">
              <div className="flex items-start justify-between">
                <span className="relative h-16 w-16 bg-accent-soft">{s.iconKey ? <Image src={mediaUrl(s.iconKey)!} alt="" fill sizes="64px" className="object-contain p-3" /> : null}</span>
                <span className="font-mono text-xs text-slate">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <h2 className="mt-6 font-display text-2xl font-semibold uppercase leading-tight text-graphite">{s.title}</h2>
              <p className="mt-3 leading-relaxed text-slate">{s.summary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-graphite text-white">
        <div className="wrap py-16">
          <p className="kicker">How we work</p>
          <h2 className="mt-2 font-display text-3xl font-semibold uppercase md:text-4xl">From specification to installation</h2>
          <ol className="mt-10 grid gap-px bg-white/10 md:grid-cols-4">
            {PROCESS.map(([title, text], i) => (
              <li key={title} className="bg-graphite p-6">
                <span className="font-display text-5xl font-semibold text-accent">{i + 1}</span>
                <h3 className="mt-3 font-display text-xl font-semibold uppercase">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/65">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {why?.data?.length ? (
        <section className="wrap py-16">
          <p className="kicker">{why.title}</p>
          <h2 className="h-display mb-8 mt-2 text-3xl">Engineering you can rely on</h2>
          <FeatureList items={why.data.map((w) => `${w.title}|${w.text}`)} />
        </section>
      ) : null}
      <CtaBand />
    </main>
  );
}
