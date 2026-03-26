/*
  Warnings:

  - You are about to drop the column `rawContent` on the `ManualReview` table. All the data in the column will be lost.
  - The `priority` column on the `ManualReview` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "PRIORITY" AS ENUM ('NORMAL', 'HIGH');

-- AlterTable
ALTER TABLE "ManualReview" DROP COLUMN "rawContent",
DROP COLUMN "priority",
ADD COLUMN     "priority" "PRIORITY" NOT NULL DEFAULT 'NORMAL';

-- CreateIndex
CREATE INDEX "ManualReview_priority_queuedAt_idx" ON "ManualReview"("priority", "queuedAt");
