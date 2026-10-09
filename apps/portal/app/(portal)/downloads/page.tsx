"use client";

import { ListPage } from "../../../components/common";
import { FileLibrary } from "../../../components/file-library";

export default function DownloadsPage() {
  return (
    <ListPage title="Technical downloads" description="CAD blocks, BIM families, drawings and datasheets. Click a file to download it.">
      <FileLibrary withDatasheets />
    </ListPage>
  );
}
