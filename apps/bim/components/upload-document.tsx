"use client";

import { Button, ErrorNote, Field, Modal, Select, TextInput } from "@fixotec/ui";
import { useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { useApi } from "../lib/query";
import { uploadDocument } from "../lib/upload";

const CATEGORIES = ["BIM", "CAD", "DRAWING", "OTHER"];
const INVALIDATE = ["/documents", "/cad", "/projects", "/products"];
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.zip,.xlsx,.docx,.csv,.txt,.dwg,.dxf,.dwf,.dwfx,.rvt,.rfa,.rte,.rft,.ifc,.step,.stp,.igs,.iges,.sat,.skp,.nwd,.nwc";

type Product = { id: string; name: string; sku: string; category?: { name: string } | null };

export function UploadDocument({
  open,
  onOpenChange,
  entityType,
  entityId,
  folderId,
  documentId,
  defaultCategory = "BIM",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType?: string;
  entityId?: string;
  folderId?: string;
  documentId?: string;
  defaultCategory?: string;
}) {
  const client = useQueryClient();
  const products = useApi<{ items: Product[] }>(open && !documentId ? "/products?pageSize=100" : null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [productId, setProductId] = useState(entityType === "product" ? entityId || "" : "");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (progress !== null) return;
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) return setError("Choose a file");
    const text = (key: string) => String(form.get(key) || "").trim() || undefined;
    setError(null);
    setProgress(0);
    try {
      const linked = productId || undefined;
      await uploadDocument(
        file,
        {
          title: text("title"),
          category: text("category"),
          notes: text("notes"),
          entityType: documentId ? entityType : linked ? "product" : entityType,
          entityId: documentId ? entityId : linked || entityId,
          folderId,
          documentId,
        },
        setProgress,
      );
      await client.invalidateQueries({ predicate: (query) => INVALIDATE.some((prefix) => String(query.queryKey[0] || "").startsWith(prefix)) });
      onOpenChange(false);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setProgress(null);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => progress === null && onOpenChange(next)}
      title={documentId ? "Upload a new version" : "Upload family"}
      description="Revit files (.rvt, .rfa) are stored for download. A preview thumbnail is taken from the file when possible. Upload an .ifc as a later version to preview the model in 3D."
      footer={
        <>
          <Button variant="outline" disabled={progress !== null} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="upload-bim" loading={progress !== null}>{progress !== null ? `Uploading ${Math.round(progress * 100)}%` : "Upload"}</Button>
        </>
      }
    >
      <form id="upload-bim" onSubmit={submit} className="grid gap-4">
        <Field label="File"><input name="file" type="file" required accept={ACCEPT} className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-canvas file:px-3 file:py-1.5 file:text-sm" /></Field>
        {documentId ? null : (
          <>
            <Field label="Title"><TextInput name="title" placeholder="Defaults to the file name" /></Field>
            <Field label="Category">
              <Select name="category" defaultValue={defaultCategory}>
                {CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}
              </Select>
            </Field>
            <Field label="Fixotec product" hint="Optional. Links this family to a catalogue product for breadcrumbs and filters.">
              <Select value={productId} onChange={(event) => setProductId(event.target.value)}>
                <option value="">Not linked</option>
                {(products.data?.items || []).map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.sku} · {product.name}{product.category?.name ? ` (${product.category.name})` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
        <Field label="Notes"><TextInput name="notes" placeholder="Optional revision note" /></Field>
        {progress !== null ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-canvas"><div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
        ) : null}
        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </form>
    </Modal>
  );
}
