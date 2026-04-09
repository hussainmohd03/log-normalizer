-- AlterTable
ALTER TABLE "NormalizeJob" ADD COLUMN     "parentJobId" TEXT;

-- CreateIndex
CREATE INDEX "NormalizeJob_parentJobId_idx" ON "NormalizeJob"("parentJobId");

-- AddForeignKey
ALTER TABLE "NormalizeJob" ADD CONSTRAINT "NormalizeJob_parentJobId_fkey" FOREIGN KEY ("parentJobId") REFERENCES "NormalizeJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

