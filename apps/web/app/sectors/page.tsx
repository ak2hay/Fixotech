import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "../../components/icons";
import { CtaBand, PageHero } from "../../components/ui";
import { load, mediaUrl, type Industry } from "../../lib/content";

export const revalidate = 300;
export const metadata: Metadata = { title: "Sectors", description: "Modular MEP support systems for high-rise buildings, hotels, hospitals, data centres and manufacturing industries." };

export default async function SectorsPage() {
  const sectors = (await load<Industry[]>("/public/industries", 300)) || [];
  return (
    <main>
      <PageHero kicker="Sectors" title="Trusted across buildings and industry" lead="Every sector has its own loads, codes and schedules. Our engineers adapt the modular system to each of them." crumbs={[{ label: "Sectors" }]} />
      {(["BUILDINGS", "INDUSTRIES"] as const).map((group) => (
        <section key={group} className="wrap py-14 first-of-type:pt-16">
          <p className="mb-6 flex items-center gap-3 font-display text-2xl font-semibold uppercase text-graphite"><span className="h-px w-10 bg-accent" />{group === "BUILDINGS" ? "Buildings" : "Industries"}</p>
          <div className="grid gap-6 md:grid-cols-2">
            {sectors.filter((s) => s.group === group).map((s) => (
              <Link key={s.slug} href={`/sectors/${s.slug}`} className="tile zoom group flex flex-col overflow-hidden border border-steel">
                <div className="relative aspect-[16/9] overflow-hidden bg-mist">
                  {s.heroImageKey || s.imageKey ? <Image src={mediaUrl(s.heroImageKey || s.imageKey)!} alt={s.name} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" /> : null}
                </div>
                <div className="flex flex-1 flex-col p-7">
                  <h2 className="h-display text-3xl group-hover:text-accent">{s.name}</h2>
                  <p className="mt-3 line-clamp-3 leading-relaxed text-slate">{s.summary}</p>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-semibold text-graphite">Explore sector <Icon name="arrow" className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
      <CtaBand />
    </main>
  );
}
