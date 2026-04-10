-- CreateEnum
CREATE TYPE "CorrectionType" AS ENUM ('AUTO_FLAGGED', 'HUMAN_FLAGGED');

-- DropIndex
DROP INDEX "OCSFEvent_normalizeJobId_key";

-- AlterTable
ALTER TABLE "ManualReview" ADD COLUMN     "correctionType" "CorrectionType" NOT NULL DEFAULT 'AUTO_FLAGGED',
ADD COLUMN     "flaggedById" TEXT;

-- AlterTable
ALTER TABLE "OCSFEvent" ADD COLUMN     "supersedesEventId" TEXT;

-- CreateIndex
CREATE INDEX "ManualReview_correctionType_idx" ON "ManualReview"("correctionType");

-- CreateIndex
CREATE UNIQUE INDEX "OCSFEvent_supersedesEventId_key" ON "OCSFEvent"("supersedesEventId");

-- CreateIndex
CREATE INDEX "OCSFEvent_normalizeJobId_idx" ON "OCSFEvent"("normalizeJobId");

-- CreateIndex
CREATE INDEX "OCSFEvent_supersedesEventId_idx" ON "OCSFEvent"("supersedesEventId");

-- AddForeignKey
ALTER TABLE "OCSFEvent" ADD CONSTRAINT "OCSFEvent_supersedesEventId_fkey" FOREIGN KEY ("supersedesEventId") REFERENCES "OCSFEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualReview" ADD CONSTRAINT "ManualReview_flaggedById_fkey" FOREIGN KEY ("flaggedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill existing ManualReview rows
UPDATE "ManualReview" SET "correctionType" = 'AUTO_FLAGGED' WHERE "correctionType" IS NULL;
