"use client";

import { Card, DataTable, PaginationBar, money } from "@fixotec/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { attributeText, type Product } from "../../../components/catalogue";
import { ListPage, QueryError, SearchBox } from "../../../components/common";
import { useApi, type Paged } from "../../../lib/query";
import { useSession } from "../../../lib/session";

export default function PriceListPage() {
  const router = useRouter();
  const { session } = useSession();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, isLoading } = useApi<Paged<Product>>(`/products?page=${page}&pageSize=25${q ? `&q=${encodeURIComponent(q)}` : ""}`, { keepPrevious: true });
  const rows = (data?.items || []).flatMap((product) => product.variants.filter((variant) => variant.active !== false).map((variant) => ({ ...variant, product })));
  const list = session?.user.customer?.priceList;

  return (
    <ListPage title="Price list" description={list ? `Net prices on your ${list.toLowerCase()} price list, before GST.` : "Net prices before GST."}>
      <div className="flex justify-end">
        <SearchBox value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="Search name, SKU or article..." />
      </div>
      <QueryError error={error} />
      <Card>
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          loading={isLoading}
          density="compact"
          onRowClick={(row) => router.push(`/catalogue/${row.product.id}`)}
          empty={<p className="px-4 py-10 text-center text-sm text-muted">No articles found.</p>}
          columns={[
            { key: "articleNumber", header: "Article", render: (row) => <span className="font-mono text-xs">{row.articleNumber}</span> },
            { key: "product", header: "Product", render: (row) => <span className="font-medium">{row.product.name}</span> },
            { key: "name", header: "Variant", render: (row) => <div><p>{row.name}</p><p className="text-xs text-muted">{attributeText(row.attributes)}</p></div> },
            { key: "sellPrice", header: "Price", align: "right", sortValue: (row) => Number(row.sellPrice), render: (row) => <span className="font-semibold">{money(row.sellPrice)}</span> },
          ]}
        />
      </Card>
      {data && data.total > data.pageSize ? <PaginationBar page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} /> : null}
    </ListPage>
  );
}
