-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "aadhaarEnc" TEXT,
ADD COLUMN     "aadhaarHash" TEXT,
ADD COLUMN     "aadhaarMasked" TEXT,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "bankAccountEnc" TEXT,
ADD COLUMN     "bankAccountMasked" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "confirmationDate" DATE,
ADD COLUMN     "designation" TEXT,
ADD COLUMN     "dob" DATE,
ADD COLUMN     "emergencyContact" TEXT,
ADD COLUMN     "employmentType" TEXT NOT NULL DEFAULT 'PERMANENT',
ADD COLUMN     "esiApplicable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "esicNo" TEXT,
ADD COLUMN     "exitReason" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "ifsc" TEXT,
ADD COLUMN     "lastWorkingDay" DATE,
ADD COLUMN     "leavePolicyId" TEXT,
ADD COLUMN     "panEnc" TEXT,
ADD COLUMN     "panHash" TEXT,
ADD COLUMN     "panMasked" TEXT,
ADD COLUMN     "personalEmail" TEXT,
ADD COLUMN     "pfApplicable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "probationEndDate" DATE,
ADD COLUMN     "ptApplicable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "resignationDate" DATE,
ADD COLUMN     "shiftId" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "taxRegime" TEXT NOT NULL DEFAULT 'NEW',
ADD COLUMN     "uan" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "appliedById" TEXT,
ADD COLUMN     "days" DECIMAL(5,1) NOT NULL DEFAULT 0,
ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedById" TEXT,
ADD COLUMN     "decisionNote" TEXT,
ADD COLUMN     "halfDay" TEXT;

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "lateMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "latitude" DECIMAL(9,6),
ADD COLUMN     "locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "longitude" DECIMAL(9,6),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shiftId" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PRESENT',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "workedMinutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "AssetItem" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "category" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "serialNo" TEXT;

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 60,
    "graceMinutes" INTEGER NOT NULL DEFAULT 15,
    "halfDayHours" DECIMAL(4,1) NOT NULL DEFAULT 4,
    "fullDayHours" DECIMAL(4,1) NOT NULL DEFAULT 8,
    "weeklyOffs" INTEGER[] DEFAULT ARRAY[0]::INTEGER[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterEntry" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "shiftId" TEXT,
    "off" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RosterEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "branchId" TEXT,
    "optional" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeavePolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branchId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "weeklyOffs" INTEGER[] DEFAULT ARRAY[0]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeavePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveType" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "annualQuota" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "accrual" TEXT NOT NULL DEFAULT 'YEARLY',
    "carryForwardMax" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "encashable" BOOLEAN NOT NULL DEFAULT false,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "allowHalfDay" BOOLEAN NOT NULL DEFAULT true,
    "allowNegative" BOOLEAN NOT NULL DEFAULT false,
    "countOffs" BOOLEAN NOT NULL DEFAULT false,
    "minNoticeDays" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LeaveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "opening" DECIMAL(6,1) NOT NULL DEFAULT 0,
    "adjusted" DECIMAL(6,1) NOT NULL DEFAULT 0,
    "encashed" DECIMAL(6,1) NOT NULL DEFAULT 0,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceCorrection" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDocument" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "expiresAt" DATE,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeTask" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "owner" TEXT NOT NULL DEFAULT 'HR',
    "dueDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobTimeLog" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "minutes" INTEGER,

    CONSTRAINT "JobTimeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppraisalCycle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "selfDue" DATE,
    "managerDue" DATE,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppraisalCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "cycleId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "target" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appraisal" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SELF',
    "selfRating" DECIMAL(2,1),
    "selfComments" TEXT,
    "managerRating" DECIMAL(2,1),
    "managerComments" TEXT,
    "reviewerId" TEXT,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Appraisal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shift_code_key" ON "Shift"("code");

-- CreateIndex
CREATE INDEX "RosterEntry_day_idx" ON "RosterEntry"("day");

-- CreateIndex
CREATE UNIQUE INDEX "RosterEntry_employeeId_day_key" ON "RosterEntry"("employeeId", "day");

-- CreateIndex
CREATE INDEX "Holiday_date_idx" ON "Holiday"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_branchId_key" ON "Holiday"("date", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveType_policyId_code_key" ON "LeaveType"("policyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalance_employeeId_year_type_key" ON "LeaveBalance"("employeeId", "year", "type");

-- CreateIndex
CREATE INDEX "AttendanceCorrection_status_idx" ON "AttendanceCorrection"("status");

-- CreateIndex
CREATE INDEX "AttendanceCorrection_employeeId_day_idx" ON "AttendanceCorrection"("employeeId", "day");

-- CreateIndex
CREATE INDEX "EmployeeDocument_employeeId_idx" ON "EmployeeDocument"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeTask_employeeId_kind_idx" ON "EmployeeTask"("employeeId", "kind");

-- CreateIndex
CREATE INDEX "EmployeeTask_status_idx" ON "EmployeeTask"("status");

-- CreateIndex
CREATE INDEX "JobTimeLog_employeeId_startedAt_idx" ON "JobTimeLog"("employeeId", "startedAt");

-- CreateIndex
CREATE INDEX "JobTimeLog_jobCardId_idx" ON "JobTimeLog"("jobCardId");

-- CreateIndex
CREATE INDEX "Goal_employeeId_idx" ON "Goal"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Appraisal_cycleId_employeeId_key" ON "Appraisal"("cycleId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_panHash_key" ON "Employee"("panHash");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_aadhaarHash_key" ON "Employee"("aadhaarHash");

-- CreateIndex
CREATE INDEX "Employee_status_idx" ON "Employee"("status");

-- CreateIndex
CREATE INDEX "LeaveRequest_employeeId_fromDate_idx" ON "LeaveRequest"("employeeId", "fromDate");

-- CreateIndex
CREATE INDEX "LeaveRequest_status_idx" ON "LeaveRequest"("status");

-- CreateIndex
CREATE INDEX "Attendance_day_idx" ON "Attendance"("day");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_leavePolicyId_fkey" FOREIGN KEY ("leavePolicyId") REFERENCES "LeavePolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterEntry" ADD CONSTRAINT "RosterEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterEntry" ADD CONSTRAINT "RosterEntry_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeavePolicy" ADD CONSTRAINT "LeavePolicy_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveType" ADD CONSTRAINT "LeaveType_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "LeavePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTask" ADD CONSTRAINT "EmployeeTask_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTimeLog" ADD CONSTRAINT "JobTimeLog_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTimeLog" ADD CONSTRAINT "JobTimeLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appraisal" ADD CONSTRAINT "Appraisal_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AppraisalCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appraisal" ADD CONSTRAINT "Appraisal_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Starter HR configuration
INSERT INTO "Shift" ("id", "code", "name", "startTime", "endTime", "breakMinutes", "graceMinutes", "halfDayHours", "fullDayHours", "weeklyOffs", "active")
VALUES ('shift_general', 'GEN', 'General', '09:30', '18:30', 60, 15, 4, 8, ARRAY[0], true)
ON CONFLICT DO NOTHING;

INSERT INTO "LeavePolicy" ("id", "name", "isDefault", "active", "weeklyOffs")
VALUES ('lp_default', 'Standard', true, true, ARRAY[0])
ON CONFLICT DO NOTHING;

INSERT INTO "LeaveType" ("id", "policyId", "code", "name", "annualQuota", "accrual", "carryForwardMax", "encashable", "paid", "allowHalfDay", "allowNegative", "countOffs", "minNoticeDays") VALUES
  ('lt_default_cl', 'lp_default', 'CL', 'Casual leave', 8, 'YEARLY', 0, false, true, true, false, false, 0),
  ('lt_default_sl', 'lp_default', 'SL', 'Sick leave', 7, 'YEARLY', 0, false, true, true, false, false, 0),
  ('lt_default_el', 'lp_default', 'EL', 'Earned leave', 15, 'MONTHLY', 30, true, true, false, false, false, 7),
  ('lt_default_lop', 'lp_default', 'LOP', 'Loss of pay', 0, 'NONE', 0, false, false, true, true, false, 0)
ON CONFLICT DO NOTHING;

INSERT INTO "ChecklistTemplate" ("id", "kind", "name", "active", "items") VALUES
  ('ct_onboarding', 'ONBOARDING', 'Standard onboarding', true, '[{"title":"Collect PAN, Aadhaar and bank proof","owner":"HR","dueDays":0},{"title":"Issue appointment letter","owner":"HR","dueDays":0},{"title":"Create ERP login and email","owner":"IT","dueDays":0},{"title":"Issue laptop / tools / safety gear","owner":"ADMIN","dueDays":1},{"title":"Register PF (UAN) and ESIC","owner":"HR","dueDays":7},{"title":"Induction and safety training","owner":"MANAGER","dueDays":3},{"title":"Set probation goals","owner":"MANAGER","dueDays":14}]'::jsonb),
  ('ct_exit', 'EXIT', 'Standard exit', true, '[{"title":"Accept resignation and confirm last working day","owner":"HR","dueDays":0},{"title":"Knowledge transfer","owner":"MANAGER","dueDays":-7},{"title":"Recover assets, ID card and tools","owner":"ADMIN","dueDays":0},{"title":"Disable ERP and email access","owner":"IT","dueDays":0},{"title":"Clear advances and expenses","owner":"FINANCE","dueDays":0},{"title":"Full and final settlement","owner":"FINANCE","dueDays":30},{"title":"Issue relieving and experience letter","owner":"HR","dueDays":30}]'::jsonb)
ON CONFLICT DO NOTHING;

UPDATE "Employee" SET "shiftId" = 'shift_general' WHERE "shiftId" IS NULL;
UPDATE "Employee" SET "status" = 'EXITED' WHERE "active" = false;