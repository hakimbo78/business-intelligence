-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_profiles" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "business_name" TEXT NOT NULL,
    "business_category" TEXT NOT NULL,
    "business_subcategory" TEXT,
    "current_branch_count" INTEGER NOT NULL DEFAULT 0,
    "current_average_transaction" DOUBLE PRECISION,
    "estimated_daily_customers" INTEGER,
    "operating_days" INTEGER,
    "gross_margin" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_searches" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "target_city" TEXT NOT NULL,
    "target_area" TEXT,
    "preferred_radius" INTEGER,
    "target_property_size" INTEGER,
    "maximum_monthly_rent" DOUBLE PRECISION,
    "maximum_initial_investment" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_candidates" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "place_id" TEXT,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "geom" geometry(Point, 4326),
    "status" TEXT NOT NULL DEFAULT 'IDENTIFIED',
    "confidence" TEXT NOT NULL DEFAULT 'LOW',
    "composite_score" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitors" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "place_id" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'DIRECT',
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "geom" geometry(Point, 4326),
    "distance_meters" INTEGER,
    "rating" DOUBLE PRECISION,
    "review_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_scenarios" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "monthly_revenue" DOUBLE PRECISION NOT NULL,
    "monthly_operating_cost" DOUBLE PRECISION NOT NULL,
    "gross_profit" DOUBLE PRECISION NOT NULL,
    "net_profit" DOUBLE PRECISION NOT NULL,
    "payback_period_months" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "content_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_sources" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "data_type" TEXT NOT NULL,
    "geographic_scope" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'LOW',
    "retrieved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "data_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clients_email_key" ON "clients"("email");

-- CreateIndex
CREATE UNIQUE INDEX "business_profiles_project_id_key" ON "business_profiles"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "location_searches_project_id_key" ON "location_searches"("project_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_searches" ADD CONSTRAINT "location_searches_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_candidates" ADD CONSTRAINT "location_candidates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_scenarios" ADD CONSTRAINT "financial_scenarios_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "location_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
