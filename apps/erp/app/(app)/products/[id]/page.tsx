"use client";

import { Badge, Button, Card, CardBody, CardHeader, DataTable, EmptyState, KeyValueList, Page, PageHeader, Tabs, cn, humanize, money, number } from "@fixotec/ui";
import { Box, ClipboardPlus, FileDown, FileText, Package, Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { DocumentTile, PageSkeleton, QueryError, type DocumentSummary } from "../../../../components/common";
import { CreateRfq } from "../../../../components/create-rfq";
import { Link } from "../../../../components/link";
import { UploadDocument } from "../../../../components/upload-document";
import type { Line } from "../../../../components/line-editor";
import { download, downloadDirect, mediaUrl } from "../../../../lib/api";
import { useApi } from "../../../../lib/query";
import { allowed, useSession } from "../../../../lib/session";

type Variant = {
  id: string;
  articleNumber: string;
  sku: string;
  name: string;
  attributes: Record<string, unknown> | null;
  standardPrice: number | string;
  customerPrice?: number | string | null;
  dealerPrice?: number | string | null;
  exportPrice?: number | string | null;
  purchaseCost?: number | string;
  manufacturingCost?: number | string;
  sellPrice?: number;
  safetyStock: number | string;
  active: boolean;
};

type Product = {
  id: string;
  sku: string;
  name: string;
  slug: string;
  description?: string | null;
  technicalDescription?: string | null;
  applications: string[];
  segments: string[];
  sectors: string[];
  features: string[];
  material?: string | null;
  coating?: string | null;
  finish?: string | null;
  hsn?: string | null;
  gstRate: number | string;
  leadTimeDays: number;
  moq: number | string;
  packSize?: string | null;
  supplyMode: string;
  weightKg?: number | string | null;
  loadCapacity?: string | null;
  thread?: string | null;
  pipeSize?: string | null;
  lengthLabel?: string | null;
  revision: string;
  published: boolean;
  imageKeys: string[];
  heroImageKey?: string | null;
  purchaseCost?: number | string;
  manufacturingCost?: number | string;
  standardPrice: number | string;
  category?: { name: string } | null;
  family?: { name: string } | null;
  variants: Variant[];
};

type DocList = { items: Array<{ id: string; title: string; category: string; updatedAt: string; versions: Array<{ version: number; status: string; sizeBytes: number; thumbnailKey?: string | null }> }> };

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const [tab, setTab] = useState("overview");
  const [image, setImage] = useState(0);
  const [rfqLines, setRfqLines] = useState<Line[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const product = useApi<Product>(`/products/${id}`);
  const productId = product.data?.id;
  const cad = useApi<{ items: DocumentSummary[] }>(productId ? `/cad?productId=${productId}` : null);
  const docs = useApi<DocList>(productId ? `/documents?entityType=product&entityId=${productId}` : null);

  if (product.isLoading) return <PageSkeleton />;
  if (product.error || !product.data) return <Page><QueryError error={product.error} /></Page>;
  const data = product.data;
  const images = (data.imageKeys.length ? data.imageKeys : data.heroImageKey ? [data.heroImageKey] : []).map((key) => mediaUrl(key)!).filter(Boolean);
  const documents: DocumentSummary[] = (docs.data?.items || []).map((doc) => ({ id: doc.id, title: doc.title, category: doc.category, version: doc.versions[0]?.version, status: doc.versions[0]?.status, sizeBytes: doc.versions[0]?.sizeBytes, hasThumbnail: Boolean(doc.versions[0]?.thumbnailKey) }));
  const datasheet = documents.find((doc) => doc.category === "DATASHEET");
  const seesCost = data.purchaseCost !== undefined;
  const fromPrice = Math.min(...data.variants.map((variant) => Number(variant.sellPrice || variant.standardPrice || 0)).filter(Boolean), Infinity);
  const attributeKeys = [...new Set(data.variants.flatMap((variant) => Object.keys(variant.attributes || {})))].slice(0, 4);

  const specs = [
    { label: "Category", value: data.category?.name },
    { label: "Family", value: data.family?.name },
    { label: "Material", value: data.material },
    { label: "Coating", value: data.coating },
    { label: "Finish", value: data.finish },
    { label: "Load capacity", value: data.loadCapacity },
    { label: "Thread", value: data.thread },
    { label: "Pipe size", value: data.pipeSize },
    { label: "Length", value: data.lengthLabel },
    { label: "Weight", value: data.weightKg ? `${number(data.weightKg, 3)} kg` : null },
    { label: "HSN / GST", value: `${data.hsn || "—"} / ${Number(data.gstRate)}%` },
    { label: "Lead time", value: `${data.leadTimeDays} days` },
    { label: "MOQ", value: `${number(data.moq)}${data.packSize ? ` · pack ${data.packSize}` : ""}` },
    { label: "Revision", value: data.revision },
  ].filter((item) => item.value) as Array<{ label: string; value: string }>;

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Product library", href: "/products" }, { label: data.sku }]}
        LinkComponent={Link}
        title={data.name}
        description={data.category?.name || "Product"}
        actions={
          <>
            <Button variant="outline" disabled={!datasheet} title={datasheet ? undefined : "No datasheet uploaded"} onClick={() => datasheet && download(`/documents/${datasheet.id}/download`, datasheet.title)}>
              <FileDown /> Datasheet
            </Button>
            {allowed(session, "rfqs.create") ? (
              <Button onClick={() => setRfqLines(data.variants.slice(0, 1).map((variant) => ({ variantId: variant.id, description: `${data.name} - ${variant.name}`, qty: Number(data.moq) || 1, unit: "NOS" })))}>
                <ClipboardPlus /> Add to RFQ
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="overflow-hidden">
          <div className="flex aspect-[4/3] items-center justify-center bg-canvas">
            {images.length ? <img src={images[image] || images[0]} alt={data.name} className="h-full w-full object-contain p-6" /> : <Package className="h-12 w-12 text-subtle" />}
          </div>
          {images.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto border-t border-line p-3 scrollbar-thin">
              {images.map((src, index) => (
                <button key={src} type="button" onClick={() => setImage(index)} className={cn("h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-canvas", index === image ? "border-accent ring-2 ring-accent/30" : "border-line")}>
                  <img src={src} alt="" className="h-full w-full object-contain p-1" />
                </button>
              ))}
            </div>
          ) : null}
        </Card>
        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-4 pt-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted">{data.sku}</span>
                <Badge tone={data.supplyMode === "MAKE" ? "accent" : "info"}>{data.supplyMode === "MAKE" ? "Manufactured" : "Traded"}</Badge>
                {data.published ? <Badge tone="good">On website</Badge> : <Badge>Internal only</Badge>}
              </div>
              {data.description ? <p className="text-sm leading-relaxed text-muted">{data.description}</p> : null}
              <div className="flex items-end gap-6">
                <div>
                  <p className="text-xs text-muted">Price from</p>
                  <p className="text-2xl font-semibold tabular">{Number.isFinite(fromPrice) ? money(fromPrice) : "On request"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">Variants</p>
                  <p className="text-2xl font-semibold tabular">{data.variants.length}</p>
                </div>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Specifications" />
            <CardBody>
              <KeyValueList columns={2} items={specs} />
            </CardBody>
          </Card>
        </div>
      </div>

      <Card>
        <div className="px-4 pt-2">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { key: "overview", label: "Overview" },
              { key: "variants", label: "Variants", count: data.variants.length },
              { key: "applications", label: "Applications", count: data.applications.length },
              { key: "cad", label: "CAD / BIM", count: cad.data?.items.length },
              { key: "documents", label: "Documents", count: documents.length },
              { key: "pricing", label: "Pricing" },
            ]}
          />
        </div>
        {tab === "overview" ? (
          <CardBody className="grid gap-6 pt-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-semibold">Technical description</p>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{data.technicalDescription || data.description || "No technical description yet."}</p>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">Features</p>
              {data.features.length ? (
                <ul className="space-y-1.5 text-sm text-muted">
                  {data.features.map((feature) => <li key={feature} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{feature}</li>)}
                </ul>
              ) : (
                <p className="text-sm text-muted">No features listed.</p>
              )}
            </div>
          </CardBody>
        ) : null}
        {tab === "variants" ? (
          <DataTable
            rows={data.variants}
            rowKey={(row) => row.id}
            columns={[
              { key: "articleNumber", header: "Article no.", render: (row) => <span className="font-mono text-xs">{row.articleNumber}</span> },
              { key: "name", header: "Variant", render: (row) => <span className="font-medium">{row.name}</span> },
              ...attributeKeys.map((key) => ({ key: `attr-${key}`, header: humanize(key), render: (row: Variant) => <span className="text-muted">{String((row.attributes || {})[key] ?? "—")}</span> })),
              { key: "sellPrice", header: "Price", align: "right", render: (row) => money(row.sellPrice ?? row.standardPrice) },
              {
                key: "add",
                header: "",
                align: "right",
                render: (row) =>
                  allowed(session, "rfqs.create") ? (
                    <Button size="sm" variant="ghost" onClick={() => setRfqLines([{ variantId: row.id, description: `${data.name} - ${row.name}`, qty: Number(data.moq) || 1, unit: "NOS" }])}>
                      <Plus /> RFQ
                    </Button>
                  ) : null,
              },
            ]}
          />
        ) : null}
        {tab === "applications" ? (
          <CardBody className="grid gap-6 pt-4 md:grid-cols-3">
            {[
              { title: "Applications", items: data.applications },
              { title: "Segments", items: data.segments },
              { title: "Sectors", items: data.sectors },
            ].map((group) => (
              <div key={group.title}>
                <p className="mb-2 text-sm font-semibold">{group.title}</p>
                <div className="flex flex-wrap gap-1.5">
                  {group.items.length ? group.items.map((item) => <Badge key={item} tone="info">{humanize(item)}</Badge>) : <span className="text-sm text-muted">None listed</span>}
                </div>
              </div>
            ))}
          </CardBody>
        ) : null}
        {tab === "cad" ? (
          <CardBody className="pt-4">
            {cad.data?.items.length ? (
              <>
                <div className="mb-3 flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => downloadDirect(`/documents/bundle?entityType=product&entityId=${data.id}&categories=CAD,BIM,DRAWING`)}><FileDown /> Download all</Button>
                  {allowed(session, "documents.create") ? <Button size="sm" variant="outline" onClick={() => setUploading(true)}><Plus /> Upload</Button> : null}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">{cad.data.items.map((doc) => <DocumentTile key={doc.id} doc={doc} />)}</div>
              </>
            ) : (
              <EmptyState icon={<Box />} title="No CAD or BIM files" description="Upload RVT/RFA, DWG, IFC, NWD or SKP models (up to 250 MB), for the whole product or one variant, so engineers and consultants can download them." action={allowed(session, "documents.create") ? <Button size="sm" onClick={() => setUploading(true)}><Plus /> Upload</Button> : undefined} />
            )}
          </CardBody>
        ) : null}
        {tab === "documents" ? (
          <CardBody className="pt-4">
            <div className="mb-3 flex justify-end">{allowed(session, "documents.create") ? <Button size="sm" variant="outline" onClick={() => setUploading(true)}><Plus /> Upload</Button> : null}</div>
            {documents.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">{documents.map((doc) => <DocumentTile key={doc.id} doc={doc} />)}</div>
            ) : (
              <EmptyState icon={<FileText />} title="No documents" description="Datasheets, test certificates and installation guides appear here." />
            )}
          </CardBody>
        ) : null}
        {tab === "pricing" ? (
          <DataTable
            rows={data.variants}
            rowKey={(row) => row.id}
            columns={[
              { key: "articleNumber", header: "Article no.", render: (row) => <span className="font-mono text-xs">{row.articleNumber}</span> },
              { key: "standardPrice", header: "Standard", align: "right", render: (row) => money(row.standardPrice) },
              { key: "customerPrice", header: "Customer", align: "right", render: (row) => (row.customerPrice ? money(row.customerPrice) : "—") },
              { key: "dealerPrice", header: "Dealer", align: "right", render: (row) => (row.dealerPrice ? money(row.dealerPrice) : "—") },
              { key: "exportPrice", header: "Export", align: "right", render: (row) => (row.exportPrice ? money(row.exportPrice) : "—") },
              ...(seesCost
                ? [
                    { key: "cost", header: "Cost", align: "right" as const, render: (row: Variant) => <span className="text-muted">{money(Number(row.manufacturingCost) || Number(row.purchaseCost))}</span> },
                    {
                      key: "margin",
                      header: "Std margin",
                      align: "right" as const,
                      render: (row: Variant) => {
                        const cost = Number(row.manufacturingCost) || Number(row.purchaseCost);
                        const price = Number(row.standardPrice);
                        return price ? <span className={cn("tabular", (price - cost) / price < 0.15 ? "text-danger" : "text-success")}>{Math.round(((price - cost) / price) * 100)}%</span> : "—";
                      },
                    },
                  ]
                : []),
            ]}
          />
        ) : null}
      </Card>

      <CreateRfq open={rfqLines !== null} onOpenChange={(open) => !open && setRfqLines(null)} initialLines={rfqLines || undefined} onCreated={(rfqId) => router.push(`/rfqs/${rfqId}`)} />
      <UploadDocument
        open={uploading}
        onOpenChange={setUploading}
        entityType="product"
        entityId={data.id}
        defaultCategory={tab === "cad" ? "BIM" : "DATASHEET"}
        variants={data.variants.map((variant) => ({ id: variant.id, label: `${variant.articleNumber} · ${variant.name}` }))}
      />
    </Page>
  );
}
