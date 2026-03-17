-- CreateEnum
CREATE TYPE "STATUS" AS ENUM ('PENDING', 'IN_PROGRESS', 'PROCESSED');

-- CreateTable
CREATE TABLE "RawLog" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "format" TEXT,
    "rawContent" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "status" "STATUS" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,

    CONSTRAINT "RawLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OCSFEvent" (
    "id" TEXT NOT NULL,
    "rawLogId" TEXT NOT NULL,
    "classUid" INTEGER NOT NULL,
    "className" TEXT NOT NULL,
    "activityId" INTEGER,
    "activityName" TEXT,
    "severityId" INTEGER,
    "ocsfJson" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "decision" TEXT NOT NULL,
    "processingTime" INTEGER NOT NULL,
    "normalizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedToSqs" BOOLEAN NOT NULL DEFAULT false,
    "sqsMessageId" TEXT,

    CONSTRAINT "OCSFEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualReview" (
    "id" TEXT NOT NULL,
    "rawLogId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "rawContent" TEXT NOT NULL,
    "slmOcsfOutput" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "confidenceBreakdown" JSONB,
    "validationErrors" JSONB,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "correctedOCSF" JSONB,
    "exportedForTraining" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ManualReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccumulatedPair" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "rawContent" TEXT NOT NULL,
    "ocsfOutput" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "accumulatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccumulatedPair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingMetric" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "latencyMs" INTEGER,
    "decision" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProcessingMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RawLog_source_receivedAt_idx" ON "RawLog"("source", "receivedAt");

-- CreateIndex
CREATE INDEX "RawLog_status_idx" ON "RawLog"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OCSFEvent_rawLogId_key" ON "OCSFEvent"("rawLogId");

-- CreateIndex
CREATE INDEX "OCSFEvent_classUid_normalizedAt_idx" ON "OCSFEvent"("classUid", "normalizedAt");

-- CreateIndex
CREATE INDEX "OCSFEvent_confidence_idx" ON "OCSFEvent"("confidence");

-- CreateIndex
CREATE INDEX "OCSFEvent_decision_idx" ON "OCSFEvent"("decision");

-- CreateIndex
CREATE INDEX "OCSFEvent_publishedToSqs_idx" ON "OCSFEvent"("publishedToSqs");

-- CreateIndex
CREATE INDEX "ManualReview_queuedAt_idx" ON "ManualReview"("queuedAt");

-- CreateIndex
CREATE INDEX "ManualReview_reviewedAt_idx" ON "ManualReview"("reviewedAt");

-- CreateIndex
CREATE INDEX "ManualReview_priority_queuedAt_idx" ON "ManualReview"("priority", "queuedAt");

-- CreateIndex
CREATE INDEX "AccumulatedPair_source_accumulatedAt_idx" ON "AccumulatedPair"("source", "accumulatedAt");

-- CreateIndex
CREATE INDEX "AccumulatedPair_confidence_idx" ON "AccumulatedPair"("confidence");

-- CreateIndex
CREATE INDEX "ProcessingMetric_timestamp_source_idx" ON "ProcessingMetric"("timestamp", "source");

-- CreateIndex
CREATE INDEX "ProcessingMetric_source_timestamp_idx" ON "ProcessingMetric"("source", "timestamp");

-- AddForeignKey
ALTER TABLE "OCSFEvent" ADD CONSTRAINT "OCSFEvent_rawLogId_fkey" FOREIGN KEY ("rawLogId") REFERENCES "RawLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
