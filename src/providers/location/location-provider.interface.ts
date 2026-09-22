/**
 * Location Provider Interface
 *
 * Per PROJECT_MASTER_SPEC.md §20 and DEVELOPMENT_RULES.md §5:
 * Business logic must not be tightly coupled to any specific map provider.
 * All external providers go through this interface.
 *
 * ```text
 * LocationProvider
 *   ├─ MockLocationProvider   (development)
 *   └─ GoogleMapsProvider     (staging/production)
 * ```
 *
 * Phase 0: Interface definition + stubs only.
 * Phase 2: Full MockLocationProvider + GoogleMapsProvider implementation.
 */

// --- Common Types ---

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface PlaceSummary {
  placeId: string;
  name: string;
  address: string;
  location: Coordinates;
  category: string;
  rating?: number;
  reviewCount?: number;
}

export interface PlaceDetails extends PlaceSummary {
  phone?: string;
  website?: string;
  openingHours?: string[];
  priceLevel?: number;
  types: string[];
}

export interface GeocodingResult {
  formattedAddress: string;
  location: Coordinates;
  placeId: string;
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  origin: Coordinates;
  destination: Coordinates;
}

export interface SearchPlacesParams {
  query: string;
  location: Coordinates;
  radiusMeters: number;
  type?: string;
  maxResults?: number;
}

export interface GetPlaceDetailsParams {
  placeId: string;
  /** Field mask to minimize API cost (per MASTER_SPEC §22) */
  fields?: string[];
}

export interface GeocodeParams {
  address: string;
}

export interface CalculateRouteParams {
  origin: Coordinates;
  destination: Coordinates;
  travelMode?: 'DRIVE' | 'WALK' | 'TRANSIT';
}

// --- Data Provenance ---

/**
 * Per DEVELOPMENT_RULES.md §10:
 * All external data must have source traceability.
 */
export interface DataProvenance {
  source: string;
  retrievedAt: string;
  geographicScope?: string;
  dataType: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * Wraps provider results with data provenance metadata.
 */
export interface ProviderResult<T> {
  data: T;
  provenance: DataProvenance;
}

// --- Provider Interface ---

export interface LocationProvider {
  /** Provider name for logging and traceability */
  readonly providerName: string;

  /**
   * Search for places near a location.
   * Maps to: Google Places API (Text Search / Nearby Search)
   */
  searchPlaces(params: SearchPlacesParams): Promise<ProviderResult<PlaceSummary[]>>;

  /**
   * Get detailed information about a specific place.
   * Maps to: Google Places API (Place Details)
   */
  getPlaceDetails(params: GetPlaceDetailsParams): Promise<ProviderResult<PlaceDetails>>;

  /**
   * Convert an address to coordinates.
   * Maps to: Google Geocoding API
   */
  geocode(params: GeocodeParams): Promise<ProviderResult<GeocodingResult>>;

  /**
   * Calculate route between two points.
   * Maps to: Google Routes API
   */
  calculateRoute(params: CalculateRouteParams): Promise<ProviderResult<RouteResult>>;
}
