"use client";

import { Button, Page, PageHeader, TextInput } from "@fixotec/ui";
import { Folder, FolderPlus, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { QueryError } from "../../../components/common";
import { EmptyLibrary, FamilyList, FamilyTiles, ViewToggle, type FamilyDoc } from "../../../components/family-views";
import { UploadDocument } from "../../../components/upload-document";
import { api } from "../../../lib/api";
import { useApi } from "../../../lib/query";
import { allowed, useSession } from "../../../lib/session";
import { useLibraryView } from "../../../lib/view-mode";

type FolderRow = { id: string; name: string; parentId: string | null };

export default function LibraryFoldersPage() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const { view, setView } = useLibraryView();
  const [folderId, setFolderId] = useState("");
  const [q, setQ] = useState("");
  const [uploading, setUploading] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderError, setFolderError] = useState("");
  const canCreate = allowed(session, "documents.create");
  const folders = useApi<{ items: FolderRow[] }>("/documents/folders");
  const params = new URLSearchParams({ kind: "library" });
  if (folderId) params.set("folderId", folderId);
  if (q) params.set("q", q);
  const docs = useApi<{ items: FamilyDoc[] }>(`/documents?${params}`, { keepPrevious: true });

  const tree = useMemo(() => {
    const items = folders.data?.items || [];
    const byParent = new Map<string, FolderRow[]>();
    for (const folder of items) {
      const key = folder.parentId || "";
      byParent.set(key, [...(byParent.get(key) || []), folder]);
    }
    for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    const rows: Array<FolderRow & { depth: number }> = [];
    const walk = (parent: string, depth: number) => {
      for (const folder of byParent.get(parent) || []) {
        rows.push({ ...folder, depth });
        walk(folder.id, depth + 1);
      }
    };
    walk("", 0);
    return rows;
  }, [folders.data]);

  const current = (folders.data?.items || []).find((folder) => folder.id === folderId);

  async function createFolder() {
    setFolderError("");
    try {
      const row = await api<FolderRow>("/documents/folders", {
        method: "POST",
        body: JSON.stringify({ name: folderName, parentId: folderId && folderId !== "root" ? folderId : undefined }),
      });
      setFolderName("");
      setFolderOpen(false);
      setFolderId(row.id);
      await queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0] || "").startsWith("/documents") });
    } catch (error) {
      setFolderError((error as Error).message);
    }
  }

  return (
    <Page>
      <PageHeader
        title="Revit Library"
        description={current ? `Folder · ${current.name}` : "Browse folders and upload Revit families for internal use."}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ViewToggle view={view} onChange={setView} />
            {canCreate ? <Button variant="outline" onClick={() => setFolderOpen((open) => !open)}><FolderPlus /> Add folder</Button> : null}
            {canCreate ? <Button onClick={() => setUploading(true)}><Plus /> Upload family</Button> : null}
          </div>
        }
      />
      {folderOpen ? (
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="text-sm font-medium">New folder{current ? ` in ${current.name}` : " at the top level"}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <TextInput value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="Folder name" className="max-w-sm" />
            <Button onClick={() => void createFolder()} disabled={!folderName.trim()}>Create</Button>
            <Button variant="outline" onClick={() => { setFolderOpen(false); setFolderError(""); }}>Cancel</Button>
          </div>
          {folderError ? <p className="mt-2 text-sm text-red-600">{folderError}</p> : null}
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <nav className="rounded-2xl border border-line bg-white p-3" aria-label="Folders">
          <button
            type="button"
            onClick={() => setFolderId("")}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${!folderId ? "bg-canvas font-medium" : "hover:bg-canvas"}`}
          >
            <Folder className="h-4 w-4" /> All folders
          </button>
          {tree.map((folder) => (
            <button
              key={folder.id}
              type="button"
              onClick={() => setFolderId(folder.id)}
              style={{ paddingLeft: 8 + folder.depth * 16 }}
              className={`flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-sm ${folderId === folder.id ? "bg-canvas font-medium" : "hover:bg-canvas"}`}
            >
              <Folder className="h-4 w-4 shrink-0" /> {folder.name}
            </button>
          ))}
        </nav>
        <div className="space-y-4">
          <TextInput value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search in this folder" />
          <QueryError error={docs.error} />
          {docs.data && (docs.data.items || []).length === 0 ? (
            <EmptyLibrary
              title="This folder is empty"
              body="Upload a Revit family, or pick another folder. Folder names must be unique at the same level."
              action={canCreate ? <Button onClick={() => setUploading(true)}>Upload family</Button> : undefined}
            />
          ) : view === "tiles" ? (
            <FamilyTiles items={docs.data?.items || []} />
          ) : (
            <FamilyList items={docs.data?.items || []} />
          )}
        </div>
      </div>
      <UploadDocument open={uploading} onOpenChange={setUploading} folderId={folderId || undefined} defaultCategory="BIM" />
    </Page>
  );
}
