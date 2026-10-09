"use client";

import { Badge, ErrorNote, FileTile, Page, PageHeader, Skeleton, cn, formatDate, humanize, statusTone, type ActivityItem, type Crumb, type Tone } from "@fixotec/ui";
import { ArrowUpDown, Building2, ChevronDown, LayoutGrid, List, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { blobUrl, download, mediaUrl } from "../lib/api";
import { useApi, type Paged } from "../lib/query";
import { Link } from "./link";

export const HEALTH_LABEL: Record<string, string> = { ON_TRACK: "On Track", AT_RISK: "At Risk", DELAYED: "Delayed" };

export function HealthPill({ health }: { health?: string | null }) {
  if (!health) return <span className="text-xs text-subtle">—</span>;
  return <Badge tone={statusTone(health)}>{HEALTH_LABEL[health] || humanize(health)}</Badge>;
}

export function Cover({ url, className, rounded = "rounded-md" }: { url?: string | null; className?: string; rounded?: string }) {
  const src = mediaUrl(url);
  if (!src) {
    return (
      <span className={cn("flex shrink-0 items-center justify-center bg-canvas text-subtle", rounded, className)}>
        <Building2 className="h-4 w-4" />
      </span>
    );
  }
  return <img src={src} alt="" className={cn("shrink-0 object-cover", rounded, className)} />;
}

/** Loads a protected image with the session token. */
export function useBlobUrl(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let revoked = false;
    let created: string | null = null;
    blobUrl(path)
      .then((value) => {
        created = value;
        if (!revoked) setUrl(value);
      })
      .catch(() => setUrl(null));
    return () => {
      revoked = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [path]);
  return url;
}

export type DocumentSummary = { id: string; title: string; category: string; version?: number; status?: string; sizeBytes?: number; hasThumbnail?: boolean; updatedAt?: string; entityName?: string | null };

export function DocumentTile({ doc }: { doc: DocumentSummary }) {
  const thumb = useBlobUrl(doc.hasThumbnail ? `/documents/${doc.id}/thumbnail` : null);
  const meta = [doc.version ? `REV ${doc.version}` : null, doc.sizeBytes ? fileSize(doc.sizeBytes) : null, doc.entityName].filter(Boolean).join(" · ");
  return <FileTile title={doc.title} meta={meta} kind={doc.category} thumbnailUrl={thumb} onClick={() => download(`/documents/${doc.id}/download`, doc.title)} />;
}

export function fileSize(bytes: number) {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`;
  return `${bytes} B`;
}

export type ActivityRow = { id: string; at: string; title: string; description?: string; actor?: string | null; status?: string | null; href?: string | null };

const PORTAL_ROUTES = ["/projects/", "/rfqs/", "/quotations/", "/orders/", "/engineering/", "/boq/"];

/** Activity links point at ERP paths; keep only the ones the portal also serves. */
export function toActivity(rows: ActivityRow[] = []): ActivityItem[] {
  return rows.map((row) => {
    const href = row.href?.replace(/^\/sales-orders\//, "/orders/") || undefined;
    return { id: row.id, at: row.at, title: row.title, description: row.description, actor: row.actor, tone: row.status ? statusTone(row.status) : "neutral", href: href && PORTAL_ROUTES.some((prefix) => href.startsWith(prefix)) ? href : undefined };
  });
}

export function QueryError({ error }: { error: unknown }) {
  if (!error) return null;
  return <ErrorNote>{(error as Error).message || "Something went wrong"}</ErrorNote>;
}

export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-5 px-4 py-6 lg:px-8 lg:py-8">
      <div className="space-y-2">
        <Skeleton className="h-9 w-56 rounded-lg" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[104px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-16 rounded-xl" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  );
}

/* ------------------------------ Page building blocks ------------------------------ */

export function PageHero({ title, description, actions }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-fg">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PrimaryButton({ href, onClick, icon = <Plus />, children }: { href?: string; onClick?: () => void; icon?: React.ReactNode; children: React.ReactNode }) {
  const className = "inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-white shadow-md shadow-accent/25 transition hover:bg-accent-strong [&_svg]:h-4 [&_svg]:w-4";
  if (href) return <Link href={href} className={className}>{icon}{children}</Link>;
  return <button type="button" onClick={onClick} className={className}>{icon}{children}</button>;
}

export type KpiTone = "blue" | "green" | "amber" | "violet" | "rose";

const KPI_TONES: Record<KpiTone, string> = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
  rose: "bg-rose-50 text-rose-600",
};

export function KpiCard({ label, value, icon, tone = "blue", footer, footerTone = "muted", loading }: { label: string; value: React.ReactNode; icon: React.ReactNode; tone?: KpiTone; footer?: React.ReactNode; footerTone?: "muted" | "good"; loading?: boolean }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-line/70 bg-surface p-5 shadow-card">
      <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl [&_svg]:h-[22px] [&_svg]:w-[22px]", KPI_TONES[tone])}>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-sm text-muted">{label}</p>
        {loading ? <Skeleton className="my-1 h-7 w-12" /> : <p className="text-2xl font-bold leading-tight tabular text-fg">{value}</p>}
        {footer ? <p className={cn("mt-0.5 truncate text-xs", footerTone === "good" ? "font-medium text-success" : "text-muted")}>{footer}</p> : null}
      </div>
    </div>
  );
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

export function shareOf(part: number, total: number) {
  return `${total ? Math.round((part / total) * 100) : 0}% of total`;
}

export type DotTab = { key: string; label: string; dot?: string };

export function DotTabs({ items, value, onChange }: { items: DotTab[]; value: string; onChange: (key: string) => void }) {
  return (
    <div className="-mb-px flex gap-1 overflow-x-auto" role="tablist">
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button key={item.key} type="button" role="tab" aria-selected={active} onClick={() => onChange(item.key)} className={cn("flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-4 text-sm font-medium transition-colors", active ? "border-accent text-accent" : "border-transparent text-fg/70 hover:text-fg")}>
            {item.dot ? <span className={cn("h-2 w-2 rounded-full", item.dot)} /> : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function ToolbarCard({ tabs, children }: { tabs?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-line/70 bg-surface px-4 shadow-card">
      <div className="min-w-0 max-w-full">{tabs}</div>
      {children ? <div className="flex flex-wrap items-center gap-2 py-3">{children}</div> : null}
    </div>
  );
}

export function SortSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<{ key: string; label: string }> }) {
  return (
    <label className="relative flex h-10 items-center gap-2 rounded-lg border border-line bg-surface pl-3 pr-8 text-sm text-fg transition focus-within:border-accent">
      <ArrowUpDown className="h-4 w-4 text-muted" />
      <span className="sr-only">Sort by</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="appearance-none bg-transparent pr-1 outline-none">
        {options.map((option) => (
          <option key={option.key} value={option.key}>Sort by: {option.label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-muted" />
    </label>
  );
}

export function ViewToggle({ value, onChange }: { value: "grid" | "list"; onChange: (value: "grid" | "list") => void }) {
  return (
    <div className="flex h-10 items-center rounded-lg border border-line bg-surface p-1">
      {(["grid", "list"] as const).map((key) => {
        const Icon = key === "grid" ? LayoutGrid : List;
        return (
          <button key={key} type="button" aria-label={key === "grid" ? "Grid view" : "List view"} aria-pressed={value === key} onClick={() => onChange(key)} className={cn("flex h-8 w-8 items-center justify-center rounded-md transition", value === key ? "bg-accent-soft text-accent" : "text-muted hover:text-fg")}>
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}

/** White rounded frame for data tables. */
export function TableCard({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-xl border border-line/70 bg-surface shadow-card">{children}</div>;
}

const BADGE_TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-600",
  good: "bg-emerald-50 text-emerald-700",
  warn: "bg-amber-50 text-amber-700",
  bad: "bg-rose-50 text-rose-700",
  info: "bg-blue-50 text-blue-700",
  accent: "bg-accent-soft text-accent",
};

const DOT_TONES: Record<Tone, string> = {
  neutral: "bg-slate-400",
  good: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-rose-500",
  info: "bg-blue-500",
  accent: "bg-accent",
};

/** Project stages read differently from the ERP's generic status colours. */
const STAGE_TONES: Record<string, Tone> = { IDENTIFIED: "neutral", RFQ: "info", ENGINEERING: "good", QUOTED: "warn", NEGOTIATION: "warn", WON: "good", EXECUTION: "info", CLOSED: "accent", LOST: "bad" };

export function toneOf(status?: string | null, kind: "status" | "stage" = "status"): Tone {
  if (kind === "stage" && status && STAGE_TONES[status]) return STAGE_TONES[status];
  return statusTone(status || "");
}

export function StageBadge({ status, kind = "status", label }: { status?: string | null; kind?: "status" | "stage"; label?: string }) {
  if (!status) return <span className="text-subtle">—</span>;
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", BADGE_TONES[toneOf(status, kind)])}>{label || humanize(status)}</span>;
}

export function StatusChip({ status, kind = "status" }: { status: string; kind?: "status" | "stage" }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-fg shadow-sm backdrop-blur">
      <span className={cn("h-2 w-2 rounded-full", DOT_TONES[toneOf(status, kind)])} />
      {humanize(status)}
    </span>
  );
}

export function MetaItem({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-fg/70 [&_svg]:h-[18px] [&_svg]:w-[18px]">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <div className="mt-0.5 truncate text-sm font-medium text-fg">{children}</div>
      </div>
    </div>
  );
}

/** Indian short form with a space after the symbol: ₹ 2.4 Cr, ₹ 85 L. */
export function rupees(value?: number | string | null) {
  const amount = Number(value);
  if (value == null || value === "" || !Number.isFinite(amount) || amount === 0) return "₹ -";
  if (amount >= 1e7) return `₹ ${Number((amount / 1e7).toFixed(2))} Cr`;
  if (amount >= 1e5) return `₹ ${Number((amount / 1e5).toFixed(1))} L`;
  return `₹ ${new Intl.NumberFormat("en-IN").format(Math.round(amount))}`;
}

/** Total for a list endpoint filtered to one status; `null` path skips the request. */
export function useCount(path: string | null) {
  const { data, isLoading } = useApi<Paged<unknown>>(path ? `${path}${path.includes("?") ? "&" : "?"}pageSize=1` : null);
  return { count: data?.total ?? 0, loading: isLoading };
}

export function DateText({ value, fallback = "—" }: { value?: string | null; fallback?: string }) {
  return <span className="tabular">{value ? formatDate(value) : fallback}</span>;
}

/** Standard list frame: header, optional toolbar, then content. */
export function ListPage({ title, description, actions, breadcrumbs, children }: { title: string; description?: string; actions?: React.ReactNode; breadcrumbs?: Crumb[]; children: React.ReactNode }) {
  return (
    <Page className="space-y-6 lg:px-8 lg:py-8">
      {breadcrumbs?.length ? <PageHeader title={title} description={description} actions={actions} breadcrumbs={breadcrumbs} LinkComponent={Link} /> : <PageHero title={title} description={description} actions={actions} />}
      {children}
    </Page>
  );
}

export function SearchBox({ value, onChange, placeholder = "Search..." }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm outline-none transition placeholder:text-subtle focus:border-accent focus:ring-2 focus:ring-accent/15" />
    </div>
  );
}

export function matches(row: unknown, query: string) {
  if (!query) return true;
  return JSON.stringify(row).toLowerCase().includes(query.toLowerCase());
}
