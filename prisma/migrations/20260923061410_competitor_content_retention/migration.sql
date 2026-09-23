-- AlterTable
ALTER TABLE "competitors" ADD COLUMN     "content_fetched_at" TIMESTAMP(3),
ADD COLUMN     "content_purged" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "competitors_content_fetched_at_idx" ON "competitors"("content_fetched_at");
