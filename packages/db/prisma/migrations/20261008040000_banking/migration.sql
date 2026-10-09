-- CreateTable
CREATE TABLE "BankStatement" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "bank" TEXT,
    "fromDate" DATE,
    "toDate" DATE,
    "openingBalance" DECIMAL(16,2),
    "closingBalance" DECIMAL(16,2),
    "lineCount" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "warnings" TEXT[],
    "importedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "statementId" TEXT,
    "date" DATE NOT NULL,
    "valueDate" DATE,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "utr" TEXT,
    "debit" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(16,2),
    "hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "suggestion" JSONB,
    "ruleId" TEXT,
    "matchedById" TEXT,
    "matchedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankMatch" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "paymentId" TEXT,
    "journalEntryId" TEXT,
    "amount" DECIMAL(16,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contains" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'ANY',
    "bankAccountId" TEXT,
    "counterAccountId" TEXT NOT NULL,
    "minAmount" DECIMAL(16,2),
    "maxAmount" DECIMAL(16,2),
    "narration" TEXT,
    "autoPost" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRun" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'VENDOR',
    "accountId" TEXT NOT NULL,
    "bankFormat" TEXT NOT NULL DEFAULT 'GENERIC',
    "valueDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "total" DECIMAL(16,2) NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "exportedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRunItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "vendorId" TEXT,
    "vendorBillId" TEXT,
    "employeeId" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "payeeName" TEXT NOT NULL,
    "accountNo" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "email" TEXT,
    "amount" DECIMAL(16,2) NOT NULL,
    "tdsAmount" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "mode" TEXT,
    "reference" TEXT NOT NULL,
    "paymentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,

    CONSTRAINT "PaymentRunItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentLink" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'RAZORPAY',
    "providerId" TEXT NOT NULL,
    "shortUrl" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "providerPaymentId" TEXT,
    "fee" DECIMAL(14,2),
    "paymentId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankStatement_accountId_createdAt_idx" ON "BankStatement"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_hash_key" ON "BankTransaction"("hash");

-- CreateIndex
CREATE INDEX "BankTransaction_accountId_date_idx" ON "BankTransaction"("accountId", "date");

-- CreateIndex
CREATE INDEX "BankTransaction_accountId_status_idx" ON "BankTransaction"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BankMatch_paymentId_key" ON "BankMatch"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "BankMatch_journalEntryId_key" ON "BankMatch"("journalEntryId");

-- CreateIndex
CREATE INDEX "BankMatch_transactionId_idx" ON "BankMatch"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRun_number_key" ON "PaymentRun"("number");

-- CreateIndex
CREATE INDEX "PaymentRun_status_idx" ON "PaymentRun"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRunItem_paymentId_key" ON "PaymentRunItem"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentRunItem_runId_idx" ON "PaymentRunItem"("runId");

-- CreateIndex
CREATE INDEX "PaymentRunItem_sourceType_sourceId_idx" ON "PaymentRunItem"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLink_providerId_key" ON "PaymentLink"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLink_providerPaymentId_key" ON "PaymentLink"("providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLink_paymentId_key" ON "PaymentLink"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentLink_invoiceId_idx" ON "PaymentLink"("invoiceId");

-- AddForeignKey
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "BankStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMatch" ADD CONSTRAINT "BankMatch_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMatch" ADD CONSTRAINT "BankMatch_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMatch" ADD CONSTRAINT "BankMatch_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankRule" ADD CONSTRAINT "BankRule_counterAccountId_fkey" FOREIGN KEY ("counterAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRun" ADD CONSTRAINT "PaymentRun_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRunItem" ADD CONSTRAINT "PaymentRunItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PaymentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRunItem" ADD CONSTRAINT "PaymentRunItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRunItem" ADD CONSTRAINT "PaymentRunItem_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Number sequence for payment runs
INSERT INTO "NumberSequence" ("key", "prefix", "next", "pad") VALUES ('PAYMENT_RUN', 'PR-', 1, 4) ON CONFLICT DO NOTHING;

-- Starter bank rules (edit or disable under Banking → Rules)
INSERT INTO "BankRule" ("id", "name", "contains", "direction", "counterAccountId", "autoPost", "priority")
SELECT v.id, v.name, v.contains, v.direction, a."id", v.auto, v.priority
FROM (VALUES
  ('rule_gateway', 'Payment gateway settlement', 'RAZORPAY|RZP|PAYU|CASHFREE|CCAVENUE', 'IN', 'GATEWAY_CLEARING', true, 10),
  ('rule_charges', 'Bank charges', 'CHGS|CHARGES|SMS CHG|GST ON CHG|CHRG|COMMISSION', 'OUT', 'BANK_CHARGES', true, 20),
  ('rule_interest', 'Interest credited', 'INT.PD|INT PD|INTEREST CREDIT|INT CR|INT.COLL|SB INT', 'IN', NULL, false, 30)
) AS v(id, name, contains, direction, key, auto, priority)
JOIN "Account" a ON (v.key IS NOT NULL AND a."systemKey" = v.key) OR (v.key IS NULL AND a."code" = '4230')
ON CONFLICT DO NOTHING;