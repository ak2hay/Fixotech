"use client";

import { ENGINEERING_STATUSES } from "@fixotec/shared";
import { ActivityFeed, Button, Card, CardBody, CardHeader, DetailHeader, EmptyState, ErrorNote, Field, KeyValueList, Modal, Page, Select, StatusPill, Stepper, TextInput, formatDate, humanize, type Step } from "@fixotec/ui";
import { Building2, CalendarDays, FileText, Pencil, Plus } from "lucide-react";
import { useParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { DocumentTile, DueText, PageSkeleton, QueryError, toActivity, type ActivityRow, type DocumentSummary } from "../../../../components/common";
import { Link } from "../../../../components/link";
import { UploadDocument } from "../../../../components/upload-document";
import { useAction, useApi, type Paged } from "../../../../lib/query";
import { allowed, useSession } from "../../../../lib/session";

type Engineering = {
  id: string;
  number: string;
  status: string;
  application?: string | null;
  requiredSystem?: string | null;
  load?: string | null;
  dimensions?: string | null;
  material?: string | null;
  installationCondition?: string | null;
  standard?: string | null;
  revision: string;
  dueDate?: string | null;
  notes?: string | null;
  createdAt: string;
  project?: { id: string; name: string; code: string } | null;
  rfq?: { id: string; number: string; status: string } | null;
  customer?: { id: string; name: string } | null;
  engineer?: { id: string; name: string } | null;
  documents: Array<{ id: string; title: string; category: string; versions: Array<{ version: number; status: string; sizeBytes: number; thumbnailKey?: string | null }> }>;
};

const FLOW = ["NEW", "UNDER_REVIEW", "CALCULATION", "DRAWING", "CLIENT_APPROVAL", "APPROVED"];

export default function EngineeringDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useSession();
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const request = useApi<Engineering>(`/engineering/${id}`);
  const activity = useApi<{ items: ActivityRow[] }>(`/activity?entityType=engineering&entityId=${id}&limit=30`);

  if (request.isLoading) return <PageSkeleton />;
  if (request.error || !request.data) return <Page><QueryError error={request.error} /></Page>;
  const data = request.data;
  const position = Math.max(0, FLOW.indexOf(data.status));
  const steps: Step[] = FLOW.map((key, index) => ({ key, label: humanize(key), state: data.status === "REJECTED" && index === position ? "blocked" : index < position || data.status === "APPROVED" ? "done" : index === position ? "current" : "upcoming" }));
  const documents: DocumentSummary[] = data.documents.map((doc) => ({ id: doc.id, title: doc.title, category: doc.category, version: doc.versions[0]?.version, status: doc.versions[0]?.status, sizeBytes: doc.versions[0]?.sizeBytes, hasThumbnail: Boolean(doc.versions[0]?.thumbnailKey) }));

  return (
    <Page>
      <DetailHeader
        LinkComponent={Link}
        breadcrumbs={[{ label: "Engineering", href: "/engineering" }, { label: data.number }]}
        title={data.application || data.number}
        code={`${data.number} · Rev ${data.revision}`}
        pills={<StatusPill status={data.status} />}
        meta={[
          ...(data.project ? [{ icon: <Building2 />, label: <Link href={`/projects/${data.project.id}`} className="hover:text-accent">{data.project.name}</Link> }] : data.customer ? [{ icon: <Building2 />, label: data.customer.name }] : []),
          ...(data.rfq ? [{ label: <Link href={`/rfqs/${data.rfq.id}`} className="hover:text-accent">{data.rfq.number}</Link> }] : []),
          { icon: <CalendarDays />, label: <>Due <DueText value={data.dueDate} /></> },
        ]}
        actions={allowed(session, "engineering.edit") ? <Button onClick={() => setEditing(true)}><Pencil /> Update</Button> : null}
      >
        <div className="overflow-x-auto pb-2 pt-2">
          <div className="min-w-[640px]">
            <Stepper steps={steps} current={position} />
          </div>
        </div>
      </DetailHeader>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Design inputs" />
            <CardBody>
              <KeyValueList
                columns={2}
                items={[
                  { label: "Required system", value: data.requiredSystem || "—" },
                  { label: "Load", value: data.load || "—" },
                  { label: "Dimensions", value: data.dimensions || "—" },
                  { label: "Material", value: data.material || "—" },
                  { label: "Installation", value: data.installationCondition || "—" },
                  { label: "Standard", value: data.standard || "—" },
                  { label: "Engineer", value: data.engineer?.name || "Unassigned" },
                  { label: "Raised", value: formatDate(data.createdAt) },
                ]}
              />
              {data.notes ? <p className="mt-4 whitespace-pre-line rounded-md bg-canvas p-3 text-sm text-muted">{data.notes}</p> : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Drawings & calculations" action={allowed(session, "documents.create") ? <Button size="sm" variant="outline" onClick={() => setUploading(true)}><Plus /> Upload</Button> : null} />
            <CardBody>
              {documents.length ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{documents.map((doc) => <DocumentTile key={doc.id} doc={doc} />)}</div>
              ) : (
                <EmptyState icon={<FileText />} title="No files yet" description="Upload calculation sheets and GA drawings for this request." />
              )}
            </CardBody>
          </Card>
        </div>
        <Card>
          <CardHeader title="Activity" />
          <CardBody>
            <ActivityFeed items={toActivity(activity.data?.items)} compact LinkComponent={Link} />
          </CardBody>
        </Card>
      </div>

      <EditEngineering open={editing} onOpenChange={setEditing} data={data} canListUsers={allowed(session, "users.view")} />
      <UploadDocument open={uploading} onOpenChange={setUploading} entityType="engineering" entityId={data.id} defaultCategory="CALCULATION" />
    </Page>
  );
}

function EditEngineering({ open, onOpenChange, data, canListUsers }: { open: boolean; onOpenChange: (open: boolean) => void; data: Engineering; canListUsers: boolean }) {
  const users = useApi<Paged<{ id: string; name: string; kind: string; active: boolean }>>(open && canListUsers ? "/users?pageSize=100" : null);
  const action = useAction(["/engineering", "/activity", "/approvals"]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) if (value !== "") body[key] = value;
    await action.mutateAsync({ path: `/engineering/${data.id}`, method: "PATCH", body });
    onOpenChange(false);
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Update engineering request" description="Moving to Client approval opens an approval request." footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="edit-eng" loading={action.isPending}>Save</Button></>}>
      <form id="edit-eng" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Status">
          <Select name="status" defaultValue={data.status}>{ENGINEERING_STATUSES.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</Select>
        </Field>
        <Field label="Revision"><TextInput name="revision" defaultValue={data.revision} /></Field>
        {canListUsers ? (
          <Field label="Engineer">
            <Select name="engineerId" defaultValue={data.engineer?.id || ""}>
              <option value="">Unassigned</option>
              {(users.data?.items || []).filter((user) => user.kind !== "EXTERNAL" && user.active).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </Select>
          </Field>
        ) : null}
        <Field label="Due date"><TextInput name="dueDate" type="date" defaultValue={data.dueDate?.slice(0, 10) || ""} /></Field>
        <Field label="Load"><TextInput name="load" defaultValue={data.load || ""} /></Field>
        <Field label="Dimensions"><TextInput name="dimensions" defaultValue={data.dimensions || ""} /></Field>
        {action.error ? <ErrorNote className="sm:col-span-2">{action.error.message}</ErrorNote> : null}
      </form>
    </Modal>
  );
}
