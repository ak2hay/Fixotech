-- Integrity hardening: order lines trace back to quote lines, one invoice per dispatch, evidence tables
-- no longer cascade-delete, missing relations and indexes on hot foreign keys, soft delete for documents.

-- Pre-flight: fail loudly instead of silently dropping data when the new unique constraints cannot hold.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Invoice" WHERE "dispatchId" IS NOT NULL GROUP BY "dispatchId" HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate invoices exist for one dispatch; cancel/merge them before applying this migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "Bom" GROUP BY "variantId", "revision" HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate BOM revisions exist for one variant; renumber them before applying this migration';
  END IF;
END $$;

-- Orphaned references would block the new foreign keys.
UPDATE "InventoryTransaction" SET "actorId" = NULL WHERE "actorId" IS NOT NULL AND "actorId" NOT IN (SELECT "id" FROM "User");
UPDATE "ProductionOrder" SET "warehouseId" = NULL WHERE "warehouseId" IS NOT NULL AND "warehouseId" NOT IN (SELECT "id" FROM "Warehouse");
UPDATE "Payment" SET "vendorId" = NULL WHERE "vendorId" IS NOT NULL AND "vendorId" NOT IN (SELECT "id" FROM "Vendor");

-- Share tokens are now stored as SHA-256 hashes; links issued before this release used plaintext tokens.
ALTER TABLE "DocumentShare" ADD COLUMN "revokedAt" TIMESTAMP(3);
UPDATE "DocumentShare" SET "revokedAt" = CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Quotation" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "createdById" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN "createdById" TEXT;
ALTER TABLE "SalesOrderItem" ADD COLUMN "quotationItemId" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "createdById" TEXT;
ALTER TABLE "GoodsReceipt" ADD COLUMN "createdById" TEXT;
ALTER TABLE "DispatchNote" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Payment" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Post" ALTER COLUMN "published" SET DEFAULT false;

-- Evidence tables: deleting a parent must not silently erase history.
ALTER TABLE "DocumentVersion" DROP CONSTRAINT "DocumentVersion_documentId_fkey";
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeadActivity" DROP CONSTRAINT "LeadActivity_leadId_fkey";
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesOrderItem" DROP CONSTRAINT "SalesOrderItem_salesOrderId_fkey";
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GoodsReceiptItem" DROP CONSTRAINT "GoodsReceiptItem_goodsReceiptId_fkey";
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WarehouseBin" DROP CONSTRAINT "WarehouseBin_warehouseId_fkey";
ALTER TABLE "WarehouseBin" ADD CONSTRAINT "WarehouseBin_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobCard" DROP CONSTRAINT "JobCard_productionOrderId_fkey";
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DispatchItem" DROP CONSTRAINT "DispatchItem_dispatchId_fkey";
ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "DispatchNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SiteVisit" DROP CONSTRAINT "SiteVisit_projectId_fkey";
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SiteReport" DROP CONSTRAINT "SiteReport_projectId_fkey";
ALTER TABLE "SiteReport" ADD CONSTRAINT "SiteReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SiteIssue" DROP CONSTRAINT "SiteIssue_projectId_fkey";
ALTER TABLE "SiteIssue" ADD CONSTRAINT "SiteIssue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialConsumption" DROP CONSTRAINT "MaterialConsumption_projectId_fkey";
ALTER TABLE "MaterialConsumption" ADD CONSTRAINT "MaterialConsumption_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TicketComment" DROP CONSTRAINT "TicketComment_ticketId_fkey";
ALTER TABLE "TicketComment" ADD CONSTRAINT "TicketComment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ServiceTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceItem" DROP CONSTRAINT "InvoiceItem_invoiceId_fkey";
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- New relations for previously orphaned foreign-key columns.
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_quotationItemId_fkey" FOREIGN KEY ("quotationItemId") REFERENCES "QuotationItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_binId_fkey" FOREIGN KEY ("binId") REFERENCES "WarehouseBin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Uniques
CREATE UNIQUE INDEX "Invoice_dispatchId_key" ON "Invoice"("dispatchId");
CREATE UNIQUE INDEX "Bom_variantId_revision_key" ON "Bom"("variantId", "revision");
CREATE UNIQUE INDEX "BatchLot_vendorId_variantId_supplierBatch_key" ON "BatchLot"("vendorId", "variantId", "supplierBatch");

