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
import { chooseFacility } from '../lib/facility-validation.js';
import { resolveTradeProfile, type TradeProfile } from '../lib/trade-profile.js';

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
    projectId?: string,
    profile?: TradeProfile
  ): Promise<LocationContext> {
    const trade = profile ?? resolveTradeProfile([]);
    const facilities: NearestFacility[] = [];

    for (const facility of CATCHMENT_FACILITIES) {
      try {
        const result = await this.locationProvider.searchPlaces({
          query: facility.label,
          location,
          radiusMeters: SEARCH_RADIUS_METERS,
          type: facility.types[0],
          maxResults: 20,
          projectId,
        });

        if (projectId) {
          await dataSourceRepository.record(result.provenance, {
            projectId,
            metadata: { operation: 'catchment', facility: facility.key },
          });
        }

        // The nearest result is often not the facility at all: the provider
        // returned a vet as the nearest hospital and a road as the nearest
        // station. So every candidate is checked by name and the nearest
        // plausible one wins (see facility-validation.ts). Counts are capped by
        // the provider, so a tally here would be a ceiling, not a measurement.
        const candidates = result.data
          .filter((p) => p.name)
          .map((p) => ({
            name: p.name,
            distanceMeters: Math.round(
              distanceMeters(location.latitude, location.longitude, p.location.latitude, p.location.longitude)
            ),
          }));

        const chosen = chooseFacility(facility.key, candidates);

        if (chosen.rejected > 0) {
          logger.info(
            { projectId, facility: facility.key, rejected: chosen.rejected, chosen: chosen.name },
            'Discarded map results whose names contradict their category'
          );
        }

        facilities.push({
          key: facility.key,
          label: facility.label,
          distanceMeters: chosen.distanceMeters,
          name: chosen.name,
          confidence: chosen.confidence,
          rejected: chosen.rejected,
          isDemandDriver: trade.demandDrivers.includes(facility.key),
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
          confidence: 'UNVERIFIED',
          rejected: 0,
          isDemandDriver: trade.demandDrivers.includes(facility.key),
        });
      }
    }

    logger.info(
      {
        projectId,
        found: facilities.filter((f) => f.distanceMeters !== null).length,
        confirmed: facilities.filter((f) => f.confidence === 'CONFIRMED').length,
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
