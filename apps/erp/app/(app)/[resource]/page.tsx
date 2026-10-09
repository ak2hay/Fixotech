"use client";

import { useParams } from "next/navigation";
import { ResourceListPage } from "../../../components/resource";

export default function ResourcePage() {
  const { resource } = useParams<{ resource: string }>();
  return <ResourceListPage key={resource} resourceKey={resource} />;
}
