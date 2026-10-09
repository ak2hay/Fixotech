"use client";

import { EmptyState, Skeleton, Tabs } from "@fixotec/ui";
import { FileText } from "lucide-react";
import { useState } from "react";
import { useApi } from "../lib/query";
import { DocumentTile, QueryError, SearchBox, type DocumentSummary } from "./common";

type CadResponse = { items: DocumentSummary[]; counts: Record<string, number> };
type DocResponse = { items: Array<{ id: string; title: string; category: string; updatedAt: string; versions: Array<{ version: number; sizeBytes?: number; thumbnailKey?: string | null }> }> };

/** Tile grid over CAD, BIM and drawings, optionally with datasheets and installation guides. */
export function FileLibrary({ withDatasheets }: { withDatasheets?: boolean }) {
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const cadCategory = ["CAD", "BIM", "DRAWING"].includes(category) ? category : "";
  const otherCategory = ["DATASHEET", "INSTALLATION"].includes(category) ? category : "";
  const cad = useApi<CadResponse>(otherCategory ? null : `/cad?${cadCategory ? `category=${cadCategory}&` : ""}${q ? `q=${encodeURIComponent(q)}` : ""}`, { keepPrevious: true });
  const datasheets = useApi<DocResponse>(withDatasheets && (!category || otherCategory) ? `/documents?category=${otherCategory || "DATASHEET"}${q ? `&q=${encodeURIComponent(q)}` : ""}` : null, { keepPrevious: true });
  const extra: DocumentSummary[] = (datasheets.data?.items || []).map((doc) => ({ id: doc.id, title: doc.title, category: doc.category, updatedAt: doc.updatedAt, version: doc.versions[0]?.version, sizeBytes: doc.versions[0]?.sizeBytes, hasThumbnail: Boolean(doc.versions[0]?.thumbnailKey) }));
  const items = [...(otherCategory ? [] : cad.data?.items || []), ...extra];
  const counts = cad.data?.counts || {};
  const loading = cad.isLoading || datasheets.isLoading;

  const tabs = [
    { key: "", label: "All" },
    { key: "CAD", label: "CAD", count: counts.CAD ?? null },
    { key: "BIM", label: "BIM", count: counts.BIM ?? null },
    { key: "DRAWING", label: "Drawings", count: counts.DRAWING ?? null },
    ...(withDatasheets ? [{ key: "DATASHEET", label: "Datasheets" }, { key: "INSTALLATION", label: "Installation" }] : []),
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs variant="pill" items={tabs} value={category} onChange={setCategory} />
        <SearchBox value={q} onChange={setQ} placeholder="Search files..." />
      </div>
      <QueryError error={cad.error || datasheets.error} />
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-48" />
          ))}
        </div>
      ) : items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((doc) => (
            <DocumentTile key={doc.id} doc={doc} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<FileText />} title="No files found" description="Try another category or search term." />
      )}
    </>
  );
}
