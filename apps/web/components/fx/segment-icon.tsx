import { DrawSvg } from "./draw-svg";

const ICONS: Array<{ match: RegExp; draw: React.ReactNode }> = [
  {
    match: /hvac|duct|air|ventil/i,
    draw: (
      <>
        <rect x="10" y="22" width="44" height="20" pathLength={1} />
        <path d="M10 22 18 14h44l-8 8M54 42l8-8V14" pathLength={1} />
        <path d="M22 32h20M36 27l6 5-6 5" pathLength={1} />
      </>
    ),
  },
  {
    match: /plumb|water|sanit|drain/i,
    draw: (
      <>
        <path d="M8 24h28a10 10 0 0 1 10 10v22" pathLength={1} />
        <path d="M8 36h22a4 4 0 0 1 4 4v16" pathLength={1} />
        <path d="M50 10c4 6 6 9 6 12a6 6 0 0 1-12 0c0-3 2-6 6-12z" pathLength={1} />
      </>
    ),
  },
  {
    match: /electr|cable|tray/i,
    draw: (
      <>
        <path d="M6 26h52v16H6z" pathLength={1} />
        <path d="M12 26v16M22 26v16M32 26v16M42 26v16M52 26v16" pathLength={1} />
        <path d="M36 6 26 22h10l-6 14" pathLength={1} />
      </>
    ),
  },
  {
    match: /fire|sprinkler/i,
    draw: (
      <>
        <path d="M8 14h48M32 14v14" pathLength={1} />
        <circle cx="32" cy="34" r="6" pathLength={1} />
        <path d="M20 50l6-8M32 54v-12M44 50l-6-8" pathLength={1} />
      </>
    ),
  },
  {
    match: /solar|pv|energy/i,
    draw: (
      <>
        <path d="M10 44 18 20h36l-8 24z" pathLength={1} />
        <path d="M14 32h36M30 20l-4 24M42 20l-4 24" pathLength={1} />
        <path d="M28 44v12M20 56h16" pathLength={1} />
      </>
    ),
  },
];

const FALLBACK = (
  <>
    <path d="M8 22h48v14H8z" pathLength={1} />
    <path d="M14 22v-12M50 22v-12" pathLength={1} />
    <circle cx="24" cy="48" r="8" pathLength={1} />
    <circle cx="44" cy="48" r="6" pathLength={1} />
  </>
);

export function SegmentIcon({ name, className = "h-14 w-14" }: { name: string; className?: string }) {
  const icon = ICONS.find((i) => i.match.test(name))?.draw || FALLBACK;
  return (
    <DrawSvg viewBox="0 0 64 64" className={className}>
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{icon}</g>
    </DrawSvg>
  );
}
