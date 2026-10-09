"use client";

import { Button, Card, CardBody, CardHeader, DataTable, EmptyState, ErrorNote, KeyValueList, TextInput, money } from "@fixotec/ui";
import { Plus, Search, Send, ShoppingCart, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { attributeText, type Product } from "../../../../components/catalogue";
import { ListPage } from "../../../../components/common";
import { api } from "../../../../lib/api";
import { useAction, useApi, type Paged } from "../../../../lib/query";

type CartLine = { variantId: string; articleNumber: string; name: string; price: number; qty: string };

export default function NewOrderPage() {
  return (
    <Suspense>
      <NewOrderForm />
    </Suspense>
  );
}

function NewOrderForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const results = useApi<Paged<Product>>(q.trim().length >= 2 ? `/products?pageSize=8&q=${encodeURIComponent(q.trim())}` : null, { keepPrevious: true });
  const action = useAction<Record<string, unknown>, { id: string }>(["/sales-orders"]);

  const add = (line: Omit<CartLine, "qty">) =>
    setCart((current) => (current.some((item) => item.variantId === line.variantId) ? current.map((item) => (item.variantId === line.variantId ? { ...item, qty: String(Number(item.qty) + 1) } : item)) : [...current, { ...line, qty: "1" }]));

  useEffect(() => {
    const variantId = params.get("variant");
    if (!variantId) return;
    api<{ items: Array<{ variantId: string; articleNumber: string }> }>("/inventory/availability")
      .then(async (stock) => {
        const article = stock.items.find((row) => row.variantId === variantId)?.articleNumber;
        if (!article) return;
        const found = await api<Paged<Product>>(`/products?pageSize=1&q=${encodeURIComponent(article)}`);
        const variant = found.items[0]?.variants.find((item) => item.id === variantId);
        if (variant) add({ variantId, articleNumber: variant.articleNumber, name: `${found.items[0].name} · ${variant.name}`, price: Number(variant.sellPrice) || 0 });
      })
      .catch(() => undefined);
  }, [params]);

  const valid = cart.filter((line) => Number(line.qty) > 0);
  const subtotal = valid.reduce((sum, line) => sum + line.price * Number(line.qty), 0);

  async function submit() {
    const order = await action.submit({ path: "/sales-orders", body: { lines: valid.map((line) => ({ variantId: line.variantId, description: line.name, qty: Number(line.qty) })) } });
    if (order) router.push(`/orders/${order.id}`);
  }

  return (
    <ListPage title="New order" description="Pick articles from the catalogue. Prices follow your price list; GST is added on the order." breadcrumbs={[{ label: "Orders", href: "/orders" }, { label: "New" }]}>
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Find articles" />
            <CardBody className="space-y-3">
              <TextInput aria-label="Search articles" icon={<Search />} value={q} onChange={(event) => setQ(event.target.value)} placeholder="Type a product name, SKU or article number" autoFocus />
              {q.trim().length >= 2 ? (
                <div className="divide-y divide-line rounded-lg border border-line">
                  {(results.data?.items || []).flatMap((product) =>
                    product.variants
                      .filter((variant) => variant.active !== false)
                      .map((variant) => (
                        <div key={variant.id} className="flex items-center gap-3 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{product.name} · {variant.name}</p>
                            <p className="truncate text-xs text-muted"><span className="font-mono">{variant.articleNumber}</span> {attributeText(variant.attributes)}</p>
                          </div>
                          <span className="text-sm font-semibold tabular">{money(variant.sellPrice)}</span>
                          <Button size="sm" variant="outline" onClick={() => add({ variantId: variant.id, articleNumber: variant.articleNumber, name: `${product.name} · ${variant.name}`, price: Number(variant.sellPrice) || 0 })}>
                            <Plus /> Add
                          </Button>
                        </div>
                      )),
                  )}
                  {results.data && !results.data.items.length ? <p className="px-3 py-6 text-center text-sm text-muted">No articles match.</p> : null}
                </div>
              ) : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Order lines" description={`${valid.length} article${valid.length === 1 ? "" : "s"}`} />
            {cart.length ? (
              <DataTable
                rows={cart}
                rowKey={(row) => row.variantId}
                columns={[
                  { key: "name", header: "Article", render: (row) => <div><p className="font-medium">{row.name}</p><p className="font-mono text-2xs text-muted">{row.articleNumber}</p></div> },
                  { key: "price", header: "Rate", align: "right", render: (row) => money(row.price) },
                  { key: "qty", header: "Qty", align: "right", render: (row) => <TextInput aria-label={`Quantity for ${row.articleNumber}`} className="ml-auto w-24 text-right" type="number" min="0" step="any" value={row.qty} onChange={(event) => setCart((current) => current.map((item) => (item.variantId === row.variantId ? { ...item, qty: event.target.value } : item)))} /> },
                  { key: "amount", header: "Amount", align: "right", render: (row) => <span className="font-semibold">{money(row.price * (Number(row.qty) || 0))}</span> },
                  { key: "remove", header: "", align: "right", render: (row) => <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => setCart((current) => current.filter((item) => item.variantId !== row.variantId))}><Trash2 /></Button> },
                ]}
              />
            ) : (
              <CardBody>
                <EmptyState icon={<ShoppingCart />} title="No lines yet" description="Search above and add articles to your order." />
              </CardBody>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Summary" />
            <CardBody>
              <KeyValueList
                items={[
                  { label: "Articles", value: valid.length },
                  { label: "Subtotal", value: <span className="text-base font-semibold tabular">{money(subtotal)}</span> },
                  { label: "GST", value: <span className="text-muted">Calculated on the order</span> },
                ]}
              />
            </CardBody>
          </Card>
          {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
          <Button size="lg" className="w-full" disabled={!valid.length} loading={action.isPending} onClick={submit}>
            <Send /> Place order
          </Button>
        </div>
      </div>
    </ListPage>
  );
}
