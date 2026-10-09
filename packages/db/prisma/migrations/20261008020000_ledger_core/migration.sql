-- AlterTable
ALTER TABLE "InventoryTransaction" ADD COLUMN     "ledgerEntryId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "exchangeRate" DECIMAL(14,6) NOT NULL DEFAULT 1,
ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "VendorBill" ADD COLUMN     "billDate" TIMESTAMP(3),
ADD COLUMN     "expenseAccountId" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "subtotal" DECIMAL(14,2),
ADD COLUMN     "tax" DECIMAL(14,2),
ADD COLUMN     "vendorInvoiceNo" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "accountId" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "exchangeRate" DECIMAL(14,6) NOT NULL DEFAULT 1,
ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "systemKey" TEXT,
    "parentId" TEXT,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "bankAccountId" TEXT,
    "externalRef" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "narration" TEXT NOT NULL,
    "reference" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "postingKey" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "exchangeRate" DECIMAL(14,6) NOT NULL DEFAULT 1,
    "total" DECIMAL(16,2) NOT NULL,
    "reversalOfId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "debit" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "fcAmount" DECIMAL(16,2),
    "description" TEXT,
    "partyType" TEXT,
    "partyId" TEXT,
    "costCenterId" TEXT,
    "branchId" TEXT,
    "projectId" TEXT,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeriodLock" (
    "id" TEXT NOT NULL,
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeriodLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "items" JSONB NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "cgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebitNote" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "vendorBillId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "items" JSONB NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "cgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebitNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningBalance" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "partyType" TEXT,
    "partyId" TEXT,
    "debit" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "asOf" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "dueDate" TIMESTAMP(3),
    "journalEntryId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpeningBalance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_code_key" ON "Account"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Account_systemKey_key" ON "Account"("systemKey");

-- CreateIndex
CREATE UNIQUE INDEX "Account_bankAccountId_key" ON "Account"("bankAccountId");

-- CreateIndex
CREATE INDEX "Account_type_idx" ON "Account"("type");

-- CreateIndex
CREATE INDEX "Account_parentId_idx" ON "Account"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_number_key" ON "JournalEntry"("number");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_postingKey_key" ON "JournalEntry"("postingKey");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversalOfId_key" ON "JournalEntry"("reversalOfId");

-- CreateIndex
CREATE INDEX "JournalEntry_date_idx" ON "JournalEntry"("date");

-- CreateIndex
CREATE INDEX "JournalEntry_sourceType_sourceId_idx" ON "JournalEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "JournalLine_entryId_idx" ON "JournalLine"("entryId");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_date_idx" ON "JournalLine"("accountId", "date");

-- CreateIndex
CREATE INDEX "JournalLine_partyType_partyId_date_idx" ON "JournalLine"("partyType", "partyId", "date");

-- CreateIndex
CREATE INDEX "PeriodLock_createdAt_idx" ON "PeriodLock"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_number_key" ON "CreditNote"("number");

-- CreateIndex
CREATE INDEX "CreditNote_customerId_date_idx" ON "CreditNote"("customerId", "date");

-- CreateIndex
CREATE INDEX "CreditNote_invoiceId_idx" ON "CreditNote"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "DebitNote_number_key" ON "DebitNote"("number");

-- CreateIndex
CREATE INDEX "DebitNote_vendorId_date_idx" ON "DebitNote"("vendorId", "date");

-- CreateIndex
CREATE INDEX "DebitNote_vendorBillId_idx" ON "DebitNote"("vendorBillId");

-- CreateIndex
CREATE INDEX "OpeningBalance_accountId_idx" ON "OpeningBalance"("accountId");

