import { prisma } from '../config/database.js';
import type { LocationCandidate, Competitor, FinancialScenario, Prisma } from '@prisma/client';

export interface CreateCandidateInput {
  projectId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  placeId?: string;
}

export interface CreateCompetitorInput {
  projectId: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  placeId?: string;
  type?: string;
  distanceMeters?: number;
  rating?: number;
  reviewCount?: number;
}

export class CandidateRepository {
  /**
   * Create a location candidate and optionally update its PostGIS geometry.
   */
  async createCandidate(input: CreateCandidateInput): Promise<LocationCandidate> {
    const candidate = await prisma.locationCandidate.create({
      data: {
        projectId: input.projectId,
        name: input.name,
        address: input.address,
        latitude: input.latitude,
        longitude: input.longitude,
        placeId: input.placeId,
      },
    });

    // Update PostGIS geometry
    await prisma.$executeRaw`
      UPDATE location_candidates 
      SET geom = ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326) 
      WHERE id = ${candidate.id}
    `;

    return candidate;
  }

  /**
   * Add a financial scenario to a candidate.
   */
  async addFinancialScenario(candidateId: string, data: Omit<Prisma.FinancialScenarioCreateInput, 'candidate'>): Promise<FinancialScenario> {
    return await prisma.financialScenario.create({
      data: {
        ...data,
        candidate: { connect: { id: candidateId } },
      },
    });
  }

  /**
   * Create a competitor and optionally update its PostGIS geometry.
   */
  async addCompetitor(input: CreateCompetitorInput): Promise<Competitor> {
    const competitor = await prisma.competitor.create({
      data: {
        projectId: input.projectId,
        name: input.name,
        category: input.category,
        latitude: input.latitude,
        longitude: input.longitude,
        placeId: input.placeId,
        type: input.type ?? 'DIRECT',
        distanceMeters: input.distanceMeters,
        rating: input.rating,
        reviewCount: input.reviewCount,
      },
    });

    // Update PostGIS geometry
    await prisma.$executeRaw`
      UPDATE competitors 
      SET geom = ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326) 
      WHERE id = ${competitor.id}
    `;

    return competitor;
  }

  /**
   * Find competitors within a certain radius of a location.
   */
  async findCompetitorsInRadius(projectId: string, latitude: number, longitude: number, radiusMeters: number): Promise<Competitor[]> {
    // Note: This relies on PostGIS being populated.
    const competitors = await prisma.$queryRaw<Competitor[]>`
      SELECT id, project_id as "projectId", place_id as "placeId", name, category, type, 
             latitude, longitude, distance_meters as "distanceMeters", rating, review_count as "reviewCount",
             created_at as "createdAt", updated_at as "updatedAt"
      FROM competitors
      WHERE project_id = ${projectId}
        AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography, ${radiusMeters})
    `;
    return competitors;
  }
}

export const candidateRepository = new CandidateRepository();
