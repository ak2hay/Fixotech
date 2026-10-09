"use client";

import { ActivityFeed, Card, CardBody, CardHeader, DetailHeader, EmptyState, KeyValueList, Page, StatusPill, Stepper, formatDate, type Step } from "@fixotec/ui";
import { CalendarDays, FileText, FolderKanban, UserRound } from "lucide-react";
import { useParams } from "next/navigation";
import { DocumentTile, PageSkeleton, QueryError, toActivity, type ActivityRow, type DocumentSummary } from "../../../../components/common";
import { Link } from "../../../../components/link";
import { useApi } from "../../../../lib/query";

type Request = {
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
  notes?: string | null;
  dueDate?: string | null;
  createdAt: string;
  project?: { id: string; name: string; code: string } | null;
  engineer?: { name: string } | null;
  documents: Array<{ id: string; title: string; category: string; updatedAt: string; versions: Array<{ version: number; sizeBytes?: number; status?: string; thumbnailKey?: string | null }> }>;
};

const FLOW = [
  { key: "NEW", label: "Received" },
  { key: "UNDER_REVIEW", label: "Review" },
  { key: "CALCULATION", label: "Calculation" },
  { key: "DRAWING", label: "Drawing" },
  { key: "CLIENT_APPROVAL", label: "Your approval" },
  { key: "APPROVED", label: "Approved" },
];

export default function PortalEngineeringPage() {
  const { id } = useParams<{ id: string }>();
  const request = useApi<Request>(`/engineering/${id}`);
  const activity = useApi<{ items: ActivityRow[] }>(`/activity?entityType=engineering&entityId=${id}&limit=30`);

  if (request.isLoading) return <PageSkeleton />;
  if (request.error || !request.data) return <Page><QueryError error={request.error} /></Page>;
  const data = request.data;
  const index = FLOW.findIndex((item) => item.key === data.status);
  const rejected = data.status === "REJECTED";
  const position = rejected ? FLOW.length - 1 : Math.max(0, index);
  const steps: Step[] = FLOW.map((item, step) => ({ key: item.key, label: rejected && step === position ? "Rejected" : item.label, state: rejected && step === position ? "blocked" : step < position || (step === position && data.status === "APPROVED") ? "done" : step === position ? "current" : "upcoming" }));
  const files: DocumentSummary[] = data.documents.map((doc) => ({ id: doc.id, title: doc.title, category: doc.category, updatedAt: doc.updatedAt, version: doc.versions[0]?.version, status: doc.versions[0]?.status, sizeBytes: doc.versions[0]?.sizeBytes, hasThumbnail: Boolean(doc.versions[0]?.thumbnailKey) }));

  return (
    <Page>
      <DetailHeader
        LinkComponent={Link}
        breadcrumbs={[{ label: "Engineering", href: "/engineering" }, { label: data.number }]}
        title={data.application || "Engineering request"}
        code={data.number}
        pills={<StatusPill status={data.status} />}
        meta={[
          ...(data.project ? [{ icon: <FolderKanban />, label: <Link href={`/projects/${data.project.id}`} className="hover:text-accent">{data.project.name}</Link> }] : []),
          { icon: <UserRound />, label: data.engineer ? `Engineer ${data.engineer.name}` : "Awaiting engineer" },
          { icon: <CalendarDays />, label: `Due ${formatDate(data.dueDate) || "—"}` },
        ]}
      >
        <div className="overflow-x-auto pb-4 pt-2">
          <div className="min-w-[560px]">
            <Stepper steps={steps} current={position} />
          </div>
        </div>
      </DetailHeader>

      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        <Card>
          <CardHeader title="Design inputs" />
          <CardBody>
            <KeyValueList
              items={[
                { label: "Required system", value: data.requiredSystem || "—" },
                { label: "Load", value: data.load || "—" },
                { label: "Dimensions", value: data.dimensions || "—" },
                { label: "Material", value: data.material || "—" },
                { label: "Standard", value: data.standard || "—" },
                { label: "Installation", value: data.installationCondition || "—" },
                { label: "Notes", value: data.notes || "—" },
              ]}
            />
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Drawings and calculations" />
            <CardBody>
              {files.length ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {files.map((doc) => (
                    <DocumentTile key={doc.id} doc={doc} />
                  ))}
                </div>
              ) : (
                <EmptyState icon={<FileText />} title="Nothing issued yet" description="Drawings appear here when the engineer shares them." />
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Activity" />
            <CardBody>
              <ActivityFeed items={toActivity(activity.data?.items)} LinkComponent={Link} />
            </CardBody>
          </Card>
        </div>
      </div>
    </Page>
  );
}
