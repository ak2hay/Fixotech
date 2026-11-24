"use client";

import { Button, Card, Page, PageHeader, StatusPill, TextInput, humanize, relativeTime } from "@fixotec/ui";
import { Box, Download, Link2, Lock, Unlock } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { QueryError, fileSize } from "../../../../components/common";
import { UploadDocument } from "../../../../components/upload-document";
import { api, download, downloadDirect } from "../../../../lib/api";
import { useApi } from "../../../../lib/query";
import { allowed, useSession } from "../../../../lib/session";

type Version = { id: string; version: number; status: string; fileName: string; sizeBytes?: number | string; mimeType?: string; notes?: string | null; createdAt: string; createdById?: string | null };
type Share = { id: string; expiresAt: string; revokedAt?: string | null; createdAt: string };
type Doc = {
  id: string;
  title: string;
  category: string;
  entityType?: string | null;
  entityId?: string | null;
  folder?: { id: string; name: string } | null;
  audiences: string[];
  updatedAt: string;
  versions: Version[];
  checkedOutById?: string | null;
  checkedOutBy?: { id: string; name: string } | null;
  checkedOutAt?: string | null;
};

function isIfc(fileName?: string) {
  return (fileName || "").toLowerCase().endsWith(".ifc");
}

export default function FileDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const id = params.id;
  const doc = useApi<Doc>(id ? `/documents/${id}` : null);
  const shares = useApi<{ id: string; expiresAt: string; revokedAt?: string | null; createdAt: string }[]>(allowed(session, "documents.share") && id ? `/documents/${id}/shares` : null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [shareDays, setShareDays] = useState("7");
  const [shareLink, setShareLink] = useState("");
  const file = doc.data;
  const latest = file?.versions[0];
  const ifc = file?.versions.find((version) => isIfc(version.fileName));
  const mine = file?.checkedOutById === session?.user.id;
  const canCreate = allowed(session, "documents.create");
  const canApprove = allowed(session, "documents.approve");
  const canShare = allowed(session, "documents.share");
  const canForce = canApprove || Boolean(session?.roleKeys.some((role) => ["super_admin", "managing_director", "ceo"].includes(role)));

  async function run(path: string, body?: unknown, method = "POST") {
    setError("");
    try {
      const result = await api<Record<string, unknown>>(path, { method, body: body ? JSON.stringify(body) : "{}" });
      await doc.refetch();
      await shares.refetch();
      return result;
    } catch (failure) {
      setError((failure as Error).message);
      return null;
    }
  }

  async function createShare() {
    if (!latest) return;
    const result = await run(`/documents/${id}/share`, { version: latest.version, days: Number(shareDays) || 7 });
    if (result && typeof result.path === "string") setShareLink(String(result.path));
  }

  return (
    <Page>
      <PageHeader
        title={file?.title || "File"}
        description={file ? `${humanize(file.category)}${file.folder ? ` · ${file.folder.name}` : ""}` : "Loading..."}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => router.push("/")}>Back to library</Button>
            {ifc ? <Button variant="outline" onClick={() => router.push(`/files/${id}/view?version=${ifc.version}`)}><Box /> Open 3D preview</Button> : null}
            {canCreate ? <Button onClick={() => setUploading(true)}>Upload version</Button> : null}
          </div>
        }
      />
      <QueryError error={doc.error || error} />
      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <Card>
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Revision history</h2>
            <p className="text-xs text-muted">Approved revisions cannot be overwritten. Upload a new version instead. An IFC can be a version of the same Revit model.</p>
          </div>
          <ul className="divide-y divide-line">
            {(file?.versions || []).map((version) => (
              <li key={version.id || version.version} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Rev {version.version} · {version.fileName}</p>
                  <p className="text-xs text-muted">{fileSize(version.sizeBytes || 0)} · {relativeTime(version.createdAt)}{version.notes ? ` · ${version.notes}` : ""}</p>
                </div>
                <StatusPill status={version.status} />
                {isIfc(version.fileName) ? <Button size="sm" variant="outline" onClick={() => router.push(`/files/${id}/view?version=${version.version}`)}>3D</Button> : null}
                {canApprove && version.status !== "APPROVED" && version.createdById !== session?.user.id ? (
                  <Button size="sm" variant="outline" onClick={() => void run(`/documents/${id}/versions/${version.version}/status`, { status: "APPROVED" })}>Approve</Button>
                ) : null}
                <Button size="icon-sm" variant="ghost" aria-label="Download" onClick={() => (Number(version.sizeBytes || 0) > 20e6 ? downloadDirect(`/documents/${id}/download?version=${version.version}`) : download(`/documents/${id}/download?version=${version.version}`, version.fileName))}><Download /></Button>
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-4">
          <Card>
            <div className="px-4 py-3">
              <h2 className="text-sm font-semibold">Check-out</h2>
              {file?.checkedOutBy ? (
                <p className="mt-2 text-sm text-muted"><Lock className="mr-1 inline h-3.5 w-3.5" />Checked out by {file.checkedOutBy.name}{file.checkedOutAt ? ` · ${relativeTime(file.checkedOutAt)}` : ""}</p>
              ) : (
                <p className="mt-2 text-sm text-muted">This file is free to edit.</p>
              )}
              {canCreate ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {!file?.checkedOutById ? <Button size="sm" onClick={() => void run(`/documents/${id}/checkout`)}>Check out</Button> : null}
                  {mine ? <Button size="sm" variant="outline" onClick={() => void run(`/documents/${id}/checkin`, {})}><Unlock /> Check in</Button> : null}
                  {file?.checkedOutById && !mine && canForce ? <Button size="sm" variant="outline" onClick={() => void run(`/documents/${id}/checkin`, { force: true })}>Force check-in</Button> : null}
                </div>
              ) : null}
            </div>
          </Card>
          {canShare && latest ? (
            <Card>
              <div className="px-4 py-3">
                <h2 className="text-sm font-semibold">Customer share link</h2>
                <p className="mt-1 text-xs text-muted">Only approved or client-review revisions can be shared. The token is shown once.</p>
                <div className="mt-3 flex gap-2">
                  <TextInput value={shareDays} onChange={(event) => setShareDays(event.target.value)} className="w-20" />
                  <Button size="sm" onClick={() => void createShare()}><Link2 /> Create {shareDays}-day link</Button>
                </div>
                {shareLink ? <p className="mt-2 break-all font-mono text-xs">{shareLink}</p> : null}
                <ul className="mt-3 space-y-1 text-xs text-muted">
                  {(Array.isArray(shares.data) ? shares.data : []).map((share: Share) => (
                    <li key={share.id} className="flex items-center justify-between gap-2">
                      <span>{share.revokedAt ? "Revoked" : `Expires ${share.expiresAt.slice(0, 10)}`}</span>
                      {!share.revokedAt ? <button type="button" className="text-accent" onClick={() => void run(`/documents/${id}/shares/${share.id}/revoke`)}>Revoke</button> : null}
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
      <UploadDocument open={uploading} onOpenChange={setUploading} documentId={id} entityType={file?.entityType || undefined} entityId={file?.entityId || undefined} />
    </Page>
  );
}
