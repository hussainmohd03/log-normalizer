-- AlterTable
ALTER TABLE "ProcessingMetric" ADD COLUMN     "normalizeJobId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ManualReview_normalizeJobId_key" ON "ManualReview"("normalizeJobId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessingMetric_normalizeJobId_key" ON "ProcessingMetric"("normalizeJobId");

