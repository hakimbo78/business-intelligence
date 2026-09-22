import { env } from '../config/environment.js';
import { createLocationProvider } from '../providers/location/index.js';
import { dataSourceRepository } from '../repositories/data-source.repository.js';
import {
  CATCHMENT_FACILITIES,
  NOT_MEASURED,
  distanceMeters,
  type LocationContext,
  type NearestFacility,
} from '../lib/location-context.js';
import { logger } from '../lib/logger.js';

/** Far enough that "nothing found" means something, close enough to matter. */
const SEARCH_RADIUS_METERS = 3000;

/**
 * Establish what is around a location, from the map provider.
 *
 * Replaces the mock demographic and trends providers, whose figures were
 * identical for every location on earth and were nonetheless printed in
 * customer reports as findings about the customer's own neighbourhood.
 */
export class LocationContextService {
  private locationProvider = createLocationProvider(env.MAP_PROVIDER);

  async describe(
    location: { latitude: number; longitude: number },
    projectId?: string
  ): Promise<LocationContext> {
    const facilities: NearestFacility[] = [];

    for (const facility of CATCHMENT_FACILITIES) {
      try {
        const result = await this.locationProvider.searchPlaces({
          query: facility.label,
          location,
          radiusMeters: SEARCH_RADIUS_METERS,
          type: facility.types[0],
          maxResults: 20,
        });

        if (projectId) {
          await dataSourceRepository.record(result.provenance, {
            projectId,
            metadata: { operation: 'catchment', facility: facility.key },
          });
        }

        // Only the nearest matters. Counts are capped by the provider, so a
        // tally here would be a ceiling rather than a measurement.
        const nearest = result.data
          .map((p) => ({
            name: p.name,
            distance: Math.round(
              distanceMeters(location.latitude, location.longitude, p.location.latitude, p.location.longitude)
            ),
          }))
          .sort((a, b) => a.distance - b.distance)[0];

        facilities.push({
          key: facility.key,
          label: facility.label,
          distanceMeters: nearest?.distance ?? null,
          name: nearest?.name ?? null,
        });
      } catch (error) {
        // One facility type failing must not lose the whole catchment.
        logger.warn(
          { err: error, facility: facility.key },
          'Could not establish distance to facility'
        );
        facilities.push({
          key: facility.key,
          label: facility.label,
          distanceMeters: null,
          name: null,
        });
      }
    }

    logger.info(
      {
        projectId,
        found: facilities.filter((f) => f.distanceMeters !== null).length,
        of: facilities.length,
      },
      'Established location catchment'
    );

    return {
      facilities,
      searchRadiusMeters: SEARCH_RADIUS_METERS,
      notMeasured: NOT_MEASURED,
    };
  }
}

export const locationContextService = new LocationContextService();
