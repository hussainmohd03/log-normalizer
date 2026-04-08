-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'ACTIVE', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "NormalizeJob" (
    "id" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "rawLog" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "ocsf" JSONB,
    "confidence" DOUBLE PRECISION,
    "decision" TEXT,
    "breakdown" JSONB,
    "validationErrors" JSONB,
    "processingTimeMs" INTEGER,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "NormalizeJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NormalizeJob_status_idx" ON "NormalizeJob"("status");

-- CreateIndex
CREATE INDEX "NormalizeJob_createdAt_idx" ON "NormalizeJob"("createdAt");
