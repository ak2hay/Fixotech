import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <main className="wrap py-24">
      <p className="kicker">404</p>
      <h1 className="h-display mt-2 text-4xl">We could not find that page</h1>
      <p className="mt-4 max-w-xl text-lg text-slate">The product or page may have moved. Search the catalogue or browse our product range.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/products" className="btn-primary">Browse products</Link>
        <Link href="/search" className="btn-outline">Search</Link>
      </div>
    </main>
  );
}
