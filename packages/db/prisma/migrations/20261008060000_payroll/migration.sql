-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "payslipId" TEXT;

-- CreateTable
CREATE TABLE "SalaryStructure" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "employerInCtc" BOOLEAN NOT NULL DEFAULT true,
    "components" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeSalary" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "structureId" TEXT NOT NULL,
    "annualCtc" DECIMAL(14,2) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "overrides" JSONB,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeSalary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatutoryConfig" (
    "id" TEXT NOT NULL,
    "fy" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatutoryConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxDeclaration" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fy" TEXT NOT NULL,
    "regime" TEXT NOT NULL DEFAULT 'NEW',
    "items" JSONB NOT NULL,
    "verified" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'REGULAR',
    "period" TEXT NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "options" JSONB,
    "totals" JSONB,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "paymentRunId" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "structureId" TEXT,
    "monthlyCtc" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "monthDays" INTEGER NOT NULL,
    "paidDays" DECIMAL(5,1) NOT NULL,
    "lopDays" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "overtimeHours" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "gross" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxable" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "reimbursements" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "employerCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pfWages" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "epsWages" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "edliWages" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pfEmployee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pfEmployer" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "eps" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pfAdmin" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "edli" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "esiWages" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "esiEmployee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "esiEmployer" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pt" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lwfEmployee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lwfEmployer" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tds" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tdsOverride" DECIMAL(14,2),
    "basicEarned" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "hraEarned" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "regime" TEXT NOT NULL DEFAULT 'NEW',
    "state" TEXT,
    "earnings" JSONB NOT NULL,
    "deductions" JSONB NOT NULL,
    "adjustments" JSONB,
    "projection" JSONB,
    "warnings" JSONB,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatutoryPayment" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "state" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidOn" DATE NOT NULL,
    "accountId" TEXT NOT NULL,
    "reference" TEXT,
    "bsrCode" TEXT,
    "challanSerial" TEXT,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatutoryPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalaryStructure_name_key" ON "SalaryStructure"("name");

-- CreateIndex
CREATE INDEX "EmployeeSalary_employeeId_effectiveFrom_idx" ON "EmployeeSalary"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "StatutoryConfig_fy_key" ON "StatutoryConfig"("fy");

-- CreateIndex
CREATE UNIQUE INDEX "TaxDeclaration_employeeId_fy_key" ON "TaxDeclaration"("employeeId", "fy");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_number_key" ON "PayrollRun"("number");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_journalEntryId_key" ON "PayrollRun"("journalEntryId");

-- CreateIndex
CREATE INDEX "PayrollRun_period_status_idx" ON "PayrollRun"("period", "status");

-- CreateIndex
CREATE INDEX "Payslip_employeeId_period_idx" ON "Payslip"("employeeId", "period");

-- CreateIndex
CREATE INDEX "Payslip_period_idx" ON "Payslip"("period");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_runId_employeeId_key" ON "Payslip"("runId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "StatutoryPayment_journalEntryId_key" ON "StatutoryPayment"("journalEntryId");

-- CreateIndex
CREATE INDEX "StatutoryPayment_kind_period_idx" ON "StatutoryPayment"("kind", "period");

-- AddForeignKey
ALTER TABLE "EmployeeSalary" ADD CONSTRAINT "EmployeeSalary_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSalary" ADD CONSTRAINT "EmployeeSalary_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "SalaryStructure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxDeclaration" ADD CONSTRAINT "TaxDeclaration_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Number sequence for payroll runs
INSERT INTO "NumberSequence" ("key", "prefix", "next", "pad") VALUES ('PAYROLL', 'PAY-', 1, 4) ON CONFLICT DO NOTHING;

-- Starter salary structure: basic 50% of CTC, HRA 40% of basic, conveyance up to 1,600, special allowance takes the balance.
INSERT INTO "SalaryStructure" ("id", "name", "description", "active", "employerInCtc", "components") VALUES
  ('ss_standard', 'Standard CTC', 'Employer PF and ESI inside CTC', true, true, '[{"code":"BASIC","name":"Basic","kind":"EARNING","calc":"PERCENT_CTC","value":50,"taxable":true,"pfWage":true,"esiWage":true,"prorate":true},{"code":"HRA","name":"House rent allowance","kind":"EARNING","calc":"PERCENT_BASIC","value":40,"taxable":true,"pfWage":false,"esiWage":true,"prorate":true},{"code":"CONV","name":"Conveyance","kind":"EARNING","calc":"FORMULA","value":0,"formula":"MIN(1600, BASIC*0.1)","taxable":true,"pfWage":false,"esiWage":true,"prorate":true},{"code":"SPECIAL","name":"Special allowance","kind":"EARNING","calc":"BALANCE","value":0,"taxable":true,"pfWage":false,"esiWage":true,"prorate":true}]'::jsonb),
  ('ss_worker', 'Shop-floor worker', 'Basic + DA as PF wages; ESI covered', true, true, '[{"code":"BASIC","name":"Basic","kind":"EARNING","calc":"PERCENT_CTC","value":45,"taxable":true,"pfWage":true,"esiWage":true,"prorate":true},{"code":"DA","name":"Dearness allowance","kind":"EARNING","calc":"PERCENT_CTC","value":15,"taxable":true,"pfWage":true,"esiWage":true,"prorate":true},{"code":"HRA","name":"House rent allowance","kind":"EARNING","calc":"PERCENT_BASIC","value":20,"taxable":true,"pfWage":false,"esiWage":true,"prorate":true},{"code":"SPECIAL","name":"Special allowance","kind":"EARNING","calc":"BALANCE","value":0,"taxable":true,"pfWage":false,"esiWage":true,"prorate":true}]'::jsonb)
ON CONFLICT DO NOTHING;
-- Professional tax and LWF follow the branch's state
UPDATE "Branch" SET "state" = 'MH' WHERE "state" IS NULL AND ("name" ILIKE '%pune%' OR "name" ILIKE '%mumbai%' OR "code" ILIKE 'PUN%' OR "code" ILIKE 'MUM%');
UPDATE "Branch" SET "state" = 'DL' WHERE "state" IS NULL AND ("name" ILIKE '%delhi%' OR "code" ILIKE 'DEL%');
UPDATE "Branch" SET "state" = 'TN' WHERE "state" IS NULL AND ("name" ILIKE '%chennai%' OR "code" ILIKE 'CHE%' OR "code" ILIKE 'MAA%');
UPDATE "Branch" SET "state" = 'KA' WHERE "state" IS NULL AND ("name" ILIKE '%bengaluru%' OR "name" ILIKE '%bangalore%' OR "code" ILIKE 'BLR%');
