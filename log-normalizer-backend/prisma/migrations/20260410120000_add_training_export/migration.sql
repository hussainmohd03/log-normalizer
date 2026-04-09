-- DropColumn
ALTER TABLE "ManualReview" DROP COLUMN "exportedForTraining";

-- AlterTable
ALTER TABLE "ManualReview" ADD COLUMN "trainingExportId" TEXT;

-- CreateTable
CREATE TABLE "TrainingExport" (
    "id" TEXT NOT NULL,
    "exportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exportedById" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL,

    CONSTRAINT "TrainingExport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingExport_exportedAt_idx" ON "TrainingExport"("exportedAt");

-- CreateIndex
CREATE INDEX "ManualReview_trainingExportId_idx" ON "ManualReview"("trainingExportId");

-- AddForeignKey
ALTER TABLE "ManualReview" ADD CONSTRAINT "ManualReview_trainingExportId_fkey" FOREIGN KEY ("trainingExportId") REFERENCES "TrainingExport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingExport" ADD CONSTRAINT "TrainingExport_exportedById_fkey" FOREIGN KEY ("exportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
