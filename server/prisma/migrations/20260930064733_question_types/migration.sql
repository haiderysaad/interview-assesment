-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SINGLE', 'MULTI');

-- AlterTable
ALTER TABLE "AptitudeQuestion" ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "type" "QuestionType" NOT NULL DEFAULT 'SINGLE';

-- AlterTable
ALTER TABLE "Round" ADD COLUMN     "shuffleOptions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false;
