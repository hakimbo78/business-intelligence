-- AlterTable
ALTER TABLE "data_sources" ADD COLUMN     "project_id" TEXT;

-- AlterTable
ALTER TABLE "job_queue" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "max_attempts" INTEGER NOT NULL DEFAULT 3;

-- CreateIndex
CREATE INDEX "data_sources_project_id_idx" ON "data_sources"("project_id");

-- CreateIndex
CREATE INDEX "job_queue_status_created_at_idx" ON "job_queue"("status", "created_at");

-- AddForeignKey
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
