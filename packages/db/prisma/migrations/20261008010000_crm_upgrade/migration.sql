-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "customFields" JSONB,
ADD COLUMN     "mergedIntoId" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "customFields" JSONB,
ADD COLUMN     "lostAt" TIMESTAMP(3),
ADD COLUMN     "lostReason" TEXT,
ADD COLUMN     "mergedIntoId" TEXT,
ADD COLUMN     "nextFollowUpAt" TIMESTAMP(3),
ADD COLUMN     "region" TEXT,
ADD COLUMN     "score" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "segment" TEXT,
ADD COLUMN     "wonAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "customFields" JSONB;

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "direction" TEXT,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "externalId" TEXT,
    "ownerId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldDef" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomFieldDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadScoringRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "op" TEXT NOT NULL,
    "value" TEXT,
    "points" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadScoringRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "condition" JSONB NOT NULL,
    "userIds" TEXT[],
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sequence" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityType" TEXT NOT NULL DEFAULT 'quotation',
    "steps" JSONB NOT NULL,
    "autoEnroll" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceEnrollment" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastError" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SequenceEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Activity_externalId_key" ON "Activity"("externalId");

-- CreateIndex
CREATE INDEX "Activity_entityType_entityId_createdAt_idx" ON "Activity"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_ownerId_status_dueAt_idx" ON "Activity"("ownerId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Activity_status_dueAt_idx" ON "Activity"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDef_entity_key_key" ON "CustomFieldDef"("entity", "key");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_key_key" ON "EmailTemplate"("key");

-- CreateIndex
CREATE INDEX "SequenceEnrollment_status_nextRunAt_idx" ON "SequenceEnrollment"("status", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "SequenceEnrollment_sequenceId_entityType_entityId_key" ON "SequenceEnrollment"("sequenceId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "Lead_email_idx" ON "Lead"("email");

-- CreateIndex
CREATE INDEX "Lead_phone_idx" ON "Lead"("phone");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceEnrollment" ADD CONSTRAINT "SequenceEnrollment_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Starter follow-up templates and a quotation sequence (disabled until sales switches on autoEnroll).
INSERT INTO "EmailTemplate" ("id", "key", "name", "subject", "body", "active", "createdAt", "updatedAt") VALUES
  ('tpl_quote_followup_1', 'quote-followup-1', 'Quotation follow-up (day 3)', 'Following up on quotation {{quotation.number}} [{{quotation.number}}]', E'Dear {{customer.name}},\n\nThank you for considering Fixotec. We wanted to check whether you had a chance to review quotation {{quotation.number}} for {{project.name}}.\n\nHappy to walk you through the technical details or adjust quantities if the scope has changed.\n\nRegards,\nFixotec Sales', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tpl_quote_followup_2', 'quote-followup-2', 'Quotation follow-up (day 7)', 'Quotation {{quotation.number}} - any questions? [{{quotation.number}}]', E'Dear {{customer.name}},\n\nJust checking in on quotation {{quotation.number}}. It is valid until {{quotation.validUntil}}.\n\nIf there is anything blocking a decision - pricing, lead time or specification - reply to this email and we will sort it out.\n\nRegards,\nFixotec Sales', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tpl_quote_followup_3', 'quote-followup-3', 'Quotation follow-up (day 14)', 'Closing the loop on {{quotation.number}} [{{quotation.number}}]', E'Dear {{customer.name}},\n\nWe have not heard back on quotation {{quotation.number}}, so this is our last reminder. If the project timing has moved, let us know and we will revalidate the offer.\n\nRegards,\nFixotec Sales', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Sequence" ("id", "name", "entityType", "steps", "autoEnroll", "active", "createdAt") VALUES
  ('seq_quote_followup', 'Quotation follow-up', 'quotation', '[{"dayOffset":3,"templateKey":"quote-followup-1"},{"dayOffset":7,"templateKey":"quote-followup-2"},{"dayOffset":14,"templateKey":"quote-followup-3"}]', false, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;