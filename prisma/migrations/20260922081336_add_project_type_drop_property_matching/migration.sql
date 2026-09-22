/*
  Warnings:

  - You are about to drop the column `property_match_distance_meters` on the `location_candidates` table. All the data in the column will be lost.
  - You are about to drop the column `property_match_method` on the `location_candidates` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "location_candidates" DROP COLUMN "property_match_distance_meters",
DROP COLUMN "property_match_method";

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "project_type" TEXT NOT NULL DEFAULT 'AREA_SCOUTING';
