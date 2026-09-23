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
  Coordinates,
  StreetViewAvailability,
  StreetViewParams,
  StaticMapParams,
  RenderedImage,
} from './location-provider.interface.js';

/**
 * A visibly fake image.
 *
 * Deliberately not a grey rectangle: if a mock image ever reaches a customer's
 * report, it must be unmistakable rather than look like a real photograph of
 * somewhere else.
 */
function placeholderImage(label: string, widthPx: number, heightPx: number): RenderedImage {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}">` +
    `<rect width="100%" height="100%" fill="#dfe6e9"/>` +
    `<text x="50%" y="50%" font-family="sans-serif" font-size="20" fill="#636e72" ` +
    `text-anchor="middle">CONTOH (MOCK) - ${label}</text></svg>`;

  return {
    dataUri: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    widthPx,
    heightPx,
  };
}

export class MockLocationProvider implements LocationProvider {
  readonly providerName = 'MockLocationProvider';

  async searchPlaces(params: SearchPlacesParams): Promise<ProviderResult<PlaceSummary[]>> {
    return {
      data: [
        {
          placeId: 'mock-place-1',
          name: 'Janji Jiwa Kemang',
          address: 'Jl. Kemang Raya No. 1, Jakarta Selatan',
          location: { latitude: params.location.latitude + 0.001, longitude: params.location.longitude + 0.001 },
          category: params.type || 'cafe',
          rating: 4.5,
          reviewCount: 120,
        },
        {
          placeId: 'mock-place-2',
          name: 'Kopi Kenangan Kemang',
          address: 'Jl. Kemang Raya No. 2, Jakarta Selatan',
          location: { latitude: params.location.latitude - 0.001, longitude: params.location.longitude - 0.001 },
          category: params.type || 'cafe',
          rating: 4.7,
          reviewCount: 350,
        },
      ],
      provenance: {
        source: this.providerName,
        retrievedAt: new Date().toISOString(),
        dataType: 'search_places',
        confidence: 'HIGH',
      },
    };
  }

  async getPlaceDetails(params: GetPlaceDetailsParams): Promise<ProviderResult<PlaceDetails>> {
    return {
      data: {
        placeId: params.placeId,
        name: 'Mock Place Details',
        address: 'Jl. Mock Address No. 1',
        location: { latitude: -6.261, longitude: 106.816 },
        category: 'cafe',
        phone: '+6281234567890',
        website: 'https://example.com',
        openingHours: ['Monday: 9:00 AM – 10:00 PM', 'Tuesday: 9:00 AM – 10:00 PM'],
        priceLevel: 2,
        types: ['cafe', 'restaurant', 'food'],
        rating: 4.5,
        reviewCount: 150,
      },
      provenance: {
        source: this.providerName,
        retrievedAt: new Date().toISOString(),
        dataType: 'place_details',
        confidence: 'HIGH',
      },
    };
  }

  async geocode(params: GeocodeParams): Promise<ProviderResult<GeocodingResult>> {
    return {
      data: {
        formattedAddress: `${params.address}, Jakarta Selatan, Indonesia`,
        location: { latitude: -6.261, longitude: 106.816 },
        placeId: 'mock-geocode-place-id',
        roadName: 'Jalan Kemang Raya',
        precision: 'ROOFTOP',
      },
      provenance: {
        source: this.providerName,
        retrievedAt: new Date().toISOString(),
        dataType: 'geocoding',
        confidence: 'HIGH',
      },
    };
  }

  async calculateRoute(params: CalculateRouteParams): Promise<ProviderResult<RouteResult>> {
    return {
      data: {
        distanceMeters: 2500,
        durationSeconds: 900, // 15 mins
        origin: params.origin,
        destination: params.destination,
      },
      provenance: {
        source: this.providerName,
        retrievedAt: new Date().toISOString(),
        dataType: 'routing',
        confidence: 'HIGH',
      },
    };
  }
  async getStreetViewAvailability(params: {
    location: Coordinates;
  }): Promise<ProviderResult<StreetViewAvailability>> {
    return {
      data: {
        available: true,
        status: 'OK',
        captureDate: '2023-05',
        // A few metres off, as a real panorama always is.
        panoramaLocation: {
          latitude: params.location.latitude + 0.0001,
          longitude: params.location.longitude,
        },
      },
      provenance: {
        source: this.providerName,
        retrievedAt: new Date().toISOString(),
        dataType: 'street_view_metadata',
        confidence: 'HIGH',
      },
    };
  }

  async getStreetViewImage(params: StreetViewParams): Promise<ProviderResult<RenderedImage>> {
    return {
      data: placeholderImage('Street View', params.widthPx ?? 640, params.heightPx ?? 400),
      provenance: {
        source: this.providerName,
        retrievedAt: new Date().toISOString(),
        dataType: 'street_view_image',
        confidence: 'HIGH',
      },
    };
  }

  async getStaticMap(params: StaticMapParams): Promise<ProviderResult<RenderedImage>> {
    return {
      data: placeholderImage(
        `Peta (${params.markers.length} penanda)`,
        params.widthPx ?? 640,
        params.heightPx ?? 480
      ),
      provenance: {
        source: this.providerName,
        retrievedAt: new Date().toISOString(),
        dataType: 'static_map',
        confidence: 'HIGH',
      },
    };
  }
}
