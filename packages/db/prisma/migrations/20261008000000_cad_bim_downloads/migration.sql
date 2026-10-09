-- P0: CAD/BIM downloads. Download analytics per document across ERP, portal, website, share links and zip bundles.

-- CreateTable
CREATE TABLE "DocumentDownload" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "userId" TEXT,
    "leadId" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentDownload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentDownload_documentId_createdAt_idx" ON "DocumentDownload"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentDownload_leadId_idx" ON "DocumentDownload"("leadId");

-- CreateIndex
CREATE INDEX "DocumentDownload_createdAt_idx" ON "DocumentDownload"("createdAt");

-- AddForeignKey
ALTER TABLE "DocumentDownload" ADD CONSTRAINT "DocumentDownload_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

