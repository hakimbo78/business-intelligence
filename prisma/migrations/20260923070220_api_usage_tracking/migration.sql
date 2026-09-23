-- CreateTable
CREATE TABLE "api_usage" (
    "id" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "sku" TEXT NOT NULL,
    "project_id" TEXT,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "estimated_cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_usage_day_idx" ON "api_usage"("day");

-- CreateIndex
CREATE INDEX "api_usage_project_id_idx" ON "api_usage"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_usage_day_sku_project_id_key" ON "api_usage"("day", "sku", "project_id");
