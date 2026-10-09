import type { Metadata } from "next";
import { CtaBand, NewsCard, PageHero } from "../../components/ui";
import { load, type PostCard } from "../../lib/content";

export const revalidate = 300;
export const metadata: Metadata = { title: "News", description: "Exhibitions, product launches and project news from Fixotec Pipe Supports." };

export default async function NewsPage() {
  const posts = (await load<PostCard[]>("/public/news?limit=60", 300)) || [];
  return (
    <main>
      <PageHero kicker="News" title="News & events" lead="Exhibitions, product launches and updates from the Fixotec team." crumbs={[{ label: "News" }]} />
      <section className="wrap py-16">
        {posts.length ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => <NewsCard key={post.slug} post={post} />)}
          </div>
        ) : (
          <p className="border border-dashed border-rule p-10 text-center text-slate">No news has been published yet.</p>
        )}
      </section>
      <CtaBand />
    </main>
  );
}
