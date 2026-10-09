"use client";

import "./globals.css";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="font-sans text-sm antialiased">
        <main role="alert" className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas p-6 text-center">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="max-w-sm text-muted">The application could not be displayed. Please try again.{error.digest ? ` Reference: ${error.digest}` : ""}</p>
          <button type="button" onClick={reset} className="rounded-md bg-accent px-4 py-2 font-medium text-white">Try again</button>
        </main>
      </body>
    </html>
  );
}
