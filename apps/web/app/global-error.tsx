"use client";

import "./globals.css";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="font-sans">
        <main className="wrap py-24" role="alert">
          <p className="kicker">Fixotec</p>
          <h1 className="h-display mt-2 text-4xl">Something went wrong</h1>
          <p className="mt-4 max-w-xl text-lg text-slate">The site could not be displayed. Please try again shortly.</p>
          {error.digest ? <p className="mt-2 font-mono text-xs text-haze">Reference: {error.digest}</p> : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" className="btn-primary" onClick={reset}>Try again</button>
            <a href="/" className="btn-outline">Go to the home page</a>
          </div>
        </main>
      </body>
    </html>
  );
}
