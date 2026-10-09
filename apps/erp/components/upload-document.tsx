"use client";

import { Button, ErrorNote, Field, Modal, Select, TextInput, humanize } from "@fixotec/ui";
import { useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { uploadDocument } from "../lib/upload";

const CATEGORIES = ["DRAWING", "CAD", "BIM", "SUBMITTAL", "CALCULATION", "SPECIFICATION", "DATASHEET", "CERTIFICATE", "INSTALLATION", "QC", "OTHER"];
const INVALIDATE = ["/documents", "/projects", "/products", "/cad", "/rfqs", "/engineering"];
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.zip,.xlsx,.docx,.csv,.txt,.dwg,.dxf,.dwf,.dwfx,.rvt,.rfa,.rte,.rft,.ifc,.step,.stp,.igs,.iges,.sat,.skp,.nwd,.nwc";

export type VariantOption = { id: string; label: string };

export function UploadDocument({
  open,
  onOpenChange,
  entityType,
  entityId,
  defaultCategory = "DRAWING",
  variants,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType?: string;
  entityId?: string;
  defaultCategory?: string;
  /** On a product, lets the file be attached to one variant (e.g. a size-specific Revit family). */
  variants?: VariantOption[];
}) {
  const client = useQueryClient();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (progress !== null) return;
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) return setError("Choose a file");
    const variantId = String(form.get("variantId") || "");
    const text = (key: string) => String(form.get(key) || "").trim() || undefined;
    setError(null);
    setProgress(0);
    try {
      await uploadDocument(
        file,
        { title: text("title"), category: text("category"), audiences: text("audiences"), entityType: variantId ? "variant" : entityType, entityId: variantId || entityId },
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
      title="Upload document"
      description="CAD and BIM models (RVT, RFA, DWG, IFC, NWD, SKP...) up to 250 MB. Image uploads get a preview thumbnail automatically."
      footer={
        <>
          <Button variant="outline" disabled={progress !== null} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="upload-doc" loading={progress !== null}>{progress !== null ? `Uploading ${Math.round(progress * 100)}%` : "Upload"}</Button>
        </>
      }
    >
      <form id="upload-doc" onSubmit={submit} className="grid gap-4">
        <Field label="File"><input name="file" type="file" required accept={ACCEPT} className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-canvas file:px-3 file:py-1.5 file:text-sm" /></Field>
        <Field label="Title"><TextInput name="title" placeholder="Defaults to the file name" /></Field>
        <Field label="Category">
          <Select name="category" defaultValue={defaultCategory}>
            {CATEGORIES.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
          </Select>
        </Field>
        {variants?.length ? (
          <Field label="Applies to" hint="Attach a size-specific model to one variant, or leave it on the whole product">
            <Select name="variantId" defaultValue="">
              <option value="">Whole product</option>
              {variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.label}</option>)}
            </Select>
          </Field>
        ) : null}
        <Field label="Share with" hint="Comma separated audiences, e.g. PUBLIC,CUSTOMER,CONSULTANT,DISTRIBUTOR. PUBLIC shows it on the website."><TextInput name="audiences" defaultValue="CUSTOMER,CONSULTANT" /></Field>
        {progress !== null ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-canvas"><div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
        ) : null}
        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </form>
    </Modal>
  );
}
