import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Reveal } from "../../components/reveal";
import { CtaBand, FeatureList, PageHero } from "../../components/ui";
import { blockOf, load, mediaUrl, type CmsBlock } from "../../lib/content";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "About",
  description: "Fixotec Pipe Supports Pvt. Ltd. brings German-engineered modular support systems to the Indian MEP industry through a technology transfer partnership with Fixotec Befestigungstechnik GmbH.",
};

type Chapter = { heading?: string; title: string; text: string; imageKey?: string | null };

export default async function AboutPage() {
  const home = await load<{ blocks: CmsBlock[] }>("/public/home", 300);
  const about = blockOf<Chapter[]>(home?.blocks, "about");
  const milestones = blockOf<Array<{ label: string; value: string }>>(home?.blocks, "milestones")?.data || [];
  const why = blockOf<Array<{ title: string; text: string }>>(home?.blocks, "why");
  const chapters = about?.data || [];
  const [overview, ...rest] = chapters;

  return (
    <main>
      <PageHero kicker="About Fixotec" title={overview?.title || about?.title || "About Fixotec"} lead={overview?.text || about?.subtitle} crumbs={[{ label: "About" }]}>
        <Link href="/products" className="btn-primary">Our products</Link>
        <Link href="/contact" className="btn-outline">Contact us</Link>
      </PageHero>

      {milestones.length ? (
        <section className="border-b border-steel">
          <div className="wrap grid grid-cols-2 divide-x divide-steel md:grid-cols-4">
            {milestones.map((m) => (
              <div key={m.label} className="px-5 py-8 first:pl-0">
                <p className="font-display text-5xl font-semibold text-accent">{m.value}</p>
                <p className="mt-1 text-sm text-slate">{m.label}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="wrap space-y-20 py-20">
        {rest.map((c, i) => (
          <Reveal key={c.title}>
            <article className="grid items-center gap-10 md:grid-cols-2">
              <div className={i % 2 ? "md:order-2" : ""}>
                {c.heading ? <p className="kicker">{c.heading}</p> : null}
                <h2 className="h-display mt-3 text-3xl md:text-4xl">{c.title}</h2>
                <p className="mt-5 text-lg leading-relaxed text-slate">{c.text}</p>
              </div>
              <div className={`relative aspect-[4/3] overflow-hidden ${c.imageKey ? "bg-mist" : "blueprint"}`}>
                {c.imageKey ? (
                  <Image src={mediaUrl(c.imageKey)!} alt="" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-contain" />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center font-display text-7xl font-semibold uppercase text-graphite/10">{c.heading || "Fixotec"}</span>
                )}
              </div>
            </article>
          </Reveal>
        ))}
      </section>

      {why?.data?.length ? (
        <section className="border-t border-steel bg-mist">
          <div className="wrap py-16">
            <p className="kicker">{why.title}</p>
            <h2 className="h-display mb-8 mt-2 text-3xl">What sets us apart</h2>
            <FeatureList items={why.data.map((w) => `${w.title}|${w.text}`)} />
          </div>
        </section>
      ) : null}
      <CtaBand />
    </main>
  );
}
