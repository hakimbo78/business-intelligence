-- AlterTable
ALTER TABLE "location_candidates" ADD COLUMN     "property_listing_id" TEXT,
ADD COLUMN     "property_match_distance_meters" INTEGER,
ADD COLUMN     "property_match_method" TEXT;

-- CreateTable
CREATE TABLE "property_listings" (
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "source" TEXT NOT NULL,
    "source_reference" TEXT,
    "place_id" TEXT,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "geom" geometry(Point, 4326),
    "property_type" TEXT,
    "size_sqm" INTEGER,
    "monthly_rent" DOUBLE PRECISION,
    "annual_rent" DOUBLE PRECISION,
    "rent_is_derived" BOOLEAN NOT NULL DEFAULT false,
    "deposit" DOUBLE PRECISION,
    "availability" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "confidence" TEXT NOT NULL DEFAULT 'LOW',
    "retrieved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_listings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_listings_project_id_idx" ON "property_listings"("project_id");

-- CreateIndex
CREATE INDEX "property_listings_availability_idx" ON "property_listings"("availability");

-- AddForeignKey
ALTER TABLE "location_candidates" ADD CONSTRAINT "location_candidates_property_listing_id_fkey" FOREIGN KEY ("property_listing_id") REFERENCES "property_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_listings" ADD CONSTRAINT "property_listings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
