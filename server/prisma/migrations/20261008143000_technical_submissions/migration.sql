CREATE TABLE "TechnicalSubmission" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evaluation" JSONB,
    "evaluatedAt" TIMESTAMP(3),

    CONSTRAINT "TechnicalSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TechnicalSubmission_candidateId_questionId_key"
ON "TechnicalSubmission"("candidateId", "questionId");

ALTER TABLE "TechnicalSubmission"
ADD CONSTRAINT "TechnicalSubmission_candidateId_fkey"
FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TechnicalSubmission"
ADD CONSTRAINT "TechnicalSubmission_questionId_fkey"
FOREIGN KEY ("questionId") REFERENCES "TechnicalQuestion"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
