ALTER TABLE "TechnicalSubmission"
ADD COLUMN "suggestedCode" TEXT,
ADD COLUMN "suggestedAt" TIMESTAMP(3),
ADD COLUMN "suggestionNote" TEXT,
ADD COLUMN "suggestionChanged" BOOLEAN;
