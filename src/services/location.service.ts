import { candidateRepository } from '../repositories/candidate.repository.js';
import { dataSourceRepository } from '../repositories/data-source.repository.js';
import { createLocationProvider } from '../providers/location/index.js';
import { env } from '../config/environment.js';
import { logger } from '../lib/logger.js';
import { LocationCandidate, Competitor } from '@prisma/client';
import { DataProvenance } from '../providers/location/location-provider.interface.js';

export class LocationService {
  private provider = createLocationProvider(env.MAP_PROVIDER);

  /**
   * Search for candidates using the active location provider and save them to the database.
   */
  async searchCandidatesForProject(projectId: string, query: string, latitude: number, longitude: number, radiusMeters: number): Promise<{ candidates: LocationCandidate[], provenance: DataProvenance }> {
    logger.info({ projectId, query, provider: this.provider.providerName }, 'Searching location candidates');
    
    const result = await this.provider.searchPlaces({
      query,
      location: { latitude, longitude },
      radiusMeters,
    });

    // Record where this data came from before using it (DEVELOPMENT_RULES.md §10).
    await dataSourceRepository.record(result.provenance, {
      projectId,
      metadata: { operation: 'searchCandidates', query, radiusMeters, resultCount: result.data.length },
    });

    const candidates: LocationCandidate[] = [];
    for (const place of result.data) {
      const candidate = await candidateRepository.createCandidate({
        projectId,
        name: place.name,
        address: place.address,
        latitude: place.location.latitude,
        longitude: place.location.longitude,
        placeId: place.placeId,
      });
      candidates.push(candidate);
    }
    return { candidates, provenance: result.provenance };
  }

  /**
   * Find competitors around a specific coordinate.
   */
  async searchCompetitorsForProject(projectId: string, category: string, latitude: number, longitude: number, radiusMeters: number): Promise<{ competitors: Competitor[], provenance: DataProvenance }> {
    logger.info({ projectId, category, provider: this.provider.providerName }, 'Searching competitors');
    
    const result = await this.provider.searchPlaces({
      query: category,
      location: { latitude, longitude },
      radiusMeters,
      type: 'store', // general fallback
    });

    await dataSourceRepository.record(result.provenance, {
      projectId,
      metadata: { operation: 'searchCompetitors', category, radiusMeters, resultCount: result.data.length },
    });

    const competitors: Competitor[] = [];
    for (const place of result.data) {
      const comp = await candidateRepository.addCompetitor({
        projectId,
        name: place.name,
        address: place.address,
        category: place.category,
        latitude: place.location.latitude,
        longitude: place.location.longitude,
        placeId: place.placeId,
        rating: place.rating,
        reviewCount: place.reviewCount,
      });
      competitors.push(comp);
    }
    return { competitors, provenance: result.provenance };
  }
}

export const locationService = new LocationService();
