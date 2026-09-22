import { env } from '../../config/environment.js';
import {
  LocationProvider,
  SearchPlacesParams,
  GetPlaceDetailsParams,
  GeocodeParams,
  CalculateRouteParams,
  ProviderResult,
  PlaceSummary,
  PlaceDetails,
  GeocodingResult,
  RouteResult,
} from './location-provider.interface.js';
import { logger } from '../../lib/logger.js';
import { describeGoogleMapsFailure, LocationProviderError } from './location-provider.error.js';

/**
 * Google Maps Platform, via the current REST APIs.
 *
 * Deliberately not the `@googlemaps/google-maps-services-js` SDK: that client
 * speaks only the legacy endpoints, which require a billing account even for
 * their free tier. The APIs used here — Geocoding v4, Places (New) and Routes —
 * also work with a Maps Platform demo key, so the platform can be exercised
 * before billing is set up.
 *
 * The demo key is for prototyping only; production needs a billed, restricted
 * key (PROJECT_MASTER_SPEC.md §26).
 */

const GEOCODE_URL = 'https://geocode.googleapis.com/v4/geocode/address';
const PLACES_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const PLACE_DETAILS_URL = 'https://places.googleapis.com/v1/places';
const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

/** Fields requested from Places. Asking for less costs less (§22). */
const PLACE_SUMMARY_FIELDS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.primaryType',
].join(',');

const PLACE_DETAIL_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'rating',
  'userRatingCount',
  'primaryType',
  'types',
  'nationalPhoneNumber',
  'websiteUri',
  'regularOpeningHours',
  'priceLevel',
].join(',');

interface GeocodeV4Response {
  results?: Array<{
    placeId?: string;
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    granularity?: string;
    addressComponents?: Array<{ longText?: string; types?: string[] }>;
  }>;
}

interface PlaceResource {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  types?: string[];
  nationalPhoneNumber?: string;
  websiteUri?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  priceLevel?: string;
}

interface RoutesResponse {
  routes?: Array<{ distanceMeters?: number; duration?: string }>;
}

/** Google returns durations as a string of seconds, e.g. "1234s". */
function parseDurationSeconds(duration?: string): number {
  if (!duration) return 0;
  const seconds = Number(duration.replace(/s$/, ''));
  return Number.isFinite(seconds) ? seconds : 0;
}

/** Places (New) reports price level as an enum rather than a number. */
const PRICE_LEVELS: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

export class GoogleMapsProvider implements LocationProvider {
  readonly providerName = 'GoogleMapsProvider';

  constructor() {
    if (!env.GOOGLE_MAPS_API_KEY) {
      logger.warn('GoogleMapsProvider initialized without GOOGLE_MAPS_API_KEY');
    }
  }

  private get key(): string {
    if (!env.GOOGLE_MAPS_API_KEY) {
      throw new Error('GOOGLE_MAPS_API_KEY is not configured');
    }
    return env.GOOGLE_MAPS_API_KEY;
  }

