"use client";

import { Button, Page, PageHeader } from "@fixotec/ui";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { IfcViewer } from "../../../../../components/ifc-viewer";

function ViewerBody() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const version = search.get("version") || undefined;
  return (
    <Page>
      <PageHeader
        title="IFC 3D preview"
        description="Native Revit files cannot be shown in the browser. This viewer reads an IFC export of the model."
        actions={<Button variant="outline" onClick={() => router.push(`/files/${params.id}`)}>Back to file</Button>}
      />
      <IfcViewer documentId={params.id} version={version} />
    </Page>
  );
}

export default function ViewerPage() {
  return (
    <Suspense>
      <ViewerBody />
    </Suspense>
  );
}
