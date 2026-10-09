import { cn } from "./utils";

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8", className)} aria-hidden>
      <rect width="32" height="32" rx="7" fill="currentColor" />
      <path d="M8 23V9h11M13.5 15.5h6" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="square" />
      <path d="M18 18l6 6M24 18l-6 6" stroke="#f26b1d" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ subtitle = "Industrial Operating System", tone = "light", className }: { subtitle?: string | null; tone?: "light" | "dark"; className?: string }) {
  return (
    <div className={cn("leading-none", className)}>
      <div className={cn("flex items-baseline text-[22px] font-extrabold tracking-[0.04em]", tone === "light" ? "text-white" : "text-fg")}>
        <span>FI</span>
        <span className="text-accent">X</span>
        <span>OTEC</span>
      </div>
      {subtitle ? <p className={cn("mt-1 text-[10px] font-medium tracking-wide", tone === "light" ? "text-sidebar-muted" : "text-muted")}>{subtitle}</p> : null}
    </div>
  );
}
