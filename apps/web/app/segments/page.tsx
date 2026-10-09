import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "../../components/icons";
import { CtaBand, PageHero } from "../../components/ui";
import { load, mediaUrl, type Solution } from "../../lib/content";

export const revalidate = 300;
export const metadata: Metadata = { title: "Segments", description: "Modular support systems for HVAC, plumbing, electrical, fire-fighting and multiple-service installations." };

export default async function SegmentsPage() {
  const segments = (await load<Solution[]>("/public/solutions", 300)) || [];
  return (
    <main>
      <PageHero kicker="Segments" title="One system for every building service" lead="Fixotec supports carry ducts, pipes, cable trays and equipment across every MEP discipline, from a single modular range." crumbs={[{ label: "Segments" }]} />
      <section className="wrap space-y-6 py-16">
        {segments.map((s, i) => (
          <Link key={s.slug} href={`/segments/${s.slug}`} className="tile zoom group grid overflow-hidden border border-steel md:grid-cols-[320px_1fr]">
            <div className="relative aspect-[4/3] bg-mist md:aspect-auto">
              {s.imageKey ? <Image src={mediaUrl(s.imageKey)!} alt={s.name} fill sizes="320px" className="object-contain p-8" /> : null}
            </div>
            <div className="flex flex-col justify-center p-8">
              <p className="font-mono text-xs text-accent">{String(i + 1).padStart(2, "0")}</p>
              <h2 className="h-display mt-2 text-3xl group-hover:text-accent">{s.name}</h2>
              <p className="mt-3 max-w-3xl leading-relaxed text-slate">{s.summary}</p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-graphite">View {s.name} products <Icon name="arrow" className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
            </div>
          </Link>
        ))}
      </section>
      <CtaBand />
    </main>
  );
}
