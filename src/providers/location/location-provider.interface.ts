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
  /** The road the address sits on, when the provider reports one. */
  roadName?: string;
  /** How precisely the address was located, e.g. ROOFTOP. */
  precision?: string;
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  origin: Coordinates;
  destination: Coordinates;
}

export interface StreetViewAvailability {
  available: boolean;
  /** Where the camera actually stands, which is rarely the address itself. */
  panoramaLocation?: Coordinates;
  /** Capture date as the provider reports it, e.g. "2023-05". */
  captureDate?: string;
  /** The provider's own status word, for logging. */
  status: string;
}

/** A rendered image, carried as a data: URI so no API key reaches the PDF. */
export interface RenderedImage {
  dataUri: string;
  widthPx: number;
  heightPx: number;
}

export interface StreetViewParams {
  location: Coordinates;
  /** Compass bearing to aim the camera. Omitted means the provider decides. */
  headingDegrees?: number;
  widthPx?: number;
  heightPx?: number;
}

export interface StaticMapMarker {
  location: Coordinates;
  label: string;
  /** A named colour the provider understands, e.g. "red". */
  colour: string;
}

export interface StaticMapParams {
  center: Coordinates;
  zoom: number;
  markers: StaticMapMarker[];
  widthPx?: number;
  heightPx?: number;
}

export interface SearchPlacesParams {
  query: string;
  /** Attributes the call's cost to a project, for the budget ceiling. */
  projectId?: string;
  /** Ask for rating and review count, which costs the Enterprise SKU. */
  includeRatings?: boolean;
  location: Coordinates;
  radiusMeters: number;
  type?: string;
  maxResults?: number;
}

export interface SearchNearbyParams {
  location: Coordinates;
  /** Attributes the call's cost to a project, for the budget ceiling. */
  projectId?: string;
  /**
   * Ask for rating and review count.
   *
   * Off by default, and deliberately so: those two fields move the request to
   * the Enterprise SKU, whose free allowance is a fifth the size. A census
   * counting competitors does not need them.
   */
  includeRatings?: boolean;
  radiusMeters: number;
  /** Google Places types. Results match any of them. */
  includedTypes: string[];
  maxResults?: number;
  /**
   * Return the closest first rather than the most "prominent".
   *
   * Relevance ranking answers a different question: asked for supermarkets near
   * a Depok street it offers one 11 km away because it is a bigger name.
   */
  rankByDistance?: boolean;
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
   * Find places of given types around a point, nearest first.
   *
   * Distinct from `searchPlaces`, which matches free text: counting the
   * competitors around a premises needs a type filter and distance ordering,
   * and a text search gives neither reliably.
   */
  searchNearbyPlaces(params: SearchNearbyParams): Promise<ProviderResult<PlaceSummary[]>>;

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

  /**
   * Whether a street-level photograph exists at all, and how old it is.
   *
   * Kept separate from fetching the image because on Google this lookup is
   * free and unmetered while the image is billed: asking first means an
   * address with no coverage — common down an Indonesian gang — never costs
   * anything (PROJECT_MASTER_SPEC.md §22).
   */
  getStreetViewAvailability(
    params: { location: Coordinates }
  ): Promise<ProviderResult<StreetViewAvailability>>;

  /** Fetch the street-level photograph itself. */
  getStreetViewImage(params: StreetViewParams): Promise<ProviderResult<RenderedImage>>;

  /** Render a map of the area with the given points pinned. */
  getStaticMap(params: StaticMapParams): Promise<ProviderResult<RenderedImage>>;
}
