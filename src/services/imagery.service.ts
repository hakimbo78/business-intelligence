import { env } from '../config/environment.js';
import { createLocationProvider } from '../providers/location/index.js';
import { dataSourceRepository } from '../repositories/data-source.repository.js';
import { logger } from '../lib/logger.js';
import {
  bearing,
  describeImagery,
  imageryCacheKey,
  type LocationImagery,
  type MapShot,
  type StreetViewShot,
} from '../lib/imagery.js';
import { distanceMeters } from '../lib/location-context.js';
import type { Coordinates } from '../providers/location/location-provider.interface.js';

/**
 * Photograph and map of the location under assessment.
 *
 * Three things keep the bill down, which matters because these are the only
 * billed Google products the platform touches (PROJECT_MASTER_SPEC.md §22):
 *
 *  1. The free metadata lookup runs first, so an address with no coverage — a
 *     gang, typically — never requests a billed image.
 *  2. Results are cached for the process lifetime, and then stored inside the
 *     report itself, so regenerating a PDF costs nothing at all.
 *  3. At most two billed requests per report: one photograph, one map.
 *
 * Every failure degrades to a report that says why the picture is missing.
 * A location photograph is worth having; it is not worth failing a paid report
 * over.
 */

/** Competitors pinned on the map. Static Maps labels are a single character. */
const MAX_MAP_MARKERS = 9;

/** Close enough to show the street, wide enough to show the neighbours. */
const MAP_ZOOM = 16;

const DISABLED_REASON =
  'Foto lokasi tidak disertakan: layanan citra Google (Street View / Static Maps) belum ' +
  'diaktifkan untuk sistem ini.';

/** Survives a single process; the report JSON is the durable cache. */
const cache = new Map<string, LocationImagery>();

export class ImageryService {
  private provider: ReturnType<typeof createLocationProvider> | null = null;

  /**
   * Built on first use, not at import.
   *
   * The report agent imports this module, so constructing the provider eagerly
   * would make merely loading the agent fail whenever MAP_PROVIDER is unset.
   */
  private get locationProvider() {
    this.provider ??= createLocationProvider(env.MAP_PROVIDER);
    return this.provider;
  }

  async capture(input: {
    premises: Coordinates;
    competitors?: Array<{ name: string; latitude: number; longitude: number }>;
    projectId?: string;
  }): Promise<LocationImagery> {
    if (!env.ENABLE_LOCATION_IMAGERY) {
      return { streetView: null, map: null, notes: [], unavailableReason: DISABLED_REASON };
    }

    const key = imageryCacheKey(input.premises, `report:${input.competitors?.length ?? 0}`);
    const cached = cache.get(key);
    if (cached) return cached;

    const streetView = await this.captureStreetView(input.premises, input.projectId);
    const map = await this.captureMap(input.premises, input.competitors ?? [], input.projectId);

    const imagery: LocationImagery = {
      streetView,
      map,
      // With nothing to show, the notes would be caveats about images that are
      // not there, so the reason stands alone instead.
      notes: streetView || map ? describeImagery({ streetView, map }) : [],
      unavailableReason:
        streetView || map
          ? null
          : 'Foto dan peta lokasi tidak dapat diambil dari Google saat laporan ini dibuat.',
    };

    cache.set(key, imagery);
    return imagery;
  }

  private async captureStreetView(
    premises: Coordinates,
    projectId?: string
  ): Promise<StreetViewShot | null> {
    try {
      const metadata = await this.locationProvider.getStreetViewAvailability({
        location: premises,
      });

      if (projectId) {
        await dataSourceRepository.record(metadata.provenance, {
          projectId,
          metadata: { operation: 'street_view_metadata', status: metadata.data.status },
        });
      }

      if (!metadata.data.available) {
        logger.info({ projectId, status: metadata.data.status }, 'No Street View imagery here');
        return null;
      }

      // Aim the camera from where it stands towards the premises. Left to
      // Google, the heading is whichever way the car faced.
      const panorama = metadata.data.panoramaLocation;
      const heading = panorama ? bearing(panorama, premises) : undefined;
      const offsetMeters = panorama
        ? Math.round(
            distanceMeters(
              panorama.latitude,
              panorama.longitude,
              premises.latitude,
              premises.longitude
            )
          )
        : null;

      const image = await this.locationProvider.getStreetViewImage({
        location: premises,
        headingDegrees: heading,
        widthPx: 640,
        heightPx: 400,
      });

      if (projectId) {
        await dataSourceRepository.record(image.provenance, {
          projectId,
          metadata: { operation: 'street_view_image' },
        });
      }

      return {
        dataUri: image.data.dataUri,
        captureDate: metadata.data.captureDate ?? null,
        offsetMeters,
      };
    } catch (error) {
      logger.warn({ err: error, projectId }, 'Could not capture Street View imagery');
      return null;
    }
  }

  private async captureMap(
    premises: Coordinates,
    competitors: Array<{ name: string; latitude: number; longitude: number }>,
    projectId?: string
  ): Promise<MapShot | null> {
    // Nearest first: a map of the ten furthest competitors would be a map of
    // somewhere else.
    const nearest = [...competitors]
      .sort(
        (a, b) =>
          distanceMeters(premises.latitude, premises.longitude, a.latitude, a.longitude) -
          distanceMeters(premises.latitude, premises.longitude, b.latitude, b.longitude)
      )
      .slice(0, MAX_MAP_MARKERS);

    try {
      const image = await this.locationProvider.getStaticMap({
        center: premises,
        zoom: MAP_ZOOM,
        widthPx: 620,
        heightPx: 400,
        markers: [
          { location: premises, label: 'A', colour: 'red' },
          ...nearest.map((c, i) => ({
            location: { latitude: c.latitude, longitude: c.longitude },
            label: String(i + 1),
            colour: 'blue',
          })),
        ],
      });

      if (projectId) {
        await dataSourceRepository.record(image.provenance, {
          projectId,
          metadata: { operation: 'static_map', markers: nearest.length + 1 },
        });
      }

      return { dataUri: image.data.dataUri, markedCompetitors: nearest.length };
    } catch (error) {
      logger.warn({ err: error, projectId }, 'Could not render the location map');
      return null;
    }
  }
}

export const imageryService = new ImageryService();
