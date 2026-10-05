/*
  Warnings:

  - A unique constraint covering the columns `[shareToken]` on the table `InterviewSession` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "InterviewSession" ADD COLUMN     "shareToken" TEXT NOT NULL DEFAULT gen_random_uuid();

-- CreateIndex
CREATE UNIQUE INDEX "InterviewSession_shareToken_key" ON "InterviewSession"("shareToken");
