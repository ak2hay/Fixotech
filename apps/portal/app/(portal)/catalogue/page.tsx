"use client";

import { Badge, EmptyState, PaginationBar, Skeleton, money } from "@fixotec/ui";
import { Package } from "lucide-react";
import { useState } from "react";
import { ListPage, QueryError, SearchBox } from "../../../components/common";
import { fromPrice, productImage, type Product } from "../../../components/catalogue";
import { Link } from "../../../components/link";
import { useApi, type Paged } from "../../../lib/query";
import { useSession } from "../../../lib/session";

export default function CataloguePage() {
  const { role } = useSession();
  const showPrice = role === "distributor";
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, isLoading } = useApi<Paged<Product>>(`/products?page=${page}&pageSize=24${q ? `&q=${encodeURIComponent(q)}` : ""}`, { keepPrevious: true });

  return (
    <ListPage title="Product catalogue" description={showPrice ? "Published Fixotec products with your price list applied." : "Published Fixotec products, specifications and technical files."}>
      <div className="flex justify-end">
        <SearchBox value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="Search name, SKU or article..." />
      </div>
      <QueryError error={error} />
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-64" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <EmptyState icon={<Package />} title="No products found" description="Try a different search term." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {data.items.map((product) => {
            const image = productImage(product);
            const price = fromPrice(product);
            return (
              <Link key={product.id} href={`/catalogue/${product.id}`} className="group overflow-hidden rounded-xl border border-line bg-surface shadow-card transition hover:border-accent/50">
                <div className="flex h-40 items-center justify-center bg-canvas">
                  {image ? <img src={image} alt="" className="h-full w-full object-contain p-4" /> : <Package className="h-8 w-8 text-subtle" />}
                </div>
                <div className="space-y-2 p-4">
                  <div className="flex items-center gap-2">
                    {product.family ? <Badge>{product.family.name}</Badge> : null}
                    <span className="font-mono text-2xs text-muted">{product.sku}</span>
                  </div>
                  <p className="line-clamp-2 font-semibold group-hover:text-accent">{product.name}</p>
                  <div className="flex items-end justify-between">
                    <span className="text-xs text-muted">{product.variants.length} variant{product.variants.length === 1 ? "" : "s"}</span>
                    {showPrice && price !== null ? (
                      <span className="text-sm">
                        <span className="text-xs text-muted">from </span>
                        <span className="font-semibold">{money(price)}</span>
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      {data && data.total > data.pageSize ? <PaginationBar page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} /> : null}
    </ListPage>
  );
}
