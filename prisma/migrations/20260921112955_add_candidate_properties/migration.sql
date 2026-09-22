-- AlterTable
ALTER TABLE "location_candidates" ADD COLUMN     "estimated_rent" DOUBLE PRECISION,
ADD COLUMN     "property_size" INTEGER,
ADD COLUMN     "property_type" TEXT;
