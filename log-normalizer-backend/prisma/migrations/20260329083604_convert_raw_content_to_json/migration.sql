/*
  Warnings:

  - Changed the type of `rawContent` on the `AccumulatedPair` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "AccumulatedPair" DROP COLUMN "rawContent",
ADD COLUMN     "rawContent" JSONB NOT NULL;

-- AddForeignKey
ALTER TABLE "ManualReview" ADD CONSTRAINT "ManualReview_rawLogId_fkey" FOREIGN KEY ("rawLogId") REFERENCES "RawLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
