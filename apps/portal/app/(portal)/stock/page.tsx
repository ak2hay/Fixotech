"use client";

import { Badge, Button, Card, DataTable, Tabs, humanize, type Tone } from "@fixotec/ui";
import { ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ListPage, QueryError, SearchBox, matches } from "../../../components/common";
import { useApi } from "../../../lib/query";

type Row = { variantId: string; articleNumber: string; name: string; availability: string };

function bandTone(band: string): Tone {
  if (/IN_STOCK|AVAILABLE|HIGH/.test(band)) return "good";
  if (/LOW|LIMITED/.test(band)) return "warn";
  if (/OUT|NONE/.test(band)) return "bad";
  return "info";
}

export default function AvailabilityPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [band, setBand] = useState("");
  const { data, error, isLoading } = useApi<{ items: Row[] }>("/inventory/availability");
  const all = data?.items || [];
  const bands = Array.from(new Set(all.map((row) => row.availability)));
  const rows = all.filter((row) => (!band || row.availability === band) && matches(row, q));

  return (
    <ListPage title="Availability" description="Live stock bands per article. Exact quantities are confirmed on order.">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs variant="pill" items={[{ key: "", label: "All", count: all.length }, ...bands.map((item) => ({ key: item, label: humanize(item), count: all.filter((row) => row.availability === item).length }))]} value={band} onChange={setBand} />
        <SearchBox value={q} onChange={setQ} placeholder="Search article..." />
      </div>
      <QueryError error={error} />
      <Card>
        <DataTable
          rows={rows}
          rowKey={(row) => row.variantId}
          loading={isLoading}
          density="compact"
          empty={<p className="px-4 py-10 text-center text-sm text-muted">No articles match.</p>}
          columns={[
            { key: "articleNumber", header: "Article", render: (row) => <span className="font-mono text-xs">{row.articleNumber}</span> },
            { key: "name", header: "Description", render: (row) => <span className="font-medium">{row.name}</span> },
            { key: "availability", header: "Availability", render: (row) => <Badge tone={bandTone(row.availability)} dot>{humanize(row.availability)}</Badge> },
            { key: "order", header: "", align: "right", render: (row) => <Button size="sm" variant="ghost" onClick={() => router.push(`/orders/new?variant=${row.variantId}`)}><ShoppingCart /> Order</Button> },
          ]}
        />
      </Card>
    </ListPage>
  );
}
