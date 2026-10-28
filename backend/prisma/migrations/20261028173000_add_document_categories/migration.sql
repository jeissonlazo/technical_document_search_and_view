ALTER TABLE "Document"
  ADD COLUMN "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "Document"
SET "categories" = ARRAY["category"]::TEXT[]
WHERE "category" IS NOT NULL
  AND cardinality("categories") = 0;
