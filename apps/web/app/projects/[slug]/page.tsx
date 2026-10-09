import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CtaBand, PageHero } from "../../../components/ui";
import { load, type Study } from "../../../lib/content";

export const revalidate = 300;

const getStudy = (slug: string) => load<Study>(`/public/projects/${slug}`, 300);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const study = await getStudy(slug);
  return { title: study?.title || "Project", description: study?.summary };
}

export default async function StudyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const study = await getStudy(slug);
  if (!study) notFound();
  return (
    <main>
      <PageHero kicker={[study.sector, study.location, study.year].filter(Boolean).join(" · ")} title={study.title} lead={study.summary} crumbs={[{ label: "Projects", href: "/projects" }, { label: study.title }]} />
      <section className="wrap max-w-4xl py-14">
        <div className="prose-fx text-lg">{study.body.split(/\n{2,}/).map((p) => <p key={p}>{p}</p>)}</div>
      </section>
      <CtaBand />
    </main>
  );
}
