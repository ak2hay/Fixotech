import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "../../components/icons";
import { CtaBand, PageHero } from "../../components/ui";
import { load, type Study } from "../../lib/content";

export const revalidate = 300;
export const metadata: Metadata = { title: "Projects", description: "Project references for Fixotec modular MEP support systems." };

export default async function ProjectsPage() {
  const studies = (await load<Study[]>("/public/projects", 300)) || [];
  return (
    <main>
      <PageHero kicker="Projects" title="Project references" lead="Selected installations where Fixotec systems carry the building services." crumbs={[{ label: "Projects" }]} />
      <section className="wrap py-16">
        {studies.length ? (
          <div className="grid gap-6 md:grid-cols-2">
            {studies.map((s) => (
              <Link key={s.slug} href={`/projects/${s.slug}`} className="tile group flex flex-col border border-steel p-7">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">{[s.sector, s.location, s.year].filter(Boolean).join(" · ")}</p>
                <h2 className="h-display mt-3 text-3xl group-hover:text-accent">{s.title}</h2>
                <p className="mt-3 leading-relaxed text-slate">{s.summary}</p>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-semibold text-graphite">Read project <Icon name="arrow" className="h-4 w-4" /></span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="border border-dashed border-rule p-10 text-center text-slate">Project references are coming soon.</p>
        )}
      </section>
      <CtaBand />
    </main>
  );
}
