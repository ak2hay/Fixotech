"use client";

import { Badge, Button, Card, CardBody, CardHeader, DataTable, DetailHeader, EmptyState, KeyValueList, Page, Tabs, money } from "@fixotec/ui";
import { Download, FileText, Package, ShoppingCart } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { attributeText, productImage, type Product } from "../../../../components/catalogue";
import { DocumentTile, PageSkeleton, QueryError, type DocumentSummary } from "../../../../components/common";
import { Link } from "../../../../components/link";
import { downloadDirect } from "../../../../lib/api";
import { useApi } from "../../../../lib/query";
import { allowed, useSession } from "../../../../lib/session";

type Doc = { id: string; title: string; category: string; updatedAt: string; versions: Array<{ version: number; sizeBytes?: number; thumbnailKey?: string | null }> };

export default function PortalProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session, role } = useSession();
  const [tab, setTab] = useState("variants");
  const product = useApi<Product>(`/products/${id}`);
  const docs = useApi<{ items: Doc[] }>(`/documents?entityType=product&entityId=${id}`);
  const models = useApi<{ items: Array<DocumentSummary & { entityType?: string }> }>(`/cad?productId=${id}`);

  if (product.isLoading) return <PageSkeleton />;
  if (product.error || !product.data) return <Page><QueryError error={product.error} /></Page>;
  const data = product.data;
  const image = productImage(data);
  const showPrice = role === "distributor";
  const canOrder = showPrice && allowed(session, "sales_orders.create");
  const files: DocumentSummary[] = [
    ...(docs.data?.items || []).map((doc) => ({ id: doc.id, title: doc.title, category: doc.category, updatedAt: doc.updatedAt, version: doc.versions[0]?.version, sizeBytes: doc.versions[0]?.sizeBytes, hasThumbnail: Boolean(doc.versions[0]?.thumbnailKey) })),
    ...(models.data?.items || []).filter((doc) => doc.entityType === "variant"),
  ];
  const variants = data.variants.filter((variant) => variant.active !== false);

  return (
    <Page>
      <DetailHeader
        LinkComponent={Link}
        breadcrumbs={[{ label: "Catalogue", href: "/catalogue" }, { label: data.sku }]}
        title={data.name}
        code={data.sku}
        pills={data.family ? <Badge>{data.family.name}</Badge> : null}
        image={image}
        meta={[...(data.category ? [{ label: data.category.name }] : []), ...(data.leadTimeDays ? [{ label: `Lead time ${data.leadTimeDays} days` }] : [])]}
        actions={
          canOrder ? (
            <Button onClick={() => router.push(`/orders/new?variant=${variants[0]?.id || ""}`)} disabled={!variants.length}>
              <ShoppingCart /> Order
            </Button>
          ) : null
        }
      >
        <Tabs
          items={[
            { key: "variants", label: "Variants", count: variants.length },
            { key: "specs", label: "Specifications" },
            { key: "files", label: "Technical files", count: files.length },
          ]}
          value={tab}
          onChange={setTab}
        />
      </DetailHeader>

      {tab === "variants" ? (
        <Card>
          <DataTable
            rows={variants}
            rowKey={(row) => row.id}
            empty={<p className="px-4 py-8 text-center text-sm text-muted">No active variants.</p>}
            columns={[
              { key: "articleNumber", header: "Article", render: (row) => <span className="font-mono text-xs">{row.articleNumber}</span> },
              { key: "name", header: "Variant", render: (row) => <div><p className="font-medium">{row.name}</p><p className="text-xs text-muted">{attributeText(row.attributes)}</p></div> },
              ...(showPrice ? [{ key: "sellPrice", header: "Your price", align: "right" as const, render: (row: Product["variants"][number]) => <span className="font-semibold">{money(row.sellPrice)}</span> }] : []),
              ...(canOrder ? [{ key: "order", header: "", align: "right" as const, render: (row: Product["variants"][number]) => <Button size="sm" variant="outline" onClick={() => router.push(`/orders/new?variant=${row.id}`)}>Add to order</Button> }] : []),
            ]}
          />
        </Card>
      ) : null}

      {tab === "specs" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Card>
            <CardHeader title="Description" />
            <CardBody className="space-y-3 text-sm leading-6 text-fg">
              {data.description ? <p>{data.description}</p> : null}
              {data.technicalDescription ? <p className="text-muted">{data.technicalDescription}</p> : null}
              {!data.description && !data.technicalDescription ? <p className="text-muted">No description yet.</p> : null}
              {data.applications?.length ? (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {data.applications.map((item) => (
                    <Badge key={item} tone="info">{item}</Badge>
                  ))}
                </div>
              ) : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Technical data" />
            <CardBody>
              <KeyValueList
                items={[
                  { label: "Material", value: data.material || "—" },
                  { label: "Finish", value: data.finish || data.coating || "—" },
                  { label: "Load capacity", value: data.loadCapacity || "—" },
                  { label: "Pipe size", value: data.pipeSize || "—" },
                  { label: "Pack size", value: data.packSize || "—" },
                  { label: "MOQ", value: data.moq ? String(Number(data.moq)) : "—" },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === "files" ? (
        files.length ? (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => downloadDirect(`/documents/bundle?entityType=product&entityId=${data.id}`)}>
                <Download /> Download all files
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {files.map((doc) => (
                <DocumentTile key={doc.id} doc={doc} />
              ))}
            </div>
          </div>
        ) : (
          <EmptyState icon={image ? <FileText /> : <Package />} title="No technical files" description="Datasheets, CAD and BIM files for this product will appear here." />
        )
      ) : null}
    </Page>
  );
}
