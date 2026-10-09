import { DrawSvg } from "./draw-svg";

// Front elevation of a trapeze support: ceiling, two drop rods, strut channel, three clamped pipes.
export function AssemblyBlueprint({ className = "", immediate = false }: { className?: string; immediate?: boolean }) {
  const pipes = [
    { cx: 150, r: 46 },
    { cx: 262, r: 34 },
    { cx: 350, r: 25 },
  ];
  const channelY = 300;
  return (
    <DrawSvg viewBox="0 0 480 400" className={className} immediate={immediate} label="Technical drawing of a trapeze pipe support">
      <g stroke="#3fd0ff" strokeWidth="1.2" fill="none" strokeLinecap="round">
        <line x1="20" y1="40" x2="460" y2="40" pathLength={1} />
        {Array.from({ length: 22 }, (_, i) => <line key={i} x1={24 + i * 20} y1="40" x2={14 + i * 20} y2="28" pathLength={1} strokeOpacity="0.5" />)}
        <rect x="56" y="40" width="36" height="8" pathLength={1} />
        <rect x="388" y="40" width="36" height="8" pathLength={1} />
        <line x1="74" y1="48" x2="74" y2={channelY + 30} pathLength={1} />
        <line x1="406" y1="48" x2="406" y2={channelY + 30} pathLength={1} />
        <rect x="40" y={channelY} width="400" height="22" pathLength={1} />
        <line x1="40" y1={channelY + 5} x2="440" y2={channelY + 5} pathLength={1} strokeOpacity="0.5" />
        {[64, 396].map((x) => (
          <g key={x}>
            <rect x={x} y={channelY - 8} width="20" height="8" pathLength={1} />
            <rect x={x} y={channelY + 22} width="20" height="8" pathLength={1} />
          </g>
        ))}
        {pipes.map((p) => (
          <g key={p.cx}>
            <circle cx={p.cx} cy={channelY - 6 - p.r} r={p.r} pathLength={1} />
            <circle cx={p.cx} cy={channelY - 6 - p.r} r={p.r + 6} pathLength={1} strokeOpacity="0.7" />
            <line x1={p.cx - p.r - 14} y1={channelY - 6 - p.r} x2={p.cx + p.r + 14} y2={channelY - 6 - p.r} pathLength={1} strokeOpacity="0.35" strokeDasharray="4 4" />
            <line x1={p.cx} y1={channelY - 6 - p.r * 2 - 14} x2={p.cx} y2={channelY - 6 + 4} pathLength={1} strokeOpacity="0.35" />
            <rect x={p.cx - 8} y={channelY - 6 - p.r * 2 - 18} width="16" height="12" pathLength={1} />
          </g>
        ))}
      </g>
      <g stroke="#e21f26" strokeWidth="1" fill="none">
        <line x1="40" y1="356" x2="440" y2="356" pathLength={1} />
        <line x1="40" y1="346" x2="40" y2="366" pathLength={1} />
        <line x1="440" y1="346" x2="440" y2="366" pathLength={1} />
        <line x1="466" y1="40" x2="466" y2={channelY} pathLength={1} />
        <line x1="458" y1="40" x2="474" y2="40" pathLength={1} />
        <line x1="458" y1={channelY} x2="474" y2={channelY} pathLength={1} />
      </g>
      <g fill="#3fd0ff" fontFamily="var(--font-mono)" fontSize="10" letterSpacing="2">
        <text x="240" y="380" textAnchor="middle" fill="#e21f26">1200 MM</text>
        <text x="452" y="175" textAnchor="middle" fill="#e21f26" transform="rotate(-90 452 175)">DROP 850</text>
        <text x="150" y="190" textAnchor="middle">DN150</text>
        <text x="262" y="214" textAnchor="middle">DN100</text>
        <text x="350" y="232" textAnchor="middle">DN80</text>
        <text x="40" y="24" fillOpacity="0.6">FXT-TRAPEZE / ELEV. A-A</text>
      </g>
    </DrawSvg>
  );
}
