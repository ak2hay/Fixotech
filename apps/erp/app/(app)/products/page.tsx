"use client";

import { Badge, Card, DataTable, FilterButton, Page, PageHeader, PaginationBar, Skeleton, TextInput, cn, money } from "@fixotec/ui";
import { LayoutGrid, List, Package, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { QueryError } from "../../../components/common";
import { mediaUrl } from "../../../lib/api";
import { useApi, type Paged } from "../../../lib/query";

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  supplyMode: string;
  published: boolean;
  heroImageKey?: string | null;
  imageKeys: string[];
  applications: string[];
  material?: string | null;
  category?: { name: string } | null;
  family?: { name: string } | null;
  variants: Array<{ id: string; sellPrice?: number }>;
};

export default function ProductsPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [supplyMode, setSupplyMode] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ page: String(page), pageSize: "24" });
  if (q) query.set("q", q);
  if (categoryId) query.set("categoryId", categoryId);
  if (familyId) query.set("familyId", familyId);
  if (supplyMode) query.set("supplyMode", supplyMode);
  const { data, error, isLoading } = useApi<Paged<ProductRow>>(`/products?${query}`, { keepPrevious: true });
  const categories = useApi<Array<{ id: string; name: string }>>("/product-categories");
  const families = useApi<Array<{ id: string; name: string }>>("/product-families");
  const rows = data?.items || [];
  const fromPrice = (row: ProductRow) => {
    const prices = row.variants.map((variant) => Number(variant.sellPrice || 0)).filter(Boolean);
    return prices.length ? Math.min(...prices) : 0;
  };

  return (
    <Page>
      <PageHeader title="Product library" description="Catalogue of supports, anchors and channel systems with variants, CAD and datasheets." />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <TextInput icon={<Search />} placeholder="Search name, SKU or article number..." value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} className="w-72" />
          <FilterButton label="Category" value={categoryId} onChange={(value) => { setCategoryId(value); setPage(1); }} options={(categories.data || []).map((item) => ({ value: item.id, label: item.name }))} />
          <FilterButton label="Family" value={familyId} onChange={(value) => { setFamilyId(value); setPage(1); }} options={(families.data || []).map((item) => ({ value: item.id, label: item.name }))} />
          <FilterButton label="Supply" value={supplyMode} onChange={(value) => { setSupplyMode(value); setPage(1); }} options={[{ value: "MAKE", label: "Manufactured" }, { value: "BUY", label: "Traded" }]} />
          <div className="ml-auto inline-flex rounded-md border border-line p-0.5">
            <button type="button" aria-label="Grid view" className={cn("rounded p-1.5", view === "grid" ? "bg-sidebar text-white" : "text-muted hover:text-fg")} onClick={() => setView("grid")}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button type="button" aria-label="List view" className={cn("rounded p-1.5", view === "list" ? "bg-sidebar text-white" : "text-muted hover:text-fg")} onClick={() => setView("list")}>
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
        <QueryError error={error} />
        {view === "grid" ? (
          <>
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {isLoading ? Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-72" />) : null}
              {rows.map((row) => (
                <button key={row.id} type="button" onClick={() => router.push(`/products/${row.id}`)} className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface text-left shadow-card transition hover:border-accent/50 hover:shadow-pop">
                  <div className="relative flex aspect-[4/3] items-center justify-center bg-canvas">
                    <ProductImage keyPath={row.heroImageKey || row.imageKeys[0]} className="h-full w-full object-contain p-4 transition group-hover:scale-105" />
                    {!row.published ? <Badge className="absolute left-2 top-2">Internal</Badge> : null}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div>
                      <p className="line-clamp-1 font-semibold">{row.name}</p>
                      <p className="font-mono text-2xs text-muted">{row.sku}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {row.applications.slice(0, 3).map((item) => <Badge key={item}>{item}</Badge>)}
                    </div>
                    <div className="mt-auto flex items-center justify-between border-t border-line pt-2 text-xs">
                      <span className="text-muted">{row.variants.length} variant{row.variants.length === 1 ? "" : "s"}</span>
                      <span className="font-semibold tabular">{fromPrice(row) ? `from ${money(fromPrice(row))}` : "Price on request"}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {!isLoading && !rows.length ? <p className="px-4 pb-8 text-center text-sm text-muted">No products match these filters.</p> : null}
            {data && data.total > data.pageSize ? <PaginationBar page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} /> : null}
          </>
        ) : (
          <DataTable
            rows={rows}
            loading={isLoading}
            rowKey={(row) => row.id}
            onRowClick={(row) => router.push(`/products/${row.id}`)}
            pagination={{ page, pageSize: data?.pageSize || 24, total: data?.total || 0, onPage: setPage }}
            columns={[
              {
                key: "name",
                header: "Product",
                sortValue: (row) => row.name,
                render: (row) => (
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md bg-canvas">
                      <ProductImage keyPath={row.heroImageKey || row.imageKeys[0]} className="h-full w-full object-contain" />
                    </span>
                    <div>
                      <p className="font-medium">{row.name}</p>
                      <p className="font-mono text-2xs text-muted">{row.sku}</p>
                    </div>
                  </div>
                ),
              },
              { key: "category", header: "Category", render: (row) => row.category?.name || "—" },
              { key: "family", header: "Family", render: (row) => <span className="text-muted">{row.family?.name || "—"}</span> },
              { key: "material", header: "Material", render: (row) => <span className="text-muted">{row.material || "—"}</span> },
              { key: "supplyMode", header: "Supply", render: (row) => <Badge tone={row.supplyMode === "MAKE" ? "accent" : "info"}>{row.supplyMode === "MAKE" ? "Manufactured" : "Traded"}</Badge> },
              { key: "variants", header: "Variants", align: "right", render: (row) => row.variants.length },
              { key: "price", header: "From", align: "right", sortValue: fromPrice, render: (row) => (fromPrice(row) ? money(fromPrice(row)) : "—") },
              { key: "published", header: "Website", render: (row) => (row.published ? <Badge tone="good">Published</Badge> : <Badge>Internal</Badge>) },
            ]}
          />
        )}
      </Card>
    </Page>
  );
}

function ProductImage({ keyPath, className }: { keyPath?: string | null; className?: string }) {
  const src = mediaUrl(keyPath);
  if (!src) return <Package className="h-8 w-8 text-subtle" />;
  return <img src={src} alt="" loading="lazy" className={className} />;
}
