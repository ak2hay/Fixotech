"use client";

import { useParams } from "next/navigation";
import { ResourceDetailPage } from "../../../../components/resource";

export default function ResourceRecordPage() {
  const { resource, id } = useParams<{ resource: string; id: string }>();
  return <ResourceDetailPage key={`${resource}/${id}`} resourceKey={resource} id={id} />;
}
