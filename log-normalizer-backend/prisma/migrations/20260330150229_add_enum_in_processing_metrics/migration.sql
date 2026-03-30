/*
  Warnings:

  - The `decision` column on the `ProcessingMetric` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "ProcessingMetric" DROP COLUMN "decision",
ADD COLUMN     "decision" "DECISION";
