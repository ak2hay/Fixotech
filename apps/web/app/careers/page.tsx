import type { Metadata } from "next";
import { Icon } from "../../components/icons";
import { FeatureList, PageHero } from "../../components/ui";
import { blockOf, load, type CmsBlock } from "../../lib/content";

export const revalidate = 300;
export const metadata: Metadata = { title: "Careers", description: "Join Fixotec Pipe Supports. Current openings in engineering, production, sales and technology." };

type Careers = { email?: string; values?: Array<{ title: string; text: string }>; openings?: Array<{ title: string; location?: string; type?: string }> };

export default async function CareersPage() {
  const home = await load<{ blocks: CmsBlock[] }>("/public/home", 300);
  const careers = blockOf<Careers>(home?.blocks, "careers");
  const email = careers?.data?.email || "info@in.fixotec.global";
  const openings = careers?.data?.openings || [];
  const values = careers?.data?.values || [];

  return (
    <main>
      <PageHero kicker="Careers" title={careers?.title || "Building careers, shaping futures"} lead={careers?.body} crumbs={[{ label: "Careers" }]}>
        <a href="#openings" className="btn-primary">View openings</a>
        <a href={`mailto:${email}?subject=Career%20application`} className="btn-outline">Send your CV</a>
      </PageHero>

      {values.length ? (
        <section className="wrap py-16">
          <p className="kicker">Life at Fixotec</p>
          <h2 className="h-display mb-8 mt-2 text-3xl">What we stand for</h2>
          <FeatureList items={values.map((v) => `${v.title}|${v.text}`)} />
        </section>
      ) : null}

      <section id="openings" className="scroll-mt-24 border-t border-steel bg-mist">
        <div className="wrap py-16">
          <p className="kicker">Current openings</p>
          <h2 className="h-display mb-8 mt-2 text-3xl">{openings.length} open position{openings.length === 1 ? "" : "s"}</h2>
          <div className="border-x border-t border-steel">
            {openings.map((job) => (
              <div key={job.title} className="flex flex-col gap-4 border-b border-steel bg-white p-5 md:flex-row md:items-center">
                <div className="flex-1">
                  <h3 className="font-display text-xl font-semibold uppercase leading-tight text-graphite">{job.title}</h3>
                  <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate">
                    {job.location ? <span className="inline-flex items-center gap-1.5"><Icon name="pin" className="h-4 w-4" />{job.location}</span> : null}
                    {job.type ? <span className="chip">{job.type}</span> : null}
                  </p>
                </div>
                <a href={`mailto:${email}?subject=${encodeURIComponent(`Application: ${job.title}`)}`} className="btn-dark shrink-0">Apply <Icon name="arrow" className="h-4 w-4" /></a>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-slate">Don&apos;t see your role? Send your CV to <a href={`mailto:${email}`} className="font-semibold text-accent">{email}</a>.</p>
        </div>
      </section>
    </main>
  );
}
