-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "lowerDeductionRate" DECIMAL(5,2),
ADD COLUMN     "pan" TEXT,
ADD COLUMN     "tdsSection" TEXT;

-- AlterTable
ALTER TABLE "DispatchNote" ADD COLUMN     "distanceKm" INTEGER,
ADD COLUMN     "ewbDate" TIMESTAMP(3),
ADD COLUMN     "ewbError" TEXT,
ADD COLUMN     "ewbStatus" TEXT,
ADD COLUMN     "ewbValidUntil" TIMESTAMP(3),
ADD COLUMN     "transporterGstin" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "ackDate" TIMESTAMP(3),
ADD COLUMN     "ackNo" TEXT,
ADD COLUMN     "cgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "einvoiceError" TEXT,
ADD COLUMN     "einvoiceStatus" TEXT,
ADD COLUMN     "igst" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "irn" TEXT,
ADD COLUMN     "irnCancelledAt" TIMESTAMP(3),
ADD COLUMN     "placeOfSupply" TEXT,
ADD COLUMN     "reverseCharge" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "signedQr" TEXT,
ADD COLUMN     "supplyType" TEXT NOT NULL DEFAULT 'B2B',
ADD COLUMN     "tcsAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "cgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "hsn" TEXT,
ADD COLUMN     "igst" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "sgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "uqc" TEXT;

-- AlterTable
ALTER TABLE "VendorBill" ADD COLUMN     "cgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "igst" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "itcEligible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "itcStatus" TEXT,
ADD COLUMN     "reverseCharge" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sgst" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "tdsSection" TEXT;

-- AlterTable
ALTER TABLE "CreditNote" ADD COLUMN     "ackDate" TIMESTAMP(3),
ADD COLUMN     "ackNo" TEXT,
ADD COLUMN     "einvoiceError" TEXT,
ADD COLUMN     "einvoiceStatus" TEXT,
ADD COLUMN     "irn" TEXT,
ADD COLUMN     "irnCancelledAt" TIMESTAMP(3),
ADD COLUMN     "placeOfSupply" TEXT,
ADD COLUMN     "signedQr" TEXT,
ADD COLUMN     "supplyType" TEXT NOT NULL DEFAULT 'B2B';

-- CreateTable
CREATE TABLE "Gstr2bEntry" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "supplierGstin" TEXT NOT NULL,
    "supplierName" TEXT,
    "docType" TEXT NOT NULL DEFAULT 'INV',
    "invoiceNo" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "invoiceValue" DECIMAL(14,2) NOT NULL,
    "placeOfSupply" TEXT,
    "reverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "taxable" DECIMAL(14,2) NOT NULL,
    "igst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cess" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "itcAvailable" BOOLEAN NOT NULL DEFAULT true,
    "itcReason" TEXT,
    "matchStatus" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "differences" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "vendorBillId" TEXT,
    "action" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gstr2bEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GstFiling" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "returnType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FILED',
    "arn" TEXT,
    "filedOn" TIMESTAMP(3) NOT NULL,
    "summary" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GstFiling_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Gstr2bEntry_period_matchStatus_idx" ON "Gstr2bEntry"("period", "matchStatus");

-- CreateIndex
CREATE INDEX "Gstr2bEntry_vendorBillId_idx" ON "Gstr2bEntry"("vendorBillId");

-- CreateIndex
CREATE UNIQUE INDEX "Gstr2bEntry_period_supplierGstin_docType_invoiceNo_key" ON "Gstr2bEntry"("period", "supplierGstin", "docType", "invoiceNo");

-- CreateIndex
CREATE UNIQUE INDEX "GstFiling_period_returnType_key" ON "GstFiling"("period", "returnType");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_irn_key" ON "Invoice"("irn");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_irn_key" ON "CreditNote"("irn");

