"use client";

import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, FileText, Box, Check, Image as ImageIcon } from "lucide-react";
import * as React from "react";
import { Skeleton, toneFill, toneText, type Tone } from "./primitives";
import { cn, formatTime, relativeTime } from "./utils";

/* ---------------------------------- Table --------------------------------- */

export type Column<T> = {
  key: string;
  header: React.ReactNode;
  render?: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  className?: string;
  headerClassName?: string;
};

export type Pagination = { page: number; pageSize: number; total: number; onPage: (page: number) => void };

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loading,
  empty,
  pagination,
  density = "comfortable",
  className,
  rowClassName,
}: {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: React.ReactNode;
  pagination?: Pagination;
  density?: "compact" | "comfortable";
  className?: string;
  rowClassName?: (row: T) => string;
}) {
  const [sort, setSort] = React.useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  const sorted = React.useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((item) => item.key === sort.key);
    if (!column) return rows;
    const value = column.sortValue || ((row: T) => (row as Record<string, unknown>)[column.key] as string | number);
    return [...rows].sort((a, b) => {
      const left = value(a) ?? "";
      const right = value(b) ?? "";
      const result = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), undefined, { numeric: true });
      return sort.dir === "asc" ? result : -result;
    });
  }, [rows, sort, columns]);

  function toggle(key: string) {
    setSort((current) => (!current || current.key !== key ? { key, dir: "asc" } : current.dir === "asc" ? { key, dir: "desc" } : null));
  }

  const cell = density === "compact" ? "px-3 py-2" : "px-4 py-3";

  return (
    <div className={cn("overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas/60">
              {columns.map((column) => {
                const sortable = column.sortable !== false && (column.sortable || column.sortValue);
                const active = sort?.key === column.key;
                return (
                  <th key={column.key} className={cn("whitespace-nowrap text-xs font-medium text-muted", cell, "py-2.5", column.align === "right" && "text-right", column.align === "center" && "text-center", column.headerClassName)}>
                    {sortable ? (
                      <button type="button" className={cn("inline-flex items-center gap-1 hover:text-fg", active && "text-fg")} onClick={() => toggle(column.key)}>
                        {column.header}
                        {active ? sort?.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0
              ? Array.from({ length: 6 }).map((_, index) => (
                  <tr key={`skeleton-${index}`} className="border-b border-line last:border-0">
                    {columns.map((column) => (
                      <td key={column.key} className={cell}>
                        <Skeleton className="h-4 w-full max-w-[140px]" />
                      </td>
                    ))}
                  </tr>
                ))
              : sorted.map((row, index) => (
                  <tr
                    key={rowKey(row, index)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn("border-b border-line transition-colors last:border-0", onRowClick && "cursor-pointer hover:bg-canvas/70", rowClassName?.(row))}
                  >
                    {columns.map((column) => (
                      <td key={column.key} className={cn(cell, "align-middle text-fg", column.align === "right" && "text-right tabular", column.align === "center" && "text-center", column.className)}>
                        {column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {!loading && rows.length === 0 ? empty || <p className="px-4 py-10 text-center text-sm text-muted">Nothing here yet.</p> : null}
      {pagination && pagination.total > pagination.pageSize ? <PaginationBar {...pagination} /> : null}
    </div>
  );
}

export function PaginationBar({ page, pageSize, total, onPage }: Pagination) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-xs text-muted">
      <span className="tabular">
        {from}-{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-md p-1.5 hover:bg-canvas disabled:opacity-40" aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-2 tabular">
          {page} / {pages}
        </span>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="rounded-md p-1.5 hover:bg-canvas disabled:opacity-40" aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function FilterButton({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <label className="relative inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-surface pl-3 pr-8 text-sm shadow-sm hover:bg-canvas">
      <span className={cn(value ? "text-fg" : "text-muted")}>{value ? options.find((option) => option.value === value)?.label || value : label}</span>
      <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-muted" />
      <select value={value} onChange={(event) => onChange(event.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={label}>
        <option value="">{label}: All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ---------------------------------- Stats --------------------------------- */

export function Sparkline({ values, tone = "good", className }: { values: number[]; tone?: Tone; className?: string }) {
  const points = values.length > 1 ? values : [0, ...(values.length ? values : [0])];
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const width = 96;
  const height = 32;
  const step = width / (points.length - 1);
  const coords = points.map((value, index) => [index * step, height - 3 - ((value - min) / range) * (height - 6)] as const);
  const path = coords.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${path} L${width},${height} L0,${height} Z`;
  const id = React.useId();
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn("h-8 w-24", toneText[tone], className)} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Delta({ value, suffix = "vs last month", invert }: { value?: number | null; suffix?: string; invert?: boolean }) {
  if (value == null || Number.isNaN(value)) return <span className="text-xs text-muted">{suffix}</span>;
  const up = value >= 0;
  const good = invert ? !up : up;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className={cn("inline-flex items-center gap-0.5 font-semibold", good ? "text-success" : "text-danger")}>
        {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        {Math.abs(value).toFixed(1)}%
      </span>
      <span className="text-muted">{suffix}</span>
    </span>
  );
}

export function StatCard({ label, value, delta, deltaSuffix, invertDelta, series, icon, footer, className }: { label: string; value: React.ReactNode; delta?: number | null; deltaSuffix?: string; invertDelta?: boolean; series?: number[]; icon?: React.ReactNode; footer?: React.ReactNode; className?: string }) {
  const good = delta == null ? true : invertDelta ? delta < 0 : delta >= 0;
  return (
    <div className={cn("rounded-lg border border-line bg-surface p-4 shadow-card", className)}>
      <div className="flex items-center justify-between">
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted">{label}</p>
        {icon ? <span className="text-muted [&_svg]:h-4 [&_svg]:w-4">{icon}</span> : null}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="text-2xl font-bold tabular tracking-tight text-fg">{value}</p>
        {series && series.length ? <Sparkline values={series} tone={good ? "good" : "bad"} /> : null}
      </div>
      <div className="mt-1.5">{footer ?? <Delta value={delta} suffix={deltaSuffix} invert={invertDelta} />}</div>
    </div>
  );
}

export function MiniStat({ label, value, icon, tone = "accent", hint }: { label: string; value: React.ReactNode; icon?: React.ReactNode; tone?: Tone; hint?: React.ReactNode }) {
  const tints: Record<Tone, string> = { neutral: "bg-canvas text-muted", good: "bg-success-soft text-success", warn: "bg-warning-soft text-warning", bad: "bg-danger-soft text-danger", info: "bg-info-soft text-info", accent: "bg-accent-soft text-accent" };
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4 shadow-card">
      {icon ? <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg [&_svg]:h-5 [&_svg]:w-5", tints[tone])}>{icon}</span> : null}
      <div className="min-w-0">
        <p className="truncate text-xs text-muted">{label}</p>
        <p className="text-xl font-bold tabular text-fg">{value}</p>
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      </div>
    </div>
  );
}

/* ------------------------------ Pipeline bar ------------------------------ */

const funnelColors = ["bg-sidebar", "bg-slate-500", "bg-info", "bg-violet-500", "bg-warning", "bg-success", "bg-accent"];

export function FunnelBar({ stages, format }: { stages: Array<{ label: string; count: number; value?: number }>; format?: (value: number) => string }) {
  const total = stages.reduce((sum, stage) => sum + Math.max(stage.count, 0), 0) || 1;
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-line">
        {stages.map((stage, index) => (
          <div key={stage.label} className={cn("h-full", funnelColors[index % funnelColors.length])} style={{ width: `${(Math.max(stage.count, 0) / total) * 100}%` }} title={`${stage.label}: ${stage.count}`} />
        ))}
      </div>
      <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
        {stages.map((stage, index) => (
          <div key={stage.label} className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", funnelColors[index % funnelColors.length])} />
              <span className="truncate text-xs text-muted">{stage.label}</span>
            </div>
            <p className="mt-1 text-xl font-bold tabular text-fg">{stage.count}</p>
            {stage.value != null ? <p className="text-xs tabular text-muted">{format ? format(stage.value) : stage.value}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------- Stepper -------------------------------- */

export type Step = { key: string; label: string; caption?: React.ReactNode; state?: "done" | "current" | "upcoming" | "blocked" };

export function Stepper({ steps, current, className }: { steps: Step[]; current: number; className?: string }) {
  return (
    <ol className={cn("flex w-full items-start", className)}>
      {steps.map((step, index) => {
        const state = step.state || (index < current ? "done" : index === current ? "current" : "upcoming");
        const last = index === steps.length - 1;
        return (
          <li key={step.key} className={cn("relative flex flex-1 flex-col items-center text-center", last && "flex-none basis-16 sm:basis-20")}>
            {!last ? <span className={cn("absolute left-1/2 top-3.5 h-0.5 w-full", index < current ? "bg-success" : "bg-line")} aria-hidden /> : null}
            <span
              className={cn(
                "relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold",
                state === "done" && "border-success bg-success text-white",
                state === "current" && "border-success bg-surface text-success ring-4 ring-success/15",
                state === "upcoming" && "border-line bg-surface text-subtle",
                state === "blocked" && "border-danger bg-danger-soft text-danger",
              )}
            >
              {state === "done" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : state === "current" ? <span className="h-2 w-2 rounded-full bg-success" /> : index + 1}
            </span>
            <span className={cn("mt-2 px-1 text-xs font-medium leading-tight", state === "upcoming" ? "text-muted" : "text-fg")}>{step.label}</span>
            {step.caption ? <span className="mt-0.5 text-[11px] text-muted">{step.caption}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------- Activity -------------------------------- */

export type ActivityItem = { id: string; at: string; title: React.ReactNode; description?: React.ReactNode; actor?: string | null; tone?: Tone; href?: string };

export function ActivityFeed({ items, empty = "No activity yet.", compact, LinkComponent }: { items: ActivityItem[]; empty?: string; compact?: boolean; LinkComponent?: React.ComponentType<{ href: string; className?: string; children?: React.ReactNode }> }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <ol className="relative">
      {items.map((item, index) => {
        const body = (
          <>
            <span className="w-11 shrink-0 pt-0.5 text-right text-[11px] tabular text-muted">{isToday(item.at) ? formatTime(item.at) : shortDate(item.at)}</span>
            <span className="relative flex flex-col items-center">
              <span className={cn("mt-1.5 h-2 w-2 rounded-full ring-4 ring-surface", toneFill[item.tone || "neutral"])} />
              {index < items.length - 1 ? <span className="w-px flex-1 bg-line" /> : null}
            </span>
            <span className={cn("min-w-0 flex-1", compact ? "pb-3" : "pb-4")}>
              <span className="block text-sm leading-snug text-fg">{item.title}</span>
              {item.description || item.actor ? (
                <span className="mt-0.5 block truncate text-xs text-muted">
                  {item.description}
                  {item.description && item.actor ? " · " : ""}
                  {item.actor}
                  {!compact ? ` · ${relativeTime(item.at)}` : ""}
                </span>
              ) : null}
            </span>
          </>
        );
        const classes = "flex gap-3";
        if (item.href && LinkComponent) return <li key={item.id}><LinkComponent href={item.href} className={cn(classes, "rounded-md hover:bg-canvas/60")}>{body}</LinkComponent></li>;
        return <li key={item.id} className={classes}>{body}</li>;
      })}
    </ol>
  );
}

function isToday(value: string) {
  const date = new Date(value);
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

function shortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

/* ------------------------------ Key / values ------------------------------ */

export function KeyValueList({ items, columns = 1, className }: { items: Array<{ label: string; value: React.ReactNode }>; columns?: 1 | 2 | 3; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-3", className)}>
      {items.map((item) => (
        <div key={item.label} className="flex items-start justify-between gap-4 border-b border-line py-2.5 text-sm last:border-0 sm:[&:nth-last-child(-n+1)]:border-0">
          <dt className="shrink-0 text-muted">{item.label}</dt>
          <dd className="min-w-0 text-right font-medium text-fg">{item.value === null || item.value === undefined || item.value === "" ? <span className="text-subtle">—</span> : item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* --------------------------------- Files ---------------------------------- */

export function FileTile({ title, meta, thumbnailUrl, kind, onClick, badge }: { title: string; meta?: React.ReactNode; thumbnailUrl?: string | null; kind?: string; onClick?: () => void; badge?: React.ReactNode }) {
  const Icon = kind === "BIM" ? Box : kind === "CAD" || kind === "DRAWING" ? ImageIcon : FileText;
  return (
    <button type="button" onClick={onClick} className="group flex w-full flex-col overflow-hidden rounded-lg border border-line bg-surface text-left shadow-card transition hover:border-accent/50 hover:shadow-pop">
      <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-canvas">
        {thumbnailUrl ? <img src={thumbnailUrl} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.02]" /> : <Icon className="h-9 w-9 text-subtle" strokeWidth={1.25} />}
        {kind ? <span className="absolute left-2 top-2 rounded bg-sidebar/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">{kind}</span> : null}
        {badge ? <span className="absolute right-2 top-2">{badge}</span> : null}
      </div>
      <div className="min-w-0 px-3 py-2">
        <p className="truncate text-xs font-medium text-fg">{title}</p>
        {meta ? <p className="mt-0.5 truncate text-[11px] text-muted">{meta}</p> : null}
      </div>
    </button>
  );
}

/* ------------------------------- Action list ------------------------------ */

export function ActionRow({ icon, title, description, tone = "accent", onClick, href, LinkComponent }: { icon?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; tone?: Tone; onClick?: () => void; href?: string; LinkComponent?: React.ComponentType<{ href: string; className?: string; children?: React.ReactNode }> }) {
  const tints: Record<Tone, string> = { neutral: "bg-canvas text-muted", good: "bg-success-soft text-success", warn: "bg-warning-soft text-warning", bad: "bg-danger-soft text-danger", info: "bg-info-soft text-info", accent: "bg-accent-soft text-accent" };
  const body = (
    <>
      {icon ? <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md [&_svg]:h-4 [&_svg]:w-4", tints[tone])}>{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-fg">{title}</span>
        {description ? <span className="block truncate text-xs text-muted">{description}</span> : null}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />
    </>
  );
  const classes = "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition hover:bg-canvas";
  if (href && LinkComponent) return <LinkComponent href={href} className={classes}>{body}</LinkComponent>;
  return <button type="button" onClick={onClick} className={classes}>{body}</button>;
}
