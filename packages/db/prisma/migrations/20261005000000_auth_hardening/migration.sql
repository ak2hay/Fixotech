-- AlterTable
ALTER TABLE "User" ADD COLUMN     "failedLogins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "mfaLastStep" INTEGER,
ADD COLUMN     "mfaRecoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "UserIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "tenantId" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "UserIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_provider_subject_key" ON "UserIdentity"("provider", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_userId_provider_key" ON "UserIdentity"("userId", "provider");

-- AddForeignKey
ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
