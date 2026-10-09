import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import * as React from "react";
import { cn, humanize, initials } from "./utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-fg shadow-sm hover:bg-accent-strong",
        accent: "bg-accent text-accent-fg shadow-sm hover:bg-accent-strong",
        dark: "bg-sidebar text-white hover:bg-sidebar/90",
        outline: "border border-line bg-surface text-fg shadow-sm hover:bg-canvas",
        line: "border border-line bg-surface text-fg shadow-sm hover:bg-canvas",
        ghost: "text-fg hover:bg-canvas",
        soft: "bg-accent-soft text-accent-strong hover:bg-accent-soft/70",
        danger: "bg-danger text-white hover:bg-danger/90",
        link: "h-auto px-0 text-accent hover:underline",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-5",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) {
  const Comp = asChild ? Slot : "button";
  if (asChild) return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>{children}</Comp>;
  return (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {loading ? <Loader2 className="animate-spin" /> : null}
      {children}
    </button>
  );
});

export type Tone = "neutral" | "good" | "warn" | "bad" | "info" | "accent";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-canvas text-muted ring-line",
  good: "bg-success-soft text-success ring-success/20",
  warn: "bg-warning-soft text-warning ring-warning/20",
  bad: "bg-danger-soft text-danger ring-danger/20",
  info: "bg-info-soft text-info ring-info/20",
  accent: "bg-accent-soft text-accent-strong ring-accent/20",
};

export const toneText: Record<Tone, string> = {
  neutral: "text-muted",
  good: "text-success",
  warn: "text-warning",
  bad: "text-danger",
  info: "text-info",
  accent: "text-accent",
};

export const toneFill: Record<Tone, string> = {
  neutral: "bg-subtle",
  good: "bg-success",
  warn: "bg-warning",
  bad: "bg-danger",
  info: "bg-info",
  accent: "bg-accent",
};

export function Badge({ children, tone = "neutral", className, dot }: { children: React.ReactNode; tone?: Tone; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", toneClasses[tone], className)}>
      {dot ? <span className={cn("h-1.5 w-1.5 rounded-full", toneFill[tone])} /> : null}
      {children}
    </span>
  );
}

const GOOD = ["APPROVED", "ACCEPTED", "CONFIRMED", "PAID", "CLOSED", "DELIVERED", "AVAILABLE", "COMPLETED", "WON", "ON_TRACK", "DONE", "RESOLVED", "CONVERTED", "PASSED", "ACTIVE", "IN_STOCK"];
const BAD = ["REJECTED", "LOST", "CANCELLED", "CREDIT_HOLD", "OVERDUE", "DELAYED", "FAILED", "CRITICAL", "BLOCKED", "OUT_OF_STOCK"];
const WARN = ["UNDER_REVIEW", "PENDING", "PRICING", "QC", "BACKORDERED", "LIMITED", "AT_RISK", "APPROVAL_PENDING", "NEGOTIATION", "PARTIAL", "CLIENT_APPROVAL", "CLIENT_REVIEW", "INTERNAL_REVIEW", "HIGH", "ENGINEERING_REQUIRED", "ON_HOLD", "DUE_TODAY"];
const INFO = ["SHIPPED", "IN_PROGRESS", "RUNNING", "SENT", "SUBMITTED", "QUOTED", "EXECUTION", "ENGINEERING", "CALCULATION", "DRAWING", "RECEIVED", "DISPATCHED", "OPEN", "RFQ", "PRODUCTION", "ISSUED", "QUALIFIED", "OPPORTUNITY"];

export function statusTone(status?: string): Tone {
  const value = (status || "").toUpperCase().replace(/\s+/g, "_");
  if (GOOD.includes(value)) return "good";
  if (BAD.includes(value)) return "bad";
  if (WARN.includes(value)) return "warn";
  if (INFO.includes(value)) return "info";
  return "neutral";
}

export function StatusPill({ status, label, className }: { status?: string | null; label?: string; className?: string }) {
  if (!status) return null;
  return <Badge tone={statusTone(status)} className={className}>{label || humanize(status)}</Badge>;
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  const id = React.useId();
  const noteId = error || hint ? `${id}-note` : undefined;
  const control =
    noteId && React.isValidElement(children)
      ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, { "aria-describedby": noteId, ...(error ? { "aria-invalid": true } : {}) })
      : children;
  return (
    <label className={cn("grid gap-1.5 text-sm", className)}>
      <span className="text-xs font-medium text-fg">{label}</span>
      {control}
      {error ? <span id={noteId} role="alert" className="text-xs text-danger">{error}</span> : hint ? <span id={noteId} className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

const inputBase = "w-full rounded-md border border-line bg-surface px-3 text-sm text-fg shadow-sm outline-none transition placeholder:text-subtle focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:bg-canvas disabled:text-muted";

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode }>(function TextInput({ icon, className, ...props }, ref) {
  if (!icon) return <input ref={ref} {...props} className={cn(inputBase, "h-9", className)} />;
  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      <input ref={ref} {...props} className={cn(inputBase, "h-9 pl-9")} />
    </div>
  );
});

