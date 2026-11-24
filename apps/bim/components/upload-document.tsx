"use client";

import { Button, ErrorNote, Field, Modal, Select, TextInput, humanize } from "@fixotec/ui";
import { useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { uploadDocument } from "../lib/upload";

const CATEGORIES = ["BIM", "CAD", "DRAWING", "OTHER"];
const INVALIDATE = ["/documents", "/cad", "/projects"];
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.zip,.xlsx,.docx,.csv,.txt,.dwg,.dxf,.dwf,.dwfx,.rvt,.rfa,.rte,.rft,.ifc,.step,.stp,.igs,.iges,.sat,.skp,.nwd,.nwc";

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
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      await uploadDocument(
        file,
        { title: text("title"), category: text("category"), audiences: text("audiences"), notes: text("notes"), entityType, entityId, folderId, documentId },
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
      title={documentId ? "Upload a new version" : "Upload file"}
      description="Revit files (.rvt, .rfa) are stored for download. Upload an .ifc alongside or as a new version to preview the model in the browser. Large files go straight to object storage."
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
                {CATEGORIES.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
              </Select>
            </Field>
            <Field label="Share with" hint="Comma-separated audiences, e.g. CUSTOMER,CONSULTANT. Approved revisions can then be shared with the partner portal.">
              <TextInput name="audiences" defaultValue="CUSTOMER,CONSULTANT" />
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