  /**
   * Issue a request and turn any failure into an actionable error.
   *
   * The response body is parsed before the status is checked, because Google
   * puts the useful explanation in the body rather than the status line.
   */
  private async request<T>(
    url: string,
    init: RequestInit,
    operation: string
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      // Network-level failure: no body to read.
      throw new LocationProviderError(
        `Could not reach Google Maps for ${operation}: ${(error as Error).message}`,
        { provider: this.providerName, operation, cause: error }
      );
    }

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      throw describeGoogleMapsFailure(
        { response: { status: response.status, data: body } },
        operation
      );
    }

    return body as T;
  }

  private provenance(dataType: string) {
    return {
      source: this.providerName,
      retrievedAt: new Date().toISOString(),
      dataType,
      confidence: 'HIGH' as const,
    };
  }

  async searchPlaces(params: SearchPlacesParams): Promise<ProviderResult<PlaceSummary[]>> {
    const body = await this.request<{ places?: PlaceResource[] }>(
      PLACES_SEARCH_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.key,
          'X-Goog-FieldMask': PLACE_SUMMARY_FIELDS,
        },
        body: JSON.stringify({
          textQuery: params.query,
          maxResultCount: Math.min(params.maxResults ?? 20, 20),
          // Without these the call is a free-text name match, so a street named
          // "Jalan Sekolah" comes back as the nearest school.
          ...(params.type
            ? { includedType: params.type, strictTypeFiltering: true }
            : {}),
          locationBias: {
            circle: {
              center: {
                latitude: params.location.latitude,
                longitude: params.location.longitude,
              },
              radius: params.radiusMeters,
            },
          },
        }),
      },
      'searchPlaces'
    );

    const places: PlaceSummary[] = (body.places ?? []).map((p) => ({
      placeId: p.id ?? '',
      name: p.displayName?.text ?? '',
      address: p.formattedAddress ?? '',
      location: {
        latitude: p.location?.latitude ?? 0,
        longitude: p.location?.longitude ?? 0,
      },
      category: p.primaryType ?? params.type ?? 'unknown',
      rating: p.rating,
      reviewCount: p.userRatingCount,
    }));

    return { data: places, provenance: this.provenance('search_places') };
  }

  async getPlaceDetails(params: GetPlaceDetailsParams): Promise<ProviderResult<PlaceDetails>> {
    const place = await this.request<PlaceResource>(
      `${PLACE_DETAILS_URL}/${encodeURIComponent(params.placeId)}`,
      {
        headers: {
          'X-Goog-Api-Key': this.key,
          'X-Goog-FieldMask': params.fields?.join(',') ?? PLACE_DETAIL_FIELDS,
        },
      },
      'getPlaceDetails'
    );

    return {
      data: {
        placeId: place.id ?? params.placeId,
        name: place.displayName?.text ?? '',
        address: place.formattedAddress ?? '',
        location: {
          latitude: place.location?.latitude ?? 0,
          longitude: place.location?.longitude ?? 0,
        },
        category: place.primaryType ?? 'unknown',
        phone: place.nationalPhoneNumber,
        website: place.websiteUri,
        openingHours: place.regularOpeningHours?.weekdayDescriptions,
        priceLevel: place.priceLevel ? PRICE_LEVELS[place.priceLevel] : undefined,
        types: place.types ?? [],
        rating: place.rating,
        reviewCount: place.userRatingCount,
      },
      provenance: this.provenance('place_details'),
    };
  }

  async geocode(params: GeocodeParams): Promise<ProviderResult<GeocodingResult>> {
    const body = await this.request<GeocodeV4Response>(
      `${GEOCODE_URL}/${encodeURIComponent(params.address)}?key=${encodeURIComponent(this.key)}`,
      { method: 'GET' },
      'geocode'
    );

    const first = body.results?.[0];
    if (!first?.location) {
      // An address with no match is a data outcome, not a fault: say so rather
      // than returning coordinates of 0,0 in the middle of the ocean.
      throw new LocationProviderError(
        `Google Maps found no location for "${params.address}".`,
        { provider: this.providerName, operation: 'geocode' }
      );
    }

    return {
      data: {
        formattedAddress: first.formattedAddress ?? params.address,
        location: {
          latitude: first.location.latitude ?? 0,
          longitude: first.location.longitude ?? 0,
        },
        placeId: first.placeId ?? '',
        // The road name carries real information in Indonesia: "Gang" is an
        // alley, "Raya" is usually a through road.
        roadName: first.addressComponents?.find((c) => c.types?.includes('route'))?.longText,
        precision: first.granularity,
      },
      provenance: this.provenance('geocoding'),
    };
  }

  async calculateRoute(params: CalculateRouteParams): Promise<ProviderResult<RouteResult>> {
    const body = await this.request<RoutesResponse>(
      ROUTES_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.key,
          'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
        },
        body: JSON.stringify({
          origin: {
            location: {
              latLng: {
                latitude: params.origin.latitude,
                longitude: params.origin.longitude,
              },
            },
          },
          destination: {
            location: {
              latLng: {
                latitude: params.destination.latitude,
                longitude: params.destination.longitude,
              },
            },
          },
          travelMode: params.travelMode ?? 'DRIVE',
        }),
      },
      'calculateRoute'
    );

    const route = body.routes?.[0];
    if (!route) {
      throw new LocationProviderError(
        'Google Maps found no route between those points.',
        { provider: this.providerName, operation: 'calculateRoute' }
      );
    }

    return {
      data: {
        distanceMeters: route.distanceMeters ?? 0,
        durationSeconds: parseDurationSeconds(route.duration),
        origin: params.origin,
        destination: params.destination,
      },
      provenance: this.provenance('routing'),
    };
  }
}
