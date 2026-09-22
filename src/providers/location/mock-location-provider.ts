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
}
