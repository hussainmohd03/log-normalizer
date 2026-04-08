-- AlterTable
ALTER TABLE "NormalizeJob" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "NormalizeJob_idempotencyKey_key" ON "NormalizeJob"("idempotencyKey");