export const PasswordInput = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { icon?: React.ReactNode }>(function PasswordInput({ icon, className, disabled, ...props }, ref) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className={cn("relative", className)}>
      {icon ? <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle [&_svg]:h-4 [&_svg]:w-4">{icon}</span> : null}
      <input ref={ref} {...props} disabled={disabled} type={visible ? "text" : "password"} className={cn(inputBase, "h-9 pr-9", icon && "pl-9")} />
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.preventDefault();
          setVisible((value) => !value);
        }}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:pointer-events-none [&_svg]:h-4 [&_svg]:w-4"
      >
        {visible ? <EyeOff /> : <Eye />}
      </button>
    </div>
  );
});

export const TextArea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(props, ref) {
  return <textarea ref={ref} {...props} className={cn(inputBase, "min-h-24 py-2", props.className)} />;
});

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(props, ref) {
  return <select ref={ref} {...props} className={cn(inputBase, "h-9 pr-8", props.className)} />;
});

export function Checkbox({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="checkbox" {...props} className={cn("h-4 w-4 rounded border-line accent-[rgb(var(--accent))]", className)} />;
}

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-line bg-surface shadow-card", className)} {...props}>{children}</div>;
}

export function CardHeader({ title, description, action, icon, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-4 pb-2 pt-4", className)}>
      <div className="flex min-w-0 items-center gap-2">
        {icon ? <span className="text-muted [&_svg]:h-4 [&_svg]:w-4">{icon}</span> : null}
        <div className="min-w-0">
          <h3 className="truncate text-xs font-semibold uppercase tracking-wide text-fg">{title}</h3>
          {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0 text-xs">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-4 pb-4", className)}>{children}</div>;
}

const avatarColors = ["bg-orange-100 text-orange-700", "bg-sky-100 text-sky-700", "bg-emerald-100 text-emerald-700", "bg-violet-100 text-violet-700", "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700", "bg-teal-100 text-teal-700"];

export function Avatar({ name, src, size = "md", className }: { name?: string | null; src?: string | null; size?: "xs" | "sm" | "md" | "lg"; className?: string }) {
  const sizes = { xs: "h-5 w-5 text-[9px]", sm: "h-7 w-7 text-[10px]", md: "h-8 w-8 text-xs", lg: "h-10 w-10 text-sm" };
  const hash = (name || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  if (src) return <img src={src} alt={name || ""} className={cn("shrink-0 rounded-full object-cover", sizes[size], className)} />;
  return <span title={name || undefined} className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", avatarColors[hash % avatarColors.length], sizes[size], className)}>{initials(name)}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-line/70", className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin text-muted", className)} />;
}

export function EmptyState({ icon, title, description, action, className }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon ? <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-canvas text-muted [&_svg]:h-5 [&_svg]:w-5">{icon}</div> : null}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorNote({ children, className }: { children?: React.ReactNode; className?: string }) {
  if (!children) return null;
  return <div role="alert" className={cn("rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger", className)}>{children}</div>;
}

export function Notice({ children, tone = "info", className }: { children?: React.ReactNode; tone?: Tone; className?: string }) {
  if (!children) return null;
  return <div className={cn("rounded-md px-3 py-2 text-sm ring-1 ring-inset", toneClasses[tone], className)}>{children}</div>;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-line bg-canvas px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted">{children}</kbd>;
}

export function ProgressBar({ value, tone, className, showLabel }: { value: number; tone?: Tone; className?: string; showLabel?: boolean }) {
  const pct = Math.max(0, Math.min(100, Math.round(value || 0)));
  const fill = tone ? toneFill[tone] : pct >= 100 ? "bg-success" : "bg-accent";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
        <div className={cn("h-full rounded-full transition-all", fill)} style={{ width: `${pct}%` }} />
      </div>
      {showLabel ? <span className="w-9 text-right text-xs tabular text-muted">{pct}%</span> : null}
    </div>
  );
}

export function Meter({ label, value, tone = "good", detail }: { label: string; value: number; tone?: Tone; detail?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-semibold tabular text-fg">{detail ?? `${Math.round(value)}%`}</span>
      </div>
      <ProgressBar value={value} tone={tone} />
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px bg-line", className)} />;
}
