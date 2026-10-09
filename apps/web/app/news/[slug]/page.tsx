import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "../../../components/icons";
import { Breadcrumbs, CtaBand, NewsCard } from "../../../components/ui";
import { formatDate, load, mediaUrl, type PostCard } from "../../../lib/content";
import { jsonLd as ldJson, richText } from "../../../lib/rich-text";

export const revalidate = 300;

type Post = PostCard & { body: string };
const getPost = (slug: string) => load<{ post: Post | null; more: PostCard[] }>(`/public/news/${slug}`, 300);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = (await getPost(slug))?.post;
  const image = mediaUrl(post?.imageKey);
  return {
    title: post?.title || "News",
    description: post?.excerpt || undefined,
    alternates: { canonical: `/news/${slug}` },
    openGraph: post ? { type: "article", publishedTime: post.publishedAt, images: image ? [{ url: image }] : undefined } : undefined,
  };
}

export default async function NewsArticle({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getPost(slug);
  const post = data?.post;
  if (!post) notFound();
  const image = mediaUrl(post.imageKey);
  const jsonLd = { "@context": "https://schema.org", "@type": "NewsArticle", headline: post.title, datePublished: post.publishedAt, image: image ? [image] : undefined, publisher: { "@type": "Organization", name: "Fixotec Pipe Supports Pvt. Ltd." } };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(jsonLd) }} />
      <section className="blueprint border-b border-steel">
        <div className="wrap max-w-4xl py-12 md:py-16">
          <Breadcrumbs items={[{ label: "News", href: "/news" }, { label: post.title }]} />
          <p className="kicker mt-8">{formatDate(post.publishedAt)}</p>
          <h1 className="h-display mt-3 text-4xl md:text-5xl">{post.title}</h1>
        </div>
      </section>
      <article className="wrap max-w-4xl py-12">
        {image ? (
          <div className="relative mb-10 aspect-[16/9] overflow-hidden bg-mist">
            <Image src={image} alt="" fill priority sizes="(min-width: 1024px) 896px, 100vw" className="object-cover" />
          </div>
        ) : null}
        <div className="prose-fx text-[17px]" dangerouslySetInnerHTML={{ __html: richText(post.body) }} />
        <Link href="/news" className="mt-10 inline-flex items-center gap-2 text-sm font-semibold text-graphite hover:text-accent"><Icon name="arrow" className="h-4 w-4 rotate-180" />Back to news</Link>
      </article>
      {data.more?.length ? (
        <section className="border-t border-steel bg-mist">
          <div className="wrap py-14">
            <p className="kicker mb-6">More news</p>
            <div className="grid gap-6 md:grid-cols-3">
              {data.more.map((p) => <NewsCard key={p.slug} post={p} />)}
            </div>
          </div>
        </section>
      ) : null}
      <CtaBand />
    </main>
  );
}
