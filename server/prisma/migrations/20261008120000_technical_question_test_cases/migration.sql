ALTER TABLE "TechnicalQuestion"
ADD COLUMN "testCases" JSONB NOT NULL DEFAULT '[]';
