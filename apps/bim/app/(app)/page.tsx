"use client";

import { Button, Card, DataTable, FilterButton, Page, PageHeader, StatusPill, TextInput, humanize, relativeTime } from "@fixotec/ui";
import { Folder, FolderPlus, Lock, Plus, Search } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { QueryError, fileSize } from "../../components/common";
import { UploadDocument } from "../../components/upload-document";
import { api } from "../../lib/api";
import { useApi, type Paged } from "../../lib/query";
import { allowed, useSession } from "../../lib/session";

type Project = { id: string; code: string; name: string };
type FolderRow = { id: string; name: string; parentId: string | null };
type Version = { version: number; status: string; fileName: string; sizeBytes?: number | string; mimeType?: string };
type Doc = {
  id: string;
  title: string;
  category: string;
  folderId?: string | null;
  updatedAt: string;
  versions: Version[];
  checkedOutById?: string | null;
  checkedOutBy?: { id: string; name: string } | null;
  checkedOutAt?: string | null;
};

function isIfc(fileName?: string) {
  return (fileName || "").toLowerCase().endsWith(".ifc");
}

export default function LibraryPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [projectId, setProjectId] = useState("");
  const [folderId, setFolderId] = useState("");
  const [q, setQ] = useState("");
  const [uploading, setUploading] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderError, setFolderError] = useState("");
  const projects = useApi<Paged<Project>>("/projects?pageSize=100");
  const folderQuery = projectId ? `/documents/folders?entityType=project&entityId=${projectId}` : "/documents/folders";
  const folders = useApi<{ items: FolderRow[] }>(folderQuery);
  const params = new URLSearchParams();
  if (projectId) {
    params.set("entityType", "project");
    params.set("entityId", projectId);
  }
  if (folderId) params.set("folderId", folderId);
  if (q) params.set("q", q);
  const docs = useApi<{ items: Doc[] }>(`/documents?${params}`, { keepPrevious: true });
  const canCreate = allowed(session, "documents.create");

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

  async function createFolder() {
    setFolderError("");
    try {
      const row = await api<FolderRow>("/documents/folders", {
        method: "POST",
        body: JSON.stringify({ name: folderName, parentId: folderId && folderId !== "root" ? folderId : undefined, entityType: projectId ? "project" : undefined, entityId: projectId || undefined }),
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
        title="Project files"
        description="Revit, IFC and CAD files in project folders. Native Revit stays download-only; upload an IFC to preview it in 3D."
        actions={
          canCreate ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setFolderOpen(true)}><FolderPlus /> New folder</Button>
              <Button onClick={() => setUploading(true)}><Plus /> Upload file</Button>
            </div>
          ) : null
        }
      />
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <Card className="h-fit">
          <div className="border-b border-line px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Folders</p>
          </div>
          <nav className="p-2">
            <button type="button" className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${!folderId ? "bg-sidebar text-white" : "hover:bg-canvas"}`} onClick={() => setFolderId("")}>
              <Folder className="h-4 w-4" /> All files
            </button>
            <button type="button" className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${folderId === "root" ? "bg-sidebar text-white" : "hover:bg-canvas"}`} onClick={() => setFolderId("root")}>
              <Folder className="h-4 w-4" /> Unfiled
            </button>
            {tree.map((folder) => (
              <button key={folder.id} type="button" style={{ paddingLeft: 8 + folder.depth * 12 }} className={`flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm ${folderId === folder.id ? "bg-sidebar text-white" : "hover:bg-canvas"}`} onClick={() => setFolderId(folder.id)}>
                <Folder className="h-4 w-4 shrink-0" />
                <span className="truncate">{folder.name}</span>
              </button>
            ))}
          </nav>
        </Card>
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <TextInput icon={<Search />} placeholder="Search file titles..." value={q} onChange={(event) => setQ(event.target.value)} className="w-64" />
            <FilterButton label="Project" value={projectId} onChange={(value) => { setProjectId(value); setFolderId(""); }} options={(projects.data?.items || []).map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} />
          </div>
          <QueryError error={docs.error || folders.error} />
          <DataTable
            rows={docs.data?.items || []}
            loading={docs.isLoading}
            rowKey={(row) => row.id}
            empty="No files in this folder yet."
            onRowClick={(row) => router.push(`/files/${row.id}`)}
            columns={[
              { key: "title", header: "File", sortValue: (row) => row.title, render: (row) => (
                <div>
                  <p className="font-medium">{row.title}</p>
                  <p className="text-2xs text-muted">{row.versions[0]?.fileName}</p>
                </div>
              ) },
              { key: "category", header: "Type", render: (row) => humanize(row.category) },
              { key: "version", header: "Rev", align: "right", render: (row) => row.versions[0]?.version || "—" },
              { key: "status", header: "Status", render: (row) => (row.versions[0]?.status ? <StatusPill status={row.versions[0].status} /> : "—") },
              { key: "size", header: "Size", align: "right", render: (row) => (row.versions[0]?.sizeBytes ? fileSize(row.versions[0].sizeBytes) : "—") },
              { key: "lock", header: "Lock", render: (row) => (row.checkedOutBy ? <span className="inline-flex items-center gap-1 text-xs text-muted"><Lock className="h-3 w-3" />{row.checkedOutBy.name}</span> : "—") },
              { key: "preview", header: "3D", render: (row) => (row.versions.some((version) => isIfc(version.fileName)) ? "IFC" : "—") },
              { key: "updatedAt", header: "Updated", sortValue: (row) => row.updatedAt, render: (row) => <span className="text-muted">{relativeTime(row.updatedAt)}</span> },
            ]}
          />
        </Card>
      </div>
      <UploadDocument open={uploading} onOpenChange={setUploading} entityType={projectId ? "project" : undefined} entityId={projectId || undefined} folderId={folderId && folderId !== "root" ? folderId : undefined} defaultCategory="BIM" />
      {folderOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-5 shadow-pop">
            <h2 className="text-base font-semibold">New folder</h2>
            <p className="mt-1 text-sm text-muted">{projectId ? "Created in the selected project." : "Created in the unassigned library."}</p>
            <TextInput className="mt-4" value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="Folder name" />
            {folderError ? <p className="mt-2 text-sm text-accent">{folderError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFolderOpen(false)}>Cancel</Button>
              <Button disabled={!folderName.trim()} onClick={() => void createFolder()}>Create</Button>
            </div>
          </div>
        </div>
      ) : null}
    </Page>
  );
}
