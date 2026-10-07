CREATE TABLE "TechnicalQuestion" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'MEDIUM',
    "statement" TEXT NOT NULL,
    "constraints" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "examples" JSONB NOT NULL DEFAULT '[]',
    "marks" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "TechnicalQuestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TechnicalQuestion_roundId_order_key"
ON "TechnicalQuestion"("roundId", "order");

ALTER TABLE "TechnicalQuestion"
ADD CONSTRAINT "TechnicalQuestion_roundId_fkey"
FOREIGN KEY ("roundId") REFERENCES "Round"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