-- Indexes
CREATE INDEX "User_customerId_idx" ON "User"("customerId");
CREATE INDEX "DocumentShare_documentId_idx" ON "DocumentShare"("documentId");
CREATE INDEX "Lead_ownerId_idx" ON "Lead"("ownerId");
CREATE INDEX "Lead_customerId_idx" ON "Lead"("customerId");
CREATE INDEX "LeadActivity_leadId_idx" ON "LeadActivity"("leadId");
CREATE INDEX "Project_customerId_idx" ON "Project"("customerId");
CREATE INDEX "Project_developerId_idx" ON "Project"("developerId");
CREATE INDEX "Project_consultantId_idx" ON "Project"("consultantId");
CREATE INDEX "Project_pmcId_idx" ON "Project"("pmcId");
CREATE INDEX "Project_contractorId_idx" ON "Project"("contractorId");
CREATE INDEX "Project_mepContractorId_idx" ON "Project"("mepContractorId");
CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");
CREATE INDEX "Rfq_customerId_idx" ON "Rfq"("customerId");
CREATE INDEX "Rfq_projectId_idx" ON "Rfq"("projectId");
CREATE INDEX "Rfq_assigneeId_status_idx" ON "Rfq"("assigneeId", "status");
CREATE INDEX "RfqItem_rfqId_idx" ON "RfqItem"("rfqId");
CREATE INDEX "Quotation_customerId_status_idx" ON "Quotation"("customerId", "status");
CREATE INDEX "Quotation_projectId_idx" ON "Quotation"("projectId");
CREATE INDEX "Quotation_rfqId_idx" ON "Quotation"("rfqId");
CREATE INDEX "QuotationItem_quotationId_idx" ON "QuotationItem"("quotationId");
CREATE INDEX "SalesOrder_customerId_status_idx" ON "SalesOrder"("customerId", "status");
CREATE INDEX "SalesOrder_projectId_idx" ON "SalesOrder"("projectId");
CREATE INDEX "SalesOrder_quotationId_idx" ON "SalesOrder"("quotationId");
CREATE INDEX "SalesOrder_status_idx" ON "SalesOrder"("status");
CREATE INDEX "SalesOrderItem_salesOrderId_idx" ON "SalesOrderItem"("salesOrderId");
CREATE INDEX "SalesOrderItem_variantId_idx" ON "SalesOrderItem"("variantId");
CREATE INDEX "SalesOrderItem_quotationItemId_idx" ON "SalesOrderItem"("quotationItemId");
CREATE INDEX "Boq_projectId_idx" ON "Boq"("projectId");
CREATE INDEX "BoqItem_boqId_idx" ON "BoqItem"("boqId");
CREATE INDEX "EngineeringRequest_projectId_idx" ON "EngineeringRequest"("projectId");
CREATE INDEX "EngineeringRequest_customerId_idx" ON "EngineeringRequest"("customerId");
CREATE INDEX "Submittal_projectId_idx" ON "Submittal"("projectId");
CREATE INDEX "PurchaseRequisition_status_idx" ON "PurchaseRequisition"("status");
CREATE INDEX "PurchaseRequisition_sourceType_sourceId_idx" ON "PurchaseRequisition"("sourceType", "sourceId");
CREATE INDEX "PurchaseOrder_vendorId_status_idx" ON "PurchaseOrder"("vendorId", "status");
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");
CREATE INDEX "GoodsReceipt_purchaseOrderId_status_idx" ON "GoodsReceipt"("purchaseOrderId", "status");
CREATE INDEX "BatchLot_variantId_idx" ON "BatchLot"("variantId");
CREATE INDEX "InventoryTransaction_warehouseId_createdAt_idx" ON "InventoryTransaction"("warehouseId", "createdAt");
CREATE INDEX "ProductionOrder_salesOrderId_idx" ON "ProductionOrder"("salesOrderId");
CREATE INDEX "ProductionOrder_status_idx" ON "ProductionOrder"("status");
CREATE INDEX "ProductionOrder_variantId_idx" ON "ProductionOrder"("variantId");
CREATE INDEX "JobCard_productionOrderId_idx" ON "JobCard"("productionOrderId");
CREATE INDEX "JobCard_status_idx" ON "JobCard"("status");
CREATE INDEX "QualityInspection_status_idx" ON "QualityInspection"("status");
CREATE INDEX "QualityInspection_goodsReceiptId_idx" ON "QualityInspection"("goodsReceiptId");
CREATE INDEX "QualityInspection_productionOrderId_idx" ON "QualityInspection"("productionOrderId");
CREATE INDEX "Ncr_status_idx" ON "Ncr"("status");
CREATE INDEX "DispatchNote_salesOrderId_status_idx" ON "DispatchNote"("salesOrderId", "status");
CREATE INDEX "DispatchNote_status_idx" ON "DispatchNote"("status");
CREATE INDEX "DispatchItem_dispatchId_idx" ON "DispatchItem"("dispatchId");
CREATE INDEX "DispatchItem_salesOrderItemId_idx" ON "DispatchItem"("salesOrderItemId");
CREATE INDEX "SiteVisit_projectId_idx" ON "SiteVisit"("projectId");
CREATE INDEX "SiteVisit_userId_checkOutAt_idx" ON "SiteVisit"("userId", "checkOutAt");
CREATE INDEX "SiteReport_projectId_createdAt_idx" ON "SiteReport"("projectId", "createdAt");
CREATE INDEX "SiteIssue_projectId_status_idx" ON "SiteIssue"("projectId", "status");
CREATE INDEX "SiteIssue_assigneeId_idx" ON "SiteIssue"("assigneeId");
CREATE INDEX "MaterialConsumption_projectId_idx" ON "MaterialConsumption"("projectId");
CREATE INDEX "ServiceTicket_customerId_status_idx" ON "ServiceTicket"("customerId", "status");
CREATE INDEX "ServiceTicket_projectId_idx" ON "ServiceTicket"("projectId");
CREATE INDEX "ServiceTicket_assigneeId_status_idx" ON "ServiceTicket"("assigneeId", "status");
CREATE INDEX "TicketComment_ticketId_idx" ON "TicketComment"("ticketId");
CREATE INDEX "Invoice_customerId_status_idx" ON "Invoice"("customerId", "status");
CREATE INDEX "Invoice_salesOrderId_idx" ON "Invoice"("salesOrderId");
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");
CREATE INDEX "VendorBill_vendorId_status_idx" ON "VendorBill"("vendorId", "status");
CREATE INDEX "Payment_customerId_paidAt_idx" ON "Payment"("customerId", "paidAt");
CREATE INDEX "Payment_vendorId_idx" ON "Payment"("vendorId");
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");
CREATE INDEX "Payment_vendorBillId_idx" ON "Payment"("vendorBillId");
CREATE INDEX "Expense_employeeId_status_idx" ON "Expense"("employeeId", "status");