-- CreateIndex
CREATE INDEX "OpeningBalance_journalEntryId_idx" ON "OpeningBalance"("journalEntryId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_ledgerEntryId_idx" ON "InventoryTransaction"("ledgerEntryId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNote" ADD CONSTRAINT "DebitNote_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNote" ADD CONSTRAINT "DebitNote_vendorBillId_fkey" FOREIGN KEY ("vendorBillId") REFERENCES "VendorBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningBalance" ADD CONSTRAINT "OpeningBalance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "charges" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tdsAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;


-- Ledger integrity: amounts are one-sided and non-negative.
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_amounts_check" CHECK ("debit" >= 0 AND "credit" >= 0 AND ("debit" = 0 OR "credit" = 0) AND ("debit" > 0 OR "credit" > 0));
ALTER TABLE "OpeningBalance" ADD CONSTRAINT "OpeningBalance_amounts_check" CHECK ("debit" >= 0 AND "credit" >= 0);

-- Every journal entry must balance when the transaction commits.
CREATE OR REPLACE FUNCTION ledger_check_balance() RETURNS trigger AS $$
DECLARE
  entry TEXT := COALESCE(NEW."entryId", OLD."entryId");
  diff NUMERIC;
  cnt INTEGER;
BEGIN
  SELECT COALESCE(SUM("debit") - SUM("credit"), 0), COUNT(*) INTO diff, cnt FROM "JournalLine" WHERE "entryId" = entry;
  IF cnt < 2 THEN RAISE EXCEPTION 'Journal entry % needs at least two lines', entry; END IF;
  IF ABS(diff) > 0.004 THEN RAISE EXCEPTION 'Journal entry % does not balance (difference %)', entry, diff; END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "JournalLine_balance" AFTER INSERT ON "JournalLine" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_check_balance();

-- Posted journals are immutable; corrections are reversal entries.
CREATE OR REPLACE FUNCTION ledger_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Posted journals cannot be changed or deleted; post a reversal instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "JournalLine_immutable" BEFORE UPDATE OR DELETE ON "JournalLine" FOR EACH ROW EXECUTE FUNCTION ledger_immutable();
CREATE TRIGGER "JournalEntry_immutable" BEFORE UPDATE OR DELETE ON "JournalEntry" FOR EACH ROW EXECUTE FUNCTION ledger_immutable();

-- Number sequences
INSERT INTO "NumberSequence" ("key", "prefix", "next", "pad") VALUES ('JOURNAL', 'JV-', 200, 4), ('CREDIT_NOTE', 'CN-', 200, 4), ('DEBIT_NOTE', 'DN-', 200, 4) ON CONFLICT DO NOTHING;
-- Seed: default chart of accounts
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_1000', '1000', 'Assets', 'ASSET', NULL, NULL, NULL, true, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_1100', '1100', 'Current Assets', 'ASSET', NULL, NULL, (SELECT "id" FROM "Account" WHERE "code" = '1000'), true, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_1110', '1110', 'Cash in Hand', 'ASSET', 'CASH', 'CASH', (SELECT "id" FROM "Account" WHERE "code" = '1100'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_1120', '1120', 'Bank Accounts', 'ASSET', 'BANK', NULL, (SELECT "id" FROM "Account" WHERE "code" = '1100'), true, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_1121', '1121', 'Primary Bank Account', 'ASSET', 'BANK', 'BANK', (SELECT "id" FROM "Account" WHERE "code" = '1120'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_1130', '1130', 'Sundry Debtors', 'ASSET', 'RECEIVABLE', 'AR', (SELECT "id" FROM "Account" WHERE "code" = '1100'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_1140', '1140', 'Inventory', 'ASSET', 'INVENTORY', 'INVENTORY', (SELECT "id" FROM "Account" WHERE "code" = '1100'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_1141', '1141', 'Work in Progress', 'ASSET', 'INVENTORY', 'WIP', (SELECT "id" FROM "Account" WHERE "code" = '1100'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_1150', '1150', 'GST Input Credit', 'ASSET', 'TAX', NULL, (SELECT "id" FROM "Account" WHERE "code" = '1100'), true, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_1151', '1151', 'CGST Input', 'ASSET', 'TAX', 'CGST_IN', (SELECT "id" FROM "Account" WHERE "code" = '1150'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_1152', '1152', 'SGST Input', 'ASSET', 'TAX', 'SGST_IN', (SELECT "id" FROM "Account" WHERE "code" = '1150'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_1153', '1153', 'IGST Input', 'ASSET', 'TAX', 'IGST_IN', (SELECT "id" FROM "Account" WHERE "code" = '1150'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_1160', '1160', 'TDS Receivable', 'ASSET', 'TAX', 'TDS_RECEIVABLE', (SELECT "id" FROM "Account" WHERE "code" = '1100'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_1161', '1161', 'TCS Receivable', 'ASSET', 'TAX', 'TCS_RECEIVABLE', (SELECT "id" FROM "Account" WHERE "code" = '1100'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_1170', '1170', 'Employee Advances', 'ASSET', NULL, 'EMPLOYEE_ADVANCE', (SELECT "id" FROM "Account" WHERE "code" = '1100'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_1171', '1171', 'Advances to Suppliers', 'ASSET', NULL, 'VENDOR_ADVANCE', (SELECT "id" FROM "Account" WHERE "code" = '1100'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_1180', '1180', 'Payment Gateway Clearing', 'ASSET', 'BANK', 'GATEWAY_CLEARING', (SELECT "id" FROM "Account" WHERE "code" = '1100'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_1200', '1200', 'Fixed Assets', 'ASSET', 'FIXED_ASSET', NULL, (SELECT "id" FROM "Account" WHERE "code" = '1000'), true, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_1210', '1210', 'Plant and Machinery', 'ASSET', 'FIXED_ASSET', NULL, (SELECT "id" FROM "Account" WHERE "code" = '1200'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_1220', '1220', 'Furniture and Fixtures', 'ASSET', 'FIXED_ASSET', NULL, (SELECT "id" FROM "Account" WHERE "code" = '1200'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_1230', '1230', 'Computers', 'ASSET', 'FIXED_ASSET', NULL, (SELECT "id" FROM "Account" WHERE "code" = '1200'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_1240', '1240', 'Vehicles', 'ASSET', 'FIXED_ASSET', NULL, (SELECT "id" FROM "Account" WHERE "code" = '1200'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_1290', '1290', 'Accumulated Depreciation', 'ASSET', 'FIXED_ASSET', 'ACCUMULATED_DEPRECIATION', (SELECT "id" FROM "Account" WHERE "code" = '1200'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_2000', '2000', 'Liabilities', 'LIABILITY', NULL, NULL, NULL, true, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_2100', '2100', 'Current Liabilities', 'LIABILITY', NULL, NULL, (SELECT "id" FROM "Account" WHERE "code" = '2000'), true, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_2110', '2110', 'Sundry Creditors', 'LIABILITY', 'PAYABLE', 'AP', (SELECT "id" FROM "Account" WHERE "code" = '2100'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_2120', '2120', 'Goods Received Not Invoiced', 'LIABILITY', NULL, 'GRNI', (SELECT "id" FROM "Account" WHERE "code" = '2100'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_2130', '2130', 'GST Output Liability', 'LIABILITY', 'TAX', NULL, (SELECT "id" FROM "Account" WHERE "code" = '2100'), true, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_2131', '2131', 'CGST Output', 'LIABILITY', 'TAX', 'CGST_OUT', (SELECT "id" FROM "Account" WHERE "code" = '2130'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_2132', '2132', 'SGST Output', 'LIABILITY', 'TAX', 'SGST_OUT', (SELECT "id" FROM "Account" WHERE "code" = '2130'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_2133', '2133', 'IGST Output', 'LIABILITY', 'TAX', 'IGST_OUT', (SELECT "id" FROM "Account" WHERE "code" = '2130'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_2134', '2134', 'GST Payable (Reverse Charge)', 'LIABILITY', 'TAX', 'RCM_PAYABLE', (SELECT "id" FROM "Account" WHERE "code" = '2130'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_2140', '2140', 'TDS Payable', 'LIABILITY', 'TAX', 'TDS_PAYABLE', (SELECT "id" FROM "Account" WHERE "code" = '2100'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_2141', '2141', 'TCS Payable', 'LIABILITY', 'TAX', 'TCS_PAYABLE', (SELECT "id" FROM "Account" WHERE "code" = '2100'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_2150', '2150', 'Salaries Payable', 'LIABILITY', NULL, 'SALARY_PAYABLE', (SELECT "id" FROM "Account" WHERE "code" = '2100'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_2151', '2151', 'PF Payable', 'LIABILITY', 'TAX', 'PF_PAYABLE', (SELECT "id" FROM "Account" WHERE "code" = '2100'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_2152', '2152', 'ESI Payable', 'LIABILITY', 'TAX', 'ESI_PAYABLE', (SELECT "id" FROM "Account" WHERE "code" = '2100'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_2153', '2153', 'Professional Tax Payable', 'LIABILITY', 'TAX', 'PT_PAYABLE', (SELECT "id" FROM "Account" WHERE "code" = '2100'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_2154', '2154', 'Labour Welfare Fund Payable', 'LIABILITY', 'TAX', 'LWF_PAYABLE', (SELECT "id" FROM "Account" WHERE "code" = '2100'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_2155', '2155', 'TDS on Salary Payable', 'LIABILITY', 'TAX', 'TDS_SALARY_PAYABLE', (SELECT "id" FROM "Account" WHERE "code" = '2100'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_2160', '2160', 'Customer Advances', 'LIABILITY', NULL, 'CUSTOMER_ADVANCE', (SELECT "id" FROM "Account" WHERE "code" = '2100'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_2170', '2170', 'Reimbursements Payable', 'LIABILITY', NULL, 'REIMBURSEMENT_PAYABLE', (SELECT "id" FROM "Account" WHERE "code" = '2100'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_2200', '2200', 'Loans', 'LIABILITY', NULL, NULL, (SELECT "id" FROM "Account" WHERE "code" = '2000'), true, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_2210', '2210', 'Secured Loans', 'LIABILITY', NULL, NULL, (SELECT "id" FROM "Account" WHERE "code" = '2200'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_2220', '2220', 'Unsecured Loans', 'LIABILITY', NULL, NULL, (SELECT "id" FROM "Account" WHERE "code" = '2200'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_3000', '3000', 'Equity', 'EQUITY', NULL, NULL, NULL, true, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_3100', '3100', 'Share Capital', 'EQUITY', NULL, NULL, (SELECT "id" FROM "Account" WHERE "code" = '3000'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_3200', '3200', 'Retained Earnings', 'EQUITY', NULL, 'RETAINED_EARNINGS', (SELECT "id" FROM "Account" WHERE "code" = '3000'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_3300', '3300', 'Opening Balance Equity', 'EQUITY', NULL, 'OPENING_EQUITY', (SELECT "id" FROM "Account" WHERE "code" = '3000'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_4000', '4000', 'Income', 'INCOME', NULL, NULL, NULL, true, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_4100', '4100', 'Sales - Domestic', 'INCOME', 'SALES', 'SALES', (SELECT "id" FROM "Account" WHERE "code" = '4000'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_4110', '4110', 'Sales - Export', 'INCOME', 'SALES', 'SALES_EXPORT', (SELECT "id" FROM "Account" WHERE "code" = '4000'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_4120', '4120', 'Sales Returns', 'INCOME', 'SALES', 'SALES_RETURNS', (SELECT "id" FROM "Account" WHERE "code" = '4000'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_4130', '4130', 'Service Income', 'INCOME', 'SALES', 'SERVICE_INCOME', (SELECT "id" FROM "Account" WHERE "code" = '4000'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_4200', '4200', 'Other Income', 'INCOME', NULL, NULL, (SELECT "id" FROM "Account" WHERE "code" = '4000'), true, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_4210', '4210', 'Foreign Exchange Gain/Loss', 'INCOME', NULL, 'FX_GAIN_LOSS', (SELECT "id" FROM "Account" WHERE "code" = '4200'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_4220', '4220', 'Round Off', 'INCOME', NULL, 'ROUND_OFF', (SELECT "id" FROM "Account" WHERE "code" = '4200'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_4230', '4230', 'Interest Income', 'INCOME', NULL, NULL, (SELECT "id" FROM "Account" WHERE "code" = '4200'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_5000', '5000', 'Expenses', 'EXPENSE', NULL, NULL, NULL, true, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_5100', '5100', 'Cost of Goods Sold', 'EXPENSE', 'COGS', 'COGS', (SELECT "id" FROM "Account" WHERE "code" = '5000'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_5110', '5110', 'Purchase Price Variance', 'EXPENSE', 'COGS', 'PPV', (SELECT "id" FROM "Account" WHERE "code" = '5000'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_5120', '5120', 'Purchase Returns', 'EXPENSE', 'COGS', 'PURCHASE_RETURNS', (SELECT "id" FROM "Account" WHERE "code" = '5000'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_5130', '5130', 'Stock Adjustments', 'EXPENSE', 'COGS', 'STOCK_ADJUSTMENT', (SELECT "id" FROM "Account" WHERE "code" = '5000'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_5140', '5140', 'Freight Inward', 'EXPENSE', 'DIRECT_EXPENSE', NULL, (SELECT "id" FROM "Account" WHERE "code" = '5000'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_5200', '5200', 'Employee Costs', 'EXPENSE', NULL, NULL, (SELECT "id" FROM "Account" WHERE "code" = '5000'), true, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_5210', '5210', 'Salaries and Wages', 'EXPENSE', NULL, 'SALARY_EXPENSE', (SELECT "id" FROM "Account" WHERE "code" = '5200'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_5220', '5220', 'Employer PF Contribution', 'EXPENSE', NULL, 'PF_EMPLOYER_EXPENSE', (SELECT "id" FROM "Account" WHERE "code" = '5200'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_5230', '5230', 'Employer ESI Contribution', 'EXPENSE', NULL, 'ESI_EMPLOYER_EXPENSE', (SELECT "id" FROM "Account" WHERE "code" = '5200'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_5240', '5240', 'Employer LWF Contribution', 'EXPENSE', NULL, 'LWF_EMPLOYER_EXPENSE', (SELECT "id" FROM "Account" WHERE "code" = '5200'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_5250', '5250', 'Staff Welfare', 'EXPENSE', NULL, NULL, (SELECT "id" FROM "Account" WHERE "code" = '5200'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_5300', '5300', 'Operating Expenses', 'EXPENSE', NULL, NULL, (SELECT "id" FROM "Account" WHERE "code" = '5000'), true, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_5310', '5310', 'Travel and Conveyance', 'EXPENSE', NULL, 'EXP_TRAVEL', (SELECT "id" FROM "Account" WHERE "code" = '5300'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_5320', '5320', 'Freight Outward', 'EXPENSE', NULL, 'EXP_FREIGHT', (SELECT "id" FROM "Account" WHERE "code" = '5300'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_5330', '5330', 'Rent', 'EXPENSE', NULL, NULL, (SELECT "id" FROM "Account" WHERE "code" = '5300'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_5340', '5340', 'Power and Utilities', 'EXPENSE', NULL, NULL, (SELECT "id" FROM "Account" WHERE "code" = '5300'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_5350', '5350', 'Professional Fees', 'EXPENSE', NULL, NULL, (SELECT "id" FROM "Account" WHERE "code" = '5300'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_5360', '5360', 'Meals and Entertainment', 'EXPENSE', NULL, 'EXP_MEALS', (SELECT "id" FROM "Account" WHERE "code" = '5300'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_5370', '5370', 'Lodging', 'EXPENSE', NULL, 'EXP_LODGING', (SELECT "id" FROM "Account" WHERE "code" = '5300'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_5380', '5380', 'Site Expenses', 'EXPENSE', NULL, 'EXP_SITE', (SELECT "id" FROM "Account" WHERE "code" = '5300'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_5390', '5390', 'General Expenses', 'EXPENSE', NULL, 'EXP_GENERAL', (SELECT "id" FROM "Account" WHERE "code" = '5300'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_5400', '5400', 'Bank Charges', 'EXPENSE', NULL, 'BANK_CHARGES', (SELECT "id" FROM "Account" WHERE "code" = '5000'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_5500', '5500', 'Depreciation', 'EXPENSE', NULL, 'DEPRECIATION', (SELECT "id" FROM "Account" WHERE "code" = '5000'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
INSERT INTO "Account" ("id", "code", "name", "type", "subtype", "systemKey", "parentId", "isGroup", "currency", "active", "createdAt", "updatedAt") VALUES ('acc_5600', '5600', 'Bad Debts', 'EXPENSE', NULL, 'BAD_DEBTS', (SELECT "id" FROM "Account" WHERE "code" = '5000'), false, 'INR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

-- Seed: permissions for accounting, banking, payroll
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_accounting_view', 'accounting.view', 'accounting', 'view') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_accounting_create', 'accounting.create', 'accounting', 'create') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_accounting_edit', 'accounting.edit', 'accounting', 'edit') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_accounting_delete', 'accounting.delete', 'accounting', 'delete') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_accounting_approve', 'accounting.approve', 'accounting', 'approve') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_accounting_export', 'accounting.export', 'accounting', 'export') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_accounting_download', 'accounting.download', 'accounting', 'download') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_accounting_share', 'accounting.share', 'accounting', 'share') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_accounting_assign', 'accounting.assign', 'accounting', 'assign') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_accounting_override', 'accounting.override', 'accounting', 'override') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_banking_view', 'banking.view', 'banking', 'view') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_banking_create', 'banking.create', 'banking', 'create') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_banking_edit', 'banking.edit', 'banking', 'edit') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_banking_delete', 'banking.delete', 'banking', 'delete') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_banking_approve', 'banking.approve', 'banking', 'approve') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_banking_export', 'banking.export', 'banking', 'export') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_banking_download', 'banking.download', 'banking', 'download') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_banking_share', 'banking.share', 'banking', 'share') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_banking_assign', 'banking.assign', 'banking', 'assign') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_banking_override', 'banking.override', 'banking', 'override') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_payroll_view', 'payroll.view', 'payroll', 'view') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_payroll_create', 'payroll.create', 'payroll', 'create') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_payroll_edit', 'payroll.edit', 'payroll', 'edit') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_payroll_delete', 'payroll.delete', 'payroll', 'delete') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_payroll_approve', 'payroll.approve', 'payroll', 'approve') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_payroll_export', 'payroll.export', 'payroll', 'export') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_payroll_download', 'payroll.download', 'payroll', 'download') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_payroll_share', 'payroll.share', 'payroll', 'share') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_payroll_assign', 'payroll.assign', 'payroll', 'assign') ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("id", "key", "resource", "action") VALUES ('perm_payroll_override', 'payroll.override', 'payroll', 'override') ON CONFLICT DO NOTHING;

-- Seed: role grants from the presets
INSERT INTO "RolePermission" ("roleId", "permissionId") SELECT r."id", p."id" FROM "Role" r JOIN "Permission" p ON p."key" IN ('accounting.view', 'accounting.create', 'accounting.edit', 'accounting.delete', 'accounting.approve', 'accounting.export', 'accounting.download', 'accounting.share', 'accounting.assign', 'accounting.override', 'banking.view', 'banking.create', 'banking.edit', 'banking.delete', 'banking.approve', 'banking.export', 'banking.download', 'banking.share', 'banking.assign', 'banking.override', 'payroll.view', 'payroll.create', 'payroll.edit', 'payroll.delete', 'payroll.approve', 'payroll.export', 'payroll.download', 'payroll.share', 'payroll.assign', 'payroll.override') WHERE r."key" = 'super_admin' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId") SELECT r."id", p."id" FROM "Role" r JOIN "Permission" p ON p."key" IN ('accounting.view', 'accounting.create', 'accounting.edit', 'accounting.delete', 'accounting.approve', 'accounting.export', 'accounting.download', 'accounting.share', 'accounting.assign', 'accounting.override', 'banking.view', 'banking.create', 'banking.edit', 'banking.delete', 'banking.approve', 'banking.export', 'banking.download', 'banking.share', 'banking.assign', 'banking.override', 'payroll.view', 'payroll.create', 'payroll.edit', 'payroll.delete', 'payroll.approve', 'payroll.export', 'payroll.download', 'payroll.share', 'payroll.assign', 'payroll.override') WHERE r."key" = 'managing_director' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId") SELECT r."id", p."id" FROM "Role" r JOIN "Permission" p ON p."key" IN ('accounting.view', 'accounting.create', 'accounting.edit', 'accounting.delete', 'accounting.approve', 'accounting.export', 'accounting.download', 'accounting.share', 'accounting.assign', 'accounting.override', 'banking.view', 'banking.create', 'banking.edit', 'banking.delete', 'banking.approve', 'banking.export', 'banking.download', 'banking.share', 'banking.assign', 'banking.override', 'payroll.view', 'payroll.create', 'payroll.edit', 'payroll.delete', 'payroll.approve', 'payroll.export', 'payroll.download', 'payroll.share', 'payroll.assign', 'payroll.override') WHERE r."key" = 'ceo' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId") SELECT r."id", p."id" FROM "Role" r JOIN "Permission" p ON p."key" IN ('accounting.view', 'accounting.create', 'accounting.edit', 'accounting.approve', 'accounting.export', 'accounting.override', 'banking.view', 'banking.create', 'banking.edit', 'banking.approve', 'banking.export', 'payroll.view', 'payroll.approve', 'payroll.export', 'organization.view', 'customers.view', 'customers.approve', 'customers.override', 'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.approve', 'invoices.export', 'payments.view', 'payments.create', 'payments.approve', 'payments.export', 'expenses.view', 'expenses.approve', 'expenses.export', 'reports.view', 'reports.export', 'hr.view', 'hr.view_salary', 'purchases.view', 'purchases.approve', 'audit.view', 'notifications.view', 'documents.view', 'documents.download', 'approvals.view', 'approvals.approve', 'vendors.view') WHERE r."key" = 'finance_head' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId") SELECT r."id", p."id" FROM "Role" r JOIN "Permission" p ON p."key" IN ('payroll.view', 'payroll.create', 'payroll.edit', 'payroll.export', 'hr.view', 'hr.create', 'hr.edit', 'hr.approve', 'hr.view_salary', 'users.view', 'expenses.view', 'documents.view', 'documents.create', 'notifications.view') WHERE r."key" = 'hr' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId") SELECT r."id", p."id" FROM "Role" r JOIN "Permission" p ON p."key" IN ('accounting.view', 'accounting.create', 'accounting.edit', 'accounting.export', 'banking.view', 'banking.create', 'banking.edit', 'banking.export', 'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.export', 'payments.view', 'payments.create', 'expenses.view', 'expenses.edit', 'customers.view', 'vendors.view', 'reports.view', 'notifications.view') WHERE r."key" = 'accounts' ON CONFLICT DO NOTHING;