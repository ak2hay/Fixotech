"use client";

import { Button, Card, DataTable, Drawer, KeyValueList, StatusPill, Tabs, formatDate, relativeTime } from "@fixotec/ui";
import { Download } from "lucide-react";
import { useState } from "react";
import { ListPage, QueryError, fileSize } from "../../../components/common";
import { Link } from "../../../components/link";
import { download } from "../../../lib/api";
import { useApi } from "../../../lib/query";

type SubmittalRow = { id: string; number: string; title: string; status: string; createdAt: string; project?: { id: string; name: string; code: string } | null; selections?: { documentIds?: string[]; variantIds?: string[] } };
type SubmittalDetail = SubmittalRow & { document: { id: string; versions: Array<{ version: number; status: string; fileName: string; sizeBytes: number; createdAt: string }> } | null };

const TABS = [
  { key: "", label: "All" },
  { key: "SUBMITTED", label: "For review" },
  { key: "APPROVED", label: "Approved" },
  { key: "APPROVED_AS_NOTED", label: "Approved as noted" },
  { key: "REJECTED", label: "Rejected" },
];

export default function PortalSubmittalsPage() {
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const { data, error, isLoading } = useApi<{ items: SubmittalRow[] }>(`/submittals${status ? `?status=${status}` : ""}`, { keepPrevious: true });

  return (
    <ListPage title="Technical submittals" description="Compiled product data and drawings issued by Fixotec for your approval.">
      <Tabs variant="pill" items={TABS} value={status} onChange={setStatus} />
      <QueryError error={error} />
      <Card>
        <DataTable
          rows={data?.items || []}
          rowKey={(row) => row.id}
          loading={isLoading}
          onRowClick={(row) => setSelected(row.id)}
          empty={<p className="px-4 py-10 text-center text-sm text-muted">No submittals yet.</p>}
          columns={[
            { key: "number", header: "Submittal", render: (row) => <span className="font-medium">{row.number}</span> },
            { key: "title", header: "Title" },
            { key: "project", header: "Project", render: (row) => <span className="text-muted">{row.project ? `${row.project.code} · ${row.project.name}` : "—"}</span> },
            { key: "contents", header: "Contents", render: (row) => <span className="text-muted">{row.selections?.variantIds?.length || 0} products · {row.selections?.documentIds?.length || 0} documents</span> },
            { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
            { key: "createdAt", header: "Issued", render: (row) => <span className="text-muted">{relativeTime(row.createdAt)}</span> },
          ]}
        />
      </Card>
      <SubmittalDrawer id={selected} onClose={() => setSelected(null)} />
    </ListPage>
  );
}

function SubmittalDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data } = useApi<SubmittalDetail>(id ? `/submittals/${id}` : null);
  return (
    <Drawer open={Boolean(id)} onOpenChange={(open) => (!open ? onClose() : undefined)} title={data?.number || "Submittal"} description={data?.title}>
      {data ? (
        <div className="space-y-5">
          <KeyValueList
            items={[
              { label: "Status", value: <StatusPill status={data.status} /> },
              { label: "Project", value: data.project ? <Link href={`/projects/${data.project.id}`} className="hover:text-accent">{data.project.name}</Link> : "—" },
              { label: "Products", value: data.selections?.variantIds?.length || 0 },
              { label: "Documents", value: data.selections?.documentIds?.length || 0 },
              { label: "Issued", value: formatDate(data.createdAt) },
            ]}
          />
          {data.document ? (
            <div>
              <p className="mb-2 text-sm font-semibold">Revisions</p>
              <div className="space-y-2">
                {data.document.versions.map((version) => (
                  <div key={version.version} className="flex items-center justify-between rounded-md border border-line px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">Rev {version.version} · {version.fileName}</p>
                      <p className="text-xs text-muted">{fileSize(version.sizeBytes)} · {formatDate(version.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill status={version.status} />
                      <Button size="icon-sm" variant="ghost" aria-label="Download" onClick={() => download(`/documents/${data.document!.id}/download?version=${version.version}`, version.fileName)}>
                        <Download />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}
