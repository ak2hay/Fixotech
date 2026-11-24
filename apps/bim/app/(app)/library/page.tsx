"use client";

import { Button, Page, PageHeader, TextInput } from "@fixotec/ui";
import { Folder, FolderPlus, Pencil, Plus, Trash2 } from "lucide-react";
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
  const [folderMode, setFolderMode] = useState<"create" | "rename" | null>(null);
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

  async function refreshLibrary() {
    await queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey[0] || "").startsWith("/documents") });
  }

  async function createFolder() {
    setFolderError("");
    try {
      const row = await api<FolderRow>("/documents/folders", {
        method: "POST",
        body: JSON.stringify({ name: folderName, parentId: folderId && folderId !== "root" ? folderId : undefined }),
      });
      setFolderName("");
      setFolderMode(null);
      setFolderId(row.id);
      await refreshLibrary();
    } catch (error) {
      setFolderError((error as Error).message);
    }
  }

  async function renameFolder() {
    if (!current) return;
    setFolderError("");
    try {
      await api(`/documents/folders/${current.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: folderName }),
      });
      setFolderName("");
      setFolderMode(null);
      await refreshLibrary();
    } catch (error) {
      setFolderError((error as Error).message);
    }
  }

  async function deleteFolder() {
    if (!current) return;
    if (!window.confirm(`Delete the folder “${current.name}”? It must be empty.`)) return;
    setFolderError("");
    try {
      await api(`/documents/folders/${current.id}`, { method: "DELETE" });
      setFolderId("");
      setFolderMode(null);
      await refreshLibrary();
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
            {canCreate ? (
              <Button
                variant="outline"
                onClick={() => {
                  setFolderMode("create");
                  setFolderName("");
                  setFolderError("");
                }}
              >
                <FolderPlus /> Add folder
              </Button>
            ) : null}
            {canCreate && current ? (
              <Button
                variant="outline"
                onClick={() => {
                  setFolderMode("rename");
                  setFolderName(current.name);
                  setFolderError("");
                }}
              >
                <Pencil /> Rename
              </Button>
            ) : null}
            {canCreate && current ? (
              <Button variant="outline" onClick={() => void deleteFolder()}>
                <Trash2 /> Delete
              </Button>
            ) : null}
            {canCreate ? <Button onClick={() => setUploading(true)}><Plus /> Upload family</Button> : null}
          </div>
        }
      />
      {folderMode ? (
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="text-sm font-medium">
            {folderMode === "rename"
              ? `Rename ${current?.name || "folder"}`
              : `New folder${current ? ` in ${current.name}` : " at the top level"}`}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <TextInput value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="Folder name" className="max-w-sm" />
            <Button
              onClick={() => void (folderMode === "rename" ? renameFolder() : createFolder())}
              disabled={!folderName.trim()}
            >
              {folderMode === "rename" ? "Save" : "Create"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setFolderMode(null);
                setFolderError("");
              }}
            >
              Cancel
            </Button>
          </div>
          {folderError ? <p className="mt-2 text-sm text-red-600">{folderError}</p> : null}
        </div>
      ) : folderError ? (
        <p className="text-sm text-red-600">{folderError}</p>
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
              onClick={() => {
                setFolderId(folder.id);
                setFolderMode(null);
                setFolderError("");
              }}
              style={{ paddingLeft: 8 + folder.depth * 16 }}
              className={`flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-sm ${folderId === folder.id ? "bg-canvas font-medium" : "hover:bg-canvas"}`}
            >
              <Folder className="h-4 w-4 shrink-0" /> {folder.name}
            </button>
          ))}
          {tree.length === 0 ? <p className="px-2 py-3 text-sm text-muted">No folders yet. Add a folder to organise families by company or product line.</p> : null}
        </nav>
        <div className="space-y-4">
          <TextInput value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search in this folder" />
          <QueryError error={docs.error} />
          {docs.data && (docs.data.items || []).length === 0 ? (
            <EmptyLibrary
              title={current ? `${current.name} is empty` : "No families in this view"}
              body={current ? "Upload a Revit family into this folder, or pick another folder." : "Upload a Revit family, or open a folder from the list. Folder names must be unique at the same level."}
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
