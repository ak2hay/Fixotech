"use client";

import { ListPage } from "../../../components/common";
import { FileLibrary } from "../../../components/file-library";

export default function CadPage() {
  return (
    <ListPage title="CAD / BIM library" description="Native CAD and BIM files for Fixotec products and your projects.">
      <FileLibrary />
    </ListPage>
  );
}
