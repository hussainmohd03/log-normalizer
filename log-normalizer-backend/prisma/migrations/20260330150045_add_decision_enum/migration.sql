/*
  Warnings:

  - Changed the type of `decision` on the `OCSFEvent` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "DECISION" AS ENUM ('ACCEPT', 'REVIEW', 'REJECT', 'CORRECTED');

-- AlterTable
ALTER TABLE "OCSFEvent" DROP COLUMN "decision",
ADD COLUMN     "decision" "DECISION" NOT NULL;

-- CreateIndex
CREATE INDEX "OCSFEvent_decision_idx" ON "OCSFEvent"("decision");
