"use client";

import { Badge, ErrorNote, FileTile, Skeleton, cn, formatDate, humanize, statusTone, type ActivityItem } from "@fixotec/ui";
import { Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import { blobUrl, download, downloadDirect, mediaUrl } from "../lib/api";

export const HEALTH_LABEL: Record<string, string> = { ON_TRACK: "On Track", AT_RISK: "At Risk", DELAYED: "Delayed" };

export function HealthPill({ health }: { health?: string | null }) {
  if (!health) return <span className="text-xs text-subtle">—</span>;
  return <Badge tone={statusTone(health)}>{HEALTH_LABEL[health] || humanize(health)}</Badge>;
}

export function priorityTone(priority: string) {
  if (priority === "URGENT" || priority === "HIGH") return "bad" as const;
  if (priority === "MEDIUM") return "warn" as const;
  return "neutral" as const;
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

export type DocumentSummary = { id: string; title: string; category: string; version?: number; status?: string; sizeBytes?: number | string; hasThumbnail?: boolean; updatedAt?: string; entityName?: string | null; downloads?: number };

export function DocumentTile({ doc }: { doc: DocumentSummary }) {
  const thumb = useBlobUrl(doc.hasThumbnail ? `/documents/${doc.id}/thumbnail` : null);
  const meta = [doc.version ? `REV ${doc.version}` : null, doc.sizeBytes ? fileSize(doc.sizeBytes) : null, doc.entityName, doc.downloads ? `${doc.downloads} downloads` : null].filter(Boolean).join(" · ");
  const open = () => (Number(doc.sizeBytes || 0) > 20e6 ? downloadDirect(`/documents/${doc.id}/download`) : download(`/documents/${doc.id}/download`, doc.title));
  return <FileTile title={doc.title} meta={meta} kind={doc.category} thumbnailUrl={thumb} onClick={open} />;
}

export function fileSize(bytes: number | string) {
  const value = typeof bytes === "string" ? Number(bytes) : bytes;
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)} GB`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)} MB`;
  if (value >= 1e3) return `${Math.round(value / 1e3)} KB`;
  return `${value} B`;
}

export type ActivityRow = { id: string; at: string; title: string; description?: string; actor?: string | null; status?: string | null; href?: string | null };

export function toActivity(rows: ActivityRow[] = []): ActivityItem[] {
  return rows.map((row) => ({ id: row.id, at: row.at, title: row.title, description: row.description, actor: row.actor, tone: row.status ? statusTone(row.status) : "neutral", href: row.href || undefined }));
}

export function QueryError({ error }: { error: unknown }) {
  if (!error) return null;
  return <ErrorNote>{(error as Error).message || "Something went wrong"}</ErrorNote>;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}

export function DateText({ value, fallback = "—" }: { value?: string | null; fallback?: string }) {
  return <span className="tabular">{value ? formatDate(value) : fallback}</span>;
}

export function DueText({ value }: { value?: string | null }) {
  if (!value) return <span className="text-subtle">—</span>;
  const due = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(due);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return <span className="font-medium text-danger">Overdue {Math.abs(diff)}d</span>;
  if (diff === 0) return <span className="font-medium text-danger">Today</span>;
  if (diff === 1) return <span className="font-medium text-warning">Tomorrow</span>;
  return <span className="tabular text-muted">{formatDate(value, "short")}</span>;
}
