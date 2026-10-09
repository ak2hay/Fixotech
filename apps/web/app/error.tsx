"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="wrap py-24" role="alert">
      <p className="kicker">Temporarily unavailable</p>
      <h1 className="h-display mt-2 text-4xl">This page could not be loaded</h1>
      <p className="mt-4 max-w-xl text-lg text-slate">Our product data service did not respond. Please try again in a moment, or contact us directly.</p>
      {error.digest ? <p className="mt-2 font-mono text-xs text-haze">Reference: {error.digest}</p> : null}
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" className="btn-primary" onClick={reset}>Try again</button>
        <Link href="/contact" className="btn-outline">Contact us</Link>
      </div>
    </main>
  );
}
