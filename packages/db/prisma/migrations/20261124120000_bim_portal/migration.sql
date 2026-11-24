-- BIM portal: folders, document check-out, and sizeBytes as BIGINT so files over 2 GB can be stored.

ALTER TABLE "DocumentVersion" ALTER COLUMN "sizeBytes" SET DATA TYPE BIGINT;

CREATE TABLE "DocumentFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentFolder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentFolder_entityType_entityId_idx" ON "DocumentFolder"("entityType", "entityId");
CREATE INDEX "DocumentFolder_parentId_idx" ON "DocumentFolder"("parentId");

ALTER TABLE "DocumentFolder" ADD CONSTRAINT "DocumentFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DocumentFolder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Document" ADD COLUMN "folderId" TEXT;
ALTER TABLE "Document" ADD COLUMN "checkedOutById" TEXT;
ALTER TABLE "Document" ADD COLUMN "checkedOutAt" TIMESTAMP(3);

CREATE INDEX "Document_folderId_idx" ON "Document"("folderId");
CREATE INDEX "Document_checkedOutById_idx" ON "Document"("checkedOutById");

ALTER TABLE "Document" ADD CONSTRAINT "Document_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "DocumentFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_checkedOutById_fkey" FOREIGN KEY ("checkedOutById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
