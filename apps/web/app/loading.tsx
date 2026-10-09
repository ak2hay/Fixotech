export default function Loading() {
  return (
    <main className="wrap py-24" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="h-4 w-32 animate-pulse bg-mist" />
      <div className="mt-4 h-10 w-2/3 animate-pulse bg-mist" />
      <div className="mt-6 h-4 w-1/2 animate-pulse bg-mist" />
    </main>
  );
}
