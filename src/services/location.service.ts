import { candidateRepository } from '../repositories/candidate.repository.js';
import { dataSourceRepository } from '../repositories/data-source.repository.js';
import { createLocationProvider } from '../providers/location/index.js';
import { env } from '../config/environment.js';
import { logger } from '../lib/logger.js';
import { LocationCandidate, Competitor } from '@prisma/client';
import { DataProvenance } from '../providers/location/location-provider.interface.js';
import { resolveCompetitorTypes, type CompetitionCount } from '../lib/competitor-types.js';
import { distanceMeters } from '../lib/location-context.js';

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
   * Find the competitors around a point, and say how confident the count is.
   *
   * Searches by Google Places type, nearest first, one call per type. The
   * previous version passed the client's free-text category with a hardcoded
   * `type: 'store'`, which under strict type filtering matched nothing for most
   * trades — a laundry surrounded by twenty laundries came back with one.
   *
   * Returns the count alongside the competitors because a result that hit the
   * provider's ceiling means "at least this many", and that distinction is what
   * separates a saturated market from an empty one.
   */
  async searchCompetitorsForProject(
    projectId: string,
    categories: string[],
    latitude: number,
    longitude: number,
    radiusMeters: number
  ): Promise<{ competitors: Competitor[]; count: CompetitionCount; provenance: DataProvenance | null }> {
    const types = resolveCompetitorTypes(categories);
    const origin = { latitude, longitude };

    logger.info(
      { projectId, categories, types, provider: this.provider.providerName },
      'Searching competitors'
    );

    if (types.length === 0) {
      // Better to measure nothing than to measure the wrong thing: an
      // unmatched trade previously fell back to a broad type and reported a
      // confident, meaningless number.
      logger.warn({ projectId, categories }, 'No Google Places type matches this business');
      return {
        competitors: [],
        count: { found: 0, capped: false, radiusMeters, nearestMeters: null, searchable: false },
        provenance: null,
      };
    }

    const byPlaceId = new Map<string, { place: any; distance: number }>();
    let provenance: DataProvenance | null = null;
    let capped = false;

    for (const type of types) {
      try {
        const result = await this.provider.searchNearbyPlaces({
          location: origin,
          radiusMeters,
          includedTypes: [type],
          maxResults: 20,
          rankByDistance: true,
        });

        provenance ??= result.provenance;
        // Twenty is the provider's ceiling, so a full page means the real
        // number is unknown and larger.
        if (result.data.length >= 20) capped = true;

        await dataSourceRepository.record(result.provenance, {
          projectId,
          metadata: { operation: 'searchCompetitors', type, radiusMeters, resultCount: result.data.length },
        });

        for (const place of result.data) {
          if (!place.placeId || byPlaceId.has(place.placeId)) continue;
          byPlaceId.set(place.placeId, {
            place,
            distance: Math.round(
              distanceMeters(latitude, longitude, place.location.latitude, place.location.longitude)
            ),
          });
        }
      } catch (error) {
        // One type failing must not silently shrink the count; it is logged so
        // a systematically failing type is visible rather than read as "few
        // competitors here".
        logger.warn({ err: error, projectId, type }, 'Competitor search failed for a type');
      }
    }

    const found = [...byPlaceId.values()].sort((a, b) => a.distance - b.distance);

    const competitors: Competitor[] = [];
    for (const { place } of found) {
      competitors.push(
        await candidateRepository.addCompetitor({
          projectId,
          name: place.name,
          address: place.address,
          category: place.category,
          latitude: place.location.latitude,
          longitude: place.location.longitude,
          placeId: place.placeId,
          rating: place.rating,
          reviewCount: place.reviewCount,
        })
      );
    }

    return {
      competitors,
      count: {
        found: found.length,
        capped,
        radiusMeters,
        nearestMeters: found[0]?.distance ?? null,
        searchable: true,
      },
      provenance,
    };
  }
}

export const locationService = new LocationService();
