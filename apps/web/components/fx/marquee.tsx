export function Marquee({ items, className = "" }: { items: string[]; className?: string }) {
  if (!items.length) return null;
  const row = [...items, ...items];
  return (
    <div className={`relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)] ${className}`}>
      <ul className="flex w-max animate-marquee items-center hover:[animation-play-state:paused]">
        {[0, 1].map((copy) =>
          row.map((item, i) => (
            <li key={`${copy}-${i}`} aria-hidden={copy === 1 || i >= items.length} className="flex shrink-0 items-center gap-6 px-6 py-5">
              <span className="font-display text-2xl font-semibold uppercase tracking-wide text-white/85 md:text-3xl">{item}</span>
              <svg viewBox="0 0 20 20" className="h-4 w-4 text-accent" aria-hidden="true">
                <path d="M10 1v18M1 10h18" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="10" cy="10" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
