-- DropForeignKey
ALTER TABLE "ManualReview" DROP CONSTRAINT "ManualReview_rawLogId_fkey";

-- DropForeignKey
ALTER TABLE "OCSFEvent" DROP CONSTRAINT "OCSFEvent_rawLogId_fkey";

-- DropIndex
DROP INDEX "OCSFEvent_rawLogId_key";

-- AlterTable
ALTER TABLE "ManualReview" DROP COLUMN "rawLogId",
ADD COLUMN     "normalizeJobId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "NormalizeJob" DROP COLUMN "rawLog",
ADD COLUMN     "rawLog" JSONB NOT NULL;

-- AlterTable
ALTER TABLE "OCSFEvent" DROP COLUMN "rawLogId",
ADD COLUMN     "normalizeJobId" TEXT NOT NULL;

-- DropTable
DROP TABLE "RawLog";

-- DropEnum
DROP TYPE "STATUS";

-- CreateIndex
CREATE UNIQUE INDEX "OCSFEvent_normalizeJobId_key" ON "OCSFEvent"("normalizeJobId");

-- AddForeignKey
ALTER TABLE "OCSFEvent" ADD CONSTRAINT "OCSFEvent_normalizeJobId_fkey" FOREIGN KEY ("normalizeJobId") REFERENCES "NormalizeJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualReview" ADD CONSTRAINT "ManualReview_normalizeJobId_fkey" FOREIGN KEY ("normalizeJobId") REFERENCES "NormalizeJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

