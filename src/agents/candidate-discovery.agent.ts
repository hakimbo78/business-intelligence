import { LocationCandidate } from '@prisma/client';
import { env } from '../config/environment.js';
import { createLocationProvider } from '../providers/location/index.js';
import { candidateRepository } from '../repositories/candidate.repository.js';
import { dataSourceRepository } from '../repositories/data-source.repository.js';
import { projectService } from '../services/project.service.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../config/database.js';

export interface CandidateDiscoveryResult {
  queriesRun: string[];
  placesFound: number;
  duplicatesSkipped: number;
  candidatesCreated: number;
  candidates: LocationCandidate[];
}

/**
 * Candidate Discovery Agent
 *
 * Populates the candidate pool that the shortlist funnel narrows down
 * (PROJECT_MASTER_SPEC.md §6: 1000+ POIs → … → 5 report candidates).
 *
 * Without this step the funnel has nothing to filter, so every generated
 * report ships with zero candidate locations.
 */
export class CandidateDiscoveryAgent {
  private locationProvider = createLocationProvider(env.MAP_PROVIDER);

  async discoverCandidates(projectId: string): Promise<CandidateDiscoveryResult> {
    logger.info({ projectId }, 'CandidateDiscoveryAgent discovering candidate locations');

    const project = await projectService.getProject(projectId);

    if (!project.locationSearch || !project.researchPlan) {
      throw new Error(
        `Project ${projectId} is missing required data (LocationSearch or ResearchPlan)`
      );
    }

    const ls = project.locationSearch;
    const researchPlan = project.researchPlan as {
      searchRadiusMeters?: number;
      candidateSearchQueries?: string[];
    };

    const queries = (researchPlan.candidateSearchQueries ?? []).filter((q) => q.trim().length > 0);
    if (queries.length === 0) {
      throw new Error(
        `Project ${projectId} research plan contains no candidateSearchQueries`
      );
    }

    const searchRadiusMeters = researchPlan.searchRadiusMeters ?? ls.preferredRadius ?? 3000;

    const targetQuery = ls.targetArea ? `${ls.targetArea}, ${ls.targetCity}` : ls.targetCity;
    const geocodeResult = await this.locationProvider.geocode({ address: targetQuery });
    const center = geocodeResult.data.location;

    await dataSourceRepository.record(geocodeResult.provenance, {
      projectId,
      metadata: { operation: 'geocode', address: targetQuery },
    });

    // Place IDs already stored for this project, so re-running discovery
    // after a revision does not duplicate the pool.
    const existing = await prisma.locationCandidate.findMany({
      where: { projectId },
      select: { placeId: true },
    });
    const seenPlaceIds = new Set(
      existing.map((c) => c.placeId).filter((id): id is string => Boolean(id))
    );

    let placesFound = 0;
    let duplicatesSkipped = 0;
    const candidates: LocationCandidate[] = [];

    for (const query of queries) {
      const result = await this.locationProvider.searchPlaces({
        query,
        location: center,
        radiusMeters: searchRadiusMeters,
      });

      await dataSourceRepository.record(result.provenance, {
        projectId,
        metadata: { operation: 'discoverCandidates', query, searchRadiusMeters, resultCount: result.data.length },
      });

      for (const place of result.data) {
        placesFound++;

        // The same property surfaces across several queries; keep one row each.
        if (place.placeId && seenPlaceIds.has(place.placeId)) {
          duplicatesSkipped++;
          continue;
        }
        if (place.placeId) seenPlaceIds.add(place.placeId);

        candidates.push(
          await candidateRepository.createCandidate({
            projectId,
            name: place.name,
            address: place.address,
            latitude: place.location.latitude,
            longitude: place.location.longitude,
            placeId: place.placeId,
          })
        );
      }
    }

    logger.info(
      {
        projectId,
        queriesRun: queries.length,
        placesFound,
        duplicatesSkipped,
        candidatesCreated: candidates.length,
      },
      'CandidateDiscoveryAgent finished'
    );

    return {
      queriesRun: queries,
      placesFound,
      duplicatesSkipped,
      candidatesCreated: candidates.length,
      candidates,
    };
  }
}

export const candidateDiscoveryAgent = new CandidateDiscoveryAgent();
