"use client";

import { Badge, Card, DataTable, FilterButton, MiniStat, Page, PageHeader, TextInput, money, number } from "@fixotec/ui";
import { AlertTriangle, Boxes, IndianRupee, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { QueryError } from "../../../components/common";
import { useApi } from "../../../lib/query";

type Balance = {
  id: string;
  qty: number | string;
  avgCost?: number | string;
  updatedAt: string;
  variant: { id: string; articleNumber: string; name: string; safetyStock: number | string; reorderLevel: number | string; product?: { name: string } | null };
  warehouse: { id: string; name: string; code: string };
  bin: { code: string; zone?: string | null };
  batch?: { code: string } | null;
};

export default function InventoryPage() {
  const { data, error, isLoading } = useApi<{ items: Balance[] }>("/inventory/balances");
  const [q, setQ] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [low, setLow] = useState("");
  const all = data?.items || [];

  const onHand = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of all) map.set(row.variant.id, (map.get(row.variant.id) || 0) + Number(row.qty));
    return map;
  }, [all]);

  const rows = useMemo(() => {
    const term = q.toLowerCase();
    return all.filter((row) => (!warehouse || row.warehouse.id === warehouse) && (!low || (onHand.get(row.variant.id) || 0) < Number(row.variant.safetyStock)) && (!term || [row.variant.articleNumber, row.variant.name, row.variant.product?.name, row.bin.code].some((value) => value?.toLowerCase().includes(term))));
  }, [all, q, warehouse, low, onHand]);

  const warehouses = [...new Map(all.map((row) => [row.warehouse.id, row.warehouse])).values()];
  const seesCost = all.some((row) => row.avgCost !== undefined);
  const value = all.reduce((sum, row) => sum + Number(row.qty) * Number(row.avgCost || 0), 0);
  const belowSafety = [...new Set(all.filter((row) => (onHand.get(row.variant.id) || 0) < Number(row.variant.safetyStock)).map((row) => row.variant.id))].length;

  return (
    <Page>
      <PageHeader title="Inventory" description="Balances produced by the stock ledger. Quantities change only through transactions." />
      <div className="grid gap-4 sm:grid-cols-3">
        <MiniStat label="Stock positions" value={number(all.length)} icon={<Boxes />} tone="info" />
        <MiniStat label="Articles below safety stock" value={number(belowSafety)} icon={<AlertTriangle />} tone={belowSafety ? "bad" : "good"} />
        {seesCost ? <MiniStat label="Inventory value" value={money(value)} icon={<IndianRupee />} tone="accent" /> : null}
      </div>
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <TextInput icon={<Search />} placeholder="Search article, product or bin..." value={q} onChange={(event) => setQ(event.target.value)} className="w-72" />
          <FilterButton label="Warehouse" value={warehouse} onChange={setWarehouse} options={warehouses.map((item) => ({ value: item.id, label: item.name }))} />
          <FilterButton label="Stock level" value={low} onChange={setLow} options={[{ value: "low", label: "Below safety stock" }]} />
        </div>
        <QueryError error={error} />
        <DataTable
          rows={rows}
          loading={isLoading}
          rowKey={(row) => row.id}
          empty="No stock positions."
          columns={[
            { key: "article", header: "Article", sortValue: (row) => row.variant.articleNumber, render: (row) => <span className="font-mono text-xs">{row.variant.articleNumber}</span> },
            { key: "name", header: "Item", sortValue: (row) => row.variant.name, render: (row) => <div><p className="font-medium">{row.variant.name}</p><p className="text-2xs text-muted">{row.variant.product?.name}</p></div> },
            { key: "warehouse", header: "Warehouse", render: (row) => row.warehouse.name },
            { key: "bin", header: "Bin", render: (row) => <span className="font-mono text-xs">{row.bin.code}</span> },
            { key: "batch", header: "Batch", render: (row) => <span className="font-mono text-xs text-muted">{row.batch?.code || "—"}</span> },
            { key: "qty", header: "On hand", align: "right", sortValue: (row) => Number(row.qty), render: (row) => <span className="font-semibold tabular">{number(row.qty, 3)}</span> },
            {
              key: "level",
              header: "Level",
              render: (row) => {
                const total = onHand.get(row.variant.id) || 0;
                const safety = Number(row.variant.safetyStock);
                return total <= 0 ? <Badge tone="bad">Out</Badge> : safety && total < safety ? <Badge tone="warn">Below safety</Badge> : <Badge tone="good">OK</Badge>;
              },
            },
            ...(seesCost ? [{ key: "value", header: "Value", align: "right" as const, sortValue: (row: Balance) => Number(row.qty) * Number(row.avgCost || 0), render: (row: Balance) => money(Number(row.qty) * Number(row.avgCost || 0)) }] : []),
          ]}
        />
      </Card>
    </Page>
  );
}
