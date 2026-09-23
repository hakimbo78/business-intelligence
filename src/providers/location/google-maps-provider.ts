import { env } from '../../config/environment.js';
import {
  LocationProvider,
  SearchPlacesParams,
  SearchNearbyParams,
  GetPlaceDetailsParams,
  GeocodeParams,
  CalculateRouteParams,
  ProviderResult,
  Coordinates,
  PlaceSummary,
  PlaceDetails,
  GeocodingResult,
  RouteResult,
  StreetViewAvailability,
  StreetViewParams,
  StaticMapParams,
  RenderedImage,
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
const PLACES_NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';
const PLACE_DETAILS_URL = 'https://places.googleapis.com/v1/places';
const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

/**
 * Imagery endpoints.
 *
 * Unlike the APIs above, these are the older billed services: they refuse a
 * demo key and require billing enabled on the project. The metadata endpoint is
 * the exception — Google does not charge for it, which is why every image
 * request here is preceded by one.
 */
const STREET_VIEW_METADATA_URL = 'https://maps.googleapis.com/maps/api/streetview/metadata';
const STREET_VIEW_IMAGE_URL = 'https://maps.googleapis.com/maps/api/streetview';
const STATIC_MAP_URL = 'https://maps.googleapis.com/maps/api/staticmap';

/** Largest size Google serves without the premium plan. */
const MAX_IMAGE_PX = 640;

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

  async searchNearbyPlaces(params: SearchNearbyParams): Promise<ProviderResult<PlaceSummary[]>> {
    const body = await this.request<{ places?: PlaceResource[] }>(
      PLACES_NEARBY_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.key,
          'X-Goog-FieldMask': PLACE_SUMMARY_FIELDS,
        },
        body: JSON.stringify({
          includedTypes: params.includedTypes,
          maxResultCount: Math.min(params.maxResults ?? 20, 20),
          ...(params.rankByDistance ? { rankPreference: 'DISTANCE' } : {}),
          // A restriction, not a bias: a competitor outside the radius is not a
          // competitor, and bias lets one in from the next city.
          locationRestriction: {
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
      'searchNearbyPlaces'
    );

    const places: PlaceSummary[] = (body.places ?? []).map((p) => ({
      placeId: p.id ?? '',
      name: p.displayName?.text ?? '',
      address: p.formattedAddress ?? '',
      location: {
        latitude: p.location?.latitude ?? 0,
        longitude: p.location?.longitude ?? 0,
      },
      category: p.primaryType ?? 'unknown',
      rating: p.rating,
      reviewCount: p.userRatingCount,
    }));

    return { data: places, provenance: this.provenance('search_nearby') };
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

  /**
   * Fetch an image and return it as a data: URI.
   *
   * Google answers an unavailable image with a 200 and an HTML or JSON error
   * body rather than an error status, so the content type is checked before the
   * bytes are trusted.
   */
  private async fetchImage(
    url: string,
    operation: string,
    widthPx: number,
    heightPx: number
  ): Promise<RenderedImage> {
    let response: Response;
    try {
      response = await fetch(url);
    } catch (error) {
      throw new LocationProviderError(
        `Could not reach Google Maps for ${operation}: ${(error as Error).message}`,
        { provider: this.providerName, operation, cause: error }
      );
    }

    const contentType = response.headers.get('content-type') ?? '';

    if (!response.ok || !contentType.startsWith('image/')) {
      const body = await response.text().catch(() => '');
      throw new LocationProviderError(
        `Google Maps declined ${operation} (HTTP ${response.status}). ${body.slice(0, 200)}`,
        { provider: this.providerName, operation }
      );
    }

    const bytes = Buffer.from(await response.arrayBuffer());

    return {
      dataUri: `data:${contentType.split(';')[0]};base64,${bytes.toString('base64')}`,
      widthPx,
      heightPx,
    };
  }

  async getStreetViewAvailability(params: {
    location: Coordinates;
  }): Promise<ProviderResult<StreetViewAvailability>> {
    const url =
      `${STREET_VIEW_METADATA_URL}?location=${params.location.latitude},${params.location.longitude}` +
      `&key=${encodeURIComponent(this.key)}`;

    const body = await this.request<{
      status?: string;
      date?: string;
      location?: { lat?: number; lng?: number };
    }>(url, { method: 'GET' }, 'getStreetViewAvailability');

    const status = body.status ?? 'UNKNOWN';

    // ZERO_RESULTS means Google looked and found nothing there, which is a
    // finding. REQUEST_DENIED means the API is not enabled, which is a fault —
    // and the two must not be reported to the customer as the same thing.
    if (status !== 'OK' && status !== 'ZERO_RESULTS') {
      throw new LocationProviderError(
        `Street View metadata returned ${status}. The Street View Static API may not be ` +
          'enabled, or billing may not be active on the Google Cloud project.',
        { provider: this.providerName, operation: 'getStreetViewAvailability' }
      );
    }

    return {
      data: {
        available: status === 'OK',
        status,
        captureDate: body.date,
        panoramaLocation:
          body.location?.lat !== undefined && body.location?.lng !== undefined
            ? { latitude: body.location.lat, longitude: body.location.lng }
            : undefined,
      },
      provenance: this.provenance('street_view_metadata'),
    };
  }

  async getStreetViewImage(params: StreetViewParams): Promise<ProviderResult<RenderedImage>> {
    const width = Math.min(params.widthPx ?? 640, MAX_IMAGE_PX);
    const height = Math.min(params.heightPx ?? 400, MAX_IMAGE_PX);

    const query = new URLSearchParams({
      size: `${width}x${height}`,
      location: `${params.location.latitude},${params.location.longitude}`,
      fov: '80',
      pitch: '0',
      // Without this Google bills for, and returns, a grey "no imagery" tile.
      return_error_code: 'true',
      key: this.key,
    });

    if (params.headingDegrees !== undefined) {
      query.set('heading', String(Math.round(params.headingDegrees)));
    }

    const image = await this.fetchImage(
      `${STREET_VIEW_IMAGE_URL}?${query.toString()}`,
      'getStreetViewImage',
      width,
      height
    );

    return { data: image, provenance: this.provenance('street_view_image') };
  }

  async getStaticMap(params: StaticMapParams): Promise<ProviderResult<RenderedImage>> {
    const width = Math.min(params.widthPx ?? 640, MAX_IMAGE_PX);
    const height = Math.min(params.heightPx ?? 480, MAX_IMAGE_PX);

    const query = new URLSearchParams({
      size: `${width}x${height}`,
      center: `${params.center.latitude},${params.center.longitude}`,
      zoom: String(params.zoom),
      scale: '2',
      maptype: 'roadmap',
      language: 'id',
      region: 'ID',
      key: this.key,
    });

    // URLSearchParams escapes the pipes Google's marker syntax needs, so the
    // markers are appended by hand after the rest is encoded.
    const markers = params.markers
      .map(
        (m) =>
          `&markers=${encodeURIComponent(`color:${m.colour}|label:${m.label}|` +
            `${m.location.latitude},${m.location.longitude}`)}`
      )
      .join('');

    const image = await this.fetchImage(
      `${STATIC_MAP_URL}?${query.toString()}${markers}`,
      'getStaticMap',
      width,
      height
    );

    return { data: image, provenance: this.provenance('static_map') };
  }
}
