import { candidateRepository } from '../repositories/candidate.repository.js';
import { dataSourceRepository } from '../repositories/data-source.repository.js';
import { createLocationProvider } from '../providers/location/index.js';
import { env } from '../config/environment.js';
import { logger } from '../lib/logger.js';
import { LocationCandidate, Competitor } from '@prisma/client';
import { DataProvenance } from '../providers/location/location-provider.interface.js';
import { resolveCompetitorTypes, type CompetitionCount } from '../lib/competitor-types.js';
import { providerRetentionService } from './provider-retention.service.js';
import type { PlaceSummary } from '../providers/location/location-provider.interface.js';
import { distanceMeters } from '../lib/location-context.js';

/** Results one search returns before the total becomes a ceiling. */
const PAGE_SIZE = 20;

/**
 * How far the census may subdivide, and how many calls it may spend.
 *
 * Each level multiplies the tiles by four, and each tile is a billed request,
 * so the budget is the real limit (PROJECT_MASTER_SPEC.md §22). Reaching it
 * marks the count as a floor rather than pretending the census finished.
 */
const MAX_CENSUS_DEPTH = 3;
const MAX_CENSUS_CALLS = 45;

/** Below this a tile is smaller than the error in the coordinates. */
const MIN_TILE_RADIUS_METERS = 120;

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
   * Census the competitors around a point.
   *
   * A single search returns at most twenty results, which is a ceiling and not
   * a count: around one Depok premises it reported twenty laundries when a
   * census found 267. Reporting the ceiling as the total is the most damaging
   * error this product can make, because it tells someone a full market is
   * empty.
   *
   * So a full page of results is treated as a signal to look closer: the circle
   * is split into quadrants and each is searched again, recursively, until the
   * results stop filling the page or the call budget runs out. A sparse area
   * costs one call per type; only crowded ground is subdivided.
   */
  async searchCompetitorsForProject(
    projectId: string,
    categories: string[],
    latitude: number,
    longitude: number,
    radiusMeters: number
  ): Promise<{ competitors: Competitor[]; count: CompetitionCount; provenance: DataProvenance | null }> {
    // Expire stale provider content before writing new rows, so the sweep runs
    // on the same schedule as the work that creates the obligation.
    await providerRetentionService.sweep();

    const types = resolveCompetitorTypes(categories);
    const origin = { latitude, longitude };

    logger.info(
      { projectId, categories, types, radiusMeters, provider: this.provider.providerName },
      'Starting competitor census'
    );

    if (types.length === 0) {
      // Better to measure nothing than to measure the wrong thing: an unmatched
      // trade previously fell back to a broad type and reported a confident,
      // meaningless number.
      logger.warn({ projectId, categories }, 'No Google Places type matches this business');
      return {
        competitors: [],
        count: {
          found: 0,
          capped: false,
          radiusMeters,
          nearestMeters: null,
          searchable: false,
          apiCalls: 0,
          censusComplete: false,
        },
        provenance: null,
      };
    }

    const found = new Map<string, { place: PlaceSummary; distance: number }>();
    const state = { calls: 0, exhausted: false, provenance: null as DataProvenance | null };

    for (const type of types) {
      await this.censusTile(projectId, type, origin, radiusMeters, 0, found, state);
    }

    const ordered = [...found.values()].sort((a, b) => a.distance - b.distance);

    const competitors: Competitor[] = [];
    for (const { place, distance } of ordered) {
      competitors.push(
        await candidateRepository.addCompetitor({
          projectId,
          name: place.name,
          address: place.address,
          category: place.category,
          latitude: place.location.latitude,
          longitude: place.location.longitude,
          placeId: place.placeId,
          distanceMeters: distance,
          rating: place.rating,
          reviewCount: place.reviewCount,
        })
      );
    }

    logger.info(
      { projectId, found: ordered.length, apiCalls: state.calls, complete: !state.exhausted },
      'Finished competitor census'
    );

    return {
      competitors,
      count: {
        found: ordered.length,
        // After a census, "capped" no longer means the ceiling was touched; it
        // means the census could not finish, so the total is a floor.
        capped: state.exhausted,
        radiusMeters,
        nearestMeters: ordered[0]?.distance ?? null,
        searchable: true,
        apiCalls: state.calls,
        censusComplete: !state.exhausted,
      },
      provenance: state.provenance,
    };
  }

  /**
   * Search one tile, and split it when the result fills the page.
   *
   * The four child circles overlap deliberately: quadrant centres at 0.7r with
   * radius 0.75r leave no gap at the tile corners, and the placeId map absorbs
   * the double counting.
   */
  private async censusTile(
    projectId: string,
    type: string,
    centre: { latitude: number; longitude: number },
    radiusMeters: number,
    depth: number,
    found: Map<string, { place: PlaceSummary; distance: number }>,
    state: { calls: number; exhausted: boolean; provenance: DataProvenance | null }
  ): Promise<void> {
    if (state.calls >= MAX_CENSUS_CALLS) {
      state.exhausted = true;
      return;
    }

    let places: PlaceSummary[];
    try {
      state.calls += 1;
      const result = await this.provider.searchNearbyPlaces({
        location: centre,
        radiusMeters,
        includedTypes: [type],
        maxResults: PAGE_SIZE,
        rankByDistance: true,
      });

      places = result.data;
      state.provenance ??= result.provenance;

      await dataSourceRepository.record(result.provenance, {
        projectId,
        metadata: {
          operation: 'competitorCensus',
          type,
          depth,
          radiusMeters: Math.round(radiusMeters),
          resultCount: places.length,
        },
      });
    } catch (error) {
      // A failed tile leaves a hole in the census, so the count becomes a floor
      // rather than silently reading as "few competitors here".
      logger.warn({ err: error, projectId, type, depth }, 'Competitor census tile failed');
      state.exhausted = true;
      return;
    }

    for (const place of places) {
      if (!place.placeId || found.has(place.placeId)) continue;
      found.set(place.placeId, {
        place,
        distance: Math.round(
          distanceMeters(
            centre.latitude,
            centre.longitude,
            place.location.latitude,
            place.location.longitude
          )
        ),
      });
    }

    const pageIsFull = places.length >= PAGE_SIZE;
    if (!pageIsFull) return;

    if (depth >= MAX_CENSUS_DEPTH || radiusMeters <= MIN_TILE_RADIUS_METERS) {
      // Still full at the finest tile we will search: the rest is uncounted.
      state.exhausted = true;
      return;
    }

    const offset = radiusMeters * 0.7;
    const dLat = offset / 111_320;
    const dLon = offset / (111_320 * Math.cos((centre.latitude * Math.PI) / 180));

    for (const [ns, ew] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      await this.censusTile(
        projectId,
        type,
        { latitude: centre.latitude + ns * dLat, longitude: centre.longitude + ew * dLon },
        radiusMeters * 0.75,
        depth + 1,
        found,
        state
      );
    }
  }
}

export const locationService = new LocationService();
